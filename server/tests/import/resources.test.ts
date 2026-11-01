/** Checks resource research fits retrieved page evidence into the model input budget. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../../src/config.js';
import { FindResourcesTask } from '../../src/providers/ai/tasks/find-resources.js';

// Page catalogues exceeded the text limit and repeated resource URLs across retrieved pages.
test('resource research structures large page catalogues within the request text limits', async (t) => {
  const config = readConfig({ OPENAI_API_KEY: 'fixture-key' });
  const pages = [1, 2, 3].map((page) => `https://maker.example/model/page-${page}`);
  const photo = 'https://maker.example/photo-1-0.webp';
  const expected = {
    identity: { name: 'Example Oven', sourceUrl: pages[0] },
    items: [
      {
        kind: 'image',
        title: 'Product photo',
        description: 'Matching model photo',
        url: photo,
        sourceUrl: pages[0],
        metadata: null,
      },
    ],
  };
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    requests++;
    if (requests === 2) {
      const input = body.input[0].content;
      assert.ok(input.length <= 90000);
      assert.ok(input.length + body.instructions.length <= config.importMaxTextCharacters);
      assert.ok(input.includes(photo));
    }
    return Response.json({
      status: 'completed',
      output: [
        ...(requests === 1
          ? [{ type: 'web_search_call', action: { sources: pages.map((url) => ({ url })) } }]
          : []),
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: requests === 1 ? 'Official model resources.' : JSON.stringify(expected),
            },
          ],
        },
      ],
    });
  });
  const task = new FindResourcesTask(
    config,
    { id: 'fixture', categoryId: 'appliances', knownFields: [], emptyFields: [] },
    3,
    async (url) => ({
      url,
      links: Array.from({ length: 30 }, (_, index) => ({
        url:
          index === 0
            ? photo
            : `https://maker.example/photo-${pages.indexOf(url) + 1}-${index}.webp`,
        context: '"model" '.repeat(120),
      })),
    }),
  );
  const result = await task.run({
    signal: new AbortController().signal,
    maxTextCharacters: 90000,
    record: async () => {},
  });
  assert.equal(requests, 2);
  assert.deepEqual(result.items, expected.items);
  assert.ok(result.sources.includes(photo));
  assert.equal(new Set(result.sources).size, result.sources.length);
});
