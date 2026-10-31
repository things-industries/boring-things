/** Researches and converts cited suggestTasks results. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiContext, AiConfig } from '../types.js';
import { AiTask } from './task.js';
import { thingResearchInstructions, taskRecommendationInstructions } from '../prompts.js';
import type { TaskResearch, TaskSuggestions } from '../../../application/import/types.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';
import { publicUrl } from '../../web/resources.js';
import { ensure } from '../../../application/errors.js';

import { createObjectSchema } from '../schemas.js';

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
          sourceUrl: {
            type: 'string',
            description: 'Supporting URL observed through web search (min 1 char, max 2000 chars).',
            minLength: 1,
            maxLength: 2000,
          },
          quote: {
            type: 'string',
            description:
              'Supporting excerpt from the public source establishing task applicability (min 1 char, max 2000 chars).',
            minLength: 1,
            maxLength: 2000,
          },
        },
        'One task supported by a retrieved public source applicable to the Thing.',
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
  const subject = {
    name: research.name,
    categoryId: research.categoryId,
    knownFields: research.knownFields,
    referenceUrls: research.referenceUrls,
  };
  return ` Find useful management tasks for a Thing. Suitable task ideas for this category of thing include: ${guidance[research.categoryId]} About the thing: ${JSON.stringify(subject)}. Consult the supplied reference URLs and prefer official manufacturer or provider documentation. Establish applicability to the model, variant, region and service version where relevant. Preserve supported instructions, intervals, usage thresholds and conditions. Every task needs supporting evidence of applicability to the thing. Use at most ${searchCalls} web tool calls including page opens; stop at that limit. Return up to 3 distinct suggested tasks from public research. Use a supporting URL observed through web search with a supporting quote for every task. Keep secrets and individual identifiers out of task text. Return an empty items array when none are justifiable.  Finding no applicable tasks is a valid outcome.`;
}

export class SuggestTasksTask extends AiTask<
  components['schemas']['TaskSuggestions'],
  TaskSuggestions
> {
  protected readonly model: string = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected task = 'task_suggestions';
  protected instructions = `${thingResearchInstructions} ${taskRecommendationInstructions}`;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: TaskResearch,
    private searchCalls: number,
  ) {
    super(config);
  }

  // Researches public fields and returns cited suggestions.
  async run(context: AiContext) {
    if (!this.input.knownFields.length) return { items: [] };
    const response = await this.execute(
      suggestTasksPrompt(this.input, this.searchCalls),
      context,
      createWebSearchOptions(this.searchCalls),
    );
    const { sources } = await readWebResult(response, context, this.searchCalls);
    return this.processResponse(response, sources);
  }

  // Checks observed sources and converts model citations into application references.
  private processResponse(response: Response, sources: string[]): TaskSuggestions {
    const result = this.parseOutput(response);
    return {
      items: result.items
        .map((item) => {
          ensure(
            publicUrl(item.sourceUrl) && sources.includes(item.sourceUrl),
            'Uncited task source',
          );
          return {
            title: item.title,
            description: item.description,
            sourceRefs: [{ url: item.sourceUrl, quote: item.quote }],
          };
        })
        .filter(
          (item) =>
            !this.input.existingTasks.some(
              (task) => task.title.trim().toLowerCase() === item.title.trim().toLowerCase(),
            ),
        ),
    };
  }
}
