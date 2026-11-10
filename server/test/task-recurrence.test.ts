/** Calendar and validation coverage for recurrence anchored to the original scheduled date. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocalDate,
  getNextTaskDates,
  validateTaskSchedule,
} from '../src/application/task-recurrence.js';
import type { Schema } from '../../shared/model.js';

const monthly: Schema['TaskRecurrence'] = { interval: 1, unit: 'MONTH', from: 'SCHEDULED' };

test('scheduled recurrence keeps month-end references and skips missed occurrences', () => {
  const reference = { scheduledOn: '2026-01-31' };
  const task = { ...reference, deadlineOn: null, recurrence: monthly };
  const february = getNextTaskDates(task, reference, '2026-01-30');
  assert.deepEqual(february, { scheduledOn: '2026-02-28', deadlineOn: null });
  assert.deepEqual(getNextTaskDates({ ...task, ...february }, reference, '2026-02-28'), {
    scheduledOn: '2026-03-31',
    deadlineOn: null,
  });
  assert.deepEqual(getNextTaskDates({ ...task, ...february }, reference, '2026-03-31'), {
    scheduledOn: '2026-04-30',
    deadlineOn: null,
  });
});

test('annual cadence restores leap day and timezone conversion follows the local date', () => {
  const reference = { scheduledOn: '2024-02-29' };
  const task = {
    scheduledOn: '2027-02-28',
    deadlineOn: null,
    recurrence: { ...monthly, unit: 'YEAR' } satisfies Schema['TaskRecurrence'],
  };
  assert.equal(getNextTaskDates(task, reference, '2027-02-28').scheduledOn, '2028-02-29');
  assert.equal(getLocalDate(new Date('2026-03-29T23:30:00Z'), 'Europe/London'), '2026-03-30');
  assert.throws(() => getLocalDate(new Date(), 'Invalid/Zone'), /Unknown timezone/);
});

test('recurring suggestions can be undated until acceptance', () => {
  const task = { scheduledOn: null, deadlineOn: null, recurrence: monthly };
  validateTaskSchedule(task, true);
  assert.throws(() => validateTaskSchedule(task), /need a scheduled date/);
});

for (const from of ['COMPLETION', 'SCHEDULED'] as const) {
  test(`${from} recurrence rejects deadlines for suggestions and accepted Tasks`, () => {
    const task = {
      scheduledOn: '2026-01-10',
      deadlineOn: '2026-01-20',
      recurrence: { ...monthly, from },
    };
    for (const suggested of [true, false])
      assert.throws(() => validateTaskSchedule(task, suggested), /deadline cannot recur/);
    assert.throws(() => getNextTaskDates(task, task, '2026-01-31'), /deadline cannot recur/);
    validateTaskSchedule({ ...task, recurrence: null });
  });
}

// a139bfe removed completion-based recurrence and changed its reference to saved dates.
test('completion recurrence advances the actual completion date', () => {
  const task = {
    scheduledOn: '2026-01-10',
    deadlineOn: null,
    recurrence: { ...monthly, from: 'COMPLETION' as const },
  };
  assert.deepEqual(getNextTaskDates(task, task, '2026-01-31'), {
    scheduledOn: '2026-02-28',
    deadlineOn: null,
  });
});
