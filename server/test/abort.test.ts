import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitWithSignal } from '../src/lib/abort.js';
test('abort stops waiting and suppresses late completion', async () => {
  const controller = new AbortController();
  let complete!: (value: string) => void;
  const result = awaitWithSignal(
    new Promise<string>((resolve) => {
      complete = resolve;
    }),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(result);
  complete('late');
});

test('an already-aborted wait still observes an underlying rejection', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await assert.rejects(
    awaitWithSignal(Promise.reject(new Error('late failure')), controller.signal),
    /cancelled/,
  );
});
