/** Recommendation execution, shares attachment retrieval, bounded web search and citation conversion. */

import type { Response } from 'openai/resources/responses/responses';
import type {
  ImportTaskContext,
  ResearchThing,
  ImportSourceText,
  SourceEvidence,
} from '../../../application/import/types.js';
import type { SourceRef, FieldDefinition, Value } from '../../../../../shared/model.js';
import { AiTask } from './task.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import { readWebResult } from '../tools/web.js';
import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';
import { createSourceRef } from '../sources.js';
import { publicUrl } from '../../web/resources.js';
import { getPrompt } from '../prompts.js';

export interface RecommendationInput extends Pick<
  ResearchThing,
  'name' | 'categoryId' | 'knownFields'
> {
  referenceUrls: string[];
  fields: {
    id: string;
    label: string;
    description: string;
    schema: FieldDefinition['schema'] | null;
    value: Value | null;
  }[];
  sources: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'>[];
}

export const recommendationInstructions = `${getPrompt('thing-definition')} ${getPrompt('import-instructions')} ${getPrompt('web-research-instructions')}
Read applicable linked Attachments with search_transcription before searching the web. Use web search when evidence or purchase links are missing. Prefer official manufacturer or provider recommendations. Include Attachment IDs, original pages and quotations, or public URLs and excerpts when available. Sources are optional; return an empty sourceRefs array when none are available. Keep secrets and private identifiers out of web queries and recommendation text. Use public model, provider and product details for research. Exclude equivalent existing suggestions, including completed or dismissed tasks. Return useful recommendations based on the available information; distinguish conditional advice from known facts.
Use fieldSetSuggestions to guide research. Recommend a candidate only when the evidence supports its applicability and any stated eligibility conditions. Look for other useful recommendations and return each underlying action or product once.`;

export const recommendationSourcesSchema = {
  description: 'Optional Attachment passages or public sources explaining the recommendation.',
  type: 'array',
  items: {
    anyOf: [
      createObjectSchema(sourceEvidenceProperties, 'A passage from a supplied Attachment.'),
      createObjectSchema(
        {
          url: {
            description: 'Public source URL, 1–2000 characters.',
            type: 'string',
            minLength: 1,
            maxLength: 2000,
          },
          quote: {
            description: 'Supporting excerpt when available; empty when unavailable.',
            type: 'string',
          },
        },
        'A public source and an optional excerpt.',
      ),
    ],
  },
} as const;

export abstract class RecommendationTask<Output, Result> extends AiTask<Output, Result> {
  protected override readonly searchCalls = 3;
  private readonly sources: ImportTaskContext['sources'];

  // Registers attachment retrieval using the run's authorised source data.
  constructor(context: ImportTaskContext) {
    super(context);
    this.sources = context.sources;
    this.tools = context.sources.length ? [createTranscriptionTool(context)] : [];
  }

  // Records the public sources observed in this recommendation turn.
  protected override async onResponse(response: Response) {
    const { sources } = await readWebResult(response, this.context, this.searchCalls);
    this.reportMetrics({ sourceCount: sources.length });
  }

  // Converts citations and omits unusable links without rejecting their recommendations.
  protected getSourceRefs(refs: (SourceEvidence | { url: string; quote: string })[]): SourceRef[] {
    return refs.flatMap((ref) => {
      if ('attachmentId' in ref) {
        if (!this.sources.some((source) => source.attachmentId === ref.attachmentId)) return [];
        return [createSourceRef(ref)];
      }
      return publicUrl(ref.url) ? [{ ...ref, quote: ref.quote.slice(0, 2000) }] : [];
    });
  }
}
