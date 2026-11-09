/** Recommendation execution, shares attachment retrieval, bounded web search and citation conversion. */

import type { ResponseInput } from 'openai/resources/responses/responses';
import type {
  ImportTaskContext,
  ResearchThing,
  ImportSourceText,
  SourceEvidence,
} from '../../../application/import/types.js';
import type { SourceRef, FieldDefinition, Value } from '../../../../../shared/model.js';
import { AiTask, type TaskOptions } from './task.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';
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
Read applicable linked Attachments with search_transcription before searching the web. Use web search when evidence or purchase links are missing. Prefer official manufacturer or provider recommendations. Include Attachment IDs, original pages and quotations, or public URLs and excerpts when available. Sources are optional; return an empty sourceRefs array when none are available. Keep secrets and private identifiers out of web queries and recommendation text. Use public model, provider and product details for research. Exclude equivalent existing suggestions, including completed or dismissed tasks. Return useful recommendations based on the available information; distinguish conditional advice from known facts.`;

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
  protected abstract readonly searchCalls: number;
  private webCalls = 0;
  private readonly sources: ImportTaskContext['sources'];

  // Registers attachment retrieval using the run's authorised source data.
  constructor(context: ImportTaskContext) {
    super(context);
    this.sources = context.sources;
    this.tools = context.sources.length ? [createTranscriptionTool(context)] : [];
  }

  // Adds web search to each turn and accounts for its budget across attachment reads.
  protected override async requestResponse(
    input: ResponseInput | string,
    options: TaskOptions = {},
    delta?: (text: string) => void,
    task = this.task,
  ) {
    const remaining = this.searchCalls - this.webCalls;
    const web = createWebSearchOptions(options.tool_choice === 'none' ? 0 : remaining);
    const response = await super.requestResponse(
      input,
      {
        ...options,
        ...web,
        tools: [...(options.tools ?? []), ...(web.tools ?? [])],
        include: [...(options.include ?? []), ...(web.include ?? [])],
      },
      delta,
      task,
    );
    const { sources } = await readWebResult(response, this.context, remaining);
    this.reportMetrics({ sourceCount: sources.length });
    this.webCalls += response.output.filter((item) => item.type === 'web_search_call').length;
    return response;
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
