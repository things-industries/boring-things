import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiImports } from '../src/providers/ai.js';
import type { Usage } from '../src/application/import-types.js';

test('discovery retains opened PDF URLs and structures a cited product identity', async (t) => {
  const source = 'https://manufacturer.example/oven';
  const pdf = 'https://documents.example/download?id=123';
  const requests: Record<string, unknown>[] = [];
  const usage: Partial<Usage>[] = [];
  const expected = {
    identity: { name: 'Bosch Oven', sourceUrl: source },
    items: [
      {
        kind: 'reference',
        title: 'User manual',
        description: 'Applies to the identified model',
        url: pdf,
        sourceUrl: source,
      },
    ],
  };
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string));
    return new Response(
      JSON.stringify({
        status: 'completed',
        output:
          requests.length === 1
            ? [
                {
                  type: 'web_search_call',
                  action: { sources: [{ url: source }] },
                },
                { type: 'web_search_call', action: { url: pdf } },
                {
                  type: 'message',
                  content: [
                    {
                      type: 'output_text',
                      text: 'The identified Bosch model is an oven. Its manual is a PDF.',
                      annotations: [{ type: 'url_citation', url: source }],
                    },
                  ],
                },
              ]
            : [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: JSON.stringify(expected) }],
                },
              ],
      }),
    );
  });
  const ai = new OpenAiImports('test-key', 'test-model');
  const result = await ai.discover(
    {
      id: 'candidate-1',
      name: 'Bosch SYNTHETIC/01',
      categoryId: 'appliances',
      terms: [],
      facts: [],
    },
    {
      signal: new AbortController().signal,
      record: async (entry) => {
        usage.push(entry);
      },
    },
  );
  assert.deepEqual(result, { ...expected, sources: [source, pdf] });
  assert.equal(requests[0].max_tool_calls, 3);
  assert.ok(JSON.stringify(requests[1].input).includes(pdf));
  assert.equal(usage.flatMap((entry) => entry.toolCalls ?? []).length, 2);
});
