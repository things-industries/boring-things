import type { Schema, Value } from '../../../shared/model';
import { localDateTimeToUtc } from './date.util';
export function amountMinor(draft: string) {
  const [whole, fraction = ''] = draft.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function fieldValue(
  field: Schema['Field'],
  draft: string,
  currency: Schema['Money']['currency'],
): Value {
  if (field.schema.type === 'boolean') return draft === 'true';
  if (field.uiHint === 'MONEY') return { amountMinor: amountMinor(draft), currency };
  if (field.schema.type === 'number' || field.schema.type === 'integer') return Number(draft);
  if (field.schema.format === 'date-time') return localDateTimeToUtc(draft)!;
  return draft;
}
export function formatFieldValue(value: Value | null): string {
  return value !== null && typeof value === 'object'
    ? new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: value.currency,
      }).format(value.amountMinor / 100)
    : String(value ?? '');
}
/** Whether two values are equal, comparing money by amount and currency. */
export function sameValue(a: Value | null, b: Value | null): boolean {
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object')
    return a.amountMinor === b.amountMinor && a.currency === b.currency;
  return a === b;
}
