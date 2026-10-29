/** Selects category fieldsets through registry retrieval. */

import type { components } from '../schema-types.js';
import type { AiContext, AiConfig } from '../types.js';
import { AiTask } from './task.js';
import { thingImportInstructions } from '../prompts.js';
import type { ExtractedThing, RegistryTools } from '../../../application/import/types.js';
import { createFieldSetsTool } from '../tools/registry.js';

import { createObjectSchema } from '../schemas.js';

export const schema = createObjectSchema(
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
  return `Fieldsets are groups of properties that should be used together as a unit and applied to a Thing when the fieldset's eligibility criteria are met. **Select fieldsets for this thing using the search_field_sets tool**: search using keywords, filter using eligibility criteria and respect 'includes' (mandatory) and 'considerAlongside' (optional) flags. Prefer the most specific fieldsets. Only IDs returned by tools may be selected. Return fieldsets, not values. Select every applicable fieldset, even when some fields have no extracted values.  Thing: ${JSON.stringify({ name: thing.name, categoryId: thing.categoryId, terms: thing.terms, sources: thing.sources, knownFields: thing.knownFields, facts: thing.facts })}`;
}

export class SelectFieldSetsTask extends AiTask<components['schemas']['Selection']> {
  protected task = 'field_selection';
  protected instructions = thingImportInstructions;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: ExtractedThing,
    tools: RegistryTools,
  ) {
    super(config);
    this.tools = [createFieldSetsTool(tools)];
  }

  // Selects fieldsets without proposing field values.
  async run(context: AiContext) {
    const response = await this.execute(
      [{ role: 'user', content: selectFieldSetsPrompt(this.input) }],
      context,
    );
    return this.parseOutput(response);
  }
}
