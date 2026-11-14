/**
 * Identifies Things described by the submitted Attachments and checks whether
 * they match records the owner already has.
 *
 * Runs after: Submitted Attachments finish processing
 * As part of: Import
 * Inputs: Attachment summaries, terms, identifier observations and searchable
 *   transcriptions, category and identifier field definitions, existing Things
 *   with their identifiers, and the target Thing ID when supplied
 * Outputs: Thing candidates with names, categories, terms, evidence scores and
 *   contributing Attachment IDs. Each has identifier values mapped to registry
 *   fields with source references, and an existing Thing ID if it matches one.
 *   The result also flags evidence that conflicts with the target Thing.
 * Next: Thing selection and identity persistence, followed by Research
 */

import type { FromSchema } from 'json-schema-to-ts';
import type {
  ResolutionResult,
  ImportTaskContext,
  ImportSourceText,
  IdentifierObservation,
} from '../../../application/import/types.js';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';
import type { FieldDefinition, Value } from '../../../../../shared/model.js';

export interface ResolutionInput {
  sources: (Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'> & {
    identifiers: IdentifierObservation[];
  })[];
  categories: { id: string; name: string; description: string; identifiers: FieldDefinition[] }[];
  existingThings: {
    id: string;
    name: string;
    categoryId: string;
    identifiers: { fieldId: string; value: Value }[];
  }[];
  thingContextId: string | null;
}

export const outputSchema = createObjectSchema(
  {
    candidates: {
      description: 'Up to 10 candidate descriptions; the application processes one.',
      type: 'array',
      maxItems: 10,
      items: createObjectSchema(
        {
          name: {
            description: 'Short Thing name without private identifiers.',
            type: 'string',
          },
          categoryId: {
            description: 'Recognised category ID.',
            type: 'string',
          },
          terms: {
            description: 'Up to 20 relevant Thing terms.',
            type: 'array',
            maxItems: 20,
            items: {
              description: 'Search term.',
              type: 'string',
            },
          },
          identifiers: {
            description: 'Up to 30 evidenced identifiers.',
            type: 'array',
            maxItems: 30,
            items: createObjectSchema(
              {
                fieldId: {
                  description: 'Category-valid registry identifier field ID.',
                  type: 'string',
                },
                value: {
                  description: 'Observed identifier as a string.',
                  type: 'string',
                },
                ...sourceEvidenceProperties,
              },
              'Registry-linked candidate identifier.',
            ),
          },
          attachmentIds: {
            description: 'Contributing Attachment IDs.',
            type: 'array',
            maxItems: 30,
            items: {
              description: 'Relevant Attachment ID.',
              type: 'string',
            },
          },
          strength: {
            description: 'Relative evidence strength from 0 to 1.',
            type: 'number',
            minimum: 0,
            maximum: 1,
          },
          matchedThingId: {
            description: 'Owned Thing ID from the supplied matching candidates, or null.',
            type: ['string', 'null'],
          },
        },
        'One Thing Candidate.',
      ),
    },
    contradiction: {
      description: 'Whether the sources contradict the explicitly supplied Thing context.',
      type: 'boolean',
    },
  },
  'Candidate identity and matching decision.',
);

export type Output = FromSchema<typeof outputSchema>;

export class ResolveThingTask extends AiTask<Output, ResolutionResult> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'medium';
  protected task = 'thing_resolution';
  protected instructions = `${getPrompt('thing-definition')} ${getPrompt('import-instructions')}`;
  protected outputSchema = outputSchema;
  protected resultKey = 'candidates' as const;

  constructor(
    private input: ResolutionInput,
    context: ImportTaskContext,
  ) {
    super(context);
    this.tools = [createTranscriptionTool(context)];
  }

  // Runs the task over the supplied Thing and source context.
  protected async runTask() {
    return this.parseOutput(
      await this.execute([
        {
          role: 'user',
          content: `Identify candidate Things and give each a relative evidence strength. Associate printed identifiers with supplied category-valid identifier fields. Match only supplied owned Thing IDs using a semantic judgement. Thing context supplies the sole target and attributes ambiguous scraps to it; report contradiction only when source identifiers conflict. A manual's applicable-model list does not establish separate owned Things. Use search_transcription for evidence beyond summaries. Copy verbatim quotes and source IDs. Input: ${JSON.stringify(this.input)}`,
        },
      ]),
    );
  }
}
