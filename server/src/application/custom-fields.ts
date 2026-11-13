/** Infers and validates custom field types at the point of writing. */

import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { FieldDefinition, Schema, Value } from '../../../shared/model.js';
import { schemaValidator } from '../contracts/schemas.js';

const ajv = new Ajv();
addFormats.default(ajv);
const validateDate = ajv.compile<string>({ type: 'string', format: 'date' });
const validateMoney = schemaValidator('Money');

/** Checks the full calendar date, including the number of days in the month. */
export function isCalendarDate(value: unknown): value is string {
  return validateDate(value);
}

/** Infers a custom field type from a new value. */
export function inferCustomValueType(value: Value | null): Schema['ValueTypeEnum'] {
  if (typeof value === 'number') return 'NUMBER';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (value !== null && typeof value === 'object') return 'MONEY';
  return isCalendarDate(value) ? 'DATE' : 'STRING';
}

/** Checks a value against its custom field type. */
export function isCustomValue(value: unknown, type: Schema['ValueTypeEnum']): boolean {
  if (value === null) return true;
  switch (type) {
    case 'DATE':
      return isCalendarDate(value);
    case 'STRING':
      return typeof value === 'string';
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value);
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'MONEY':
      return validateMoney(value) === true;
  }
}

/** Maps a displaced registry field to a custom type, keeping invalid legacy dates as text. */
export function getDisplacedValueType(
  schema: FieldDefinition['schema'],
  value: Value,
): Schema['ValueTypeEnum'] {
  switch (schema.type) {
    case 'number':
    case 'integer':
      return 'NUMBER';
    case 'boolean':
      return 'BOOLEAN';
    case 'object':
      return 'MONEY';
    default:
      return schema.format === 'date' && isCalendarDate(value) ? 'DATE' : 'STRING';
  }
}
