import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInMonths,
  differenceInYears,
  format,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';
import type { EventRecurrence } from '../interfaces/event.interface';
import type { TaskRecurrence } from '../interfaces/task.interface';
export function localDateTimeToUtc(value: string): string | null {
  const date = parseISO(value);
  return isValid(date) ? date.toISOString() : null;
}
export function dateTimeInput(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

export function daysUntil(value: string, now = new Date()): number {
  return differenceInCalendarDays(parseISO(value), now);
}
export function isNewThing(createdAt: string, now = new Date(), days = 7): boolean {
  const age = now.getTime() - parseISO(createdAt).getTime();
  return age >= 0 && age < days * 24 * 60 * 60 * 1000;
}
/**
 * Signed distance from `now` to `value` in the largest unit that fits: calendar days under a week,
 * then weeks, then whole months and whole years counted from the start of today.
 */
export function relativeDistance(
  value: string,
  now = new Date(),
): { amount: number; unit: 'day' | 'week' | 'month' | 'year' } {
  const date = parseISO(value);
  const days = differenceInCalendarDays(date, now);
  if (Math.abs(days) < 7) return { amount: days, unit: 'day' };
  const today = startOfDay(now);
  const months = differenceInMonths(date, today);
  if (months === 0) return { amount: Math.round(days / 7), unit: 'week' };
  if (Math.abs(months) < 12) return { amount: months, unit: 'month' };
  return { amount: differenceInYears(date, today), unit: 'year' };
}
/** An event's start as a time: `startsAt`, or local midnight on `startsOn`. */
export function eventStart(event: {
  startsAt: string | null;
  startsOn: string | null;
}): number | null {
  const value = event.startsAt ?? event.startsOn;
  return value ? parseISO(value).getTime() : null;
}

/**
 * Time left until `value`: whole years from two years, whole months from one month, otherwise days.
 * `null` once it has passed.
 */
export function timeLeft(
  value: string,
  now = new Date(),
): { amount: number; unit: 'year' | 'month' | 'day' } | null {
  const date = parseISO(value);
  const days = differenceInCalendarDays(date, now);
  if (!isValid(date) || days < 0) return null;
  const months = differenceInMonths(date, startOfDay(now));
  if (months >= 24) return { amount: Math.floor(months / 12), unit: 'year' };
  return months >= 1 ? { amount: months, unit: 'month' } : { amount: days, unit: 'day' };
}
/** Time since `value`: whole months under a year, then years to the half. `null` for the future. */
export function timeSince(
  value: string,
  now = new Date(),
): { amount: number; unit: 'month' | 'year' } | null {
  const date = parseISO(value);
  const months = differenceInMonths(startOfDay(now), date);
  if (!isValid(date) || months < 0) return null;
  return months < 12
    ? { amount: months, unit: 'month' }
    : { amount: Math.floor(months / 6) / 2, unit: 'year' };
}

/** Local calendar date of `value`, as `yyyy-MM-dd`. */
export function dayKey(value: Date | string): string {
  return format(typeof value === 'string' ? parseISO(value) : value, 'yyyy-MM-dd');
}

const addUnit = { DAY: addDays, WEEK: addWeeks, MONTH: addMonths, YEAR: addYears };

/** The calendar date one recurrence interval after `day`. */
export function addRecurrence(day: string, { interval, unit }: EventRecurrence): string {
  return dayKey(addUnit[unit](parseISO(day), interval));
}

/** Due date of the task that follows one due on `scheduledOn` and completed on `completedOn`. */
export function nextDueOn(
  scheduledOn: string,
  completedOn: string,
  recurrence: TaskRecurrence,
): string {
  return addRecurrence(recurrence.from === 'DUE_DATE' ? scheduledOn : completedOn, recurrence);
}
