import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  format,
  isValid,
  parseISO,
} from 'date-fns';
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
/** Signed distance from `now` to `value` in the largest calendar unit that fits: days, weeks, months or years. */
export function relativeDistance(
  value: string,
  now = new Date(),
): { amount: number; unit: 'day' | 'week' | 'month' | 'year' } {
  const date = parseISO(value);
  const days = differenceInCalendarDays(date, now);
  if (Math.abs(days) < 7) return { amount: days, unit: 'day' };
  const months = differenceInCalendarMonths(date, now);
  if (Math.abs(months) < 1) return { amount: Math.round(days / 7), unit: 'week' };
  if (Math.abs(months) < 12) return { amount: months, unit: 'month' };
  return { amount: differenceInCalendarYears(date, now), unit: 'year' };
}
