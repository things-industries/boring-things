/** Verifies independent job execution, serial processor work and leadership-safe shutdown. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { JobRunner } from '../../src/application/jobs/runner.js';

// Creates a completion controlled by the test without relying on elapsed time.
function gate() {
  let complete = () => {};
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

// The serial runner prevented transcription queued while an Import was waiting from starting.
test('transcription runs while an Import waits for its result', async () => {
  const importing = gate();
  const transcribed = gate();
  const imported = gate();
  let sourcePending = false;
  let importPending = true;
  const failures: unknown[] = [];
  const runner = new JobRunner(
    [
      {
        async recover() {},
        async next(signal) {
          if (!importPending) return false;
          importPending = false;
          importing.complete();
          await Promise.race([
            transcribed.promise,
            new Promise<void>((resolve) =>
              signal.addEventListener('abort', () => resolve(), { once: true }),
            ),
          ]);
          if (!signal.aborted) imported.complete();
          return true;
        },
      },
      {
        async recover() {},
        async next() {
          if (!sourcePending) return false;
          sourcePending = false;
          transcribed.complete();
          return true;
        },
      },
    ],
    (error) => failures.push(error),
  );
  try {
    await runner.start();
    await importing.promise;
    await setImmediate();
    sourcePending = true;
    runner.wake();
    await setImmediate();
    assert.equal(sourcePending, false);
    await imported.promise;
    assert.deepEqual(failures, []);
  } finally {
    await runner.stop();
  }
});

test('wake keeps each processor serial and isolates processor failures', async () => {
  const held = gate();
  const entered = gate();
  let active = 0;
  let maximum = 0;
  let healthyCalls = 0;
  let fail = true;
  const failure = new Error('Synthetic job failure');
  const failures: unknown[] = [];
  const runner = new JobRunner(
    [
      {
        async recover() {},
        async next() {
          active++;
          maximum = Math.max(maximum, active);
          entered.complete();
          await held.promise;
          active--;
          return false;
        },
      },
      {
        async recover() {},
        async next() {
          healthyCalls++;
          if (fail) throw failure;
          return false;
        },
      },
    ],
    (error) => failures.push(error),
  );
  try {
    await runner.start();
    await entered.promise;
    await setImmediate();
    fail = false;
    runner.wake();
    runner.wake();
    await setImmediate();
    assert.equal(maximum, 1);
    assert.equal(healthyCalls, 2);
    assert.deepEqual(failures, [failure]);
  } finally {
    held.complete();
    await runner.stop();
  }
});

test('recovery precedes all work and leadership remains held until all jobs stop', async () => {
  const stopped = [gate(), gate()];
  const aborted = [gate(), gate()];
  const entered = [gate(), gate()];
  const events: string[] = [];
  const runner = new JobRunner(
    stopped.map((completion, index) => ({
      async recover() {
        events.push('recover ' + index);
      },
      async next(signal) {
        events.push('work ' + index);
        entered[index].complete();
        signal.addEventListener('abort', () => aborted[index].complete(), { once: true });
        await completion.promise;
        events.push('stop ' + index);
        return false;
      },
    })),
    () => assert.fail('Unexpected job failure'),
    {
      async acquire() {
        return async () => {
          events.push('release');
        };
      },
    },
  );
  await runner.start();
  await Promise.all(entered.map((entry) => entry.promise));
  assert.deepEqual(events, ['recover 0', 'recover 1', 'work 0', 'work 1']);
  const stopping = runner.stop();
  await Promise.all(aborted.map((entry) => entry.promise));
  stopped[0].complete();
  await setImmediate();
  assert.equal(events.includes('release'), false);
  stopped[1].complete();
  await stopping;
  assert.equal(events.at(-1), 'release');
});
