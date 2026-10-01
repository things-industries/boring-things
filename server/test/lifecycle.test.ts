import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { JobRunner } from '../src/application/jobs/runner.js';

test('failed startup closes owned pools and preserves injected pools', async (t) => {
  const failure = new Error('Registry unavailable');
  t.mock.method(pg.Pool.prototype, 'query', async () => {
    throw failure;
  });
  const end = t.mock.method(pg.Pool.prototype, 'end', async () => {});
  const config = readConfig();
  await assert.rejects(buildApp({ config }), (error) => error === failure);
  assert.equal(end.mock.callCount(), 1);
  await assert.rejects(buildApp({ config, dbPool: new pg.Pool() }), (error) => error === failure);
  assert.equal(end.mock.callCount(), 1);
});

test('runner recovers before work and waits for aborted work during shutdown', async () => {
  const events: string[] = [];
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runner = new JobRunner(
    [
      {
        async recover() {
          events.push('recover');
        },
        async next(signal) {
          events.push('next');
          started();
          await new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve(), { once: true }),
          );
          events.push('abort');
          return false;
        },
      },
    ],
    () => events.push('failure'),
  );
  await runner.start();
  await entered;
  await runner.stop();
  runner.wake();
  assert.deepEqual(events, ['recover', 'next', 'abort']);
});

test('normal shutdown closes owned database pools and preserves injected pools', async (t) => {
  t.mock.method(pg.Pool.prototype, 'query', async () => ({ rows: [] }));
  t.mock.method(pg.Pool.prototype, 'connect', async () => ({
    query: async () => ({ rows: [{ acquired: false }] }),
    on() {},
    removeListener() {},
    release() {},
  }));
  const end = t.mock.method(pg.Pool.prototype, 'end', async () => {});
  const config = readConfig({});
  const owned = await buildApp({ config });
  await owned.ready();
  await owned.close();
  assert.equal(end.mock.callCount(), 1);
  const injected = await buildApp({ config, dbPool: new pg.Pool() });
  await injected.ready();
  await injected.close();
  assert.equal(end.mock.callCount(), 1);
});
