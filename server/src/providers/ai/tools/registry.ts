/** Adapts shared transcription and registry retrieval capabilities into model function tools. */

import type { FunctionTool } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { RegistryTools, WorkflowTools } from '../../../application/import/types.js';
import { createObjectSchema } from '../schemas.js';
import { createTool } from './tool.js';

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

export const search_transcription = {
  type: 'function',
  name: 'search_transcription',
  description: 'Search supplied Attachment transcriptions for bounded cited passages.',
  strict: true,
  parameters: createObjectSchema(
    {
      attachmentId: {
        description: 'Supplied Attachment ID.',
        type: 'string',
      },
      query: {
        description: 'Search phrase, or empty text for the beginning.',
        type: 'string',
      },
      offset: {
        description: 'Character offset for reading the next source section.',
        type: 'integer',
        minimum: 0,
      },
    },
    'Source search arguments.',
  ),
} satisfies FunctionTool;

// Gives tasks access to saved passages within their authorised source scope.
export function createTranscriptionTool(tools: Pick<WorkflowTools, 'searchTranscription'>) {
  return createTool<components['schemas']['search_transcription']>(
    search_transcription,
    async (args) => ({
      output: await tools.searchTranscription(args.attachmentId, args.query, args.offset),
    }),
  );
}

// Gives tasks access to retrieved field definitions.
export function createFieldsTool(tools: Pick<RegistryTools, 'searchFields'>) {
  return createTool<components['schemas']['search_fields']>(search_fields, async (args) => ({
    output: await tools.searchFields(args.labels),
  }));
}

// Gives tasks access to category fieldsets.
export function createFieldSetsTool(tools: Pick<RegistryTools, 'searchFieldSets'>) {
  return createTool<components['schemas']['search_field_sets']>(
    search_field_sets,
    async (args) => ({ output: await tools.searchFieldSets(args.categoryId, args.terms) }),
  );
}

export const registryFunctions = [search_field_sets, search_fields, search_transcription];
