import { countryCodes } from '../../../shared/country-codes';
import type { Schema, Value } from '../../../shared/model';
import { APP_CONFIG } from '../core/app.config';
import type { FieldDraft, FieldInput, MoneyDraft } from '../interfaces/field-input.interface';
import { dateTimeInput, localDateTimeToUtc } from './date.util';

const countryNames = new Intl.DisplayNames('en-GB', { type: 'region', fallback: 'none' });
const countryOptions = countryCodes
  .map((value) => ({ value, label: countryNames.of(value) ?? value }))
  .sort(
    (a, b) =>
      Number(b.value === 'GB') - Number(a.value === 'GB') ||
      a.label.localeCompare(b.label, 'en-GB'),
  );
const countryLabels = new Map(countryOptions.map(({ value, label }) => [value, label]));

/** Checks email drafts and stored values using the registry validator's address syntax. */
export function isEmailAddress(value: string): boolean {
  return /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(
    value,
  );
}

/** Builds a mail link only for an email field with a valid address. */
export function getEmailLink(format: Schema['SchemaFormatEnum'] | null, value: Value | null) {
  return format === 'email' && typeof value === 'string' && isEmailAddress(value)
    ? 'mailto:' + encodeURIComponent(value).replace('%40', '@')
    : null;
}

/** The format used when displaying a registry field. */
export function getFieldFormat(field: {
  schema: Pick<Schema['FieldSchema'], 'format'>;
  uiHint?: Schema['UiHintEnum'];
}): Schema['SchemaFormatEnum'] | null {
  return field.schema.format ?? (field.uiHint === 'EMAIL' ? 'email' : null);
}

export function amountMinor(draft: string) {
  const [whole, fraction = ''] = draft.split('.');

  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** The control for a registry field. */
export function fieldInput(field: Schema['Field']): FieldInput {
  const { schema } = field;
  const base = { sensitive: field.sensitive };

  if (field.uiHint === 'MONEY') return { ...base, kind: 'money' };
  if (schema.type === 'boolean' || field.uiHint === 'CHECKBOX') return { ...base, kind: 'boolean' };
  if (schema.format === 'country-code') {
    const value = field.value;

    // Show legacy text in the editor until the owner chooses a country.
    const options =
      typeof value === 'string' && value && !countryLabels.has(value)
        ? [...countryOptions, { value, label: value }]
        : countryOptions;
    return { ...base, kind: 'select', options };
  }
  if (schema.enum)
    return {
      ...base,
      kind: 'select',
      options: schema.enum.map((option) => ({ value: option, label: option })),
    };

  if (schema.format === 'date' || field.uiHint === 'DATE') return { ...base, kind: 'date' };
  if (schema.format === 'date-time' || field.uiHint === 'DATETIME')
    return { ...base, kind: 'date-time' };
  if (schema.type === 'number' || schema.type === 'integer' || field.uiHint === 'NUMBER')
    return {
      ...base,
      kind: 'number',
      integer: schema.type === 'integer',
      minimum: schema.minimum,
      maximum: schema.maximum,
    };

  return {
    ...base,
    kind:
      getFieldFormat(field) === 'email'
        ? 'email'
        : field.uiHint === 'TEXTAREA'
          ? 'textarea'
          : 'text',
    maxLength: schema.maxLength,
    pattern: schema.pattern,
  };
}

/** The control for a custom field, from its value type. */
export function customFieldInput(field: Schema['CustomField']): FieldInput {
  const base = { sensitive: field.sensitive };

  switch (field.valueType) {
    case 'MONEY':
      return { ...base, kind: 'money' };
    case 'BOOLEAN':
      return { ...base, kind: 'boolean' };
    case 'DATE':
      return { ...base, kind: 'date' };
    case 'NUMBER':
      return { ...base, kind: 'number' };
    default:
      return { ...base, kind: 'text' };
  }
}

/** A stored value as its control holds it. */
export function valueDraft(input: FieldInput, value: Value | null): FieldDraft {
  if (input.kind === 'money')
    return value !== null && typeof value === 'object'
      ? { amount: (value.amountMinor / 100).toFixed(2), currency: value.currency }
      : { amount: '', currency: APP_CONFIG.defaultCurrency };

  if (value === null || typeof value === 'object') return '';
  if (input.kind === 'date-time') return dateTimeInput(String(value));
  return String(value);
}

/** A valid draft as the value to store; empty drafts are `null`. */
export function draftValue(input: FieldInput, draft: FieldDraft): Value | null {
  if (typeof draft === 'object')
    return draft.amount.trim()
      ? { amountMinor: amountMinor(draft.amount.trim()), currency: draft.currency }
      : null;

  const text = input.kind === 'textarea' ? draft : draft.trim();

  if (!text) return null;

  switch (input.kind) {
    case 'boolean':
      return text === 'true';
    case 'number':
      return Number(text);
    case 'date-time':
      return localDateTimeToUtc(text);
    default:
      return text;
  }
}

/**
 * A money draft's amount padded to two decimal places, when it has at most two. Works on the text
 * so large amounts keep every digit.
 */
export function formatMoneyDraft(draft: MoneyDraft): MoneyDraft {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(draft.amount.trim());

  if (!match || (!match[1] && !match[2])) return draft;
  return { ...draft, amount: `${match[1] || '0'}.${(match[2] ?? '').padEnd(2, '0')}` };
}

/** Formats money and country values for display. */
export function formatFieldValue(
  value: Value | null,
  format?: Schema['SchemaFormatEnum'] | null,
): string {
  if (format === 'country-code' && typeof value === 'string')
    return countryLabels.get(value) ?? value;

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
