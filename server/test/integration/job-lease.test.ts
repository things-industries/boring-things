import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createPool } from '../../src/db/connection.js';
import { jobLease } from '../../src/db/job-lease.js';
import { JobRunner } from '../../src/application/jobs/runner.js';

test('overlapping runners recover only after leadership transfers', async () => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  );
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const admin = createPool(url.toString());
  const name = 'bt_lease_' + randomUUID().replaceAll('-', '');
  await admin.query(`create database ${name}`);
  url.pathname = '/' + name;
  const pool = createPool(url.toString());
  const events: string[] = [];
  const failures: unknown[] = [];
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = new JobRunner(
    [
      {
        async recover() {
          events.push('first recover');
        },
        async next(signal) {
          events.push('first work');
          started();
          await new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve(), { once: true }),
          );
          await setTimeout(30);
          events.push('first stopped');
          return false;
        },
      },
    ],
    (error) => failures.push(error),
    jobLease(pool, () => failures.push('lost')),
  );
  let recovered!: () => void;
  const transferred = new Promise<void>((resolve) => {
    recovered = resolve;
  });
  let connectionLost!: () => void;
  const lost = new Promise<void>((resolve) => {
    connectionLost = resolve;
  });
  const second = new JobRunner(
    [
      {
        async recover() {
          events.push('second recover');
          recovered();
        },
        async next() {
          return false;
        },
      },
    ],
    (error) => failures.push(error),
    jobLease(pool, connectionLost),
  );
  try {
    await first.start();
    await entered;
    await second.start();
    assert.deepEqual(events, ['first recover', 'first work']);
    const stopping = first.stop();
    second.wake();
    await stopping;
    await Promise.race([
      transferred,
      setTimeout(5000).then(() => {
        throw new Error('Runner did not take over');
      }),
    ]);
    assert.deepEqual(events, ['first recover', 'first work', 'first stopped', 'second recover']);
    assert.deepEqual(failures, []);
    const terminated = await admin.query(
      `select pg_terminate_backend(pid) from pg_locks where locktype='advisory'
       and classid=18451 and objid=1 and database=(select oid from pg_database where datname=$1)`,
      [name],
    );
    assert.equal(terminated.rowCount, 1);
    await Promise.race([
      lost,
      setTimeout(5000).then(() => {
        throw new Error('Lost session was not reported');
      }),
    ]);
    const release = await jobLease(pool, () => {
      throw new Error('Unexpected lock loss');
    }).acquire();
    assert.ok(release, 'terminated leader releases its database lock');
    await release();
  } finally {
    await first.stop();
    await second.stop();
    await pool.end();
    await admin.query(`drop database ${name} with (force)`);
    await admin.end();
  }
});
