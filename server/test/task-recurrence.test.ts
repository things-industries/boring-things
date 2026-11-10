/** Calendar and validation coverage for recurrence references and completion policies. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalDate, getNextTaskDates } from '../src/application/task-recurrence.js';
import type { Schema } from '../../shared/model.js';

const monthly: Schema['TaskRecurrence'] = { interval: 1, unit: 'MONTH', from: 'DEADLINE' };
test('deadline cadence uses January reference through February and skips missed occurrences', () => {
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
    { scheduledOn: '2026-04-20', deadlineOn: '2026-04-30' },
  );
  assert.deepEqual(
    getNextTaskDates({ ...task, deadlineOn: '2026-02-28' }, reference, '2026-02-28'),
    { scheduledOn: '2026-03-20', deadlineOn: '2026-03-31' },
  );
});
test('completion recurrence uses actual local completion and keeps the scheduling lead', () => {
  const recurrence = { ...monthly, from: 'COMPLETION' } satisfies Schema['TaskRecurrence'];
  const task = { scheduledOn: '2026-01-10', deadlineOn: '2026-01-20', recurrence };
  assert.deepEqual(getNextTaskDates(task, task, '2026-01-31'), {
    scheduledOn: '2026-02-18',
    deadlineOn: '2026-02-28',
  });
  assert.deepEqual(getNextTaskDates({ ...task, deadlineOn: null }, task, '2026-01-31'), {
    scheduledOn: '2026-02-28',
    deadlineOn: null,
  });
  assert.deepEqual(getNextTaskDates({ ...task, scheduledOn: null }, task, '2026-01-31'), {
    scheduledOn: null,
    deadlineOn: '2026-02-28',
  });
});
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
test('recurrence requires a date and deadline-based recurrence requires a deadline', () => {
  assert.throws(
    () =>
      getNextTaskDates(
        { scheduledOn: null, deadlineOn: null, recurrence: monthly },
        { scheduledOn: null, deadlineOn: null },
        '2026-01-01',
      ),
    /need a date/,
  );
  assert.throws(
    () =>
      getNextTaskDates(
        { scheduledOn: '2026-01-01', deadlineOn: null, recurrence: monthly },
        { scheduledOn: '2026-01-01', deadlineOn: null },
        '2026-01-01',
      ),
    /needs a deadline/,
  );
});
