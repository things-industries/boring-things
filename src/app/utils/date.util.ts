import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
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
