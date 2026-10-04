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
  MappingSession,
  RegistryTools,
  Source,
} from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';

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
  ) {
    this.client = new OpenAI({ apiKey: key, maxRetries: 0 });
  }

  private async requestResponse(
    conversation: ResponseInput,
    context: AiContext,
    extra: Partial<ResponseCreateParamsNonStreaming> & { max_tool_calls?: number } = {},
  ): Promise<Response> {
    context.signal.throwIfAborted();
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
      model: this.model,
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
  ): Promise<T> {
    const result = await this.requestResponse(conversation, context, {
      text: this.outputFormat(schema),
      include: ['reasoning.encrypted_content'],
    });
    return this.validateOutput<T>(result, schema);
  }

  private async runRegistryConversation<T>(
    conversation: ResponseInput,
    schema: object,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<T> {
    for (let round = 0; round < 32; round++) {
      const result = await this.requestResponse(conversation, context, {
        text: this.outputFormat(schema),
        tools: functions,
        parallel_tool_calls: false,
        include: ['reasoning.encrypted_content'],
      });
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
  ): Promise<MappingSession> {
    const conversation: ResponseInput = [
      { role: 'user', content: prompts.selectFieldSetsPrompt(extractedThing) },
    ];
    const selected = await this.runRegistryConversation<Outputs['Selection']>(
      conversation,
      schemas.$defs.selection,
      tools,
      context,
    );
    return {
      setIds: selected.setIds,
      mapFactBatch: async (facts) => {
        conversation.push({ role: 'user', content: prompts.mapFactBatchPrompt(selected, facts) });
        return this.runRegistryConversation<Outputs['Mapping']>(
          conversation,
          schemas.$defs.mapping,
          tools,
          context,
        );
      },
    };
  }
  async discover(
    candidate: ResearchContext,
    context: AiContext,
    focus: 'reference' | 'maintenance' | 'products' = 'reference',
  ): Promise<Discovery> {
    const result = await this.requestResponse(
      [
        {
          role: 'user',
          content: prompts.researchPrompt(candidate, focus, this.searchCalls),
        },
      ],
      context,
      {
        tools: [{ type: 'web_search' }],
        max_tool_calls: this.searchCalls,
        include: ['web_search_call.action.sources'],
      },
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
      result.output.filter((o) => o.type === 'web_search_call').length <= this.searchCalls,
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
    );

    return { ...parsed, sources };
  }
}
