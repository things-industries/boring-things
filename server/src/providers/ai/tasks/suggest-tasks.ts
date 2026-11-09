/** Researches and converts cited suggestTasks results. */

import type { FromSchema } from 'json-schema-to-ts';
import type { TaskSuggestions, ImportTaskContext } from '../../../application/import/types.js';
import type { Response } from 'openai/resources/responses/responses';
import {
  RecommendationTask,
  recommendationSourcesSchema,
  recommendationInstructions,
} from './recommendation.js';
import { createObjectSchema } from '../schemas.js';
import type { Schema } from '../../../../../shared/model.js';
import type { RecommendationInput } from './recommendation.js';

export interface TaskResearch extends RecommendationInput {
  existingTasks: Pick<Schema['Event'], 'title' | 'status'>[];
}

const taskRecommendationInstructions = `Select work worth remembering or tracking to completion. Prioritise activities specific to the Thing that help maintain it and are easy to forget, such as running a maintenance programme, replacing a consumable or booking a service. Include recurring work and relevant one-off administration, such as submitting an insurance claim. Exclude extremely obvious actions and work likely to be done very frequently during normal use, such as wiping up spills or removing loose food residues. Boring Things manages records: do not suggest recording model numbers, serial numbers or policy details, copying information into the app, or uploading and organising documents. Passive waiting and rare incident-recovery advice do not belong in general suggestions.
Common remedies that nearly every owner is likely to need can also qualify, such as resetting a router. Explain when to use the remedy and its consequences without claiming a fault exists. A common remedy need not depend on a recorded fault.
Use supplied age, mileage, condition and service history to select applicable work. For example, select the documented car service appropriate to its age and mileage. When these facts are unknown, describe the documented conditions without assuming they apply or that work is due. Use evidence recommending the action for this Thing and its relevant component when available. A warning or identifying label alone does not establish a maintenance requirement. Use only documented procedures, triggers and intervals.
Select the overall procedure or outcome as one task. Put preparation, precautions and completion steps in its description. Name each task with a verb and its object, including words needed to identify the procedure. Put timing, frequency and conditions in the description. Keep the action's meaning when shortening its title.
Examples:
- "Run the maintenance programme" and "Use the pyrolytic cleaning function" are useful when documented for the Thing.
- "Remove coarse dirt before pyrolytic cleaning" belongs in the pyrolytic task's description.
- "Remove food residues before using the oven" is obvious routine care; omit it as a task.
- "Reset the router" can qualify as a documented common remedy; its description explains the symptoms and procedure.
- "Submit a claim" names the work; evidence requirements belong in the description.
Return each underlying action once. Exclude equivalent existing tasks even when their titles differ, including completed or dismissed tasks. Return fewer tasks or none when no worthwhile tasks can be identified.`;

export const outputSchema = createObjectSchema(
  {
    items: {
      type: 'array',
      maxItems: 8,
      description:
        'Up to eight distinct tasks worth remembering or tracking; empty when none qualify.',
      items: createObjectSchema(
        {
          title: {
            type: 'string',
            description:
              'Verb and object naming the procedure or outcome, with timing and conditions in the description (min 1 char, max 200 chars).',
            minLength: 1,
            maxLength: 200,
          },
          description: {
            type: 'string',
            description:
              'Documented conditions, frequency, preparation, procedure and precautions, accounting for known age and state, with no inferred next date or assumed fault (min 1 char, max 4000 chars).',
            minLength: 1,
            maxLength: 4000,
          },
          sourceRefs: recommendationSourcesSchema,
        },
        'One maintenance procedure, administration action or common remedy justified by evidence applicable to the Thing.',
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
  return `Find management tasks worth remembering for this Thing. Category guidance: ${guidance[research.categoryId] ?? 'Documented maintenance, administration and common remedies.'} About the thing: ${JSON.stringify(research)}. Consult the supplied reference URLs. Establish applicability to the model, variant, region and service version where relevant. Include sourceRefs from linked Attachments or public sources when available; an empty array is allowed. Use at most ${searchCalls} web tool calls including page opens; stop at that limit.`;
}

export type Output = FromSchema<typeof outputSchema>;

export class SuggestTasksTask extends RecommendationTask<Output, TaskSuggestions> {
  protected readonly model: string = 'gpt-6-luna';
  protected readonly effort = 'low';
  protected readonly searchCalls = 3;
  protected task = 'task_suggestions';
  protected instructions = `${recommendationInstructions} ${taskRecommendationInstructions}`;
  protected outputSchema = outputSchema;
  protected resultKey = 'items' as const;

  constructor(
    private input: TaskResearch,
    context: ImportTaskContext,
  ) {
    super(context);
  }

  // Reads attachments and researches missing evidence before returning cited suggestions.
  protected async runTask() {
    if (!this.input.knownFields.length && !this.input.sources.length) return { items: [] };
    const response = await this.execute(suggestTasksPrompt(this.input, this.searchCalls));
    return this.processResponse(response);
  }

  // Checks observed sources and converts model citations into application references.
  private processResponse(response: Response): TaskSuggestions {
    const result = this.parseOutput(response);
    const output: TaskSuggestions = {
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
    this.reportMetrics({ validCount: output.items.length });
    return output;
  }
}
