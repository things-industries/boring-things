import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, isNewThing } from '../../src/app/utils/date.util.js';

test('New badge includes creation and excludes the seven-day boundary and future dates', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  assert.equal(isNewThing('2026-10-01T12:00:00Z', now), true);
  assert.equal(isNewThing('2026-09-24T12:00:00.001Z', now), true);
  assert.equal(isNewThing('2026-09-24T12:00:00Z', now), false);
  assert.equal(isNewThing('2026-10-01T12:00:00.001Z', now), false);
  assert.equal(isNewThing('invalid', now), false);
});

test('Issue countdown uses calendar days across DST and distinguishes due and overdue dates', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/London';
  try {
    const now = new Date(2026, 9, 24, 23, 30);
    assert.equal(daysUntil('2026-10-24', now), 0);
    assert.equal(daysUntil('2026-10-25', now), 1);
    assert.equal(daysUntil('2026-10-26', now), 2);
    assert.equal(daysUntil('2026-10-23', now), -1);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
