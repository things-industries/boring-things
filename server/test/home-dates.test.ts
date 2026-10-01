import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysUntil,
  eventStart,
  isNewThing,
  relativeDistance,
  startsFrom,
} from '../../src/app/utils/date.util.js';

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

test('Relative time uses days under a week, then weeks, whole months and whole years', () => {
  const now = new Date(2026, 9, 25, 12);
  const distance = (value: string) => relativeDistance(value, now);

  assert.deepEqual(distance('2026-10-25T09:00'), { amount: 0, unit: 'day' });
  assert.deepEqual(distance('2026-10-31'), { amount: 6, unit: 'day' });
  assert.deepEqual(distance('2026-11-01'), { amount: 1, unit: 'week' });
  // Crossing into the next calendar month is not a month away.
  assert.deepEqual(distance('2026-11-02'), { amount: 1, unit: 'week' });
  assert.deepEqual(distance('2026-11-24'), { amount: 4, unit: 'week' });
  assert.deepEqual(distance('2026-11-25'), { amount: 1, unit: 'month' });
  assert.deepEqual(distance('2027-10-24'), { amount: 11, unit: 'month' });
  assert.deepEqual(distance('2027-10-25'), { amount: 1, unit: 'year' });
  assert.deepEqual(distance('2026-10-11'), { amount: -2, unit: 'week' });
});

test('An event starts at its instant, or at local midnight on its date', () => {
  assert.equal(
    eventStart({ startsAt: null, startsOn: '2026-10-25' }),
    new Date(2026, 9, 25).getTime(),
  );
  assert.equal(
    eventStart({ startsAt: '2026-10-25T09:30', startsOn: '2026-10-20' }),
    new Date(2026, 9, 25, 9, 30).getTime(),
  );
  assert.equal(eventStart({ startsAt: null, startsOn: null }), null);
});

test('A date-only event stays upcoming for its whole day; a timed event until it starts', () => {
  const now = new Date(2026, 9, 25, 12);

  assert.equal(startsFrom({ startsAt: null, startsOn: '2026-10-25' }, now), true);
  assert.equal(startsFrom({ startsAt: null, startsOn: '2026-10-24' }, now), false);
  assert.equal(startsFrom({ startsAt: '2026-10-25T11:00', startsOn: null }, now), false);
  assert.equal(startsFrom({ startsAt: '2026-10-25T13:00', startsOn: null }, now), true);
  assert.equal(startsFrom({ startsAt: null, startsOn: null }, now), false);
});
