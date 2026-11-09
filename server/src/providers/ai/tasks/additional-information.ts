/** Additional information task, identifies source facts beyond the selected Thing fields. */

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
import { createObjectSchema, valueSchema, sourceEvidenceProperties } from '../schemas.js';
import type { Value } from '../../../../../shared/model.js';

export interface AdditionalInformationInput {
  thing: { name: string; categoryId: string; identifiers?: { fieldId: string; value: Value }[] };

  // Labels of all existing registry and custom fields, including empty fields.
  knownFields: string[];
  attachmentId: string;

  // A portion of the current attachment transcription, up to 20,000 characters.
  text: string;
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
  protected task = 'additional_information';
  protected instructions = getPrompt('thing-definition') + getPrompt('import-instructions');
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
          content: `Find only significant information missing from the supplied Thing fields. It must matter to identifying, operating, maintaining or administering this Thing. Use search_fields before proposing a custom field. Ignore incidental text and unexplained markings. Explain why each finding matters, preserve sensitivity and cite verbatim source passages. Input: ${JSON.stringify(this.input)}`,
        },
      ]),
    );
  }
}
