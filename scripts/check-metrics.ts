/** Exports synthetic imports through the application telemetry boundary with a mocked OpenAI response. */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import * as metrics from '../server/src/metrics.js';
import { getEnv, setEnvMode } from '../server/src/env.js';
import { AiTask, responseText } from '../server/src/providers/ai/tasks/task.js';

getEnv('LANGFUSE_PUBLIC_KEY');
getEnv('LANGFUSE_SECRET_KEY');
assert.notEqual(process.env.LANGFUSE_TRACING_ENABLED, 'false', 'Enable tracing for this check');
process.env.LANGFUSE_TRACING_ENVIRONMENT = 'setup-check';
setEnvMode('test');
metrics.initializeMetrics();
const attachmentId = randomUUID();
const importIds = [randomUUID(), randomUUID()];
let modelCalls = 0;
const originalFetch = globalThis.fetch;
const stub = mock.method(
  globalThis,
  'fetch',
  async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === 'https://api.openai.com') {
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-key');
      modelCalls++;
      return Response.json({
        id: randomUUID(),
        model: 'gpt-6-luna',
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'Synthetic result.' }] },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 10,
          input_tokens_details: { cached_tokens: 20 },
        },
      });
    }
    assert.equal(url.origin, new URL(getEnv('LANGFUSE_BASE_URL')).origin);
    return originalFetch(input, options);
  },
);

class SyntheticTask extends AiTask<never, string> {
  protected readonly model = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'check_import_metrics';
  protected instructions = 'Synthetic telemetry check.';

  // Exercises the model request boundary with an invented response.
  protected async runTask() {
    return responseText(await this.execute('Synthetic source.'));
  }
}

try {
  await metrics.withJob('attachment', attachmentId, () =>
    metrics.withProviderCall(
      {
        task: 'google_vision_ocr',
        provider: 'google_vision',
        units: 1,
        costUsd: 0.0015,
      },
      async () => 'Synthetic OCR text.',
    ),
  );
  await Promise.all(
    importIds.map((id) =>
      metrics.withJob('import', id, async () => {
        for (let turn = 0; turn < 2; turn++) {
          await new SyntheticTask({
            signal: new AbortController().signal,
            record: async () => {},
          }).run();
        }
      }),
    ),
  );
  assert.equal(modelCalls, 4);
  console.log(
    JSON.stringify(
      {
        synthetic: true,
        providerRequests: 0,
        attachmentId,
        traces: [attachmentId, ...importIds].map(metrics.getJobTraceId),
      },
      null,
      2,
    ),
  );
} finally {
  await metrics.shutdownMetrics();
  stub.mock.restore();
  setEnvMode('runtime');
}
