/** Thing resolution task, proposes candidates and identifier matches from saved sources. */

import type { components } from '../schema-types.js';
import type { AiContext } from '../types.js';
import { AiTask, type TaskRuntime } from './task.js';
import { importInstructions } from '../prompts.js';
import type {
  ResolutionInput,
  ResolutionResult,
  WorkflowTools,
} from '../../../application/import/types.js';
import { createTranscriptionTool } from '../tools/registry.js';

import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';

export const schema = createObjectSchema(
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

export class ResolveThingTask extends AiTask<components['schemas']['Resolution']> {
  protected task = 'thing_resolution';
  protected instructions = importInstructions;
  protected schema = schema;

  constructor(
    runtime: TaskRuntime,
    private input: ResolutionInput,
    tools: WorkflowTools,
  ) {
    super(runtime);
    this.tools = [createTranscriptionTool(tools)];
  }

  // Runs the task over the supplied Thing and source context.
  async run(context: AiContext): Promise<ResolutionResult> {
    return this.parseOutput(
      await this.execute(
        [
          {
            role: 'user',
            content: `Identify candidate Things and give each a relative evidence strength. Associate printed identifiers with supplied category-valid identifier fields. Match only supplied owned Thing IDs using a semantic judgement. Thing context supplies the sole target and attributes ambiguous scraps to it; report contradiction only when source identifiers conflict. A manual's applicable-model list does not establish separate owned Things. Use search_transcription for evidence beyond summaries. Copy verbatim quotes and source IDs. Input: ${JSON.stringify(this.input)}`,
          },
        ],
        context,
      ),
    );
  }
}
