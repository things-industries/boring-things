/** Checks environment modes and AI task credentials and limits through mocked requests. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEnv, setEnvMode } from '../../src/env.js';
import { AiTask, responseText } from '../../src/providers/ai/tasks/task.js';
import type { AiContext } from '../../src/providers/ai/types.js';

class TextTask extends AiTask<never, string, AiContext & { text: string }> {
  protected readonly model = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'text';
  protected instructions = 'Read text.';

  // Exercises the shared request path with supplied text.
  protected async runTask(context: AiContext & { text: string }) {
    return responseText(await this.execute(context.text, context));
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
  assert.equal(getEnv('OPENAI_API_KEY'), 'second-key');
  setEnvMode('test');
  assert.equal(getEnv('OPENAI_API_KEY'), 'test-key');
  setEnvMode('runtime');
  process.env.OPENAI_API_KEY = ' ';
  assert.throws(() => getEnv('OPENAI_API_KEY'), /Missing OPENAI_API_KEY/);
  delete process.env.OPENAI_API_KEY;
  assert.throws(() => getEnv('OPENAI_API_KEY'), /Missing OPENAI_API_KEY/);
});

test('tasks read credentials at construction and enforce shared request limits', async (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: '' };
  t.after(() => {
    process.env = env;
    setEnvMode('runtime');
  });
  setEnvMode('runtime');
  assert.throws(() => new TextTask(), /Missing OPENAI_API_KEY/);
  setEnvMode('test');
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-key');
    assert.equal(JSON.parse(String(options.body)).max_output_tokens, 12000);
    return Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }],
    });
  });
  const context = {
    signal: new AbortController().signal,
    record: async () => {},
  };
  await assert.rejects(new TextTask().run({ ...context, text: 'x'.repeat(120000) }), /text_limit/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(await new TextTask().run({ ...context, text: 'Read this.' }), 'Done.');
  assert.equal(fetch.mock.callCount(), 1);
});
