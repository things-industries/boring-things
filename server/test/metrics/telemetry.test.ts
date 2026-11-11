/** Exercises telemetry context, accounting and privacy with an in-memory OpenTelemetry exporter. */

import { setEnvMode } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { LangfuseOtelSpanAttributes as attributes } from '@langfuse/tracing';
import * as metrics from '../../src/metrics.js';
import { AiTask, responseText } from '../../src/providers/ai/tasks/task.js';
import { readImageText } from '../../src/providers/google-vision/index.js';
import { summarizeProviderCalls, type RecordedObservation } from '../../src/metrics-report.js';
import type { Usage } from '../../src/application/import/types.js';

class TextTask extends AiTask<never, string> {
  protected readonly model = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'read_text';
  protected instructions = 'Read supplied text.';

  // Exercises the actual provider boundary through a mocked OpenAI response.
  protected async runTask() {
    return responseText(await this.execute('private source content'));
  }
}

class StreamTask extends TextTask {
  // Exercises usage returned by an incomplete streamed response.
  protected async runTask() {
    return responseText(await this.execute('private source content', () => {}));
  }
}

test('concurrent jobs isolate traces and record provider usage without source content', async (t) => {
  const exporter = new InMemorySpanExporter();
  const processor = new LangfuseSpanProcessor({ exporter, mediaUploadEnabled: false });
  const sdk = new NodeSDK({ spanProcessors: [processor] });
  sdk.start();
  setEnvMode('test');
  t.after(async () => {
    setEnvMode('runtime');
    await sdk.shutdown();
  });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      id: 'response-fixture',
      model: 'gpt-6-luna',
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: 'private answer' }] },
        {
          type: 'web_search_call',
          status: 'completed',
          action: { type: 'search', query: 'private query' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } },
    }),
  );
  const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
  const recorded: Partial<Usage>[] = [];
  await Promise.all(
    ids.map((id) =>
      metrics.withJob('import', id, async () => {
        for (let turn = 0; turn < 2; turn++)
          await new TextTask({
            signal: new AbortController().signal,
            record: async (usage) => {
              recorded.push(usage);
            },
          }).run();
      }),
    ),
  );
  assert.equal(recorded.length, 4);
  assert(
    recorded.every(
      (usage) => usage.inputTokens === 10 && usage.outputTokens === 3 && usage.cachedTokens === 2,
    ),
  );
  await processor.forceFlush();
  const spans = exporter.getFinishedSpans();
  for (const id of ids) {
    const group = spans.filter((span) => span.spanContext().traceId === metrics.getJobTraceId(id));
    assert.equal(group.length, 7);
    assert(group.every((span) => span.attributes[attributes.TRACE_SESSION_ID] === id));
    const generations = group.filter(
      (span) => span.attributes[attributes.OBSERVATION_TYPE] === 'generation',
    );
    assert.equal(generations.length, 2);
    assert.deepEqual(
      JSON.parse(String(generations[0].attributes[attributes.OBSERVATION_USAGE_DETAILS])),
      { input: 8, input_cached_tokens: 2, output: 3 },
    );
    assert.equal(
      group.filter(
        (span) => span.attributes[attributes.OBSERVATION_COST_DETAILS] === '{"total":0.01}',
      ).length,
      2,
    );
  }
  assert(!JSON.stringify(spans.map((span) => span.attributes)).includes('private'));

  exporter.reset();
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'missing-usage', model: 'gpt-6-luna', status: 'completed', output: [] }),
  );
  await new TextTask({
    signal: new AbortController().signal,
    record: async (usage) => {
      assert.equal(usage.inputTokens, 0);
      assert.equal(usage.outputTokens, 0);
      assert.equal(usage.cachedTokens, 0);
    },
  }).run();
  await processor.forceFlush();
  const unknown = exporter
    .getFinishedSpans()
    .find((span) => span.attributes[attributes.OBSERVATION_TYPE] === 'generation');
  assert(unknown);
  assert.equal(unknown.attributes[attributes.OBSERVATION_USAGE_DETAILS], undefined);

  exporter.reset();
  const failure = new Error('private failure details');
  await assert.rejects(
    metrics.withJob('attachment', ids[0], () =>
      metrics.withTask('ocr', () =>
        metrics.withProviderCall(
          { task: 'ocr', provider: 'google_vision', costUsd: 0.0015 },
          async () => {
            throw failure;
          },
        ),
      ),
    ),
    (error) => error === failure,
  );
  await processor.forceFlush();
  const failed = exporter.getFinishedSpans();
  assert.equal(failed.length, 3);
  assert(failed.every((span) => span.attributes[attributes.OBSERVATION_LEVEL] === 'ERROR'));
  assert(!failed.some((span) => span.attributes[attributes.OBSERVATION_COST_DETAILS]));
  assert(
    !JSON.stringify(
      failed.map((span) => ({
        attributes: span.attributes,
        status: span.status,
        events: span.events,
      })),
    ).includes('private'),
  );

  exporter.reset();
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        `event: response.incomplete\ndata: ${JSON.stringify({
          type: 'response.incomplete',
          response: {
            id: 'incomplete-fixture',
            model: 'gpt-6-luna',
            status: 'incomplete',
            output: [],
            usage: {
              input_tokens: 10,
              output_tokens: 3,
              input_tokens_details: { cached_tokens: 2 },
            },
          },
        })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  await assert.rejects(
    new StreamTask({ signal: new AbortController().signal, record: async () => {} }).run(),
  );
  await processor.forceFlush();
  const partial = exporter
    .getFinishedSpans()
    .find((span) => span.attributes[attributes.OBSERVATION_TYPE] === 'generation');
  assert(partial);
  assert.equal(partial.attributes[attributes.OBSERVATION_LEVEL], 'ERROR');
  assert.deepEqual(JSON.parse(String(partial.attributes[attributes.OBSERVATION_USAGE_DETAILS])), {
    input: 8,
    input_cached_tokens: 2,
    output: 3,
  });

  // Wrapping OCR preparation recorded a provider call even when credentials were missing.
  exporter.reset();
  await assert.rejects(readImageText(Buffer.from('synthetic'), new AbortController().signal));
  await processor.forceFlush();
  assert.equal(exporter.getFinishedSpans().length, 0);

  // Two messages and a retry share the conversation session but use one trace per message.
  const conversationId = '20000000-0000-4000-8000-000000000001';
  for (const messageId of [ids[0], ids[1], ids[0]]) {
    await metrics.withChatTurn(messageId, conversationId, async () => {
      metrics.recordProviderCall({
        task: 'assistant_response',
        provider: 'openai',
        model: 'gpt-6-luna',
        status: 'success',
      });
    });
  }
  await processor.forceFlush();
  const chatSpans = exporter.getFinishedSpans();
  assert.equal(chatSpans.length, 6);
  assert(
    chatSpans.every((span) => span.attributes[attributes.TRACE_SESSION_ID] === conversationId),
  );
  assert(
    chatSpans.every(
      (span) =>
        span.attributes[`${attributes.TRACE_METADATA}.sessionKind`] ===
        JSON.stringify('conversation'),
    ),
  );
  assert.deepEqual(
    ids.map(
      (id) =>
        chatSpans.filter((span) => span.spanContext().traceId === metrics.getJobTraceId(id)).length,
    ),
    [4, 2],
  );
});

test('reports distinguish unknown costs and deduplicate shared-source calls', () => {
  const source: RecordedObservation = {
    id: 'ocr-call',
    traceId: 'source',
    name: 'ocr',
    type: 'TOOL',
    startTime: '2026-01-01T00:00:00Z',
    endTime: '2026-01-01T00:00:01Z',
    metadata: { provider: 'google_vision', durationKnown: true },
    totalCost: 0.0015,
  };
  const model: RecordedObservation = {
    ...source,
    id: 'model-call',
    traceId: 'import',
    name: 'populate_fields',
    type: 'GENERATION',
    metadata: { provider: 'openai', usageKnown: true, durationKnown: true },
    usageDetails: { input: 8, input_cached_tokens: 2, output: 3 },
    totalCost: null,
  };
  const summary = summarizeProviderCalls([
    source,
    source,
    model,
    { ...source, id: 'free-call', totalCost: 0 },
  ]);
  assert.equal(summary.total.calls, 3);
  assert.equal(summary.total.knownCostUsd, 0.0015);
  assert.equal(summary.total.unpricedCalls, 1);
  assert.equal(summary.total.inputTokens, 10);
  assert.equal(summary.total.cachedTokens, 2);
  assert.equal(summary.total.outputTokens, 3);
  assert.equal(summary.total.summedRequestMs, 3000);
});
