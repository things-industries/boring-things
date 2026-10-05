// Adapts AI extraction, registry selection, mapping and research, validating model output before use.

import { responseText, searchWeb, requestResponse, type AiTurnCompleted } from './responses.js';
import { readResourcePage } from '../web/resources.js';
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
  ReferenceDocument,
  EmptyResearchField,
  DocumentExtraction,
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

  private validateOutput<T>(result: Response, schema: object): T {
    let data: unknown;
    try {
      data = JSON.parse(responseText(result));
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
    return this.validateOutput<T>(result, schema);
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
      if (!calls.length) return this.validateOutput<T>(result, schema);
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
      extractedThings: extracted.candidates,
    };
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
}
