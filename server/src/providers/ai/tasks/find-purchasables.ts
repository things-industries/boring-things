/** Researches and converts cited findPurchasables results. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiContext, AiConfig } from '../types.js';
import { AiTask } from './task.js';
import { thingResearchInstructions } from '../prompts.js';
import type {
  PurchasableResearch,
  PurchasableSuggestions,
} from '../../../application/import/types.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';
import { publicUrl } from '../../web/resources.js';
import { ensure } from '../../../application/errors.js';

import { createObjectSchema } from '../schemas.js';

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
              'Source-supported product name, retaining any manufacturer part number (min 1 char, max 200 chars).',
            minLength: 1,
            maxLength: 200,
          },
          description: {
            type: 'string',
            description:
              'Purpose and compatibility explanation supported by retrieved evidence (min 1 char, max 4000 chars).',
            minLength: 1,
            maxLength: 4000,
          },
          merchantUrl: {
            type: 'string',
            description:
              'Direct purchase page URL observed through web search (min 1 char, max 2000 chars).',
            minLength: 1,
            maxLength: 2000,
          },
          sourceUrl: {
            type: 'string',
            description:
              'URL observed through web search establishing compatibility (min 1 char, max 2000 chars).',
            minLength: 1,
            maxLength: 2000,
          },
          quote: {
            type: 'string',
            description:
              'Supporting excerpt establishing model, variant, part number or technical compatibility (min 1 char, max 2000 chars).',
            minLength: 1,
            maxLength: 2000,
          },
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
  const subject = {
    name: research.name,
    categoryId: research.categoryId,
    knownFields: research.knownFields,
    referenceUrls: research.referenceUrls,
  };
  return ` Find useful purchasables for a Thing, including their purchase links. Suitable ideas for purchasables in this category of thing include: ${guidance[research.categoryId]} About the thing: ${JSON.stringify(subject)}. Consult the supplied reference URLs. Prefer manufacturer purchase pages and authorised retailers. Establish compatibility with the model, variant, region, manufacturer part number or documented technical requirements. Every product needs an observed direct purchase URL and compatibility evidence with a supporting excerpt. Do not invent URLs, prices, availability or compatibility. Use at most ${searchCalls} web tool calls including page opens; stop at that limit. Return up to 5 distinct consumables or accessories. Every merchantUrl and sourceUrl must be observed through web search. Return an empty items array when none are justified.  Finding no applicable purchasables is a valid outcome.`;
}

export class FindPurchasablesTask extends AiTask<
  components['schemas']['PurchasableSuggestions'],
  PurchasableSuggestions
> {
  protected task = 'purchasable_suggestions';
  protected instructions = thingResearchInstructions;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: PurchasableResearch,
    private searchCalls: number,
  ) {
    super(config);
  }

  // Researches public fields and returns cited suggestions.
  async run(context: AiContext) {
    if (!this.input.knownFields.length) return { items: [] };
    const response = await this.execute(
      findPurchasablesPrompt(this.input, this.searchCalls),
      context,
      createWebSearchOptions(this.searchCalls),
    );
    const { sources } = await readWebResult(response, context, this.searchCalls);
    return this.processResponse(response, sources);
  }

  // Checks observed sources and converts model citations into application references.
  private processResponse(response: Response, sources: string[]): PurchasableSuggestions {
    const result = this.parseOutput(response);
    return {
      items: result.items
        .map((item) => {
          ensure(
            publicUrl(item.merchantUrl) &&
              publicUrl(item.sourceUrl) &&
              sources.includes(item.merchantUrl) &&
              sources.includes(item.sourceUrl),
            'Uncited purchasable',
          );
          return {
            kind: item.kind,
            name: item.name,
            description: item.description,
            merchantUrl: item.merchantUrl,
            sourceRefs: [{ url: item.sourceUrl, quote: item.quote }],
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
