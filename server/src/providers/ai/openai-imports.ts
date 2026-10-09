// Adapts AI extraction, registry selection, mapping and research, validating model output before use.

import { responseText, searchWeb, requestResponse, type AiTurnCompleted } from './responses.js';
import { readResourcePage, publicUrl } from '../web/resources.js';
import OpenAI from 'openai';
import type {
  Response,
  ResponseInput,
  ResponseInputContent,
  ResponseCreateParamsNonStreaming,
  Tool,
} from 'openai/resources/responses/responses';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import schemas from './schemas.js';
import type { components } from './schema-types.js';
import * as prompts from './prompts.js';
import type {
  AiContext,
  ExtractedThing,
  ResearchThing,
  Discovery,
  Extraction,
  ImportAi,
  Fact,
  FactMapping,
  RegistryTools,
  Source,
  ImportSourceText,
  ReferenceDocument,
  EmptyResearchField,
  DocumentExtraction,
  TaskResearch,
  TaskSuggestions,
  PurchasableResearch,
  PurchasableSuggestions,
} from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';
import type { FieldSet } from '../../../../shared/model.js';
import { pdfText } from '../../lib/pdf.js';
import {
  DocumentSizeError,
  maxDocumentBytes,
  maxDocumentTextLength,
  maxModelDocumentBytes,
  maxModelDocumentPages,
} from '../../lib/document-limits.js';

const ajv = new Ajv({ strict: false });
addFormats.default(ajv);
const functions = schemas.registryTools as Tool[];
type Outputs = components['schemas'];

function boundedSources(sources: ImportSourceText[], terms: string[] = []): ImportSourceText[] {
  return sources.map((source) => {
    if (source.text.length <= 12_000) return source;
    const excerpts = [source.text.slice(0, 4_000)];
    for (const term of terms.filter((value) => value.length >= 3).slice(0, 8)) {
      const at = source.text.toLowerCase().indexOf(term.toLowerCase());
      if (at >= 0) excerpts.push(source.text.slice(Math.max(0, at - 500), at + 1_500));
    }
    return { ...source, text: excerpts.join('\n[Later source excerpt]\n').slice(0, 12_000) };
  });
}

export class OpenAiImports implements ImportAi {
  private client: OpenAI;
  constructor(
    key: string,
    private model: string,
    private maxOutputTokens = 12000,
    private searchCalls = 3,
    private documentModel = model,
    private readPage = readResourcePage,
    private onTurnCompleted?: AiTurnCompleted,
  ) {
    this.client = new OpenAI({ apiKey: key, maxRetries: 0 });
  }

  private async requestResponse(
    conversation: ResponseInput,
    context: AiContext,
    extra: Partial<ResponseCreateParamsNonStreaming> & { max_tool_calls?: number } = {},
    task = 'structured_output',
  ): Promise<Response> {
    return requestResponse(
      this.client,
      this.model,
      this.maxOutputTokens,
      conversation,
      context,
      extra,
      task,
      this.onTurnCompleted,
    );
  }

  private validateOutput<T>(text: string, schema: object): T {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid AI output');
    }
    ensure(ajv.validate(schema, data), 'Invalid AI output');
    return data as T;
  }

  private outputFormat(schema: object): NonNullable<ResponseCreateParamsNonStreaming['text']> {
    return {
      format: {
        type: 'json_schema',
        name: 'result',
        strict: true,
        schema: schema as Record<string, unknown>,
      },
    };
  }

  private async requestStructuredOutput<T>(
    conversation: ResponseInput,
    schema: object,
    context: AiContext,
    task = 'structured_output',
    model = this.model,
  ): Promise<T> {
    const result = await this.requestResponse(
      conversation,
      context,
      {
        text: this.outputFormat(schema),
        include: ['reasoning.encrypted_content'],
        model,
      },
      task,
    );
    return this.validateOutput<T>(responseText(result), schema);
  }

  private async runRegistryConversation<T>(
    input: Readonly<ResponseInput>,
    schema: object,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<T> {
    const conversation: ResponseInput = [...input];
    for (let round = 0; round < 32; round++) {
      const result = await this.requestResponse(
        conversation,
        context,
        {
          text: this.outputFormat(schema),
          tools:
            schema === schemas.$defs.mapping
              ? functions.filter(
                  (tool) => tool.type === 'function' && tool.name === 'search_fields',
                )
              : functions,
          parallel_tool_calls: false,
          include: ['reasoning.encrypted_content'],
        },
        schema === schemas.$defs.selection ? 'field_selection' : 'fact_mapping',
      );
      conversation.push(...(result.output as ResponseInput));
      const calls = result.output.filter((o) => o.type === 'function_call');
      if (!calls.length) return this.validateOutput<T>(responseText(result), schema);
      ensure(calls.length === 1, 'Invalid registry tool calls');
      const call = calls[0];
      const fn = schemas.registryTools.find((f) => f.name === call.name);
      ensure(fn, 'Unknown registry tool');
      let args: unknown;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        throw new Error('Invalid registry tool arguments');
      }
      ensure(ajv.validate(fn.parameters, args), 'Invalid registry tool arguments');
      const output =
        call.name === 'search_field_sets'
          ? await tools.searchFieldSets(
              (args as Outputs['search_field_sets']).categoryId,
              (args as Outputs['search_field_sets']).terms,
            )
          : await tools.searchFields((args as Outputs['search_fields']).labels);
      conversation.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(output),
      });
    }
    throw new Error('tool_limit');
  }

  private async sourceInput(source: Source, signal: AbortSignal) {
    if (source.content.length > maxDocumentBytes)
      throw new DocumentSizeError(source.content.length, maxDocumentBytes);
    let text = source.text;
    let pageCount = source.pageCount;
    if (source.mediaType === 'application/pdf' && text === undefined)
      ({ text, pageCount } = await pdfText(source.content, signal));
    if (source.mediaType === 'text/plain') text = source.content.toString('utf8');
    let content: ResponseInputContent;
    if (text?.trim() || source.mediaType === 'text/plain') {
      if (text!.length > maxDocumentTextLength)
        throw new DocumentSizeError(text!.length, maxDocumentTextLength);
      content = { type: 'input_text', text: text! };
    } else {
      if (source.content.length > maxModelDocumentBytes)
        throw new DocumentSizeError(source.content.length, maxModelDocumentBytes);
      if (source.mediaType === 'application/pdf' && pageCount! > maxModelDocumentPages)
        throw new DocumentSizeError(pageCount!, maxModelDocumentPages);
      const data = `data:${source.mediaType};base64,${source.content.toString('base64')}`;
      content = source.mediaType.startsWith('image/')
        ? { type: 'input_image', image_url: data, detail: 'auto' }
        : { type: 'input_file', filename: source.filename, file_data: data };
      text = undefined;
    }
    return { content, text };
  }

  async extract(source: Source, categories: string[], context: AiContext): Promise<Extraction> {
    const { content, text } = await this.sourceInput(source, context.signal);
    const extracted = await this.requestStructuredOutput<Outputs['Extraction']>(
      [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompts.extractSourcePrompt(categories, text !== undefined),
            },
            content,
          ],
        },
      ],
      schemas.$defs.extraction,
      context,
      'source_extraction',
    );
    return {
      text: text ?? extracted.text,
      metadata: extracted.metadata,
      summary: extracted.summary,
      terms: extracted.terms,
      transcriptionStatus: extracted.transcriptionStatus,
      extractedThings: extracted.candidates,
    };
  }

  async transcribe(source: Source, context: AiContext) {
    const { content, text } = await this.sourceInput(source, context.signal);
    const output = await this.requestStructuredOutput<Outputs['Transcription']>(
      [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompts.transcribeSourcePrompt(text !== undefined) },
            content,
          ],
        },
      ],
      schemas.$defs.transcription,
      context,
      'attachment_transcription',
    );
    return { ...output, text: text ?? output.text };
  }

  async identifyCandidates(sources: ImportSourceText[], categories: string[], context: AiContext) {
    const output = await this.requestStructuredOutput<Outputs['OpenCandidates']>(
      [
        {
          role: 'user',
          content: prompts.identifyCandidatesPrompt(boundedSources(sources), categories),
        },
      ],
      schemas.$defs.openCandidates,
      context,
      'open_candidates',
    );
    return output.candidates;
  }

  async extractTargetFacts(
    sources: ImportSourceText[],
    thing: Pick<ExtractedThing, 'name' | 'categoryId' | 'terms' | 'identifiers'>,
    context: AiContext,
  ) {
    const output = await this.requestStructuredOutput<Outputs['TargetedFacts']>(
      [
        {
          role: 'user',
          content: prompts.extractTargetFactsPrompt(boundedSources(sources, thing.terms), thing),
        },
      ],
      schemas.$defs.targetedFacts,
      context,
      'targeted_facts',
    );
    return output.sources;
  }

  async selectFieldSets(
    extractedThing: ExtractedThing,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<{ setIds: string[] }> {
    return this.runRegistryConversation<Outputs['Selection']>(
      [{ role: 'user', content: prompts.selectFieldSetsPrompt(extractedThing) }],
      schemas.$defs.selection,
      tools,
      context,
    );
  }
  async mapFacts(
    thing: ExtractedThing,
    facts: Fact[],
    selectedSets: FieldSet[],
    tools: RegistryTools,
    context: AiContext,
  ): Promise<FactMapping> {
    return this.runRegistryConversation<Outputs['Mapping']>(
      [{ role: 'user', content: prompts.mapFactsPrompt(thing, facts, selectedSets) }],
      schemas.$defs.mapping,
      tools,
      context,
    );
  }
  async findResources(
    research: ResearchThing,
    context: AiContext,
    searchCalls = this.searchCalls,
  ): Promise<Discovery> {
    const { text, sources } = await searchWeb(
      this.client,
      this.model,
      this.maxOutputTokens,
      prompts.resourceSearchPrompt(research, searchCalls),
      searchCalls,
      context,
      'retrieved',
      this.onTurnCompleted,
    );
    if (!sources.length) return { items: [], sources: [] };
    const pages = await Promise.all(
      sources
        .filter((url) => !/\.(pdf|png|(?:jpg|jpeg)|webp)(?:[?#]|$)/i.test(url))
        .sort((left, right) => {
          const relevance = (url: string) =>
            research.knownFields.filter(
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
    const parsed = await this.requestStructuredOutput<Outputs['Discovery']>(
      [
        {
          role: 'user',
          content: prompts.structureResearchPrompt(
            text + '\nRetrieved page links: ' + JSON.stringify(resources),
            sources,
            research,
          ),
        },
      ],
      schemas.$defs.discovery,
      context,
      'research_structure',
    );

    return { ...parsed, sources };
  }
  async extractDocument(
    document: ReferenceDocument,
    research: ResearchThing,
    targets: EmptyResearchField[],
    context: AiContext,
  ): Promise<DocumentExtraction> {
    ensure(targets.length <= 20, 'Document extraction limit exceeded');
    const { content } = await this.sourceInput(document, context.signal);
    const result = await this.requestStructuredOutput<Outputs['DocumentExtraction']>(
      [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompts.extractDocumentPrompt(research, targets, document.sourceContext),
            },
            content,
          ],
        },
      ],
      schemas.$defs.documentExtraction,
      context,
      'document_extraction',
      this.documentModel,
    );
    return result;
  }

  async suggestTasks(
    research: TaskResearch,
    context: AiContext,
    searchCalls = this.searchCalls,
  ): Promise<TaskSuggestions> {
    if (!research.knownFields.length) return { items: [] };
    const { text, sources } = await searchWeb(
      this.client,
      this.model,
      this.maxOutputTokens,
      prompts.suggestTasksPrompt(research, searchCalls),
      searchCalls,
      context,
      'retrieved',
      this.onTurnCompleted,
      { text: this.outputFormat(schemas.$defs.taskSuggestions), task: 'task_suggestions' },
    );
    const result = this.validateOutput<Outputs['TaskSuggestions']>(
      text,
      schemas.$defs.taskSuggestions,
    );
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
            !research.existingTasks.some(
              (task) => task.title.trim().toLowerCase() === item.title.trim().toLowerCase(),
            ),
        ),
    };
  }

  async findPurchasables(
    research: PurchasableResearch,
    context: AiContext,
    searchCalls = this.searchCalls,
  ): Promise<PurchasableSuggestions> {
    if (!research.knownFields.length) return { items: [] };
    const { text, sources } = await searchWeb(
      this.client,
      this.model,
      this.maxOutputTokens,
      prompts.findPurchasablesPrompt(research, searchCalls),
      searchCalls,
      context,
      'retrieved',
      this.onTurnCompleted,
      {
        text: this.outputFormat(schemas.$defs.purchasableSuggestions),
        task: 'purchasable_suggestions',
      },
    );
    const result = this.validateOutput<Outputs['PurchasableSuggestions']>(
      text,
      schemas.$defs.purchasableSuggestions,
    );
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
            !research.existingPurchasables.some(
              (product) =>
                product.kind === item.kind &&
                product.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
            ),
        ),
    };
  }
}
