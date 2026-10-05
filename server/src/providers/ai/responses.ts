import OpenAI from 'openai';
import type {
  Response,
  ResponseInput,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';
import type { AiContext } from '../../application/import/types.js';
import { importInstructions, webResearchInstructions } from './prompts.js';
import { publicUrl } from '../web/resources.js';
import { ensure } from '../../application/errors.js';

export function responseText(result: Response) {
  return result.output
    .flatMap((o) => (o.type === 'message' ? o.content : []))
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
}

export async function searchWeb(
  client: OpenAI,
  model: string,
  maxOutputTokens: number,
  prompt: string,
  searchCalls: number,
  context: AiContext,
  sourceMode: 'retrieved' | 'cited' = 'retrieved',
) {
  const result = await requestResponse(
    client,
    model,
    maxOutputTokens,
    prompt,
    context,
    {
      instructions: webResearchInstructions,
      tools: [{ type: 'web_search' }],
      max_tool_calls: searchCalls,
      ...(sourceMode === 'retrieved'
        ? { include: ['web_search_call.action.sources' as const] }
        : {}),
    },
    'research',
  );
  const sources = [
    ...new Set(
      result.output.flatMap((o) => {
        if (o.type === 'web_search_call' && sourceMode === 'retrieved')
          return [
            ...('url' in o.action && typeof o.action.url === 'string' ? [o.action.url] : []),
            ...('sources' in o.action ? (o.action.sources ?? []).map((s) => s.url) : []),
          ];
        return o.type === 'message'
          ? o.content.flatMap((c) =>
              c.type === 'output_text'
                ? (c.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => a.url)
                : [],
            )
          : [];
      }),
    ),
  ].filter(publicUrl);
  const calls = result.output.filter((o) => o.type === 'web_search_call');
  await context.record({
    toolCalls: calls.map(({ action }) => ({
      name: 'web_search',
      resultCount: 'sources' in action ? (action.sources?.length ?? 0) : 'url' in action ? 1 : 0,
      truncated: false,
    })),
  });
  ensure(calls.length <= searchCalls, 'Research tool limit exceeded');
  return {
    text: responseText(result),
    sources: sourceMode === 'cited' ? sources.slice(0, 3) : sources,
  };
}

export async function requestResponse(
  client: OpenAI,
  model: string,
  maxOutputTokens: number,
  input: ResponseInput | string,
  context: AiContext,
  extra: Partial<ResponseCreateParamsNonStreaming> & { max_tool_calls?: number } = {},
  task = 'structured_output',
): Promise<Response> {
  context.signal.throwIfAborted();
  const started = Date.now();
  let result: Response;
  try {
    result = await client.responses.create(
      {
        model,
        store: false,
        instructions: importInstructions,
        input,
        max_output_tokens: maxOutputTokens,
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
  const usage = {
    model: extra.model ?? model,
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
    cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
  await context.record({
    ...usage,
    entries: [{ ...usage, task, elapsedMs: Date.now() - started }],
  });
  ensure(result.status === 'completed' && Array.isArray(result.output), 'AI response incomplete');
  return result;
}
