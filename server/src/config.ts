/** Process-wide application settings, environment validation and test overrides. */

import { maxDocumentBytes } from './lib/document-limits.js';

const localDatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';
const defaults = {
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: localDatabaseUrl,
  TEST_DATABASE_URL: localDatabaseUrl,
  LOG_FORMAT: '',
  LOG_LEVEL: 'info',
  SENTRY_DSN: '',
  SENTRY_FRONTEND_DSN: '',
  BLOB_STORAGE: 'local',
  BLOB_DIRECTORY: '.data/blobs',
  S3_ENDPOINT: '',
  S3_REGION: '',
  S3_BUCKET: '',
  S3_ACCESS_KEY_ID: '',
  S3_SECRET_ACCESS_KEY: '',
  LOGTO_ENDPOINT: '',
  LOGTO_APP_ID: '',
  LOGTO_API_RESOURCE: 'https://api.boring-things.local',
  OPENAI_API_KEY: '',
  GOOGLE_VISION_API_KEY: '',
  ICECAT_ACCESS_TOKEN: '',
  ZYFY_API_KEY: '',
  EPC_GOVUK_API_KEY: '',
  CHAT_TIMEOUT_MS: 180000,
  CHAT_TOOL_CALLS: 12,
  IMPORT_TIMEOUT_MS: 300000,
  IMPORT_MAX_REQUESTS: 60,
  IMPORT_MAX_RESOURCES: 3,
  IMPORT_TOOL_ROUNDS: 4,
  DISCOVERY_TIMEOUT_MS: 90000,
  MAX_UPLOAD_BYTES: maxDocumentBytes,
  ENABLE_SAMPLE_DATA: false,
  LANGFUSE_TRACING_ENABLED: true,
  LANGFUSE_PUBLIC_KEY: '',
  LANGFUSE_SECRET_KEY: '',
  LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
  LANGFUSE_TRACING_ENVIRONMENT: '',
  RENDER_GIT_COMMIT: '',
  SUPABASE_PROJECT_REF: '',
  E2E_PORT: 4300,
  PLAYWRIGHT_CHROMIUM_EXECUTABLE: '',
  CI: false,
};
const testDefaults = { NODE_ENV: 'test', OPENAI_API_KEY: 'test-key' };
type EnvValues = ReturnType<typeof buildEnvironment>;
const requiredSettings: readonly (keyof EnvValues)[] = [
  'OPENAI_API_KEY',
  'GOOGLE_VISION_API_KEY',
  'ICECAT_ACCESS_TOKEN',
  'ZYFY_API_KEY',
  'EPC_GOVUK_API_KEY',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'SUPABASE_PROJECT_REF',
];
let mode: 'runtime' | 'test' = 'runtime';
let overrides: Partial<typeof defaults> = {};
let environment: EnvValues | undefined;

// Reads a typed setting, requiring credentials only when the caller selects that capability.
export function getEnv<Key extends keyof EnvValues>(name: Key): EnvValues[Key];
export function getEnv<Key extends keyof EnvValues>(
  name: Key,
  options: { optional: true },
): EnvValues[Key] | undefined;
export function getEnv(name: keyof EnvValues, options?: { optional: true }) {
  const raw = (environment ??= buildEnvironment())[name];
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (options?.optional && value === '') return undefined;
  if (!options?.optional && requiredSettings.includes(name) && !value)
    throw new Error(`Missing ${name}`);
  return value;
}

// Selects the process configuration source and clears cached values and test overrides.
export function setEnvMode(value: 'runtime' | 'test') {
  mode = value;
  overrides = {};
  environment = undefined;
}

// Overrides one test setting; undefined restores its default.
export function setEnvValue<Key extends keyof typeof defaults>(
  name: Key,
  value: (typeof defaults)[Key] | undefined,
) {
  if (mode !== 'test') throw new Error('Environment overrides require test mode');
  overrides[name] = value ?? defaults[name];
  environment = undefined;
}

// Parses defaults and the selected source once, including conditional production requirements.
function buildEnvironment() {
  const source =
    mode === 'runtime'
      ? process.env
      : {
          ...testDefaults,
          TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? defaults.TEST_DATABASE_URL,
          PLAYWRIGHT_CHROMIUM_EXECUTABLE:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? defaults.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          ...overrides,
        };
  const values = { ...defaults, ...source };
  const blobStorage = readChoice('BLOB_STORAGE', values.BLOB_STORAGE, ['local', 's3']);
  const logFormat = readChoice(
    'LOG_FORMAT',
    values.LOG_FORMAT || (values.NODE_ENV === 'production' ? 'json' : 'pretty'),
    ['json', 'pretty'],
  );
  const logLevel = readChoice('LOG_LEVEL', values.LOG_LEVEL, [
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'fatal',
    'silent',
  ]);
  if (mode === 'test' && !Object.hasOwn(overrides, 'DATABASE_URL'))
    values.DATABASE_URL = values.TEST_DATABASE_URL || defaults.DATABASE_URL;
  if (values.NODE_ENV === 'production') {
    for (const name of [
      'DATABASE_URL',
      'LOGTO_ENDPOINT',
      'LOGTO_APP_ID',
      'LOGTO_API_RESOURCE',
    ] as const)
      if (!source[name]?.toString().trim()) throw new Error(`Missing ${name}`);
    if (blobStorage !== 's3') throw new Error('Production requires BLOB_STORAGE=s3');
    if (new URL(values.DATABASE_URL).port !== '5432')
      throw new Error('Production requires a session connection on port 5432');
  }
  if (blobStorage === 's3') {
    for (const name of [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const)
      if (!values[name].trim()) throw new Error(`Missing ${name}`);
    if (new URL(values.S3_ENDPOINT).protocol !== 'https:')
      throw new Error('S3_ENDPOINT must use HTTPS');
  }
  return {
    ...values,
    BLOB_STORAGE: blobStorage,
    LOG_FORMAT: logFormat,
    LOG_LEVEL: logLevel,
    PORT: readInteger('PORT', values.PORT, 65535),
    E2E_PORT: readInteger('E2E_PORT', values.E2E_PORT, 65535),
    CHAT_TIMEOUT_MS: readInteger('CHAT_TIMEOUT_MS', values.CHAT_TIMEOUT_MS),
    CHAT_TOOL_CALLS: readInteger('CHAT_TOOL_CALLS', values.CHAT_TOOL_CALLS),
    IMPORT_TIMEOUT_MS: readInteger('IMPORT_TIMEOUT_MS', values.IMPORT_TIMEOUT_MS),
    IMPORT_MAX_REQUESTS: readInteger('IMPORT_MAX_REQUESTS', values.IMPORT_MAX_REQUESTS),
    IMPORT_MAX_RESOURCES: readInteger('IMPORT_MAX_RESOURCES', values.IMPORT_MAX_RESOURCES),
    IMPORT_TOOL_ROUNDS: readInteger('IMPORT_TOOL_ROUNDS', values.IMPORT_TOOL_ROUNDS),
    DISCOVERY_TIMEOUT_MS: readInteger('DISCOVERY_TIMEOUT_MS', values.DISCOVERY_TIMEOUT_MS),
    MAX_UPLOAD_BYTES: readInteger('MAX_UPLOAD_BYTES', values.MAX_UPLOAD_BYTES),
    ENABLE_SAMPLE_DATA: String(values.ENABLE_SAMPLE_DATA) === 'true',
    LANGFUSE_TRACING_ENABLED: String(values.LANGFUSE_TRACING_ENABLED) !== 'false',
    LANGFUSE_TRACING_ENVIRONMENT:
      values.LANGFUSE_TRACING_ENVIRONMENT || values.NODE_ENV || 'development',
    CI: Boolean(values.CI),
  };
}

// Parses a positive integer within the setting's permitted range.
function readInteger(name: string, value: string | number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new Error(`Invalid ${name}`);
  return parsed;
}

// Narrows a setting to its declared choices.
function readChoice<const Choices extends readonly string[]>(
  name: string,
  value: string,
  choices: Choices,
) {
  const parsed = choices.find((choice) => choice === value);
  if (parsed === undefined) throw new Error(`Invalid ${name}`);
  return parsed;
}
