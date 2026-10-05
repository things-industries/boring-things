import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, type EnvConfig } from '../src/config.js';

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

test('configuration defaults and parsed values are isolated from their environment source', () => {
  const defaults = readConfig({});
  assert.equal(defaults.blobStorage, 'local');
  assert.equal(defaults.s3, undefined);
  assert.equal(defaults.port, 3000);
  assert.equal(defaults.maxUploadBytes, 100000000);
  assert.equal(defaults.chatTimeoutMs, 180000);
  assert.equal(defaults.sampleDataEnabled, false);
  const env = { PORT: '4000', CHAT_TIMEOUT_MS: '1500', ENABLE_SAMPLE_DATA: 'true' };
  const first: EnvConfig = readConfig(env);
  env.PORT = '5000';
  const second = readConfig(env);
  assert.equal(first.port, 4000);
  assert.equal(second.port, 5000);
  assert.equal(first.chatTimeoutMs, 1500);
  assert.equal(first.sampleDataEnabled, true);
  assert.equal(readConfig({ ENABLE_SAMPLE_DATA: '1' }).sampleDataEnabled, false);
});

test('storage mode and conditional credentials are validated before startup', () => {
  assert.throws(() => readConfig({ BLOB_STORAGE: 'other' }), /Invalid BLOB_STORAGE/);
  assert.equal(readConfig(storage).s3?.bucket, 'attachments');
  for (const name of Object.keys(storage).filter((key) => key.startsWith('S3_'))) {
    assert.throws(() => readConfig({ ...storage, [name]: '  ' }), new RegExp('Missing ' + name));
  }
  assert.throws(() => readConfig({ ...storage, S3_ENDPOINT: 'http://storage.example' }), /HTTPS/);
  assert.equal(readConfig({ BLOB_STORAGE: 'local', S3_ENDPOINT: 'unused' }).s3, undefined);
});

test('workflow limits reject invalid values and retain numeric defaults', () => {
  for (const name of [
    'CHAT_TIMEOUT_MS',
    'CHAT_TOOL_CALLS',
    'IMPORT_TIMEOUT_MS',
    'IMPORT_TOOL_ROUNDS',
    'DISCOVERY_TIMEOUT_MS',
    'DISCOVERY_SEARCH_CALLS',
    'AI_MAX_OUTPUT_TOKENS',
    'MAX_UPLOAD_BYTES',
  ]) {
    for (const value of ['', 'no', '0', '-1', '1.5', 'Infinity', '9007199254740992'])
      assert.throws(() => readConfig({ [name]: value }), new RegExp('Invalid ' + name));
    assert.doesNotThrow(() => readConfig({ [name]: '1' }));
  }
});

test('production validates authentication, database and storage together', () => {
  assert.doesNotThrow(() => readConfig(production));
  for (const name of ['DATABASE_URL', 'LOGTO_ENDPOINT', 'LOGTO_APP_ID', 'LOGTO_API_RESOURCE'])
    assert.throws(() => readConfig({ ...production, [name]: '' }), new RegExp('Missing ' + name));
  assert.throws(
    () => readConfig({ ...production, BLOB_STORAGE: 'local' }),
    /requires BLOB_STORAGE=s3/,
  );
});

test('document extraction model has independent configuration with the import model fallback', () => {
  assert.equal(
    readConfig({ OPENAI_MODEL: 'import-model' }).documentExtractionModel,
    'import-model',
  );
  assert.equal(
    readConfig({ OPENAI_MODEL: 'import-model', DOCUMENT_EXTRACTION_MODEL: 'document-model' })
      .documentExtractionModel,
    'document-model',
  );
});
