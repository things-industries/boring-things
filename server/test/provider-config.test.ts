import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { createAi } from '../src/providers/ai/index.js';
import { logtoVerifier } from '../src/providers/auth/logto.js';
import { ApplicationError } from '../src/application/errors.js';

test('missing AI configuration disables both capabilities without a fake fallback', () => {
  const config = readConfig();
  for (const [openaiApiKey, openaiModel] of [
    ['', ''],
    ['synthetic-key', ''],
    ['', 'synthetic-model'],
  ]) {
    assert.deepEqual(createAi({ ...config, openaiApiKey, openaiModel }), {
      importAi: undefined,
      chatAi: undefined,
    });
  }
});

test('missing authentication configuration denies access', async () => {
  const verify = logtoVerifier({ ...readConfig(), logtoEndpoint: '', logtoAppId: '' });
  await assert.rejects(
    verify('synthetic-token'),
    (error) => error instanceof ApplicationError && error.kind === 'UNAVAILABLE',
  );
});
