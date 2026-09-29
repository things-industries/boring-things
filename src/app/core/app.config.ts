export const APP_CONFIG = {
  streamRetryMs: 1000,
  streamMaxRetryMs: 15000,
  streamMaxFrameBytes: 2 * 1024 * 1024,
  apiPageSize: 100,
  activityLimit: 3,
  thingPageSize: 24,
  downloadUrlLifetimeMs: 1000,
} as const;
