import OpenAI from 'openai';
import type {
  Response,
  ResponseInput,
  ResponseInputContent,
  ResponseCreateParamsNonStreaming,
  Tool,
} from 'openai/resources/responses/responses';
import { Ajv } from 'ajv';
import schemas from './schemas.json' with { type: 'json' };
import type { components } from './schema-types.js';
import * as prompts from './prompts.js';
import type {
  AiContext,
  ExtractedThing,
  ResearchContext,
  Discovery,
  Extraction,
  ImportAi,
  Fact,
  MappingValue,
  RegistryTools,
  Source,
  ReferenceDocument,
  ResearchTarget,
  DocumentExtraction,
} from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';
import type { FieldSet } from '../../../../shared/model.js';

const ajv = new Ajv({ strict: false });
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
  ) {
    this.client = new OpenAI({ apiKey: key, maxRetries: 0 });
  }

  private async requestResponse(
    conversation: ResponseInput,
    context: AiContext,
    extra: Partial<ResponseCreateParamsNonStreaming> & { max_tool_calls?: number } = {},
    task = 'structured_output',
  ): Promise<Response> {
    context.signal.throwIfAborted();
    const started = Date.now();
    const model = extra.model ?? this.model;
    let result: Response;
    try {
      result = await this.client.responses.create(
        {
          model: this.model,
          store: false,
          instructions: prompts.importInstructions,
          input: conversation,
          max_output_tokens: this.maxOutputTokens,
          ...extra,
          stream: false,
        },
        { signal: context.signal },
      );
    } catch (error) {
      context.signal.throwIfAborted();
      throw new Error(
        error instanceof OpenAI.APIError && error.status
          ? `ai_http_${error.status}`
          : 'ai_provider_failed',
      );
    }
    await context.record({
      model,
      entries: [
        {
          task,
          model,
          inputTokens: result.usage?.input_tokens ?? 0,
          outputTokens: result.usage?.output_tokens ?? 0,
          cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
          elapsedMs: Date.now() - started,
        },
      ],
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
    });
    ensure(result.status === 'completed' && Array.isArray(result.output), 'AI response incomplete');
    return result;
  }

  private text(result: Response) {
    return result.output
      .flatMap((o) => (o.type === 'message' ? o.content : []))
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text)
      .join('');
  }

  private validateOutput<T>(result: Response, schema: object): T {
    let data: unknown;
    try {
      data = JSON.parse(this.text(result));
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

  async extract(source: Source, categories: string[], context: AiContext): Promise<Extraction> {
    const data = `data:${source.mediaType};base64,${source.content.toString('base64')}`;
    const content: ResponseInputContent =
      source.mediaType === 'text/plain'
        ? { type: 'input_text', text: source.content.toString('utf8') }
        : source.mediaType.startsWith('image/')
          ? { type: 'input_image', image_url: data, detail: 'auto' }
          : { type: 'input_file', filename: source.filename, file_data: data };
    const extracted = await this.requestStructuredOutput<Outputs['Extraction']>(
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompts.extractSourcePrompt(categories) }, content],
        },
      ],
      schemas.$defs.extraction,
      context,
      'source_extraction',
    );
    return {
      text: extracted.text,
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
  ): Promise<{ values: MappingValue[] }> {
    return this.runRegistryConversation<Outputs['Mapping']>(
      [{ role: 'user', content: prompts.mapFactsPrompt(thing, facts, selectedSets) }],
      schemas.$defs.mapping,
      tools,
      context,
    );
  }
  async discover(
    candidate: ResearchContext,
    context: AiContext,
    focus: 'reference' | 'maintenance' | 'products' = 'reference',
    searchCalls = this.searchCalls,
  ): Promise<Discovery> {
    const result = await this.requestResponse(
      [
        {
          role: 'user',
          content: prompts.researchPrompt(candidate, focus, searchCalls),
        },
      ],
      context,
      {
        tools: [{ type: 'web_search' }],
        max_tool_calls: searchCalls,
        include: ['web_search_call.action.sources'],
      },
      'research',
    );

    // Citable URLs come from provider search metadata; persistence checks model-selected URLs against this list.
    const sources = [
      ...new Set(
        result.output.flatMap((o) => {
          if (o.type === 'web_search_call') {
            return [
              ...('url' in o.action && typeof o.action.url === 'string' ? [o.action.url] : []),
              ...('sources' in o.action ? (o.action.sources ?? []).map((s) => s.url) : []),
            ];
          }
          return o.type === 'message'
            ? o.content.flatMap((c) =>
                c.type === 'output_text'
                  ? c.annotations.filter((a) => a.type === 'url_citation').map((a) => a.url)
                  : [],
              )
            : [];
        }),
      ),
    ];
    await context.record({
      toolCalls: result.output
        .filter((o) => o.type === 'web_search_call')
        .map(() => ({
          name: 'web_search',
          resultCount: sources.length,
          truncated: false,
        })),
    });
    ensure(
      result.output.filter((o) => o.type === 'web_search_call').length <= searchCalls,
      'Discovery tool limit exceeded',
    );
    if (!sources.length) return { items: [], sources: [] };
    const parsed = await this.requestStructuredOutput<Outputs['Discovery']>(
      [
        {
          role: 'user',
          content: prompts.structureResearchPrompt(this.text(result), sources),
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
    research: ResearchContext,
    targets: ResearchTarget[],
    context: AiContext,
  ): Promise<DocumentExtraction> {
    ensure(
      targets.length <= 20 &&
        document.content.length <= 20 * 1024 * 1024 &&
        document.pageCount <= 100,
      'Document extraction limit exceeded',
    );
    const content: ResponseInputContent =
      document.mediaType === 'text/plain'
        ? { type: 'input_text', text: document.content.toString('utf8') }
        : document.mediaType.startsWith('image/')
          ? {
              type: 'input_image',
              image_url: `data:${document.mediaType};base64,${document.content.toString('base64')}`,
              detail: 'auto',
            }
          : {
              type: 'input_file',
              filename: document.filename,
              file_data: `data:${document.mediaType};base64,${document.content.toString('base64')}`,
            };
    return this.requestStructuredOutput<Outputs['DocumentExtraction']>(
      [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompts.extractDocumentPrompt(research, targets) },
            content,
          ],
        },
      ],
      schemas.$defs.documentExtraction,
      context,
      'document_extraction',
      this.documentModel,
    );
  }
}
