import { Readable } from 'node:stream';

export const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'private, no-store',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
};

interface StreamEvent {
  event: string;
  data: unknown;
}
interface SnapshotOptions<T, E> {
  event: string;
  snapshot(): Promise<T>;
  revision?(snapshot: T): number;
  // Notifications without an outgoing event trigger a fresh snapshot.
  eventFor?(notification: E): StreamEvent | undefined;
}
type Subscribe<E> = (receive: (notification: E) => void) => () => void;

/** Encodes snapshots and events, bounds buffering, and owns the lifetime of open SSE streams. */
export class ServerSentEvents {
  private active = new Set<() => void>();

  close(): void {
    for (const close of this.active) close();
  }

  stream<T, E>(subscribe: Subscribe<E>, options: SnapshotOptions<T, E>): Readable {
    const stream = new Readable({ read() {}, highWaterMark: 65536 });
    let closed = false,
      running = false,
      dirty = true,
      revision = -1;
    let unsubscribe = () => {};
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(keepalive);
      clearTimeout(renew);
      this.active.delete(close);
      stream.push(null);
    };
    const write = (value: string) => {
      if (!closed && !stream.push(value)) close();
    };
    const send = async () => {
      if (closed || running) return;
      running = true;
      try {
        do {
          dirty = false;
          const data = await options.snapshot();
          if (closed) return;
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
    const keepalive = setInterval(() => {
      write(': keep-alive\n\n');
      dirty = true;
      void send();
    }, 10000);
    // Reconnecting renews bearer authentication.
    const renew = setTimeout(close, 55000);
    this.active.add(close);
    stream.once('close', close);
    try {
      // Subscribe before the first read so changes during that read cause another snapshot.
      unsubscribe = subscribe((notification) => {
        if (closed) return;
        try {
          const event = options.eventFor?.(notification);
          if (event) write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
          else {
            dirty = true;
            void send();
          }
        } catch {
          close();
        }
      });
      if (closed) unsubscribe();
      else void send();
    } catch (error) {
      close();
      throw error;
    }
    return stream;
  }
}
