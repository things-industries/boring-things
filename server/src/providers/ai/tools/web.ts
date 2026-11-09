/** Configures bounded hosted web search and extracts observed public sources from completed responses. */

import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';
import type { AiContext } from '../types.js';
import { responseText } from '../tasks/task.js';
import { publicUrl } from '../../web/resources.js';
import { ensure } from '../../../application/errors.js';

// Selects hosted search and optional retrieved-source reporting.
export function createWebSearchOptions(
  searchCalls: number,
  sourceMode: 'retrieved' | 'cited' = 'retrieved',
): Partial<ResponseCreateParamsNonStreaming> {
  return {
    ...(searchCalls > 0 ? { tools: [{ type: 'web_search' }], max_tool_calls: searchCalls } : {}),
    include: sourceMode === 'retrieved' ? ['web_search_call.action.sources'] : undefined,
  };
}

// Records hosted tool usage and returns the observed source catalogue.
export async function readWebResult(
  result: Response,
  context: AiContext,
  searchCalls: number,
  sourceMode: 'retrieved' | 'cited' = 'retrieved',
) {
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
