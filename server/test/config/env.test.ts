/** Checks environment modes and AI task credentials and limits through mocked requests. */

import { getEnv, setEnvMode } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiTask, responseText } from '../../src/providers/ai/tasks/task.js';
import type { AiContext } from '../../src/providers/ai/types.js';

class TextTask extends AiTask<never, string> {
  protected readonly model = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'text';
  protected instructions = 'Read text.';

  constructor(
    private text: string,
    context: AiContext,
  ) {
    super(context);
  }

  // Exercises the shared request path with supplied text.
  protected async runTask() {
    return responseText(await this.execute(this.text));
  }
}

test('environment values are read when requested and test credentials replace runtime credentials', (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: ' first-key ' };
  t.after(() => {
    process.env = env;
    setEnvMode('runtime');
  });
  setEnvMode('runtime');
  assert.equal(getEnv('OPENAI_API_KEY'), 'first-key');
  process.env.OPENAI_API_KEY = 'second-key';
  assert.equal(getEnv('OPENAI_API_KEY'), 'first-key');
  setEnvMode('runtime');
  assert.equal(getEnv('OPENAI_API_KEY'), 'second-key');
  setEnvMode('test');
  assert.equal(getEnv('OPENAI_API_KEY'), 'test-key');
  setEnvMode('runtime');
  process.env.OPENAI_API_KEY = ' ';
  assert.throws(() => getEnv('OPENAI_API_KEY'), /Missing OPENAI_API_KEY/);
  setEnvMode('runtime');
  delete process.env.OPENAI_API_KEY;
  assert.throws(() => getEnv('OPENAI_API_KEY'), /Missing OPENAI_API_KEY/);
});

test('tasks read credentials at first execution and enforce shared request limits', async (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: '' };
  t.after(() => {
    process.env = env;
    setEnvMode('runtime');
  });
  setEnvMode('runtime');
  const context = {
    signal: new AbortController().signal,
    record: async () => {},
  };
  const unconfigured = new TextTask('Read this.', context);
  await assert.rejects(unconfigured.run(), /Missing OPENAI_API_KEY/);
  setEnvMode('test');
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-key');
    assert.equal(JSON.parse(String(options.body)).max_output_tokens, 12000);
    return Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }],
    });
  });
  await assert.rejects(new TextTask('x'.repeat(120000), context).run(), /text_limit/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(await unconfigured.run(), 'Done.');
  assert.equal(fetch.mock.callCount(), 1);
});

test('separate tasks consume the same job request allowance', async (t) => {
  setEnvMode('test');
  t.after(() => setEnvMode('runtime'));
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }],
    }),
  );
  let requests = 0;
  const context: AiContext = {
    signal: new AbortController().signal,
    beforeRequest: () => {
      if (++requests > 1) throw new Error('tool_limit');
    },
    record: async () => {},
  };
  assert.equal(await new TextTask('First task', context).run(), 'Done.');
  await assert.rejects(new TextTask('Second task', context).run(), /tool_limit/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('task completion awaits job usage persistence and propagates persistence failures', async (t) => {
  setEnvMode('test');
  t.after(() => setEnvMode('runtime'));
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }],
      usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 2 } },
    }),
  );
  const failure = new Error('Usage write failed');
  const task = new TextTask('Read this.', {
    signal: new AbortController().signal,
    record: async (usage) => {
      assert.equal(usage.inputTokens, 10);
      assert.equal(usage.cachedTokens, 2);
      await Promise.resolve();
      throw failure;
    },
  });
  await assert.rejects(task.run(), failure);
});

test('job cancellation reaches a task constructed before the job was aborted', async (t) => {
  setEnvMode('test');
  t.after(() => setEnvMode('runtime'));
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected request');
  });
  const controller = new AbortController();
  const reason = new Error('Job stopped');
  const task = new TextTask('Read this.', {
    signal: controller.signal,
    record: async () => {
      throw new Error('Unexpected usage write');
    },
  });
  controller.abort(reason);
  await assert.rejects(task.run(), reason);
  assert.equal(fetch.mock.callCount(), 0);
});

// Request-option overrides previously bypassed the text check by replacing instructions afterwards.
test('instruction overrides count towards the request text limit', async (t) => {
  setEnvMode('test');
  t.after(() => setEnvMode('runtime'));
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected request');
  });
  class InstructionTask extends TextTask {
    protected override async runTask() {
      return responseText(await this.execute('Read this.', { instructions: 'x'.repeat(120000) }));
    }
  }
  await assert.rejects(
    new InstructionTask('', { signal: new AbortController().signal, record: async () => {} }).run(),
    /text_limit/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

for (const streamed of [false, true]) {
  test(`refused ${streamed ? 'streamed' : 'buffered'} responses report usage and a sanitised reason`, async (t) => {
    setEnvMode('test');
    t.after(() => setEnvMode('runtime'));
    const response = {
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'refusal', refusal: 'Private refusal details' }] },
      ],
      usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 0 } },
    };
    t.mock.method(globalThis, 'fetch', async () =>
      streamed
        ? new Response(`data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        : Response.json(response),
    );
    let recorded = false;
    class RefusalTask extends TextTask {
      protected override async runTask() {
        return responseText(await this.execute('Read text.', {}, streamed ? () => {} : undefined));
      }
    }
    await assert.rejects(
      new RefusalTask('', {
        signal: new AbortController().signal,
        record: async (usage) => {
          assert.equal(usage.inputTokens, 10);
          recorded = true;
        },
      }).run(),
      { message: 'ai_refused' },
    );
    assert.equal(recorded, true);
  });
}
