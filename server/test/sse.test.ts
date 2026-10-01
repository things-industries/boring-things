import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import Fastify from 'fastify';
import { sseHeaders, ServerSentEvents } from '../src/http/sse.js';

function source(t: TestContext) {
  const sse = new ServerSentEvents();
  const listeners = new Set<(event: string) => void>();
  t.after(() => sse.close());
  return {
    sse,
    listeners,
    subscribe(receive: (event: string) => void) {
      listeners.add(receive);
      return () => {
        listeners.delete(receive);
      };
    },
    publish(event = 'change') {
      for (const listener of listeners) listener(event);
    },
  };
}

test('SSE subscribes before reading and coalesces changes during an initial snapshot', async (t) => {
  const input = source(t);
  let release!: (value: number) => void;
  let reads = 0;
  const stream = input.sse.stream(input.subscribe, {
    event: 'thing.snapshot',
    snapshot: async () => {
      assert.equal(input.listeners.size, 1);
      reads++;
      return reads === 1
        ? new Promise<number>((resolve) => {
            release = resolve;
          })
        : 2;
    },
    revision: (value) => value,
  });
  input.publish();
  input.publish();
  assert.equal(reads, 1);
  release(1);
  await setImmediate();
  assert.equal(reads, 2);
  assert.equal(
    stream.read().toString(),
    'id: 1\nevent: thing.snapshot\ndata: 1\n\nid: 2\nevent: thing.snapshot\ndata: 2\n\n',
  );
  input.publish();
  await setImmediate();
  assert.equal(stream.read(), null);
});

test('SSE polls persisted snapshots without local notifications and renews at 55 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const input = source(t);
  let revision = 1;
  const stream = input.sse.stream(input.subscribe, {
    event: 'thing.snapshot',
    snapshot: async () => revision,
    revision: (value) => value,
  });
  const frames: string[] = [];
  stream.on('data', (chunk) => frames.push(chunk.toString()));
  await setImmediate();
  revision = 2;
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.match(frames.join(''), /keep-alive/);
  assert.match(frames.join(''), /id: 2/);
  t.mock.timers.tick(44999);
  await setImmediate();
  assert.equal(input.listeners.size, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(input.listeners.size, 0);
  assert.equal(stream.readableEnded, true);
});

test('SSE forwards deltas without rereading snapshots', async (t) => {
  const input = source(t);
  let reads = 0;
  const stream = input.sse.stream(input.subscribe, {
    event: 'conversation.snapshot',
    snapshot: async () => ++reads,
    eventFor: (text) => ({
      event: 'conversation.delta',
      data: { messageId: 'one', offset: 0, text },
    }),
  });
  await setImmediate();
  stream.read();
  input.publish('hello');
  assert.equal(
    stream.read().toString(),
    'event: conversation.delta\ndata: {"messageId":"one","offset":0,"text":"hello"}\n\n',
  );
  assert.equal(reads, 1);
});

test('disconnect and shutdown unsubscribe and stop periodic reads', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const input = source(t);
  let reads = 0;
  const options = { event: 'snapshot', snapshot: async () => ++reads };
  const first = input.sse.stream(input.subscribe, options);
  const second = input.sse.stream(input.subscribe, options);
  second.resume();
  await setImmediate();
  first.destroy();
  await setImmediate();
  assert.equal(input.listeners.size, 1);
  input.sse.close();
  input.sse.close();
  await setImmediate();
  assert.equal(input.listeners.size, 0);
  assert.equal(second.readableEnded, true);
  t.mock.timers.tick(60000);
  input.publish();
  await setImmediate();
  assert.equal(reads, 2);
});

test('snapshot failures close streams without exposing error details', async (t) => {
  const input = source(t);
  const stream = input.sse.stream(input.subscribe, {
    event: 'snapshot',
    snapshot: async () => {
      throw new Error('private database details');
    },
  });
  assert.equal(await stream.toArray().then((chunks) => chunks.join('')), '');
  assert.equal(input.listeners.size, 0);
});

test('late snapshot results are discarded after disconnect', async (t) => {
  const input = source(t);
  let release!: (value: string) => void;
  const stream = input.sse.stream(input.subscribe, {
    event: 'snapshot',
    snapshot: () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  });
  stream.destroy();
  await setImmediate();
  release('late');
  await setImmediate();
  assert.equal(stream.readableLength, 0);
  assert.equal(input.listeners.size, 0);
});

test('slow consumers close when the buffer fills and stop receiving events', async (t) => {
  const input = source(t);
  const stream = input.sse.stream(input.subscribe, {
    event: 'snapshot',
    snapshot: async () => 'initial',
    eventFor: (text) => ({ event: 'delta', data: text }),
  });
  await setImmediate();
  const chunk = 'x'.repeat(16384);
  for (let index = 0; index < 20; index++) input.publish(chunk);
  assert.equal(input.listeners.size, 0);
  assert.ok(stream.readableLength < 100000);
  await stream.toArray();
  assert.equal(stream.readableEnded, true);
});

test(
  'Fastify disconnect and shutdown release live SSE connections',
  { timeout: 10000 },
  async (t) => {
    const input = source(t);
    const app = Fastify();
    app.addHook('preClose', async () => input.sse.close());
    t.after(() => app.close());
    let disconnected!: () => void;
    const stopped = new Promise<void>((resolve) => {
      disconnected = resolve;
    });
    app.get('/stream', (_request, reply) =>
      reply.headers(sseHeaders).send(
        input.sse.stream(
          (receive) => {
            const unsubscribe = input.subscribe(receive);
            return () => {
              unsubscribe();
              disconnected();
            };
          },
          { event: 'snapshot', snapshot: async () => 'ready' },
        ),
      ),
    );
    const base = await app.listen({ host: '127.0.0.1', port: 0 });
    const abort = new AbortController();
    const first = await fetch(base + '/stream', { signal: abort.signal });
    assert.equal(first.headers.get('content-type'), 'text/event-stream');
    assert.equal(first.headers.get('cache-control'), 'private, no-store');
    await first.body!.getReader().read();
    abort.abort();
    await stopped;
    assert.equal(input.listeners.size, 0);
    const second = await fetch(base + '/stream');
    const reader = second.body!.getReader();
    await reader.read();
    const closing = app.close();
    assert.equal((await reader.read()).done, true);
    await closing;
    assert.equal(input.listeners.size, 0);
  },
);
