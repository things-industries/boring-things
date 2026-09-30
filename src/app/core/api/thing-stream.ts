import type { Schema } from '../../../../shared/model';
import type { createApiClient } from './api-client';
import { APP_CONFIG } from '../app.config';
import { ApiError } from '../../utils/error.util';
// Fetch keeps bearer authentication and token refresh on the existing API client.
export async function watchThing(
  client: ReturnType<typeof createApiClient>,
  id: string,
  signal: AbortSignal,
  receive: (thing: Schema['Thing']) => void,
  failed: () => void,
) {
  return watchSse(
    () =>
      client.GET('/api/things/{thingId}/stream', {
        params: { path: { thingId: id } },
        parseAs: 'stream',
        signal,
      }),
    signal,
    (event, data) => {
      if (event === 'thing.snapshot') receive(data as Schema['Thing']);
    },
    failed,
  );
}
export async function watchSse(
  open: () => Promise<{ data?: ReadableStream<Uint8Array> | null }>,
  signal: AbortSignal,
  receive: (event: string, data: unknown) => void,
  failed: () => void,
) {
  let delay: number = APP_CONFIG.streamRetryMs;
  while (!signal.aborted) {
    try {
      const result = await open();
      if (!result.data) throw new Error('Missing stream');
      const reader = result.data.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
          if (buffer.length > APP_CONFIG.streamMaxFrameBytes)
            throw new Error('Stream frame too large');
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const lines = frame.split('\n');
            const event = lines
              .find((l) => l.startsWith('event:'))
              ?.slice(6)
              .trim();
            const data = lines
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n');
            if (event && data) {
              if (!signal.aborted) receive(event, JSON.parse(data));
              delay = APP_CONFIG.streamRetryMs;
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
        failed();
        return;
      }
      failed();
    }
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, delay);
      signal.addEventListener('abort', finish, { once: true });
    });
    delay = Math.min(delay * 2, APP_CONFIG.streamMaxRetryMs);
  }
}
