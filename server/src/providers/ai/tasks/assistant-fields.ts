/** Assistant field-edit schema with registry addresses, custom definitions and per-value evidence. */

import { createObjectSchema, valueSchema } from '../schemas.js';

const sourceSchema = {
  description:
    'Null for an owner-stated value or removal; otherwise one attachment or research source read this turn.',
  anyOf: [
    { type: 'null' },
    createObjectSchema({
      attachmentId: {
        type: ['string', 'null'],
        format: 'uuid',
        description: 'Read attachment UUID, or null for research.',
      },
      page: {
        type: ['integer', 'null'],
        minimum: 1,
        description:
          'Original one-based attachment page when known; null for unpaginated content or research.',
      },
      url: {
        type: ['string', 'null'],
        maxLength: 4000,
        description:
          'URL returned by research in this turn, or null for an attachment (max 4000 chars).',
      },
    }),
  ],
} as const;

export const updateFieldsSchema = createObjectSchema(
  {
    thingId: { type: 'string', format: 'uuid', description: 'Previously retrieved Thing UUID.' },
    addFieldSetIds: {
      type: 'array',
      maxItems: 12,
      uniqueItems: true,
      items: {
        type: 'string',
        maxLength: 200,
        description: 'Registry field-set ID (max 200 chars).',
      },
      description:
        'Up to 12 field sets returned by registry search to add before applying values; dependencies are included automatically.',
    },
    values: {
      type: 'array',
      maxItems: 12,
      items: createObjectSchema({
        fieldSetId: {
          type: ['string', 'null'],
          maxLength: 200,
          description:
            'Selected or newly added set ID (max 200 chars); null for a standalone registry field.',
        },
        fieldId: {
          type: 'string',
          maxLength: 200,
          description:
            'Registry field ID returned by search_field_sets or search_fields (max 200 chars).',
        },
        value: {
          description:
            'Value matching the registry definition; null removes the value and disables automatic population.',
          anyOf: [...valueSchema.anyOf, { type: 'null' }],
        },
        source: sourceSchema,
      }),
      description:
        'Registry value edits; the batch contains at most 12 registry and custom field edits combined.',
    },
    customFields: {
      type: 'array',
      maxItems: 12,
      items: createObjectSchema({
        customFieldId: {
          type: ['string', 'null'],
          format: 'uuid',
          description:
            'Existing custom field UUID, or null to create a field for a fact without a registry match.',
        },
        label: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
          description: 'Field label without sensitive values (min 1 char, max 160 chars).',
        },
        value: valueSchema,
        sensitive: {
          type: 'boolean',
          description:
            'Whether the value requires masking in ordinary responses; true for secrets.',
        },
        scope: {
          type: 'string',
          enum: ['GROUP', 'CLASS', 'INSTANCE'],
          description:
            'GROUP for manufacturer/provider facts, CLASS for model/plan facts, INSTANCE for the owned item or account.',
        },
        source: sourceSchema,
      }),
      description:
        'Custom field additions or edits, with existing definitions copied from retrieved context unless the owner requests a change.',
    },
  },
  'One owner-requested field batch for a previously retrieved Thing. Writes and retry receipts commit together.',
);
