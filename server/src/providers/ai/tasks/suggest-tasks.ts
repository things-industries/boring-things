/** Researches and converts cited suggestTasks results. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiConfig } from '../types.js';
import {
  RecommendationTask,
  recommendationSourcesSchema,
  recommendationInstructions,
} from './recommendation.js';
import type {
  TaskResearch,
  TaskSuggestions,
  ImportTaskContext,
} from '../../../application/import/types.js';

import { createObjectSchema } from '../schemas.js';

const taskRecommendationInstructions = `Select tasks before naming them. Suggest maintenance or administration work that an owner can perform and mark complete as a separate task. Include recurring work and relevant one-off actions, such as submitting an insurance claim. Exclude passive waiting, routine operating advice and recovery advice for exceptional incidents from general suggestions. Boring Things imports and manages the owner's records: do not suggest recording model numbers, serial numbers or policy details, copying information into the app, or uploading and organising its documents. "Record the appliance model and type" is handled by Boring Things, so omit it. Identification labels and document metadata alone do not justify maintenance or administration tasks. Return fewer tasks or none when the evidence supplies only advice or identifying information.
Name each task with a verb and its object. Keep a qualifier only when it helps identify the work, such as "dirty" in "Clean dirty door seals". Put supported frequency, triggers, methods, precautions and evidence requirements in the description. Keep the action's meaning when shortening its title.
Examples:
- "Clean the watch body regularly" becomes "Clean the watch body"; frequency belongs in the description.
- "Clean the watch band according to its material" becomes "Clean the watch band"; material-specific instructions belong in the description.
- "Prepare and submit claims with complete evidence" becomes "Submit a claim"; evidence requirements belong in the description.
- "Clean dirty door seals" is a suitable task title.
- "Dry the watch and band after liquid exposure" is incident recovery advice; omit it from general suggestions.
- "Let the interior dry after each programme" is passive waiting advice; omit it from general suggestions.
Return each underlying action once. When existing tasks are supplied, exclude equivalent actions even when their titles differ, including completed or dismissed tasks.`;

export const schema = createObjectSchema(
  {
    items: {
      type: 'array',
      maxItems: 8,
      description: 'Up to eight distinct supported tasks; empty when none are established.',
      items: createObjectSchema(
        {
          title: {
            type: 'string',
            description:
              'Verb and object naming the work, with only qualifiers needed to identify it (min 1 char, max 200 chars).',
            minLength: 1,
            maxLength: 200,
          },
          description: {
            type: 'string',
            description:
              'Source-supported frequency, triggers, methods, precautions and evidence requirements, with no inferred next date (min 1 char, max 4000 chars).',
            minLength: 1,
            maxLength: 4000,
          },
          sourceRefs: recommendationSourcesSchema,
        },
        'One task justified by Attachment content or public evidence applicable to the Thing.',
      ),
    },
  },
  'Supported management tasks for one Thing, ready to become unscheduled suggested Events.',
);

// Builds task instructions from the supplied application context.
function suggestTasksPrompt(research: TaskResearch, searchCalls: number) {
  const guidance: Record<string, string> = {
    appliances:
      'Manufacturer-recommended cleaning, consumable replacement, inspection and/or servicing.',
    devices: 'Documented care, maintenance and upkeep.',
    vehicles:
      'Manufacturer-recommended servicing, inspections and part-replacement requirements, retaining time and distance conditions.',
    memberships: 'Documented renewal and required member actions, review of value.',
    subscriptions: 'Documented renewal, cancellation deadlines and required account actions.',
    insurance: 'Documented renewal review and policy-required actions.',
    utilities:
      'Required meter readings, tariff reviews and renewal actions supported by the contract.',
  };
  return ` Find useful management tasks for a Thing. Suitable task ideas for this category of thing include: ${guidance[research.categoryId]} About the thing: ${JSON.stringify(research)}. Consult the supplied reference URLs and prefer official manufacturer or provider documentation. Establish applicability to the model, variant, region and service version where relevant. Preserve supported instructions, intervals, usage thresholds and conditions. Every task needs supporting evidence of applicability to the thing. Use at most ${searchCalls} web tool calls including page opens; stop at that limit. Return up to 8 distinct suggested tasks. Every task needs sourceRefs establishing applicability from linked Attachments or observed public sources. Keep secrets and individual identifiers out of task text. Return an empty items array when none are justifiable.  Finding no applicable tasks is a valid outcome.`;
}

export class SuggestTasksTask extends RecommendationTask<
  components['schemas']['TaskSuggestions'],
  TaskSuggestions
> {
  protected readonly model: string = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'task_suggestions';
  protected instructions = `${recommendationInstructions} ${taskRecommendationInstructions}`;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: TaskResearch,
    searchCalls: number,
  ) {
    super(config, searchCalls);
  }

  // Reads attachments and researches missing evidence before returning cited suggestions.
  async run(context: ImportTaskContext) {
    this.registerSourceTool(context);
    if (!this.input.knownFields.length && !this.input.sources.length) return { items: [] };
    const response = await this.execute(suggestTasksPrompt(this.input, this.searchCalls), context);
    return this.processResponse(response);
  }

  // Checks observed sources and converts model citations into application references.
  private processResponse(response: Response): TaskSuggestions {
    const result = this.parseOutput(response);
    return {
      items: result.items
        .map((item) => ({
          title: item.title,
          description: item.description,
          sourceRefs: this.getSourceRefs(item.sourceRefs),
        }))
        .filter(
          (item) =>
            !this.input.existingTasks.some(
              (task) => task.title.trim().toLowerCase() === item.title.trim().toLowerCase(),
            ),
        ),
    };
  }
}
