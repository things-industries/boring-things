import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ThingChanges } from '../application/streams.js';
import type { Assistant } from '../application/conversations.js';
export async function streamSnapshots(
  req: FastifyRequest<{ Params: Record<string, string> }>,
  reply: FastifyReply,
  changes: ThingChanges,
  event: string,
  snapshot: () => Promise<unknown>,
  assistant: Assistant,
) {
  let closed = false,
    running = false,
    dirty = true;
  const send = async () => {
    if (closed || running) return;
    running = true;
    try {
      do {
        dirty = false;
        const data = await snapshot();
        if (!closed && !reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
          reply.raw.end();
          cleanup();
        }
      } while (dirty && !closed);
    } catch {
      reply.raw.end();
      cleanup();
    } finally {
      running = false;
    }
  };
  const unsubscribe = changes.subscribe(req.ownerId, () => {
    dirty = true;
    void send();
  });
  const unsubDelta = assistant.subscribe(req.ownerId, req.params.id, (delta) => {
    if (
      !closed &&
      !reply.raw.write(`event: conversation.delta\ndata: ${JSON.stringify(delta)}\n\n`)
    ) {
      reply.raw.end();
      cleanup();
    }
  });
  const keepalive = setInterval(() => {
    if (!closed) {
      reply.raw.write(': keep-alive\n\n');
      dirty = true;
      void send();
    }
  }, 10000);
  const renew = setTimeout(() => {
    reply.raw.end();
    cleanup();
  }, 55000);
  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    unsubDelta();
    clearInterval(keepalive);
    clearTimeout(renew);
  };
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'private, no-store',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  reply.raw.on('close', cleanup);
  await send();
}
