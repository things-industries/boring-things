/** Source recommendation task, converts saved evidence into cited tasks and products. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiContext, AiConfig } from '../types.js';
import { AiTask } from './task.js';
import {
  thingImportInstructions,
  taskRecommendationInstructions,
  purchasableRecommendationInstructions,
} from '../prompts.js';
import type {
  SourceRecommendationsInput,
  SourceRecommendations,
  WorkflowTools,
} from '../../../application/import/types.js';
import { createTranscriptionTool } from '../tools/registry.js';
import { createSourceRef } from '../sources.js';
import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';

export const schema = createObjectSchema(
  {
    tasks: {
      description: 'Distinct maintenance and administration actions justified by source content.',
      type: 'array',
      maxItems: 8,
      items: createObjectSchema(
        {
          title: {
            type: 'string',
            description:
              'Verb and object naming the work, with only qualifiers needed to identify it, up to 200 characters.',
          },
          description: {
            type: 'string',
            description:
              'Source-supported frequency, triggers, methods, precautions and evidence requirements, up to 4000 characters.',
          },
          ...sourceEvidenceProperties,
        },
        'A task justified by saved source content.',
      ),
    },
    purchasables: {
      description: 'Compatible products identified by source.',
      type: 'array',
      maxItems: 8,
      items: createObjectSchema(
        {
          name: {
            type: 'string',
            description:
              'Basic item name with only qualifiers needed to distinguish products, up to 200 characters.',
          },
          kind: {
            type: 'string',
            enum: ['CONSUMABLE', 'ACCESSORY'],
            description: 'Kind of purchasable.',
          },
          description: {
            type: 'string',
            description:
              'Brief evidence-based explanation of usefulness and when to buy, usually one sentence of 15–30 words, up to 4000 characters.',
          },
          merchantUrl: {
            type: ['string', 'null'],
            description: 'Purchase URL printed in the cited source, or null.',
          },
          ...sourceEvidenceProperties,
        },
        'A purchasable identified by a saved source.',
      ),
    },
  },
  'Recommendations justified by linked Attachment content.',
);

export class SourceRecommendationsTask extends AiTask<
  components['schemas']['SourceRecommendations'],
  SourceRecommendations
> {
  protected readonly model: string = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'source_recommendations';
  protected instructions = `${thingImportInstructions} ${taskRecommendationInstructions} ${purchasableRecommendationInstructions}`;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: SourceRecommendationsInput,
    tools: WorkflowTools,
  ) {
    super(config);
    this.tools = [createTranscriptionTool(tools)];
  }

  // Runs the task over the supplied Thing and source context.
  async run(context: AiContext) {
    return this.processResponse(
      await this.execute(
        [
          {
            role: 'user',
            content: `Recommend management tasks and compatible products justified by applicable linked Attachment content and the supplied Thing fields. Prefer official manufacturer or provider recommendations. Use search_transcription; cite original source IDs, pages and verbatim passages. Avoid existing suggestions and keep secrets and private identifiers out of recommendation text. A merchant URL must appear in the cited passage; otherwise return null. Do not invent dates or recommendations. Input: ${JSON.stringify(this.input)}`,
          },
        ],
        context,
      ),
    );
  }

  // Converts validated model output into the application result.
  private processResponse(response: Response): SourceRecommendations {
    const output = this.parseOutput(response);
    return {
      tasks: output.tasks.map(({ attachmentId, page, quote, ...task }) => ({
        ...task,
        sourceRefs: [createSourceRef({ attachmentId, page, quote })],
      })),
      purchasables: output.purchasables.map(({ attachmentId, page, quote, ...product }) => ({
        ...product,
        sourceRefs: [createSourceRef({ attachmentId, page, quote })],
      })),
    };
  }
}
