import { test } from 'node:test';
import { setEnvMode, setEnvValue } from '../src/config.js';
import assert from 'node:assert/strict';
import { createAi } from '../src/providers/ai/index.js';
import { logtoVerifier } from '../src/providers/auth/logto.js';
import { ApplicationError } from '../src/application/errors.js';

test('missing AI credentials fail provider assembly before work starts', (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: ' ' };
  t.after(() => {
    process.env = env;
    setEnvMode('runtime');
  });
  assert.throws(() => createAi(), /Missing OPENAI_API_KEY/);
  setEnvMode('test');
  const configured = createAi();
  assert.ok(configured.importAi);
  assert.ok(configured.chatAi);
});

test('missing authentication configuration denies access', async () => {
  setEnvMode('test');
  setEnvValue('LOGTO_ENDPOINT', '');
  setEnvValue('LOGTO_APP_ID', '');
  const verify = logtoVerifier();
  await assert.rejects(
    verify('synthetic-token'),
    (error) => error instanceof ApplicationError && error.kind === 'UNAVAILABLE',
  );
});
