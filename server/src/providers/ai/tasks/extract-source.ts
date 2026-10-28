/** Extracts source-wide metadata and candidate Things for extraction evaluations. */

import type { Response } from 'openai/resources/responses/responses';
import type { components } from '../schema-types.js';
import type { AiContext } from '../types.js';
import { AiTask, type TaskRuntime } from './task.js';
import { importInstructions, thingDefinition } from '../prompts.js';
import type { Source, Extraction } from '../../../application/import/types.js';
import { createSourceInput } from '../sources.js';

import { createObjectSchema, valueSchema, attachmentMetadataSchema } from '../schemas.js';

export const schema = createObjectSchema(
  {
    metadata: {
      description:
        'Display metadata for the uploaded source, including a descriptive title for photographs and notes.',
      anyOf: [
        attachmentMetadataSchema,
        {
          type: 'null',
        },
      ],
    },
    text: {
      type: 'string',
      description:
        'Source transcription preserving labels, identifiers and surrounding context; empty when supplied text is retained directly.',
    },
    summary: {
      type: ['string', 'null'],
      description:
        "Short source-wide description of the document's content; null when the content cannot be read.",
      maxLength: 2000,
    },
    terms: {
      type: 'array',
      description:
        'Source-wide search terms without private identifiers, with at most 20 terms of at most 200 characters each.',
      maxItems: 20,
      items: {
        type: 'string',
        maxLength: 200,
      },
    },
    transcriptionStatus: {
      type: 'string',
      description:
        'Outcome of reading English content: complete, partly readable, no readable content, or insufficient English content.',
      enum: ['COMPLETE', 'EMPTY', 'PARTIAL', 'INSUFFICIENT_LANGUAGE'],
    },
    candidates: {
      type: 'array',
      description:
        'Up to four distinct Things that can be identified in the source, with facts grouped by the thing they describe.  Identifying one thing in the source is typical.',
      items: createObjectSchema(
        {
          id: {
            type: 'string',
            description: 'Generated identifier unique within this extraction.',
          },
          name: {
            type: 'string',
            description:
              "Short everyday name, incorporating elements like brand/manufacturer/provider, product or type, and purpose or context, as appropriate.  Good examples are 'Bosch Oven' or 'Apple iPhone 8'.  Specificity of names should be guided by how likely it is for a person to own more than one (be more specific about iPhones than ovens).  A water utility contract could be '<company name> for <address>', since the address is important context for a contract tied to a property.  Avoid secrets, model codes and serial numbers.",
          },
          categoryId: {
            type: 'string',
            description:
              'One category ID copied from the category list, chosen for this Thing with its spelling preserved.',
          },
          terms: {
            type: 'array',
            description:
              'Key words from the source material that relate to the Thing, with at most 20 terms of at most 200 characters each.  Type, brand, provider, product or model identifiers are typical terms.  Avoid secrets and individual identifiers.',
            maxItems: 20,
            items: {
              type: 'string',
              maxLength: 200,
              description: 'One  term, such as a brand, product type or model identifier.',
            },
          },
          facts: {
            type: 'array',
            items: createObjectSchema(
              {
                id: {
                  type: 'string',
                  description:
                    'Local generated identifier unique within this thing candidate, such as "fact-1".',
                },
                label: {
                  type: 'string',
                  description:
                    'Short attribute label as defined in the source, or a descriptive label when none is printed, such as "Model number" or "Renewal date", preserving distinctions between model, production and serial identifiers.',
                  maxLength: 50,
                },
                value: {
                  ...valueSchema,
                  description:
                    'Value of this fact, as defined in the source, represented as text, number, boolean or money, with explicit false, zero and empty text preserved.',
                },
                quote: {
                  type: 'string',
                  description:
                    'Verbatim source excerpt supporting this label and value, including surrounding text needed to interpret it, at most 2000 characters.',
                  maxLength: 2000,
                },
                page: {
                  type: ['integer', 'null'],
                  description:
                    'One-based source page containing the supporting quote, supported by source page information; null when unavailable.',
                  minimum: 1,
                },
                sensitive: {
                  type: 'boolean',
                  description:
                    'Sensitivity flag: true for passwords, access codes and other secrets that require masking; false for facts that do not contain a secret.',
                },
              },
              'One observed attribute of this Thing',
            ),
            description:
              'Up to 100 source-supported facts belonging to this Thing, each with its own label, typed value and supporting quote, with manufacturer, model, production code and serial number represented as separate facts.',
          },
        },
        'One Thing and the facts belonging to it.',
      ),
    },
  },
  'Transcription, document metadata and source-supported Things extracted from the uploaded material.',
);

// Builds task instructions from the supplied application context.
function extractSourcePrompt(categories: string[], extractedText = false) {
  return `${thingDefinition} Examine the provided source material and extract up to 4 distinct Things with up to 100 facts for each Thing. Assign each Thing exactly one category from the following list: ${categories.join(', ')}. ${extractedText ? "The source text is already extracted: return an empty 'text' property in the extraction." : "Report all readable content from the source in the 'text' property of the extraction."} For each Thing, report a name, assign an appropriate category and list discernable facts about the thing. For each fact, include a verbatim supporting quote (max 2000 characters), page number or null. Use supplied [PDF page N] labels for original page numbers when present in the source; otherwise count pages by their one-based position in the supplied file, independently of any printed page labels. If source is multilingual, ignore translated repetitions, use only the English version. Mark passwords, access codes and other secret facts sensitive. Use a short everyday name for things: brand plus the supported product type, e.g. "Bosch Oven", is good. Avoid model/serial numbers and generic "appliance" when a specific type is evident.  'Terms' are keywords/tags that describe type, brand and model. Extract only facts supported by the source material; don't guess.  Give a source-wide summary and source-wide terms without private identifiers. Report whether English content was fully readable, partly readable, absent, or insufficient because the source has no usable English content. Metadata describes the whole source document. Give every source a short display title describing its content or visible purpose. For a photograph of a manufacturer rating label, use "Data plate photo"; for other photographs or notes, describe what is shown. Preserve the actual document title when useful. Use null for other unsupported metadata properties. Never infer document date from a purchase date unless the source is a receipt for that purchase.`;
}

export class ExtractSourceTask extends AiTask<components['schemas']['Extraction']> {
  protected task = 'source_extraction';
  protected instructions = importInstructions;
  protected schema = schema;

  constructor(
    runtime: TaskRuntime,
    private source: Source,
    private categories: string[],
  ) {
    super(runtime);
  }

  // Reads one source and converts candidates to the application extraction shape.
  async run(context: AiContext): Promise<Extraction> {
    const { content, text } = await createSourceInput(this.source, context.signal);
    const response = await this.execute(
      [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: extractSourcePrompt(this.categories, text !== undefined) },
            content,
          ],
        },
      ],
      context,
    );
    return this.processResponse(response, text);
  }

  // Keeps supplied text and translates the model's candidate collection.
  private processResponse(response: Response, text?: string): Extraction {
    const output = this.parseOutput(response);
    return {
      text: text ?? output.text,
      metadata: output.metadata,
      summary: output.summary,
      terms: output.terms,
      transcriptionStatus: output.transcriptionStatus,
      extractedThings: output.candidates,
    };
  }
}
