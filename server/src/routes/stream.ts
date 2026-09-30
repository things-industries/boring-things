import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Schema } from '../../../shared/model.js';

type StreamReply = Pick<FastifyReply, 'raw' | 'hijack'>;
interface StreamEvent {
  event: string;
  data: Schema['ConversationDelta'];
}
export interface SnapshotStream<T> {
  event: string;
  snapshot(): Promise<T>;
  subscribe(changed: () => void): () => void;
  revision?(snapshot: T): number;
  deltas?(send: (event: StreamEvent) => void): () => void;
}
export type StreamSnapshots = <T>(reply: StreamReply, options: SnapshotStream<T>) => Promise<void>;

export function createStreams(app: FastifyInstance): StreamSnapshots {
  const active = new Set<() => void>();
  app.addHook('preClose', async () => {
    for (const close of active) close();
  });
  return async function streamSnapshots<T>(reply: StreamReply, options: SnapshotStream<T>) {
    let closed = false,
      running = false,
      dirty = true,
      revision = -1;
    let unsubscribe = () => {},
      unsubscribeDeltas = () => {};
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      unsubscribeDeltas();
      clearInterval(keepalive);
      clearTimeout(renew);
      active.delete(close);
      reply.raw.off('close', close);
      reply.raw.end();
    };
    const write = (value: string) => {
      if (!closed && !reply.raw.write(value)) close();
    };
    const send = async () => {
      if (closed || running) return;
      running = true;
      try {
        do {
          dirty = false;
          const data = await options.snapshot();
          const next = options.revision?.(data);
          if (next === undefined || next > revision) {
            if (next !== undefined) revision = next;
            write(
              `${next === undefined ? '' : `id: ${next}\n`}event: ${options.event}\ndata: ${JSON.stringify(data)}\n\n`,
            );
          }
        } while (dirty && !closed);
      } catch {
        close();
      } finally {
        running = false;
      }
    };
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    active.add(close);
    reply.raw.on('close', close);
    unsubscribe = options.subscribe(() => {
      dirty = true;
      void send();
    });
    unsubscribeDeltas =
      options.deltas?.(({ event, data }) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      ) ?? (() => {});
    const keepalive = setInterval(() => {
      write(': keep-alive\n\n');
      dirty = true;
      void send();
    }, 10000);
    // Reconnects renew authentication; existing streams cannot revalidate their bearer token.
    const renew = setTimeout(close, 55000);
    await send();
  };
}
