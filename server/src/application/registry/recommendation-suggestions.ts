/** Schema and types for fieldset suggestions used in recommendation research. */

import type { FromSchema } from 'json-schema-to-ts';
import type { Schema } from '../../../../shared/model.js';

export const purchasableKinds = [
  'CONSUMABLE',
  'ACCESSORY',
  'UPGRADE',
] as const satisfies readonly Schema['PurchasableKindEnum'][];

const suggestionText = {
  type: 'string',
  pattern: '\\S',
} as const;

export const fieldSetRecommendationSuggestionsSchema = {
  type: 'object',
  required: ['tasks', 'purchasables'],
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
          title: { ...suggestionText, maxLength: 200 },
          eligibility: suggestionText,
          description: suggestionText,
        },
      },
    },
    purchasables: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { ...suggestionText, maxLength: 200 },
          kind: { type: 'string', enum: purchasableKinds },
          eligibility: suggestionText,
          description: suggestionText,
        },
      },
    },
  },
} as const;

export type FieldSetRecommendationSuggestions = FromSchema<
  typeof fieldSetRecommendationSuggestionsSchema
>;
export type FieldSetTaskSuggestion = FieldSetRecommendationSuggestions['tasks'][number];
export type FieldSetPurchasableSuggestion =
  FieldSetRecommendationSuggestions['purchasables'][number];
