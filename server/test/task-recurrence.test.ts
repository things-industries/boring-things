/** Calendar and validation coverage for recurrence anchored to original Task dates. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocalDate,
  getNextTaskDates,
  validateTaskSchedule,
} from '../src/application/task-recurrence.js';
import type { Schema } from '../../shared/model.js';

const monthly: Schema['TaskRecurrence'] = { interval: 1, unit: 'MONTH' };
test('both dates follow the original monthly cadence and skip missed occurrences', () => {
  const reference = { scheduledOn: '2026-01-20', deadlineOn: '2026-01-31' };
  const task = { ...reference, recurrence: monthly };
  assert.deepEqual(getNextTaskDates(task, reference, '2026-01-30'), {
    scheduledOn: '2026-02-20',
    deadlineOn: '2026-02-28',
  });
  assert.deepEqual(
    getNextTaskDates(
      { ...task, scheduledOn: '2026-02-20', deadlineOn: '2026-02-28' },
      reference,
      '2026-03-31',
    ),
    {
      scheduledOn: '2026-04-20',
      deadlineOn: '2026-04-30',
    },
  );
});
for (const key of ['scheduledOn', 'deadlineOn'] as const) {
  test(`${key} alone repeats without month-end drift`, () => {
    const reference = { scheduledOn: null, deadlineOn: null, [key]: '2026-01-31' };
    const task = { ...reference, recurrence: monthly };
    const february = getNextTaskDates(task, reference, '2026-01-31');
    assert.equal(february[key], '2026-02-28');
    const march = getNextTaskDates({ ...task, ...february }, reference, '2026-02-28');
    assert.equal(march[key], '2026-03-31');
    assert.equal(march[key === 'scheduledOn' ? 'deadlineOn' : 'scheduledOn'], null);
  });
}
test('annual cadence restores leap day and timezone conversion follows the local date', () => {
  const reference = { scheduledOn: null, deadlineOn: '2024-02-29' };
  const task = {
    ...reference,
    deadlineOn: '2027-02-28',
    recurrence: { ...monthly, unit: 'YEAR' } satisfies Schema['TaskRecurrence'],
  };
  assert.equal(getNextTaskDates(task, reference, '2027-02-28').deadlineOn, '2028-02-29');
  assert.equal(getLocalDate(new Date('2026-03-29T23:30:00Z'), 'Europe/London'), '2026-03-30');
  assert.throws(() => getLocalDate(new Date(), 'Invalid/Zone'), /Unknown timezone/);
});
test('recurring suggestions can be undated until acceptance', () => {
  const task = { scheduledOn: null, deadlineOn: null, recurrence: monthly };
  validateTaskSchedule(task, true);
  assert.throws(() => validateTaskSchedule(task), /need a date/);
});
