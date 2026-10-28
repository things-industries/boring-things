/** Additional information task, identifies source facts beyond the selected Thing fields. */

import type { components } from '../schema-types.js';
import type { AiContext } from '../types.js';
import { AiTask, type TaskRuntime } from './task.js';
import { importInstructions } from '../prompts.js';
import type {
  AdditionalInformationInput,
  AdditionalInformationResult,
  WorkflowTools,
} from '../../../application/import/types.js';
import {
  createTranscriptionTool,
  createFieldsTool,
  createFieldSetsTool,
} from '../tools/registry.js';

import { createObjectSchema, valueSchema, sourceEvidenceProperties } from '../schemas.js';

export const schema = createObjectSchema(
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

export class AdditionalInformationTask extends AiTask<
  components['schemas']['AdditionalInformation']
> {
  protected task = 'additional_information';
  protected instructions = importInstructions;
  protected schema = schema;

  constructor(
    runtime: TaskRuntime,
    private input: AdditionalInformationInput,
    tools: WorkflowTools,
  ) {
    super(runtime);
    this.tools = [
      createTranscriptionTool(tools),
      createFieldsTool(tools),
      createFieldSetsTool(tools),
    ];
  }

  // Runs the task over the supplied Thing and source context.
  async run(context: AiContext): Promise<AdditionalInformationResult> {
    return this.parseOutput(
      await this.execute(
        [
          {
            role: 'user',
            content: `Find only significant information missing from the supplied Thing fields. It must matter to identifying, operating, maintaining or administering this Thing. Use search_fields before proposing a custom field. Ignore incidental text and unexplained markings. Explain why each finding matters, preserve sensitivity and cite verbatim source passages. Input: ${JSON.stringify(this.input)}`,
          },
        ],
        context,
      ),
    );
  }
}
