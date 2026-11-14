/**
 * Checks whether a given public document applies to a given Thing.
 *
 * Runs after: The public document is linked and its transcription is available
 * As part of: Import and Refresh recommendations
 * Inputs: Thing category and public fields, registry identifier field definitions,
 *   and the document's summary, terms, identifier observations and transcription
 * Outputs: An applicability decision for the Thing and group or class identifiers
 *   covered by the document, with source references
 * Next: Document coverage storage, then fieldset selection or recommendation
 *   generation
 */

import type { FromSchema } from 'json-schema-to-ts';
import type {
  ResourceApplicability,
  ImportTaskContext,
  KnownResearchField,
  ImportSourceText,
  IdentifierObservation,
} from '../../../application/import/types.js';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';
import type { FieldDefinition } from '../../../../../shared/model.js';

export interface ResourceApplicabilityInput {
  categoryId: string;
  knownFields: KnownResearchField[];
  identifierFields: FieldDefinition[];
  source: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'> & {
    identifiers: IdentifierObservation[] | null;
  };
}

export const outputSchema = createObjectSchema(
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

export type Output = FromSchema<typeof outputSchema>;

export class ResourceApplicabilityTask extends AiTask<Output, ResourceApplicability> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'medium';
  protected task = 'resource_applicability';
  protected instructions = `${getPrompt('thing-definition')} ${getPrompt('import-instructions')}`;
  protected outputSchema = outputSchema;
  protected resultKey = 'identifiers' as const;

  constructor(
    private input: ResourceApplicabilityInput,
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
          content: `Assess whether this public source applies to the supplied Thing class and variant. Search its transcription. Record only printed group and class identifiers with verbatim quotes, including other models a manual covers. Ignore instance identifiers and credentials. Input: ${JSON.stringify(this.input)}`,
        },
      ]),
    );
  }
}
