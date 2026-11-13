import type { ValidatorFn } from '@angular/forms';
import { isValid, parseISO } from 'date-fns';
import type { UiErrorCode } from '../interfaces/error.interface';
import type { FieldDraft, FieldInput } from '../interfaces/field-input.interface';
import { amountMinor, isEmailAddress } from '../utils/field.util';
import { localDateTimeToUtc } from '../utils/date.util';

/** The first problem with a field draft. Empty drafts are valid unless the input is required. */
export function fieldValueError(input: FieldInput, draft: FieldDraft | null): UiErrorCode | null {
  if (draft !== null && typeof draft === 'object') {
    const amount = draft.amount.trim();

    if (!amount) return input.required ? 'value-required' : null;
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return 'invalid-money';
    if (!Number.isSafeInteger(amountMinor(amount))) return 'money-too-large';
    return null;
  }

  const text = (draft ?? '').trim();

  if (!text) return input.required ? 'value-required' : null;
  if (input.maxLength !== undefined && text.length > input.maxLength) return 'text-too-long';

  switch (input.kind) {
    case 'email':
      return isEmailAddress(text) ? null : 'invalid-email';
    case 'number': {
      const number = Number(text);

      if (!Number.isFinite(number)) return 'number-required';
      if (input.integer && !Number.isInteger(number)) return 'whole-number-required';
      if (
        (input.minimum !== undefined && number < input.minimum) ||
        (input.maximum !== undefined && number > input.maximum)
      )
        return 'number-out-of-range';
      return null;
    }

    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && isValid(parseISO(text)) ? null : 'invalid-date';
    case 'date-time':
      return localDateTimeToUtc(text) ? null : 'date-required';
    case 'text':
    case 'textarea':
      return input.pattern && !new RegExp(input.pattern).test(text) ? 'invalid-format' : null;
    default:
      return null;
  }
}

/** Validates a field draft for its control, keyed by its `fieldValueError` code. */
export function fieldValueValidator(input: FieldInput): ValidatorFn {
  return (control) => {
    const code = fieldValueError(input, control.value as FieldDraft | null);

    return code ? { [code]: true } : null;
  };
}
