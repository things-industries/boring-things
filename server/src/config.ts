/**
 * Reads server configuration from environment variables, including provider credentials, storage
 * paths and workflow limits.
 */

export type EnvConfig = ReturnType<typeof readConfig>;

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const blobStorage = env.BLOB_STORAGE ?? 'local';
  if (blobStorage !== 'local' && blobStorage !== 's3') throw new Error('Invalid BLOB_STORAGE');

  if (env.NODE_ENV === 'production') {
    for (const name of ['DATABASE_URL', 'LOGTO_ENDPOINT', 'LOGTO_APP_ID', 'LOGTO_API_RESOURCE'])
      required(env, name);
    if (blobStorage !== 's3') throw new Error('Production requires BLOB_STORAGE=s3');
    const database = new URL(required(env, 'DATABASE_URL'));
    if (database.port !== '5432')
      throw new Error('Production requires a session connection on port 5432');
  }

  const s3 =
    blobStorage === 's3'
      ? {
          endpoint: required(env, 'S3_ENDPOINT'),
          region: required(env, 'S3_REGION'),
          bucket: required(env, 'S3_BUCKET'),
          accessKeyId: required(env, 'S3_ACCESS_KEY_ID'),
          secretAccessKey: required(env, 'S3_SECRET_ACCESS_KEY'),
        }
      : undefined;

  if (s3 && new URL(s3.endpoint).protocol !== 'https:')
    throw new Error('S3_ENDPOINT must use HTTPS');

  return {
    blobStorage: blobStorage as 'local' | 's3',
    s3,
    chatTimeoutMs: numberOrFallback(env, 'CHAT_TIMEOUT_MS', 180000),
    chatToolCalls: numberOrFallback(env, 'CHAT_TOOL_CALLS', 12),
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    openaiModel: env.OPENAI_MODEL ?? '',
    documentExtractionModel: env.DOCUMENT_EXTRACTION_MODEL || env.OPENAI_MODEL || '',
    importTimeoutMs: numberOrFallback(env, 'IMPORT_TIMEOUT_MS', 180000),
    importToolRounds: numberOrFallback(env, 'IMPORT_TOOL_ROUNDS', 4),
    discoveryTimeoutMs: numberOrFallback(env, 'DISCOVERY_TIMEOUT_MS', 90000),
    discoverySearchCalls: numberOrFallback(env, 'DISCOVERY_SEARCH_CALLS', 3),
    aiMaxOutputTokens: numberOrFallback(env, 'AI_MAX_OUTPUT_TOKENS', 12000),
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    blobDirectory: env.BLOB_DIRECTORY ?? '.data/blobs',
    logtoEndpoint: env.LOGTO_ENDPOINT ?? '',
    logtoAppId: env.LOGTO_APP_ID ?? '',
    apiResource: env.LOGTO_API_RESOURCE ?? 'https://api.boring-things.local',
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 20971520),
    supportedMediaTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'],
    sampleDataEnabled: env.ENABLE_SAMPLE_DATA === 'true',
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function numberOrFallback(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const n = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid ${name}`);
  return n;
}
