/** Source quotation matching and proposal validation for Imports and document evaluations. */

import type { Registry } from '../registry/registry.js';
import type { DocumentExtraction, EmptyResearchField, ReferenceDocument } from './types.js';
import { ApplicationError, ensure } from '../errors.js';

// Trims and collapses whitespace in extracted text and evidence values.
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// Skips individual citation mismatches while allowing other validation errors to propagate.
export function mapValidEvidence<T, Result>(values: T[], convert: (value: T) => Result): Result[] {
  return values.flatMap((value) => {
    try {
      return [convert(value)];
    } catch (error) {
      if (
        !(error instanceof ApplicationError) ||
        ![
          'Invalid source evidence',
          'Invalid source page',
          'Quote does not match source page',
        ].includes(error.message)
      )
        throw error;
      return [];
    }
  });
}

// Checks requested addresses, document applicability and original page references.
export function validateDocumentExtraction(
  result: DocumentExtraction,
  document: Pick<ReferenceDocument, 'pageCount'>,
  fields: EmptyResearchField[],
  registry: Registry,
) {
  ensure(
    typeof result.applicable === 'boolean' && Array.isArray(result.values),
    'Invalid document output',
  );
  const evidence = (ref: { page: number; quote: string } | null) =>
    ref &&
    Number.isInteger(ref.page) &&
    ref.page > 0 &&
    ref.page <= document.pageCount &&
    ref.quote.trim().length > 0 &&
    ref.quote.length <= 2000;
  if (!result.applicable) {
    ensure(!result.values.length && !result.applicability, 'Inapplicable document supplied values');
    return;
  }
  ensure(evidence(result.applicability), 'Missing applicability evidence');
  const seen = new Set<string>();
  for (const value of result.values) {
    const key = `${value.fieldSetId}:${value.fieldId}`;
    ensure(
      !seen.has(key) &&
        fields.some(
          (field) => field.fieldSetId === value.fieldSetId && field.fieldId === value.fieldId,
        ),
      'Unrequested or duplicate field',
    );
    ensure(evidence(value), 'Invalid field evidence');
    registry.validate(value.fieldId, value.value);
    seen.add(key);
  }
}
