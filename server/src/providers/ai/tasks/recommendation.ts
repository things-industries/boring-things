/** Recommendation execution, shares attachment retrieval, bounded web search and citation conversion. */

import type { ResponseInput } from 'openai/resources/responses/responses';
import type { ImportTaskContext } from '../../../application/import/types.js';
import type { SourceRef } from '../../../../../shared/model.js';
import type { AiConfig, AiContext } from '../types.js';
import type { components } from '../schema-types.js';
import { AiTask, type TaskOptions } from './task.js';
import { createTranscriptionTool } from '../tools/transcription.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';
import { createObjectSchema, sourceEvidenceProperties } from '../schemas.js';
import { createSourceRef } from '../sources.js';
import { publicUrl } from '../../web/resources.js';
import { ensure } from '../../../application/errors.js';
import { thingImportInstructions, webResearchInstructions } from '../prompts.js';

export const recommendationInstructions = `${thingImportInstructions} ${webResearchInstructions}
Read applicable linked Attachments with search_transcription before searching the web. Use web search when evidence or purchase links are missing. Prefer official manufacturer or provider recommendations. Cite Attachment IDs, original pages and verbatim passages, or observed public URLs and supporting excerpts. Keep secrets and private identifiers out of web queries and recommendation text. Use public model, provider and product details for research. Exclude equivalent existing suggestions, including completed or dismissed tasks. Return fewer recommendations or none when the evidence is insufficient.`;

export const recommendationSourcesSchema = {
  description:
    'Attachment passages or observed public sources establishing applicability, at least one.',
  type: 'array',
  minItems: 1,
  items: {
    anyOf: [
      createObjectSchema(sourceEvidenceProperties, 'A passage from a supplied Attachment.'),
      createObjectSchema(
        {
          url: {
            description: 'Public source URL observed through web search, 1–2000 characters.',
            type: 'string',
            minLength: 1,
            maxLength: 2000,
          },
          quote: {
            description: 'Supporting excerpt establishing applicability, 1–2000 characters.',
            type: 'string',
            minLength: 1,
            maxLength: 2000,
          },
        },
        'An observed public source and its supporting excerpt.',
      ),
    ],
  },
};

export abstract class RecommendationTask<Output, Result> extends AiTask<
  Output,
  Result,
  ImportTaskContext
> {
  protected observedUrls = new Set<string>();
  private webCalls = 0;

  constructor(
    config: AiConfig,
    protected searchCalls: number,
  ) {
    super(config);
  }

  // Registers attachment retrieval using the run's authorised source data.
  protected registerSourceTool(context: ImportTaskContext) {
    this.tools = context.sources.length ? [createTranscriptionTool(context)] : [];
  }

  // Adds web search to each turn and accounts for its budget across attachment reads.
  protected override async requestResponse(
    input: ResponseInput | string,
    context: AiContext,
    options: TaskOptions = {},
    delta?: (text: string) => void,
    task = this.task,
  ) {
    const remaining = this.searchCalls - this.webCalls;
    const web = createWebSearchOptions(options.tool_choice === 'none' ? 0 : remaining);
    const response = await super.requestResponse(
      input,
      context,
      {
        ...options,
        ...web,
        tools: [...(options.tools ?? []), ...(web.tools ?? [])],
        include: [...(options.include ?? []), ...(web.include ?? [])],
      },
      delta,
      task,
    );
    const { sources } = await readWebResult(response, context, remaining);
    this.webCalls += response.output.filter((item) => item.type === 'web_search_call').length;
    sources.forEach((url) => this.observedUrls.add(url));
    return response;
  }

  // Converts attachment citations and checks that public citations were observed during the task.
  protected getSourceRefs(
    refs: components['schemas']['TaskSuggestions']['items'][number]['sourceRefs'],
  ): SourceRef[] {
    return refs.map((ref) => {
      if ('attachmentId' in ref) return createSourceRef(ref);
      ensure(publicUrl(ref.url) && this.observedUrls.has(ref.url), 'Uncited recommendation source');
      return ref;
    });
  }
}
