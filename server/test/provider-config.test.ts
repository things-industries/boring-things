import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { createAi } from '../src/providers/ai/index.js';
import { logtoVerifier } from '../src/providers/auth/logto.js';
import { ApplicationError } from '../src/application/errors.js';

test('missing AI configuration disables both capabilities without a fake fallback', () => {
  const config = readConfig();
  assert.deepEqual(createAi({ ...config, openaiApiKey: '' }), {
    importAi: undefined,
    chatAi: undefined,
  });
  const configured = createAi({ ...config, openaiApiKey: 'synthetic-key' });
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
