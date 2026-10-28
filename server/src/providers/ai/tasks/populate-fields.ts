/** Field population task, proposes cited values and pins from saved Attachment evidence. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiContext } from '../types.js';
import { AiTask, type TaskRuntime } from './task.js';
import { importInstructions } from '../prompts.js';
import type {
  PopulationInput,
  PopulationResult,
  WorkflowTools,
} from '../../../application/import/types.js';
import { createTranscriptionTool } from '../tools/registry.js';
import { createSourceRef } from '../sources.js';
import { createObjectSchema, valueSchema, sourceEvidenceProperties } from '../schemas.js';

export const schema = createObjectSchema(
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
      description: 'Up to three useful requested fields to highlight.',
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

export class PopulateFieldsTask extends AiTask<components['schemas']['Population']> {
  protected task = 'field_population';
  protected instructions = importInstructions;
  protected schema = schema;

  constructor(
    runtime: TaskRuntime,
    private input: PopulationInput,
    tools: WorkflowTools,
  ) {
    super(runtime);
    this.tools = [createTranscriptionTool(tools)];
  }

  // Runs the task over the supplied Thing and source context.
  async run(context: AiContext): Promise<PopulationResult> {
    return this.processResponse(
      await this.execute(
        [
          {
            role: 'user',
            content: `Find values for only the requested fields using applicable Attachment content. Search saved transcriptions for relevant passages. Respect field schemas, units, context, model and variant. Return only values justified by verbatim source quotes and the original Attachment/page references. Public documents justify class data, not private instance identifiers. Omit values without sufficient evidence. Suggest up to three useful requested fields to highlight. Input: ${JSON.stringify(this.input)}`,
          },
        ],
        context,
      ),
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
