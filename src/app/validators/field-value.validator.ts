import type { ValidatorFn } from '@angular/forms';
import type { Schema } from '../../../shared/model';
import { amountMinor } from '../utils/field.util';
import { localDateTimeToUtc } from '../utils/date.util';
export function fieldValueValidator(field: Schema['Field']): ValidatorFn {
  return (control) => {
    const draft = String(control.value ?? '');
    if (field.schema.type === 'boolean' && !['true', 'false'].includes(draft))
      return { 'boolean-required': true };
    if (field.uiHint === 'MONEY') {
      if (!/^\d+(\.\d{1,2})?$/.test(draft)) return { 'invalid-money': true };
      if (!Number.isSafeInteger(amountMinor(draft))) return { 'money-too-large': true };
    }
    if (
      (field.schema.type === 'number' || field.schema.type === 'integer') &&
      (!draft.trim() || !Number.isFinite(Number(draft)))
    )
      return { 'number-required': true };
    if (field.schema.format === 'date-time' && !localDateTimeToUtc(draft))
      return { 'date-required': true };
    return null;
  };
}
