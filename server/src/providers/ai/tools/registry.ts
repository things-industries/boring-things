/** Registry tools, search category fieldsets and field definitions and record retrieved metadata. */

import type { FunctionTool } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { ImportTaskContext } from '../../../application/import/types.js';
import type { RegistryResources } from '../types.js';
import type { FieldSearchLabel } from '../../../application/registry/registry.js';
import {
  searchFields as findFields,
  searchFieldSets as findFieldSets,
} from '../../../application/registry/index.js';
import { ensure } from '../../../application/errors.js';
import { createObjectSchema } from '../schemas.js';
import { createTool, recordToolCall } from './tool.js';

export const search_field_sets = {
  type: 'function',
  name: 'search_field_sets',
  description:
    'Search for relevant specialist sets and their eligibility, returning mandatory dependencies and optional alongside suggestions with definitions.',
  strict: true,
  parameters: createObjectSchema(
    {
      categoryId: {
        type: 'string',
        description:
          'Candidate category ID copied from the task context, defining the search scope.',
      },
      terms: {
        type: 'array',
        items: {
          type: 'string',
          description:
            'One source-supported registry search term, such as a product type, brand or model.',
        },
        description:
          'Source-supported type, brand, provider, product and model terms relevant to field-set eligibility, excluding secrets and individual identifiers.',
      },
    },
    'Category and source-supported terms used to find eligible field sets.',
  ),
} satisfies FunctionTool;

export const search_fields = {
  type: 'function',
  name: 'search_fields',
  description:
    'Batch search of remaining observed fact labels and surrounding text for standalone field definitions.',
  strict: true,
  parameters: createObjectSchema(
    {
      labels: {
        type: 'array',
        items: createObjectSchema(
          {
            label: {
              type: 'string',
              description:
                'Attribute label copied from the observed fact, such as "Serial number" or "Renewal date".',
            },
            context: {
              type: 'string',
              description:
                'Surrounding source text explaining the label, subject and units, limited to the context needed to identify the field and distinguish similar registry fields.',
            },
          },
          'One unmatched attribute and the evidence needed to interpret its label.',
        ),
        description:
          'Observed fact labels still needing a standalone field definition, submitted together with their supporting context.',
      },
    },
    'Batch of unmatched fact labels and source context used to find standalone field definitions.',
  ),
} satisfies FunctionTool;

// Searches category fieldsets and records the definitions available to proposal validation.
export async function searchFieldSets(
  context: ImportTaskContext,
  resources: RegistryResources | undefined,
  categoryId: string,
  terms: string[],
) {
  ensure(categoryId === context.categoryId, 'Wrong category');
  ensure(resources, 'Registry is unavailable');
  const result = await findFieldSets(resources.db, resources.registry, categoryId, terms);
  result.sets.forEach((set) => context.retrievedSetIds.add(set.id));
  result.sets
    .flatMap((set) => set.fields)
    .forEach((field) => context.retrievedFieldIds.add(field.id));
  await recordToolCall(context, 'search_field_sets', result.sets.length, result.truncated);
  return result;
}

// Searches field definitions and records the fields available to proposal validation.
export async function searchFields(
  context: ImportTaskContext,
  resources: RegistryResources | undefined,
  labels: FieldSearchLabel[],
) {
  ensure(resources, 'Registry is unavailable');
  const result = await findFields(resources.db, resources.registry, labels);
  result.results
    .flatMap((result) => result.fields)
    .forEach((field) => context.retrievedFieldIds.add(field.id));
  await recordToolCall(context, 'search_fields', result.results.length, result.truncated);
  return result;
}

// Gives the model a validated field search tool using the provider's registry resources.
export function createFieldsTool(context: ImportTaskContext, resources?: RegistryResources) {
  return createTool<components['schemas']['search_fields']>(search_fields, async (args) => ({
    output: await searchFields(context, resources, args.labels),
  }));
}

// Gives the model a validated fieldset search tool using the provider's registry resources.
export function createFieldSetsTool(context: ImportTaskContext, resources?: RegistryResources) {
  return createTool<components['schemas']['search_field_sets']>(
    search_field_sets,
    async (args) => ({
      output: await searchFieldSets(context, resources, args.categoryId, args.terms),
    }),
  );
}

export const registryFunctions = [search_field_sets, search_fields];
