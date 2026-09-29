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
  let delay: number = APP_CONFIG.streamRetryMs;
  while (!signal.aborted) {
    try {
      const result = await client.GET('/api/things/{thingId}/stream', {
        params: { path: { thingId: id } },
        parseAs: 'stream',
        signal,
      });
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
            if (lines.includes('event: thing.snapshot')) {
              const thing = JSON.parse(
                lines
                  .filter((l) => l.startsWith('data:'))
                  .map((l) => l.slice(5).trimStart())
                  .join('\n'),
              ) as Schema['Thing'];
              if (!signal.aborted) receive(thing);
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
