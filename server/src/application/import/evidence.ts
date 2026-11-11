/** Source whitespace normalization and proposal validation for Imports. */

import { ApplicationError } from '../errors.js';

// Trims and collapses whitespace in extracted text and evidence values.
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// Skips invalid proposals while allowing unexpected errors to reach the workflow.
export function mapValidResults<T, Result>(values: T[], convert: (value: T) => Result): Result[] {
  return values.flatMap((value) => {
    try {
      return [convert(value)];
    } catch (error) {
      if (!(error instanceof ApplicationError) || error.kind !== 'INVALID_INPUT') throw error;
      return [];
    }
  });
}
