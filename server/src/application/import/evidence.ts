/** Validates document field evidence for standalone provider evaluations and registry field schemas. */
import type { Registry } from '../registry/registry.js';
import type { DocumentExtraction, EmptyResearchField, ReferenceDocument } from './types.js';
import { ensure } from '../errors.js';

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
