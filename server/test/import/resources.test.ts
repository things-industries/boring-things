/** Checks resource research shares page evidence and tool budgets within one model conversation. */

import { setEnvMode } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FindResourcesTask } from '../../src/providers/ai/tasks/find-resources.js';
import { createResourcePageTool } from '../../src/providers/ai/tools/resources.js';

class LimitedResourcesTask extends FindResourcesTask {
  protected override readonly maxTextCharacters = 90000;
}

// Page catalogues exceeded the text limit and repeated resource URLs across retrieved pages.
test('resource research fits page evidence into its conversation and spends its web budget once', async (t) => {
  setEnvMode('test');
  const pages = [1, 2, 3].map((page) => `https://maker.example/model/page-${page}`);
  const photo = 'https://maker.example/photo.webp';
  const unconfirmedSource = 'https://maker.example/unconfirmed';
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
    assert.equal(body.model, 'gpt-6.1-sol');
    if (requests > 1) {
      const results = body.input.filter(
        (item: { type: string }) => item.type === 'function_call_output',
      );
      assert.equal(results.length, requests - 1);
      assert.ok(results.every((item: { output: string }) => item.output.length <= 20000));
      assert.ok(results.every((item: { output: string }) => item.output.includes(photo)));
      assert.ok(!body.tools.some((tool: { type: string }) => tool.type === 'web_search'));
      assert.equal(body.max_tool_calls, undefined);
    } else assert.equal(body.max_tool_calls, 3);
    return Response.json({
      status: 'completed',
      output: [
        ...(requests === 1
          ? [
              ...pages.map((url) => ({
                type: 'web_search_call',
                status: 'completed',
                action: { sources: [{ url }] },
              })),
              {
                type: 'web_search_call',
                status: 'incomplete',
                action: { sources: [{ url: unconfirmedSource }] },
              },
            ]
          : []),
        ...(requests <= 3
          ? [
              {
                type: 'function_call',
                name: 'read_resource_page',
                call_id: `page-${requests}`,
                arguments: JSON.stringify({ url: pages[requests - 1] }),
              },
            ]
          : [
              {
                type: 'message',
                content: [{ type: 'output_text', text: JSON.stringify(expected) }],
              },
            ]),
      ],
    });
  });
  const reads: string[] = [];
  const task = new LimitedResourcesTask(
    { id: 'fixture', categoryId: 'appliances', knownFields: [], emptyFields: [] },
    { signal: new AbortController().signal, record: async () => {} },
    async (url) => {
      reads.push(url);
      return {
        url,
        links: Array.from({ length: 30 }, (_, index) => ({
          url:
            index === 0 ? photo : `https://maker.example/photo-${pages.indexOf(url)}-${index}.webp`,
          context: '"model" '.repeat(2000),
        })),
      };
    },
  );
  const result = await task.run();
  assert.equal(requests, 4);
  assert.deepEqual(reads, pages);
  assert.deepEqual(result.items, expected.items);
  assert.ok(result.sources.includes(photo));
  assert.ok(!result.sources.includes(unconfirmedSource));
  assert.equal(result.sources.length, 91);
});

test('resource research returns its findings after exhausting page reads', async (t) => {
  setEnvMode('test');
  const source = 'https://maker.example/model';
  const identity = { name: 'Example Device', sourceUrl: source };
  let requests = 0;
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    requests++;
    if (requests === 5) {
      assert.deepEqual(body.tools, [{ type: 'web_search' }]);
      assert.equal(body.max_tool_calls, 2);
      assert.ok(body.input.at(-1).output.includes('tool_limit'));
    }
    return Response.json({
      status: 'completed',
      output: [
        ...(requests === 1
          ? [{ type: 'web_search_call', status: 'completed', action: { url: source } }]
          : []),
        ...(requests < 5
          ? [
              {
                type: 'function_call',
                name: 'read_resource_page',
                call_id: `page-${requests}`,
                arguments: JSON.stringify({ url: source }),
              },
            ]
          : [
              {
                type: 'message',
                content: [{ type: 'output_text', text: JSON.stringify({ identity, items: [] }) }],
              },
            ]),
      ],
    });
  });
  const result = await new FindResourcesTask(
    { id: 'fixture', categoryId: 'devices', knownFields: [], emptyFields: [] },
    { signal: new AbortController().signal, record: async () => {} },
    async (url) => {
      reads++;
      return { url, links: [] };
    },
  ).run();
  assert.equal(reads, 3);
  assert.equal(requests, 5);
  assert.deepEqual(result, { identity, items: [], sources: [source] });
});

test('page retrieval reports missing or unobserved pages and propagates cancellation', async () => {
  const source = 'https://maker.example/model';
  const controller = new AbortController();
  const reads: string[] = [];
  const tool = createResourcePageTool(
    { signal: controller.signal, record: async () => {} },
    new Set([source]),
    async (url) => {
      reads.push(url);
      return null;
    },
  );
  assert.deepEqual(await tool.execute({ url: 'https://unknown.example/model' }), {
    output: { error: 'unobserved_url' },
  });
  assert.deepEqual(await tool.execute({ url: source }), { output: { error: 'page_unavailable' } });
  assert.deepEqual(reads, [source]);
  controller.abort(new Error('cancelled'));
  await assert.rejects(tool.execute({ url: source }), /cancelled/);
});

test('resource research omits proposals when no public sources were retrieved', async (t) => {
  setEnvMode('test');
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                identity: { name: 'Unverified Device', sourceUrl: 'https://maker.example/model' },
                items: [],
              }),
            },
          ],
        },
      ],
    }),
  );
  const result = await new FindResourcesTask(
    { id: 'fixture', categoryId: 'devices', knownFields: [], emptyFields: [] },
    { signal: new AbortController().signal, record: async () => {} },
  ).run();
  assert.deepEqual(result, { items: [], sources: [] });
});
