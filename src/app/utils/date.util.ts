import { format, isValid, parseISO } from 'date-fns';
export function localDateTimeToUtc(value: string): string | null {
  const date = parseISO(value);
  return isValid(date) ? date.toISOString() : null;
}
export function dateTimeInput(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}
