import type { FieldDefinition, FieldSet } from '../../../shared/model.js';
import type { ResearchContext } from '../../src/application/import/types.js';

const field = (
  id: string,
  type: FieldDefinition['schema']['type'],
  extra: Partial<FieldDefinition['schema']> = {},
): FieldDefinition => ({
  id,
  name: id,
  description: id,
  keywords: [],
  uiHint: 'TEXT',
  sensitive: false,
  instanceSpecific: false,
  schema: { type, ...extra },
});
export const referenceFields: FieldDefinition[] = [
  field('reference.outputPower', 'string'),
  field('reference.zero', 'number'),
  field('reference.disabled', 'boolean'),
  field('reference.empty', 'string'),
  field('reference.fee', 'object', {
    required: ['amountMinor', 'currency'],
    additionalProperties: false,
    properties: {
      amountMinor: { type: 'integer', minimum: 0 },
      currency: { type: 'string', enum: ['GBP', 'EUR', 'USD'] },
    },
  }),
  field('reference.claimsPhone', 'string'),
];
export const referenceSet: FieldSet = {
  id: 'reference',
  name: 'Reference',
  categoryId: 'other',
  eligibility: '',
  keywords: [],
  includes: [],
  considerAlongside: [],
  fields: referenceFields,
};
const context = (categoryId: string, model: string, ids: string[]): ResearchContext => ({
  id: 'synthetic',
  name: model,
  categoryId,
  fields: [
    {
      fieldSetId: null,
      fieldId: 'model',
      label: 'Product and version',
      description: 'Public product identifiers',
      value: model,
    },
  ],
  targets: referenceFields
    .filter((field) => ids.includes(field.id))
    .map((field) => ({
      fieldSetId: 'reference',
      fieldId: field.id,
      label: field.name,
      description: field.description,
      schema: field.schema,
    })),
});
export const referenceDocumentBaseline = [
  {
    id: 'family-manual',
    mediaType: 'application/pdf',
    research: context('appliances', 'Example Oven A UK', ['reference.outputPower']),
    pages: [
      'Example Oven A UK and Example Oven B UK user manual',
      'Output power: Model A 900 W. Model B 1200 W.',
    ],
    expected: { 'reference.outputPower': '900 W' },
    applicable: true,
  },
  {
    id: 'typed-values',
    mediaType: 'text/plain',
    research: context('devices', 'Example Hub A UK v2', [
      'reference.zero',
      'reference.disabled',
      'reference.empty',
      'reference.fee',
    ]),
    pages: [
      'Example Hub A UK v2 specification\nreference.zero: 0\nreference.disabled: false\nreference.empty: ""\nreference.fee: GBP 12.34',
    ],
    expected: {
      'reference.zero': 0,
      'reference.disabled': false,
      'reference.empty': '',
      'reference.fee': { amountMinor: 1234, currency: 'GBP' },
    },
    applicable: true,
  },
  {
    id: 'policy-version',
    mediaType: 'text/plain',
    research: context('insurance', 'Example Insurance Home UK 2026', ['reference.claimsPhone']),
    pages: [
      'Example Insurance Home UK 2026 policy wording\nClaims telephone: 0800 000 0026\n2025 products use 0800 000 0025. Personal policy numbers and insured sums are supplied by the owner schedule.',
    ],
    expected: { 'reference.claimsPhone': '0800 000 0026' },
    applicable: true,
  },
  {
    id: 'wrong-variant',
    mediaType: 'application/pdf',
    research: context('appliances', 'Example Oven A UK', ['reference.outputPower']),
    pages: [
      'Example Oven B US specification\nApplies only to Model B in the US. Output power: 1200 W.',
    ],
    expected: {},
    applicable: false,
  },
];
