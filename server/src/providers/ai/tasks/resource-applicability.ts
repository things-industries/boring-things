/** Resource applicability task, checks public document coverage for a Thing class and variant. */

import type { components } from '../schema-types.js';
import type { AiConfig } from '../types.js';
import { AiTask } from './task.js';
import { thingImportInstructions } from '../prompts.js';
import type {
  ResourceApplicabilityInput,
  ResourceApplicability,
  ImportTaskContext,
} from '../../../application/import/types.js';
import { createTranscriptionTool } from '../tools/transcription.js';

import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';

export const schema = createObjectSchema(
  {
    applicable: {
      type: 'boolean',
      description: 'Source applies to the supplied Thing class and variant.',
    },
    identifiers: {
      description: 'Cited public identifiers covered by this resource.',
      type: 'array',
      maxItems: 30,
      items: createObjectSchema(
        {
          fieldId: {
            type: 'string',
            description: 'Registry identifier field ID.',
          },
          value: {
            type: 'string',
            description: 'Printed identifier value.',
          },
          ...sourceEvidenceProperties,
        },
        'One public group or class identifier printed in this source.',
      ),
    },
  },
  'Applicability and public identifier coverage of one saved resource.',
);

export class ResourceApplicabilityTask extends AiTask<
  components['schemas']['ResourceApplicability'],
  ResourceApplicability,
  ImportTaskContext
> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'medium';
  protected task = 'resource_applicability';
  protected instructions = thingImportInstructions;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: ResourceApplicabilityInput,
  ) {
    super(config);
  }

  // Runs the task over the supplied Thing and source context.
  async run(context: ImportTaskContext) {
    this.tools = [createTranscriptionTool(context)];
    return this.parseOutput(
      await this.execute(
        [
          {
            role: 'user',
            content: `Assess whether this public source applies to the supplied Thing class and variant. Search its transcription. Record only printed group and class identifiers with verbatim quotes, including other models a manual covers. Ignore instance identifiers and credentials. Input: ${JSON.stringify(this.input)}`,
          },
        ],
        context,
      ),
    );
  }
}
