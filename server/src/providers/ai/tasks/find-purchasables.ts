/** Researches and converts cited findPurchasables results. */

import type { FromSchema } from 'json-schema-to-ts';
import type {
  PurchasableSuggestions,
  ImportTaskContext,
} from '../../../application/import/types.js';
import type { Response } from 'openai/resources/responses/responses';
import {
  RecommendationTask,
  recommendationSourcesSchema,
  recommendationInstructions,
} from './recommendation.js';
import { publicUrl } from '../../web/resources.js';
import { createObjectSchema } from '../schemas.js';
import type { Schema } from '../../../../../shared/model.js';
import type { RecommendationInput } from './recommendation.js';

export interface PurchasableResearch extends RecommendationInput {
  existingPurchasables: Pick<Schema['Purchasable'], 'name' | 'kind'>[];
}

const purchasableRecommendationInstructions = `Name each purchasable with its basic item name, usually 2–5 words. Omit the Thing's name, brands, model and product codes, part numbers and quantities. Keep only qualifiers needed to distinguish it from other purchasables, such as "Solid baking tray", "Deep baking tray" or "Wire baking shelf". Other suitable names include "Cleaning gel", "Detergent tablets" and "Water filter".
Describe why the item is useful and when the owner should buy it. Aim for one sentence of 5–20 words, at most 100 characters, using only benefits and buying situations justified by the evidence. Mention included components or quantities only when they affect the buying decision. Include a compatibility restriction only when it affects the owner's choice. Keep product identifiers and compatibility evidence in source quotations. Keep quotations verbatim.
Examples:
- "Bosch Cleaning Gel for Ovens 00312324 (200 ml)" becomes "Cleaning gel": "Removes burnt-on food and grease from the oven interior, racks and baking trays."
- "Bosch Universal Oven Pan 11029049" becomes "Solid baking tray": "For baking, roasting and catching drips when grilling; useful when you need a deeper tray."
- "Bosch Multi-use Wire Shelf 00577170" becomes "Wire baking shelf": "Supports dishes and baking trays when you need an additional or replacement shelf."`;

export const outputSchema = createObjectSchema(
  {
    items: {
      type: 'array',
      maxItems: 8,
      description:
        'Up to eight distinct compatible products; empty when purchase links or compatibility are unproven.',
      items: createObjectSchema(
        {
          kind: {
            type: 'string',
            enum: ['CONSUMABLE', 'ACCESSORY'],
            description:
              'Consumable used or replaced during operation, or an accessory compatible with the Thing.',
          },
          name: {
            type: 'string',
            description:
              'Basic item name with only qualifiers needed to distinguish products (min 1 char, max 200 chars).',
            minLength: 1,
            maxLength: 200,
          },
          description: {
            type: 'string',
            description:
              'Brief evidence-based explanation of usefulness and when to buy, usually one sentence of 5–20 words (min 1 char, max 100 chars).',
            minLength: 1,
            maxLength: 100,
          },
          merchantUrl: {
            type: 'string',
            description:
              'Direct purchase page URL observed through web search or printed in cited Attachment content (min 1 char, max 2000 chars).',
            minLength: 1,
            maxLength: 2000,
          },
          sourceRefs: recommendationSourcesSchema,
        },
        'One compatible product with observed purchase and evidence URLs.',
      ),
    },
  },
  'Supported consumables and accessories with purchase pages and compatibility evidence.',
);

const guidance: Record<string, string> = {
  appliances:
    'Useful documented consumables (filters, bags, detergent, cartridges), tools (eg. cleaning supplies or special implements), replacement parts, or accessories.',
  devices: 'Compatible accessories: chargers, docks, cases and mounts.',
  vehicles:
    'Documented consumables and compatible accessories.  Commonly useful products include oil, filters, wiper blades, bulbs and batteries.  Common accessories include roof racks, cargo carriers, bike racks, and towing hitches.',
};

// Builds task instructions from the supplied application context.
function findPurchasablesPrompt(research: PurchasableResearch, searchCalls: number) {
  return `Find items or services online (with links to purchase) that a user might want to purchase for their Thing. About the Thing: ${JSON.stringify(research)}. Suitable ideas for purchasables in the ${research.categoryId} category include: ${guidance[research.categoryId]} Consult the supplied reference URLs. Prefer manufacturer purchase pages and authorised retailers. Establish compatibility with the model, variant, region, manufacturer part number or documented technical requirements. Every product needs a direct purchase URL. Include compatibility sources when available. Do not invent URLs, prices, availability or compatibility. Use at most ${searchCalls} web tool calls including page opens; stop at that limit. Return up to 5 distinct consumables or accessories. Include sourceRefs from linked Attachments or public sources when available. Provide a purchase URL when available. Search for a purchase page when the Attachment identifies a product without a purchase URL. Return an empty items array when none are justified.  Finding no applicable purchasables is a valid outcome.`;
}

export type Output = FromSchema<typeof outputSchema>;

export class FindPurchasablesTask extends RecommendationTask<Output, PurchasableSuggestions> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'medium';
  protected task = 'purchasable_suggestions';
  protected instructions = `${recommendationInstructions} ${purchasableRecommendationInstructions}`;
  protected outputSchema = outputSchema;
  protected resultKey = 'items' as const;

  constructor(
    private input: PurchasableResearch,
    context: ImportTaskContext,
  ) {
    super(context);
  }

  // Reads attachments and researches missing evidence before returning cited suggestions.
  protected async runTask() {
    if (!Object.hasOwn(guidance, this.input.categoryId)) return { items: [] };
    if (!this.input.knownFields.length && !this.input.sources.length) return { items: [] };
    const response = await this.execute(findPurchasablesPrompt(this.input, this.searchCalls));
    return this.processResponse(response);
  }

  // Checks observed sources and converts model citations into application references.
  private processResponse(response: Response): PurchasableSuggestions {
    const result = this.parseOutput(response);
    const output: PurchasableSuggestions = {
      items: result.items
        .filter((item) => publicUrl(item.merchantUrl))
        .map((item) => {
          const sourceRefs = this.getSourceRefs(item.sourceRefs);
          return {
            kind: item.kind,
            name: item.name,
            description: item.description,
            merchantUrl: item.merchantUrl,
            sourceRefs,
          };
        })
        .filter(
          (item) =>
            !this.input.existingPurchasables.some(
              (product) =>
                product.kind === item.kind &&
                product.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
            ),
        ),
    };
    this.reportMetrics({ validCount: output.items.length });
    return output;
  }
}
