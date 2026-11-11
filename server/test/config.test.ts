/** Checks typed settings, conditional startup requirements and process-wide test overrides. */

import { getEnv, setEnvMode, setEnvValue } from '../src/config.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const runtimeEnvironment = process.env;
const storage = {
  BLOB_STORAGE: 's3',
  S3_ENDPOINT: 'https://storage.example',
  S3_REGION: 'eu-west-2',
  S3_BUCKET: 'attachments',
  S3_ACCESS_KEY_ID: 'synthetic',
  S3_SECRET_ACCESS_KEY: 'synthetic',
};
const production = {
  ...storage,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://postgres:synthetic@database.example:5432/postgres',
  LOGTO_ENDPOINT: 'https://identity.example',
  LOGTO_APP_ID: 'synthetic',
  LOGTO_API_RESOURCE: 'https://api.example',
};
afterEach(() => {
  process.env = runtimeEnvironment;
  setEnvMode('runtime');
});

// Selects a synthetic runtime source to exercise parsing before application startup.
function selectEnvironment(values: NodeJS.ProcessEnv) {
  process.env = values;
  setEnvMode('runtime');
}

test('defaults are typed, cached and independent of later environment changes', () => {
  selectEnvironment({});
  assert.equal(getEnv('BLOB_STORAGE'), 'local');
  assert.equal(getEnv('PORT'), 3000);
  assert.equal(getEnv('MAX_UPLOAD_BYTES'), 100000000);
  assert.equal(getEnv('CHAT_TIMEOUT_MS'), 180000);
  assert.equal(getEnv('ENABLE_SAMPLE_DATA'), false);
  process.env.PORT = '4000';
  assert.equal(getEnv('PORT'), 3000);
  setEnvMode('runtime');
  assert.equal(getEnv('PORT'), 4000);
});

test('logging settings and workflow limits validate their runtime source', () => {
  selectEnvironment({});
  assert.equal(getEnv('LOG_FORMAT'), 'pretty');
  selectEnvironment(production);
  assert.equal(getEnv('LOG_FORMAT'), 'json');
  for (const [key, value] of [
    ['LOG_FORMAT', 'other'],
    ['LOG_LEVEL', 'other'],
    ['BLOB_STORAGE', 'other'],
  ]) {
    selectEnvironment({ [key!]: value });
    assert.throws(() => getEnv('PORT'), new RegExp('Invalid ' + key));
  }
  for (const name of [
    'PORT',
    'CHAT_TIMEOUT_MS',
    'CHAT_TOOL_CALLS',
    'IMPORT_TIMEOUT_MS',
    'IMPORT_MAX_REQUESTS',
    'IMPORT_MAX_RESOURCES',
    'IMPORT_TOOL_ROUNDS',
    'DISCOVERY_TIMEOUT_MS',
    'MAX_UPLOAD_BYTES',
  ]) {
    for (const value of ['', 'no', '0', '-1', '1.5', 'Infinity', '9007199254740992']) {
      selectEnvironment({ [name]: value });
      assert.throws(() => getEnv('PORT'), new RegExp('Invalid ' + name));
    }
  }
});

test('storage credentials and production requirements validate together', () => {
  selectEnvironment(production);
  assert.equal(getEnv('S3_BUCKET'), 'attachments');
  for (const name of [
    'DATABASE_URL',
    'LOGTO_ENDPOINT',
    'LOGTO_APP_ID',
    'LOGTO_API_RESOURCE',
    ...Object.keys(storage).filter((key) => key.startsWith('S3_')),
  ]) {
    selectEnvironment({ ...production, [name]: '  ' });
    assert.throws(() => getEnv('PORT'), new RegExp('Missing ' + name));
  }
  selectEnvironment({ ...storage, S3_ENDPOINT: 'http://storage.example' });
  assert.throws(() => getEnv('PORT'), /HTTPS/);
  selectEnvironment({ ...production, BLOB_STORAGE: 'local' });
  assert.throws(() => getEnv('PORT'), /requires BLOB_STORAGE=s3/);
  selectEnvironment({ BLOB_STORAGE: 'local', S3_ENDPOINT: 'unused' });
  assert.equal(getEnv('BLOB_STORAGE'), 'local');
});

test('test mode isolates runtime credentials and resets overrides and derived defaults', () => {
  selectEnvironment({
    OPENAI_API_KEY: 'runtime-secret',
    S3_SECRET_ACCESS_KEY: 'runtime-secret',
    TEST_DATABASE_URL: 'postgresql://localhost/test',
  });
  assert.throws(() => setEnvValue('PORT', 4000), /test mode/);
  setEnvMode('test');
  assert.equal(getEnv('OPENAI_API_KEY'), 'test-key');
  assert.equal(getEnv('S3_SECRET_ACCESS_KEY', { optional: true }), undefined);
  assert.equal(getEnv('DATABASE_URL'), 'postgresql://localhost/test');
  setEnvValue('PORT', 4000);
  assert.equal(getEnv('PORT'), 4000);
  setEnvValue('PORT', undefined);
  assert.equal(getEnv('PORT'), 3000);
  setEnvValue('OPENAI_API_KEY', '  override  ');
  assert.equal(getEnv('OPENAI_API_KEY'), 'override');
  setEnvMode('test');
  assert.equal(getEnv('OPENAI_API_KEY'), 'test-key');
});
