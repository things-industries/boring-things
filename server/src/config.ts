/**
 * Reads server configuration from environment variables, including provider credentials, storage
 * paths and workflow limits.
 */

export interface Config {
  chatTimeoutMs: number;
  chatToolCalls: number;
  openaiApiKey: string;
  openaiModel: string;
  importTimeoutMs: number;
  importToolRounds: number;
  discoveryTimeoutMs: number;
  discoverySearchCalls: number;
  aiMaxOutputTokens: number;
  port: number;
  host: string;
  databaseUrl: string;
  blobDirectory: string;
  logtoEndpoint: string;
  logtoAppId: string;
  apiResource: string;
  maxUploadBytes: number;
  supportedMediaTypes: string[];
  sampleDataEnabled: boolean;
}

export function readConfig(): Config {
  return {
    chatTimeoutMs: numberOrFallback('CHAT_TIMEOUT_MS', 180000),
    chatToolCalls: numberOrFallback('CHAT_TOOL_CALLS', 12),
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? '',
    importTimeoutMs: numberOrFallback('IMPORT_TIMEOUT_MS', 180000),
    importToolRounds: numberOrFallback('IMPORT_TOOL_ROUNDS', 4),
    discoveryTimeoutMs: numberOrFallback('DISCOVERY_TIMEOUT_MS', 90000),
    discoverySearchCalls: numberOrFallback('DISCOVERY_SEARCH_CALLS', 3),
    aiMaxOutputTokens: numberOrFallback('AI_MAX_OUTPUT_TOKENS', 12000),
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '127.0.0.1',
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    blobDirectory: process.env.BLOB_DIRECTORY ?? '.data/blobs',
    logtoEndpoint: process.env.LOGTO_ENDPOINT ?? '',
    logtoAppId: process.env.LOGTO_APP_ID ?? '',
    apiResource: process.env.LOGTO_API_RESOURCE ?? 'https://api.boring-things.local',
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 20971520),
    supportedMediaTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'],
    sampleDataEnabled: process.env.ENABLE_SAMPLE_DATA === 'true',
  };
}

function numberOrFallback(name: string, fallback: number) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid ${name}`);
  return n;
}
