/**
 * Finds significant facts outside the Thing's existing fields.
 *
 * Runs after: Field population
 * As part of: Import
 * Inputs: Thing identity, existing field labels, a batch of text from a private
 *   uploaded Attachment and registry fields retrieved during the task
 * Outputs: Findings with a proposed registry field or custom field label,
 *   typed value, sensitivity flag, reason and source reference
 * Next: Finding validation and storage, followed by recommendation generation
 */

import type { FromSchema } from 'json-schema-to-ts';
import type {
  AdditionalInformationResult,
  ImportTaskContext,
} from '../../../application/import/types.js';
import type { RegistryResources } from '../types.js';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import { createFieldsTool, createFieldSetsTool } from '../tools/registry.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import {
  createObjectSchema,
  customValueTypeSchema,
  valueSchema,
  sourceEvidenceProperties,
} from '../schemas.js';
import type { Value } from '../../../../../shared/model.js';

export interface AdditionalInformationInput {
  thing: { name: string; categoryId: string; identifiers?: { fieldId: string; value: Value }[] };

  // Labels of all existing registry and custom fields, including empty fields.
  knownFields: string[];
  attachmentId: string;

  // A portion of the current attachment transcription.
  text: string;
}

const instructions = getPrompt('thing-definition') + getPrompt('import-instructions');
const prompt =
  'Find only significant information missing from the supplied Thing fields. It must matter to identifying, operating, maintaining or administering this Thing. Use search_fields before proposing a custom field. Ignore incidental text and unexplained markings. Explain why each finding matters, preserve sensitivity and cite verbatim source passages. Input: ';
const initialCharacterLimit = 100_000;

// Fits source text into the initial request, accounting for JSON escapes and other inputs.
export function getAdditionalInformationBatch(
  input: Omit<AdditionalInformationInput, 'text'>,
  source: string,
) {
  const available =
    initialCharacterLimit -
    instructions.length -
    prompt.length -
    JSON.stringify({ ...input, text: '' }).length;
  let length = Math.min(source.length, Math.max(0, available));
  if (JSON.stringify(source.slice(0, length)).length - 2 > available) {
    let lower = 0;
    while (lower < length) {
      const midpoint = Math.ceil((lower + length) / 2);
      if (JSON.stringify(source.slice(0, midpoint)).length - 2 <= available) lower = midpoint;
      else length = midpoint - 1;
    }
  }
  if (
    length < source.length &&
    /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(source.slice(length - 1, length + 1))
  )
    length--;
  return { ...input, text: source.slice(0, length) };
}

export const outputSchema = createObjectSchema(
  {
    findings: {
      description: 'Up to 10 significant findings outside the supplied fields.',
      type: 'array',
      maxItems: 10,
      items: createObjectSchema(
        {
          label: {
            description: 'Useful field label, up to 160 characters.',
            type: 'string',
          },
          fieldId: {
            description: 'Retrieved registry field ID, or null for a custom field.',
            type: ['string', 'null'],
          },
          value: valueSchema,
          valueType: customValueTypeSchema,
          sensitive: {
            description: 'Whether this finding contains sensitive information.',
            type: 'boolean',
          },
          reason: {
            description:
              'Why the information matters to operating, maintaining or administering the Thing.',
            type: 'string',
          },
          ...sourceEvidenceProperties,
        },
        'Significant additional source information.',
      ),
    },
  },
  'Important additional information.',
);

export type Output = FromSchema<typeof outputSchema>;

export class AdditionalInformationTask extends AiTask<Output, AdditionalInformationResult> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'low';
  protected override readonly batchResearchReads = true;
  protected override readonly maxTextCharacters = 160_000;
  protected task = 'additional_information';
  protected instructions = instructions;
  protected outputSchema = outputSchema;
  protected resultKey = 'findings' as const;

  constructor(
    private input: AdditionalInformationInput,
    context: ImportTaskContext,
    registryResources?: RegistryResources,
  ) {
    super(context);
    this.tools = [
      createTranscriptionTool(context),
      createFieldsTool(context, registryResources),
      createFieldSetsTool(context, registryResources),
    ];
  }

  // Runs the task over the supplied Thing and source context.
  protected async runTask() {
    return this.parseOutput(
      await this.execute([
        {
          role: 'user',
          content: prompt + JSON.stringify(this.input),
        },
      ]),
    );
  }
}
