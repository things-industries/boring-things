/** Resource page tool, retrieves observed download and image links during public research. */

import type { FromSchema } from 'json-schema-to-ts';
import type { AiContext } from '../types.js';
import { createObjectSchema } from '../schemas.js';
import { createTool, recordToolCall } from './tool.js';
import { readResourcePage } from '../../web/resources.js';
import { ensure } from '../../../application/errors.js';

const parameters = createObjectSchema(
  { url: { type: 'string', description: 'Page URL observed in web search results.' } },
  'Public resource page to inspect.',
);

// Gives research access to page downloads with per-conversation read and text limits.
export function createResourcePageTool(
  context: AiContext,
  sources: Set<string>,
  readPage = readResourcePage,
) {
  const budget = { ...context, toolCalls: 0, toolCallLimit: 3 };
  return createTool<FromSchema<typeof parameters>>(
    {
      type: 'function',
      name: 'read_resource_page',
      description:
        'Read an observed official model or support page for direct PDF and image links, including embedded download metadata. Available up to three times.',
      strict: true,
      parameters,
    },
    async ({ url }) => {
      context.signal.throwIfAborted();
      ensure(budget.toolCalls < budget.toolCallLimit, 'tool_limit');
      const page = sources.has(url) ? await readPage(url, context.signal) : null;
      context.signal.throwIfAborted();
      if (!page) {
        await recordToolCall(budget, 'read_resource_page', 0);
        return { output: { error: sources.has(url) ? 'page_unavailable' : 'unobserved_url' } };
      }
      const links = page.links.slice(0, 30).map((link) => ({
        url: link.url,
        context: link.context.slice(0, 1000),
      }));

      // Leave room for all three page reads in the model conversation.
      while (
        links.length &&
        JSON.stringify({ url: page.url, links, truncated: true }).length > 20000
      ) {
        if (links.some((link) => link.context.length))
          for (const link of links) link.context = link.context.slice(0, link.context.length / 2);
        else links.pop();
      }
      const truncated =
        links.length < page.links.length ||
        links.some((link, index) => link.context.length < page.links[index].context.length);
      sources.add(page.url);
      for (const link of links) sources.add(link.url);
      await recordToolCall(budget, 'read_resource_page', links.length, truncated);
      return { output: { url: page.url, links, truncated } };
    },
  );
}
