/**
 * Proposes values and pins for fields the Import selects for automatic population.
 *
 * Runs after: Fieldset selection
 * As part of: Import
 * Inputs: Thing identity, a batch of eligible fields with their definitions and
 *   current values, and applicable Attachment summaries and searchable transcriptions
 * Outputs: Proposed field values with source references when available, and
 *   suggested fields to pin
 * Next: Field value validation and storage, followed by the additional information pass
 */

import type { FromSchema } from 'json-schema-to-ts';
import type {
  PopulationResult,
  ImportTaskContext,
  ImportSourceText,
} from '../../../application/import/types.js';
import type { Response } from 'openai/resources/responses/responses';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import { createSourceRef } from '../sources.js';
import { createObjectSchema, valueSchema, sourceEvidenceProperties } from '../schemas.js';
import type { FieldDefinition, Value } from '../../../../../shared/model.js';

export interface PopulationInput {
  thing: {
    id: string;
    name: string;
    categoryId: string;
    identifiers?: { fieldId: string; value: Value }[];
  };
  sources: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'>[];
  fields: { fieldSetId: string | null; field: FieldDefinition; value: Value | null }[];
}

export const outputSchema = createObjectSchema(
  {
    values: {
      description: 'Up to 20 values for the supplied field targets.',
      type: 'array',
      maxItems: 20,
      items: createObjectSchema(
        {
          fieldSetId: {
            description: 'Requested field set ID, or null for a standalone field.',
            type: ['string', 'null'],
          },
          fieldId: {
            description: 'Requested registry field ID.',
            type: 'string',
          },
          value: valueSchema,
          ...sourceEvidenceProperties,
        },
        'One cited field value.',
      ),
    },
    pinnedFields: {
      description:
        'Up to three populated requested fields, ranked by identification and frequency of reference.',
      type: 'array',
      maxItems: 3,
      items: createObjectSchema(
        {
          fieldSetId: {
            description: 'Requested field set ID or null.',
            type: ['string', 'null'],
          },
          fieldId: {
            description: 'Requested registry field ID.',
            type: 'string',
          },
        },
        'One requested field occurrence.',
      ),
    },
  },
  'Cited values for enabled Thing Fields.',
);

export type Output = FromSchema<typeof outputSchema>;

export class PopulateFieldsTask extends AiTask<Output, PopulationResult> {
  protected readonly model: string = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'field_population';
  protected instructions = `${getPrompt('thing-definition')} ${getPrompt('import-instructions')}`;
  protected outputSchema = outputSchema;
  protected resultKey = 'values' as const;

  constructor(
    private input: PopulationInput,
    context: ImportTaskContext,
  ) {
    super(context);
    this.tools = [createTranscriptionTool(context)];
  }

  // Runs the task over the supplied Thing and source context.
  protected async runTask() {
    return this.processResponse(
      await this.execute([
        {
          role: 'user',
          content: `Find values for only the requested fields using applicable Attachment content. Search saved transcriptions for relevant passages. Respect field schemas, units, context, model and variant. Include original Attachment/page references and quotations when available. Use an empty attachmentId or quote and a null page when unavailable. Public documents justify class data, not private instance identifiers. Use the available information to propose useful values; leave unknown values absent. Suggest up to three populated requested fields to highlight, ordered by usefulness for identifying the Thing and likely frequency of reference. Consider existing values as well as values found in this response. Prioritise identifying details such as registration, model and serial numbers, followed by useful dates, amounts and contact details. Give generic descriptors that repeat the Thing's name or category lower priority. Return fewer pins when the remaining fields offer little value. Input: ${JSON.stringify(this.input)}`,
        },
      ]),
    );
  }

  // Converts validated model output into the application result.
  private processResponse(response: Response): PopulationResult {
    const output = this.parseOutput(response);
    return {
      values: output.values.map(({ attachmentId, page, quote, ...value }) => ({
        ...value,
        sourceRefs: [createSourceRef({ attachmentId, page, quote })],
      })),
      pinnedFields: output.pinnedFields,
    };
  }
}
