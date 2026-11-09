import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { createAi } from '../src/providers/ai/index.js';
import { logtoVerifier } from '../src/providers/auth/logto.js';
import { ApplicationError } from '../src/application/errors.js';
import { setEnvMode } from '../src/env.js';

test('missing AI credentials fail provider assembly before work starts', (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: ' ' };
  t.after(() => {
    process.env = env;
    setEnvMode('runtime');
  });
  assert.throws(() => createAi(readConfig()), /Missing OPENAI_API_KEY/);
  setEnvMode('test');
  const configured = createAi(readConfig());
  assert.ok(configured.importAi);
  assert.ok(configured.chatAi);
});

test('missing authentication configuration denies access', async () => {
  const verify = logtoVerifier({ ...readConfig(), logtoEndpoint: '', logtoAppId: '' });
  await assert.rejects(
    verify('synthetic-token'),
    (error) => error instanceof ApplicationError && error.kind === 'UNAVAILABLE',
  );
});
