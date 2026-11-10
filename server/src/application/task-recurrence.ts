/** Calendar calculations for task recurrence, using saved reference dates to prevent drift. */

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  parseISO,
} from 'date-fns';
import type { Schema } from '../../../shared/model.js';
import { ensure } from './errors.js';

export interface RecurrenceReference {
  scheduledOn: string | null;
  deadlineOn: string | null;
}

/** Returns the calendar date in a validated IANA timezone. */
export function getLocalDate(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    ensure(false, 'Unknown timezone');
  }
}

/** Adds calendar periods from the reference, clamping month and year ends. */
function advance(date: string, recurrence: Schema['TaskRecurrence'], periods: number): string {
  const count = recurrence.interval * periods;
  const value = parseISO(date);
  return format(
    recurrence.unit === 'DAY' || recurrence.unit === 'WEEK'
      ? addDays(value, count * (recurrence.unit === 'WEEK' ? 7 : 1))
      : addMonths(value, count * (recurrence.unit === 'YEAR' ? 12 : 1)),
    'yyyy-MM-dd',
  );
}

/** Computes one successor on the original cadence, skipping missed occurrences. */
export function getNextTaskDates(
  task: Pick<Schema['Task'], 'scheduledOn' | 'deadlineOn' | 'recurrence'>,
  reference: RecurrenceReference,
  today: string,
): RecurrenceReference {
  const recurrence = task.recurrence;
  ensure(recurrence, 'Recurrence is required');
  const current = task.deadlineOn ?? task.scheduledOn;
  ensure(current, 'Recurring tasks need a date');
  if (recurrence.from === 'COMPLETION') {
    const next = advance(today, recurrence, 1);
    const lead =
      task.scheduledOn && task.deadlineOn
        ? differenceInCalendarDays(parseISO(task.deadlineOn), parseISO(task.scheduledOn))
        : 0;
    return {
      deadlineOn: task.deadlineOn ? next : null,
      scheduledOn: task.scheduledOn ? format(addDays(parseISO(next), -lead), 'yyyy-MM-dd') : null,
    };
  }
  const anchor = task.deadlineOn
    ? (reference.deadlineOn ?? task.deadlineOn)
    : (reference.scheduledOn ?? current);
  const after = current > today ? current : today;
  const days = recurrence.unit === 'DAY' || recurrence.unit === 'WEEK';
  const distance = days
    ? differenceInCalendarDays(parseISO(after), parseISO(anchor))
    : differenceInCalendarMonths(parseISO(after), parseISO(anchor));
  const step =
    recurrence.interval * (recurrence.unit === 'WEEK' ? 7 : recurrence.unit === 'YEAR' ? 12 : 1);
  let periods = Math.max(1, Math.floor(distance / step));
  while (advance(anchor, recurrence, periods) <= after) periods++;
  return {
    deadlineOn: task.deadlineOn
      ? advance(reference.deadlineOn ?? task.deadlineOn, recurrence, periods)
      : null,
    scheduledOn: task.scheduledOn
      ? advance(reference.scheduledOn ?? task.scheduledOn, recurrence, periods)
      : null,
  };
}

/** Validates date ordering and requires a date for accepted recurring Tasks. */
export function validateTaskSchedule(
  task: Pick<Schema['Task'], 'scheduledOn' | 'deadlineOn' | 'recurrence'>,
  suggested = false,
) {
  ensure(
    !task.scheduledOn || !task.deadlineOn || task.scheduledOn <= task.deadlineOn,
    'Scheduled date must not follow the deadline',
  );
  if (task.recurrence && !suggested)
    ensure(task.scheduledOn || task.deadlineOn, 'Recurring tasks need a date');
}
