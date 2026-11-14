/**
 * Finds registry fieldsets that apply to the Thing.
 *
 * Runs after: Linked source gathering and public document applicability assessment
 * As part of: Import
 * Inputs: Thing name, category, search terms and public fields, applicable
 *   Attachment summaries and terms, and fieldsets from the category registry
 * Outputs: Eligible registry fieldset IDs
 * Next: Fieldset validation and addition, followed by field population
 */

import type { FromSchema } from 'json-schema-to-ts';
import type { RegistryResources } from '../types.js';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import type {
  ExtractedThing,
  ImportTaskContext,
  FieldSetSelection,
} from '../../../application/import/types.js';
import { createFieldSetsTool } from '../tools/registry.js';
import { createObjectSchema } from '../schemas.js';

export const outputSchema = createObjectSchema(
  {
    setIds: {
      type: 'array',
      description:
        'Eligible field-set IDs returned by search_field_sets, including mandatory included sets and applicable considerAlongside suggestions; an empty array when no set applies.',
      items: {
        type: 'string',
        description: 'Field-set ID copied from registry results, with its spelling preserved.',
      },
    },
  },
  'Data fieldsets that are applicable to the thing',
);

// Builds task instructions from the supplied application context.
function selectFieldSetsPrompt(thing: ExtractedThing) {
  return `Fieldsets are groups of properties that should be used together as a unit and applied to a Thing when the fieldset's eligibility criteria are met. **Select fieldsets for this thing using the search_field_sets tool**: search using keywords, filter using eligibility criteria and respect 'includes' (mandatory) and 'considerAlongside' (optional) flags. Prefer the most specific fieldsets. Select existing registry IDs in the Thing category. Return fieldsets, not values. Select every applicable fieldset, even when some fields have no extracted values.  Thing: ${JSON.stringify({ name: thing.name, categoryId: thing.categoryId, terms: thing.terms, sources: thing.sources, knownFields: thing.knownFields, facts: thing.facts })}`;
}

export type Output = FromSchema<typeof outputSchema>;

export class SelectFieldSetsTask extends AiTask<Output, FieldSetSelection> {
  protected readonly model: string = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'field_selection';
  protected instructions = `${getPrompt('thing-definition')} ${getPrompt('import-instructions')}`;
  protected outputSchema = outputSchema;
  protected resultKey = 'setIds' as const;

  constructor(
    private input: ExtractedThing,
    context: ImportTaskContext,
    registryResources?: RegistryResources,
  ) {
    super(context);
    this.tools = [createFieldSetsTool(context, registryResources)];
  }

  // Selects fieldsets without proposing field values.
  protected async runTask() {
    const response = await this.execute([
      { role: 'user', content: selectFieldSetsPrompt(this.input) },
    ]);
    return this.parseOutput(response);
  }
}
