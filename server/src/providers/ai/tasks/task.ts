/** Executes AI requests, streamed deltas and bounded tool conversations with validation and usage reporting. */

import OpenAI from 'openai';
import type { ReasoningEffort } from 'openai/resources/shared';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type {
  Response,
  ResponseInput,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';
import type { AiTurnCompleted, AiContext, AiConfig } from '../types.js';
import type { TaskTool, TaskToolResult } from '../tools/tool.js';
import { ensure } from '../../../application/errors.js';

type TaskOptions = Omit<Partial<ResponseCreateParamsNonStreaming>, 'reasoning'> & {
  effort?: ReasoningEffort;
};

const ajv = new Ajv({ strict: false });
addFormats.default(ajv);

// Extracts response text independently of SDK convenience properties.
export function responseText(result: Response) {
  return result.output
    .flatMap((item) => (item.type === 'message' ? item.content : []))
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text)
    .join('');
}

// Counts message text and tool history before issuing a request.
function inputCharacters(input: ResponseInput | string): number {
  if (typeof input === 'string') return input.length;
  return input.reduce((total, item) => {
    if ('content' in item)
      return (
        total +
        (typeof item.content === 'string'
          ? item.content.length
          : Array.isArray(item.content)
            ? item.content.reduce((size, part) => size + ('text' in part ? part.text.length : 0), 0)
            : 0)
      );
    if (item.type === 'function_call') return total + item.arguments.length;
    if (item.type === 'function_call_output')
      return total + (typeof item.output === 'string' ? item.output.length : 0);
    return total;
  }, 0);
}

export abstract class AiTask<
  Output = never,
  Result = Output,
  Context extends AiContext = AiContext,
> {
  private client: OpenAI;
  private turnCompleted?: AiTurnCompleted;
  protected abstract readonly model: string;
  protected abstract readonly effort: ReasoningEffort;
  protected maxTextCharacters: number;
  protected abstract task: string;
  protected abstract instructions: string;
  protected schema?: Record<string, unknown>;
  protected tools: TaskTool[] = [];
  protected toolRounds = 31;
  protected parallelToolCalls = false;

  constructor(protected config: AiConfig) {
    this.client = new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 0 });
    this.maxTextCharacters = config.importMaxTextCharacters;
  }

  // Runs the task and returns its application result.
  abstract run(context: Context): Promise<Result>;

  // Registers the callback for completed model turns.
  onTurnCompleted(callback?: AiTurnCompleted): this {
    this.turnCompleted = callback;
    return this;
  }

  // Runs model turns and awaits tool results before continuing the conversation.
  protected async execute(
    input: ResponseInput | string,
    context: AiContext,
    options: TaskOptions = {},
    delta?: (text: string) => void,
  ): Promise<Response> {
    let conversation = typeof input === 'string' ? input : [...input];
    let finish = false;
    for (let round = 0; round <= this.toolRounds; round++) {
      const response = await this.requestResponse(
        conversation,
        context,
        {
          ...(this.schema
            ? {
                text: {
                  format: {
                    type: 'json_schema',
                    name: 'result',
                    strict: true,
                    schema: this.schema,
                  },
                },
              }
            : {}),
          ...(this.tools.length ? { tools: this.tools.map((tool) => tool.definition) } : {}),
          parallel_tool_calls: this.parallelToolCalls,
          include: ['reasoning.encrypted_content'],
          ...options,
          ...(this.tools.length && (finish || round === this.toolRounds)
            ? { tool_choice: 'none' }
            : {}),
        },
        delta,
      );
      const calls = response.output.filter((item) => item.type === 'function_call');
      if (!calls.length) return response;
      ensure(!finish && round < this.toolRounds, 'tool_limit');

      // Responses output items can be replayed as input, including encrypted reasoning.
      conversation = [
        ...(typeof conversation === 'string'
          ? [{ role: 'user' as const, content: conversation }]
          : conversation),
        ...(response.output as ResponseInput),
      ];
      for (const call of calls) {
        const tool = this.tools.find((tool) => tool.definition.name === call.name);
        ensure(tool, 'Unknown AI tool');
        let args: unknown;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          throw new Error('Invalid AI tool arguments');
        }
        const result: TaskToolResult = finish
          ? { output: { error: 'tool_limit' } }
          : await tool.execute(args).catch((error: unknown) => {
              if (!(error instanceof Error) || error.message !== 'tool_limit') throw error;
              finish = true;
              return {
                output: {
                  error: 'tool_limit',
                  message:
                    'Finish using the evidence already gathered; no more tool calls are available.',
                },
              };
            });
        conversation = [
          ...conversation,
          {
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify(result.output),
          },
          ...(result.input ?? []),
        ];
      }
    }
    throw new Error('tool_limit');
  }

  // Validates model JSON before task-specific conversion into an application result.
  protected parseOutput(response: Response): Output {
    let output: unknown;
    try {
      output = JSON.parse(responseText(response));
    } catch {
      throw new Error('Invalid AI output');
    }
    ensure(this.schema, 'Missing AI output schema');
    const valid = ajv.compile<Output>(this.schema);
    ensure(valid(output), 'Invalid AI output');
    return output;
  }

  // Sends streamed or buffered requests through one cancellation, error and usage boundary.
  protected async requestResponse(
    input: ResponseInput | string,
    context: AiContext,
    options: TaskOptions = {},
    delta?: (text: string) => void,
    task = this.task,
  ): Promise<Response> {
    context.signal.throwIfAborted();
    const characters = inputCharacters(input);
    ensure(
      characters + this.instructions.length <= this.maxTextCharacters &&
        characters <= (context.maxTextCharacters ?? Infinity),
      'text_limit',
    );
    context.beforeRequest?.();
    const started = Date.now();
    const { effort = this.effort, ...requestOptions } = options;
    const parameters = {
      model: this.model,
      store: false,
      instructions: this.instructions,
      input,
      max_output_tokens: this.config.aiMaxOutputTokens,
      ...requestOptions,
      reasoning: { mode: 'standard', effort },
    };
    let result: Response | undefined;
    try {
      if (delta) {
        const stream = await this.client.responses.create(
          { ...parameters, stream: true },
          { signal: context.signal },
        );
        try {
          const events = stream[Symbol.asyncIterator]();
          for (let event = await events.next(); !event.done; event = await events.next()) {
            context.signal.throwIfAborted();
            if (event.value.type === 'response.output_text.delta') delta(event.value.delta);
            if (event.value.type === 'response.completed') result = event.value.response;
            if (['error', 'response.failed', 'response.incomplete'].includes(event.value.type))
              throw new Error('chat_provider_failed');
          }
          context.signal.throwIfAborted();
        } finally {
          stream.controller.abort();
        }
      } else
        result = await this.client.responses.create(
          { ...parameters, stream: false },
          { signal: context.signal },
        );
    } catch (error) {
      context.signal.throwIfAborted();
      throw new Error(
        error instanceof OpenAI.APIError && error.status
          ? `ai_http_${error.status}`
          : delta
            ? 'chat_provider_failed'
            : 'ai_provider_failed',
      );
    }
    ensure(result, 'AI response incomplete');
    const usage = {
      model: parameters.model,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
    };
    const entry = { ...usage, task, elapsedMs: Date.now() - started };
    if (result.status === 'completed')
      this.turnCompleted?.({
        ...entry,
        toolCalls: result.output.flatMap((item) =>
          item.type === 'function_call'
            ? [item.name]
            : item.type === 'web_search_call'
              ? ['web_search']
              : [],
        ),
      });
    await context.record({ ...usage, entries: [entry] });
    ensure(result.status === 'completed' && Array.isArray(result.output), 'AI response incomplete');
    return result;
  }
}
