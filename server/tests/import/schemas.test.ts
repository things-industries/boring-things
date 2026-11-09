/** Checks schema-derived types and runtime validation for required fields, literals and unions. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';
import type { FromSchema } from 'json-schema-to-ts';
import {
  createObjectSchema,
  sourceEvidenceProperties,
  valueSchema,
} from '../../src/providers/ai/schemas.js';

const schema = createObjectSchema({
  evidence: createObjectSchema(sourceEvidenceProperties),
  values: { type: 'array', items: valueSchema },
  status: { type: 'string', enum: ['READY', 'WAITING'] },
  detail: { anyOf: [createObjectSchema({ enabled: { type: 'boolean' } }), { type: 'null' }] },
});
type Output = FromSchema<typeof schema>;

// Exercises compiler checks without executing intentionally invalid assignments.
function typeChecks(output: Output) {
  const page: number | null = output.evidence.page;

  // @ts-expect-error Source page may be null.
  const invalidPage: number = output.evidence.page;

  // @ts-expect-error Every source-evidence property is required.
  const missingEvidence: Output['evidence'] = { attachmentId: 'source' };

  // @ts-expect-error Currency stays a union of the authored enum literals.
  const invalidCurrency: Output['values'][number] = { amountMinor: 0, currency: 'AUD' };

  // @ts-expect-error Status stays a union of the authored enum literals.
  const invalidStatus: Output['status'] = 'UNKNOWN';

  // @ts-expect-error Source evidence has no additional properties.
  void output.evidence.unknown;

  // @ts-expect-error Nullable object properties keep their declared types.
  const invalidDetail: Output['detail'] = { enabled: 'yes' };

  // @ts-expect-error Schema property types must be valid JSON Schema types.
  createObjectSchema({ value: { type: 'invalid' } });
  void [page, invalidPage, missingEvidence, invalidCurrency, invalidStatus, invalidDetail];
}
void typeChecks;

test('inferred schemas validate required fields, nullable unions and enum values', () => {
  const validate = new Ajv().compile<Output>(schema);
  const value = {
    evidence: { attachmentId: 'source', page: null, quote: 'Fixture passage' },
    values: [0, false, '', { amountMinor: 0, currency: 'GBP' }],
    status: 'READY',
    detail: null,
  } satisfies Output;
  assert.ok(validate(value));
  assert.ok(validate({ ...value, detail: { enabled: false } }));
  for (const invalid of [
    { ...value, evidence: { attachmentId: 'source' } },
    { ...value, status: 'UNKNOWN' },
    { ...value, values: [{ amountMinor: 0, currency: 'AUD' }] },
    { ...value, detail: { enabled: 'yes' } },
    { ...value, evidence: { ...value.evidence, page: undefined } },
  ])
    assert.equal(validate(invalid), false);
});
