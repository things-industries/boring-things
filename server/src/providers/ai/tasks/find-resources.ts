/** Finds public documents and images, then structures observed resources. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiContext, AiConfig } from '../types.js';
import { AiTask } from './task.js';
import { thingImportInstructions } from '../prompts.js';
import type { ResearchThing, Discovery } from '../../../application/import/types.js';
import { categoryResearchPrompt, thingResearchInstructions } from '../prompts.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';
import { readResourcePage } from '../../web/resources.js';

import { createObjectSchema, attachmentMetadataSchema } from '../schemas.js';

export const schema = createObjectSchema(
  {
    identity: {
      anyOf: [
        createObjectSchema(
          {
            name: {
              type: 'string',
              description:
                'Short brand or provider plus everyday Thing type, such as "Bosch Oven", excluding model codes, marketing features, serial numbers and secrets.',
            },
            sourceUrl: {
              type: 'string',
              description:
                'URL copied from the supplied retrieved URL list whose content establishes the subject identity and type.',
            },
          },
          'Everyday name established by a retrieved source for the researched subject.',
        ),
        {
          type: 'null',
          description: 'Null when the cited research cannot establish an everyday Thing name.',
        },
      ],
      description:
        'Source-supported everyday Thing name with evidence identifying the subject; null when the research does not establish the identity.',
    },
    items: {
      type: 'array',
      items: createObjectSchema(
        {
          kind: {
            type: 'string',
            enum: ['reference', 'image'],
            description:
              'Resource kind: reference for an applicable downloadable PDF or image for an official product photograph.',
          },
          title: {
            type: 'string',
            description:
              'Short display title for the document or photograph, using source-supported wording, at most 200 characters.',
          },
          description: {
            type: 'string',
            description:
              'Summary of the resource and why it applies to this Thing, supported by the cited source, at most 4000 characters.',
          },
          url: {
            type: 'string',
            description:
              'URL copied from the supplied retrieved URL list for the downloadable PDF or product photograph.',
          },
          sourceUrl: {
            type: 'string',
            description:
              'URL copied from the supplied retrieved URL list whose content supports applicability. It may equal url when that resource provides the evidence.',
          },
          metadata: {
            anyOf: [
              attachmentMetadataSchema,
              {
                type: 'null',
                description:
                  'Null for non-reference items or when the cited source supports no document metadata.',
              },
            ],
            description:
              'Metadata supported by the cited reference document; null for other item kinds or when no metadata is supported, with null for each unknown property.',
          },
        },
        'One cited reference document or product photograph for the researched Thing.',
      ),
      description:
        'Up to eight cited reference documents and product photographs supported by retrieved evidence.',
    },
  },
  'Cited reference documents, a product photograph and identity supported by the research report and supplied retrieved URLs.',
);

// Builds task instructions from the supplied application context.
function resourceSearchPrompt(research: ResearchThing, searchCalls: number) {
  const subject = {
    name: research.name,
    categoryId: research.categoryId,
    knownFields: research.knownFields,
    documentLimits: research.documentLimits,
    rejectedDocuments: research.rejectedDocuments,
    rejectedDocumentUrls: research.rejectedDocumentUrls,
  };
  return `Research priority: ${categoryResearchPrompt(research.categoryId)} For a physical object, also find one official product photograph showing the matching model and variant. Omit images for nonphysical Things. Public subject context: ${JSON.stringify(subject)}. First fulfil the category research objective. A product data sheet does not fulfil a user-manual objective. Open the official model support page and inspect its downloads, including embedded download links. Respect the supplied documentLimits. Avoid rejectedDocumentUrls. Avoid rejectedDocuments unless a smaller edition is available at another URL. Prefer single-language manuals over multilingual bundles. Verify applicability to the subject, model or product variant, region, language and version where relevant. Prefer official documents. A family document applies only when it covers the subject. Retrieve direct downloadable PDF URLs, including official document CDN links. Do not invent URLs. Use at most ${searchCalls} web tool calls including page opens; stop at that limit. Cite each supported resource. Leave unsupported findings absent.`;
}

// Builds task instructions from the supplied application context.
function structureResearchPrompt(report: string, sources: string[], research: ResearchThing) {
  return `Structure up to 8 supported findings. Research objective: ${categoryResearchPrompt(research.categoryId)}. Public subject: ${JSON.stringify({ name: research.name, knownFields: research.knownFields })}. Include the requested category document and at most one official product photo for a physical object. The retrieved page link catalogue supplies observed URLs and their surrounding page text, including embedded download metadata. Use it to locate the full English manual. Match the source page model even when the linked manual covers a family. Every sourceUrl and url must be in the supplied retrieved URL list. Set identity to a short brand + everyday product type name such as "Bosch Oven", with sourceUrl proving the identification; otherwise null. Omit model codes, marketing features and serial numbers from the name. Reference entries MUST link directly to downloadable PDFs applicable to the subject and category instruction. Do not include HTML pages, search snippets or reference notes as attachments. The url is the retrieved PDF URL and sourceUrl is the retrieved page or PDF establishing applicability. Prefer official documents. A data sheet does not fulfil a manual objective. Image entries link to a product photograph found on an official model page, with sourceUrl proving the matching model and variant. Exclude labels, document scans, logos, icons and unrelated variants. Use null metadata for images. Reference metadata may include title, documentType, publisher and documentDate only when supported by the cited source; unknown properties are null. Do not infer document date from website update dates. Report: ${report}\nRetrieved URLs: ${JSON.stringify(sources)}`;
}

export class FindResourcesTask extends AiTask<components['schemas']['Discovery'], Discovery> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'medium';
  protected task = 'research_structure';
  protected instructions = thingImportInstructions;
  protected schema = schema;

  constructor(
    config: AiConfig,
    private input: ResearchThing,
    private searchCalls: number,
    private readPage = readResourcePage,
  ) {
    super(config);
  }

  // Searches public sources before structuring their observed download links.
  async run(context: AiContext) {
    const response = await this.requestResponse(
      resourceSearchPrompt(this.input, this.searchCalls),
      context,
      { ...createWebSearchOptions(this.searchCalls), instructions: thingResearchInstructions },
      undefined,
      'research',
    );
    const { text, sources } = await readWebResult(response, context, this.searchCalls);
    if (!sources.length) return { items: [], sources: [] };
    const pages = await Promise.all(
      sources
        .filter((url) => !/\.(pdf|png|(?:jpg|jpeg)|webp)(?:[?#]|$)/i.test(url))
        .sort((left, right) => {
          const relevance = (url: string) =>
            this.input.knownFields.filter(
              ({ value }) =>
                typeof value === 'string' &&
                value.length >= 3 &&
                url
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '')
                  .includes(value.toLowerCase().replace(/[^a-z0-9]/g, '')),
            ).length;
          return relevance(right) - relevance(left);
        })
        .slice(0, 3)
        .map((url) => this.readPage(url, context.signal)),
    );
    const resources = pages.filter((page) => page !== null);
    sources.push(
      ...resources
        .flatMap((page) => page.links.map((link) => link.url))
        .filter((url) => !sources.includes(url)),
    );
    const result = await this.execute(
      [
        {
          role: 'user',
          content: structureResearchPrompt(
            text + '\nRetrieved page links: ' + JSON.stringify(resources),
            sources,
            this.input,
          ),
        },
      ],
      context,
      { model: 'gpt-6-luna', effort: 'none' },
    );
    return this.processResponse(result, sources);
  }

  // Returns application resources with the observed source catalogue.
  private processResponse(response: Response, sources: string[]): Discovery {
    return { ...this.parseOutput(response), sources };
  }
}
