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
import { ReportedJobError } from '../../src/application/jobs/runner.js';

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
  const warnings: unknown[] = [];
  const errors: unknown[] = [];
  metrics.setDiagnosticLogger({
    info: () => {},
    warn: (data: unknown) => warnings.push(data),
    error: (data: unknown) => errors.push(data),
  });
  t.after(() => metrics.setDiagnosticLogger(undefined));
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
        {
          type: 'web_search_call',
          status: 'incomplete',
          action: { type: 'search', query: 'private unfinished query' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } },
    }),
  );
  const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
  const recorded: Partial<Usage>[] = [];
  await Promise.all(
    ids.map((id) =>
      metrics.withJob('import', { id: id }, async () => {
        for (let turn = 0; turn < 2; turn++)
          await new TextTask({
            signal: new AbortController().signal,
            record: async (usage) => {
              recorded.push(usage);
            },
          }).run();
        return { status: 'COMPLETE' };
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
    assert.equal(group.length, 9);
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
    const unfinished = group.filter(
      (span) => span.attributes[attributes.OBSERVATION_STATUS_MESSAGE] === 'web_search_unfinished',
    );
    assert.equal(unfinished.length, 2);
    for (const { attributes: details } of unfinished) {
      assert.equal(details[`${attributes.OBSERVATION_METADATA}.toolStatus`], '"incomplete"');
      assert.equal(details[`${attributes.OBSERVATION_METADATA}.responseId`], '"response-fixture"');
      assert.equal(details[attributes.OBSERVATION_COST_DETAILS], undefined);
    }
  }
  assert.equal(warnings.length, 4);
  for (const warning of warnings) {
    assert.ok(warning && typeof warning === 'object');
    assert.deepEqual(
      [Reflect.get(warning, 'kind'), Reflect.get(warning, 'toolStatus')],
      ['web_search_unfinished', 'incomplete'],
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
    metrics.withJob('attachment', { id: ids[0] }, () =>
      metrics.withTask('ocr', () =>
        metrics.withProviderCall(
          { task: 'ocr', provider: 'google_vision', costUsd: 0.0015 },
          async () => {
            throw failure;
          },
        ),
      ),
    ),
    (error) => error instanceof ReportedJobError && error.cause === failure,
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

  exporter.reset();
  warnings.length = 0;
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { error: { message: 'private HTTP error body' } },
      {
        status: 429,
        headers: { 'x-request-id': 'req_fixture' },
      },
    ),
  );
  await metrics.withJob('import', { id: ids[0] }, async () => {
    metrics.setJobEntity({ type: 'thing', id: ids[1], name: 'Fixture dishwasher' });
    await assert.rejects(
      new TextTask({ signal: new AbortController().signal, record: async () => {} }).run(),
      /ai_http_429/,
    );
    metrics.recordImportWarning({ stage: 'purchasables', reason: 'ai_http_429' });
    return { status: 'COMPLETE', warningCount: 1 };
  });
  await processor.forceFlush();
  const diagnostics = exporter.getFinishedSpans();
  const provider = diagnostics.find((span) => span.name === 'read_text');
  assert(provider);
  assert.equal(provider.attributes[attributes.OBSERVATION_LEVEL], 'ERROR');
  assert.equal(
    diagnostics.find((span) => span.name === 'process_import')?.attributes[
      attributes.OBSERVATION_LEVEL
    ],
    'WARNING',
  );
  const errorLog = warnings[0];
  assert.ok(errorLog && typeof errorLog === 'object');
  assert.deepEqual(
    [
      Reflect.get(errorLog, 'httpStatus'),
      Reflect.get(errorLog, 'httpRequestId'),
      Reflect.get(errorLog, 'entityName'),
    ],
    [429, 'req_fixture', 'Fixture dishwasher'],
  );
  assert.match(String(Reflect.get(errorLog, 'attemptId')), /^[a-f0-9]{16}$/);
  const exported = JSON.stringify(diagnostics.map((span) => span.attributes));
  assert.match(exported, /req_fixture/);
  assert.match(exported, /Fixture dishwasher/);
  assert.doesNotMatch(exported + JSON.stringify(warnings), /private/);

  // Wrapping OCR preparation recorded a provider call even when credentials were missing.
  exporter.reset();
  await assert.rejects(readImageText(Buffer.from('synthetic'), new AbortController().signal));
  await processor.forceFlush();
  assert.equal(exporter.getFinishedSpans().length, 0);

  await metrics.withJob('attachment', { id: ids[1] }, async () => {
    return {
      status: 'FAILED',
      mediaType: 'application/pdf',
      byteSize: 4096,
      stage: 'text_extraction',
      reason: 'pdf_parse_timeout',
    };
  });
  await processor.forceFlush();
  const attachment = exporter.getFinishedSpans().find((span) => span.name === 'process_attachment');
  assert(attachment);
  assert.equal(attachment.spanContext().traceId, metrics.getJobTraceId(ids[1]));
  assert.equal(attachment.attributes[attributes.OBSERVATION_LEVEL], 'ERROR');
  assert.equal(attachment.attributes[attributes.OBSERVATION_STATUS_MESSAGE], 'pdf_parse_timeout');
  assert.deepEqual(JSON.parse(String(attachment.attributes[attributes.OBSERVATION_OUTPUT])), {
    status: 'FAILED',
    stage: 'text_extraction',
    reason: 'pdf_parse_timeout',
  });
  assert.partialDeepStrictEqual(errors.at(-1), {
    event: 'job_finished',
    jobId: ids[1],
    status: 'FAILED',
    reason: 'pdf_parse_timeout',
  });

  // Two messages and a retry share the conversation session but use one trace per message.
  exporter.reset();
  const conversationId = '20000000-0000-4000-8000-000000000001';
  for (const messageId of [ids[0], ids[1], ids[0]]) {
    await metrics.withChatTurn({ id: messageId, conversationId, userId: ids[0] }, async () => {
      metrics.recordProviderCall({
        task: 'assistant_response',
        provider: 'openai',
        model: 'gpt-6-luna',
        status: 'success',
      });
      return messageId === ids[1]
        ? { status: 'FAILED', stage: 'respond', reason: 'deadline' }
        : { status: 'COMPLETE' };
    });
  }
  await processor.forceFlush();
  const chatSpans = exporter.getFinishedSpans();
  assert.equal(chatSpans.length, 6);
  const failedChat = chatSpans.find(
    (span) =>
      span.name === 'process_chat' && span.spanContext().traceId === metrics.getJobTraceId(ids[1]),
  );
  assert.equal(failedChat?.attributes[attributes.OBSERVATION_LEVEL], 'ERROR');
  assert.equal(failedChat?.attributes[attributes.OBSERVATION_STATUS_MESSAGE], 'deadline');
  assert(
    chatSpans.every((span) => span.attributes[attributes.TRACE_SESSION_ID] === conversationId),
  );
  assert(chatSpans.every((span) => span.attributes[attributes.TRACE_USER_ID] === ids[0]));
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
