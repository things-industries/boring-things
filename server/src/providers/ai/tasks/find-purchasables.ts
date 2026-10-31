/** Researches and converts cited findPurchasables results. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiConfig } from '../types.js';
import {
  RecommendationTask,
  recommendationSourcesSchema,
  recommendationInstructions,
} from './recommendation.js';
import type {
  PurchasableResearch,
  PurchasableSuggestions,
  ImportTaskContext,
} from '../../../application/import/types.js';
import { publicUrl } from '../../web/resources.js';
import { ensure } from '../../../application/errors.js';

import { createObjectSchema } from '../schemas.js';

const purchasableRecommendationInstructions = `Name each purchasable with its basic item name, usually 2–5 words. Omit the Thing's name, brands, model and product codes, part numbers and quantities. Keep only qualifiers needed to distinguish it from other purchasables, such as "Solid baking tray", "Deep baking tray" or "Wire baking shelf". Other suitable names include "Cleaning gel", "Detergent tablets" and "Water filter".
Describe why the item is useful and when the owner should buy it. Aim for one sentence of 15–30 words, using only benefits and buying situations justified by the evidence. Mention included components or quantities only when they affect the buying decision. Include a compatibility restriction only when it affects the owner's choice. Keep product identifiers and compatibility evidence in source quotations. Keep quotations verbatim.
Examples:
- "Bosch Cleaning Gel for Ovens 00312324 (200 ml)" becomes "Cleaning gel": "Removes burnt-on food and grease from the oven interior, racks and baking trays."
- "Bosch Universal Oven Pan 11029049" becomes "Solid baking tray": "For baking, roasting and catching drips when grilling; useful when you need a deeper tray."
- "Bosch Multi-use Wire Shelf 00577170" becomes "Wire baking shelf": "Supports dishes and baking trays when you need an additional or replacement shelf."`;

export const schema = createObjectSchema(
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
              'Brief evidence-based explanation of usefulness and when to buy, usually one sentence of 15–30 words (min 1 char, max 4000 chars).',
            minLength: 1,
            maxLength: 4000,
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

// Builds task instructions from the supplied application context.
function findPurchasablesPrompt(research: PurchasableResearch, searchCalls: number) {
  const guidance: Record<string, string> = {
    appliances: 'Useful documented consumables: filters, bags, cartridges and cleaning supplies.',
    devices: 'Compatible accessories: chargers, docks, cases and mounts.',
    vehicles: 'Documented consumables and compatible accessories.',
    memberships: 'Usually no purchasables.',
    subscriptions: 'Usually no purchasables.',
    insurance: 'Usually no purchasables.',
    utilities:
      'Usually no purchasables; include only products required or supported by the service documentation.',
  };
  return ` Find useful purchasables for a Thing, including their purchase links. Suitable ideas for purchasables in this category of thing include: ${guidance[research.categoryId]} About the thing: ${JSON.stringify(research)}. Consult the supplied reference URLs. Prefer manufacturer purchase pages and authorised retailers. Establish compatibility with the model, variant, region, manufacturer part number or documented technical requirements. Every product needs a direct purchase URL and compatibility evidence with a supporting excerpt. Do not invent URLs, prices, availability or compatibility. Use at most ${searchCalls} web tool calls including page opens; stop at that limit. Return up to 5 distinct consumables or accessories. Use sourceRefs from linked Attachments or observed public sources for compatibility evidence. A merchantUrl must be observed through web search or printed in a cited Attachment passage. Search for a purchase page when the Attachment identifies a product without a purchase URL. Return an empty items array when none are justified.  Finding no applicable purchasables is a valid outcome.`;
}

export class FindPurchasablesTask extends RecommendationTask<
  components['schemas']['PurchasableSuggestions'],
  PurchasableSuggestions
> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'medium';
  protected task = 'purchasable_suggestions';
  protected instructions = `${recommendationInstructions} ${purchasableRecommendationInstructions}`;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: PurchasableResearch,
    searchCalls: number,
  ) {
    super(config, searchCalls);
  }

  // Reads attachments and researches missing evidence before returning cited suggestions.
  async run(context: ImportTaskContext) {
    this.registerSourceTool(context);
    if (!this.input.knownFields.length && !this.input.sources.length) return { items: [] };
    const response = await this.execute(
      findPurchasablesPrompt(this.input, this.searchCalls),
      context,
    );
    return this.processResponse(response);
  }

  // Checks observed sources and converts model citations into application references.
  private processResponse(response: Response): PurchasableSuggestions {
    const result = this.parseOutput(response);
    return {
      items: result.items
        .map((item) => {
          const sourceRefs = this.getSourceRefs(item.sourceRefs);
          ensure(
            publicUrl(item.merchantUrl) &&
              (this.observedUrls.has(item.merchantUrl) ||
                sourceRefs.some(
                  (ref) => ref.attachmentId && ref.quote?.includes(item.merchantUrl),
                )),
            'Uncited purchasable',
          );
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
  }
}
