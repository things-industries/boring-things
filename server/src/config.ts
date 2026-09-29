export interface Config {
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
