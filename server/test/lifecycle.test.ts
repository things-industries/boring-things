import { test } from 'node:test';
import { setEnvMode } from '../src/config.js';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApp } from '../src/app.js';

setEnvMode('test');

test('missing AI credentials reject startup and close the owned pool', async (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: '' };
  setEnvMode('runtime');
  t.after(() => {
    process.env = env;
    setEnvMode('test');
  });
  t.mock.method(pg.Pool.prototype, 'query', async () => ({ rows: [] }));
  const end = t.mock.method(pg.Pool.prototype, 'end', async () => {});
  await assert.rejects(buildApp(), /Missing OPENAI_API_KEY/);
  assert.equal(end.mock.callCount(), 1);
});

test('failed startup closes owned pools and preserves injected pools', async (t) => {
  const failure = new Error('Registry unavailable');
  t.mock.method(pg.Pool.prototype, 'query', async () => {
    throw failure;
  });
  const end = t.mock.method(pg.Pool.prototype, 'end', async () => {});
  await assert.rejects(buildApp(), (error) => error === failure);
  assert.equal(end.mock.callCount(), 1);
  await assert.rejects(buildApp({ dbPool: new pg.Pool() }), (error) => error === failure);
  assert.equal(end.mock.callCount(), 1);
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
  const owned = await buildApp();
  await owned.ready();
  await owned.close();
  assert.equal(end.mock.callCount(), 1);
  const injected = await buildApp({ dbPool: new pg.Pool() });
  await injected.ready();
  await injected.close();
  assert.equal(end.mock.callCount(), 1);
});
