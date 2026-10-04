import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiImports } from '../src/providers/ai/openai-imports.js';
import type { Usage } from '../src/application/import/types.js';
import { extractedThings, extractionBaseline } from './fixtures/imports.js';
import * as registrySeedDb from '../src/db/seeds/registry.js';

const context = () => ({ signal: new AbortController().signal, record: async () => {} });
const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
const output = (data: unknown) => ({
  status: 'completed',
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(data) }],
    },
  ],
});

test('SDK extraction replays the labelled hob, van and combined-policy baseline without tools', async (t) => {
  const subjects = Object.values(extractedThings);
  let request = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.text.format.type, 'json_schema');
    return jsonResponse(
      output({ text: 'Synthetic source', metadata: null, candidates: [subjects[request++]] }),
    );
  });
  const ai = new OpenAiImports('test-key', 'fixture');
  for (const { source, expected: subject } of extractionBaseline) {
    const result = await ai.extract(
      { filename: 'source.txt', mediaType: 'text/plain', content: Buffer.from(source) },
      [subject.categoryId],
      context(),
    );
    assert.deepEqual(result.extractedThings, [subject]);
  }
  assert.equal(request, 3);
});

test('SDK mapping supplies minimal Thing and field context and retains tool history within each batch', async (t) => {
  let request = 0;
  const selectedSets = registrySeedDb.sets.filter((set) => set.id === 'appliances.neff');
  const fieldResults = { results: [] };
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    request++;
    const round = request <= 2 ? 0 : Math.ceil((request - 2) / 2);
    const toolName = round === 0 ? 'search_field_sets' : 'search_fields';
    if (round > 0)
      assert.deepEqual(
        body.tools.map((tool: { name: string }) => tool.name),
        ['search_fields'],
      );
    if (request % 2 === 1) {
      assert.equal(body.input.length, 1);
      if (round > 0) {
        const prompt = body.input[0].content;
        assert.match(prompt, /A "?Thing"? is an identifiable/);
        assert.match(prompt, /selection and mandatory dependencies are already resolved/);
        assert.match(prompt, /Omit uncertain or unmatched facts from values/);
        const input = JSON.parse(prompt.split('\nInput: ')[1]);
        assert.deepEqual(input.thing, {
          name: 'Neff hob',
          categoryId: 'appliances',
          terms: ['Neff'],
        });
        assert.deepEqual(Object.keys(input.fieldSets[0]).sort(), ['fields', 'id', 'name']);
        assert.equal(input.fieldSets[0].id, selectedSets[0].id);
        assert.equal(input.fieldSets[0].name, selectedSets[0].name);
        assert.equal(input.fieldSets[0].fields.length, selectedSets[0].fields.length);
        for (const field of input.fieldSets[0].fields) {
          const definition = selectedSets[0].fields.find((f) => f.id === field.id)!;
          assert.deepEqual(Object.keys(field).sort(), [
            'description',
            'id',
            'name',
            'schema',
            'sensitive',
          ]);
          assert.equal(field.description, definition.description);
          assert.deepEqual(field.schema, definition.schema);
          assert.equal(field.sensitive, definition.sensitive);
        }
        const { page: _page, ...fact } = extractedThings.neff.facts[round - 1];
        assert.deepEqual(input.facts, [fact]);
      }
      return jsonResponse({
        status: 'completed',
        output: [
          {
            type: 'reasoning',
            id: `reason-${round}`,
            summary: [],
            encrypted_content: `opaque-${round}`,
          },
          {
            type: 'function_call',
            name: toolName,
            call_id: `call-${round}`,
            arguments:
              round === 0
                ? '{"categoryId":"appliances","terms":["Neff"]}'
                : '{"labels":[{"label":"Installer reference","context":""}]}',
          },
        ],
      });
    }
    assert.ok(
      body.input.some(
        (entry: { encrypted_content?: string }) => entry.encrypted_content === `opaque-${round}`,
      ),
    );
    assert.ok(
      body.input.some(
        (entry: { call_id?: string; output?: string }) =>
          entry.call_id === `call-${round}` &&
          entry.output === JSON.stringify(round === 0 ? { sets: selectedSets } : fieldResults),
      ),
    );
    return jsonResponse(output(round === 0 ? { setIds: ['appliances.neff'] } : { values: [] }));
  });
  const tools = {
    searchFieldSets: async () => ({ sets: selectedSets }),
    searchFields: async () => fieldResults,
  };
  const ai = new OpenAiImports('test-key', 'fixture');
  const selection = await ai.selectFieldSets(extractedThings.neff, tools, context());
  assert.deepEqual(selection, { setIds: ['appliances.neff'] });
  for (const fact of extractedThings.neff.facts)
    assert.deepEqual(
      await ai.mapFacts(extractedThings.neff, [fact], selectedSets, tools, context()),
      { values: [] },
    );
  assert.equal(request, 6);
});

test('SDK import rejects incomplete output, invalid arguments and sanitises HTTP errors without transport retries', async (t) => {
  const source = {
    filename: 'source.txt',
    mediaType: 'text/plain',
    content: Buffer.from('synthetic'),
  };
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    jsonResponse({ status: 'incomplete', output: [] }),
  );
  const ai = new OpenAiImports('test-key', 'fixture');
  await assert.rejects(ai.extract(source, ['other'], context()), /incomplete/);
  fetch.mock.mockImplementation(async () =>
    jsonResponse({
      status: 'completed',
      output: [
        {
          type: 'function_call',
          name: 'search_field_sets',
          call_id: 'call-1',
          arguments: '{"categoryId":"appliances"}',
        },
      ],
    }),
  );
  await assert.rejects(
    ai.selectFieldSets(
      extractedThings.neff,
      {
        searchFieldSets: async () => assert.fail('invalid arguments executed'),
        searchFields: async () => ({}),
      },
      context(),
    ),
    /Invalid registry tool arguments/,
  );
  fetch.mock.mockImplementation(
    async () =>
      new Response('{"error":{"message":"private source text"}}', {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  await assert.rejects(ai.extract(source, ['other'], context()), { message: 'ai_http_429' });
  assert.equal(fetch.mock.callCount(), 3);
});

test('SDK import cancellation reaches the request signal', async (t) => {
  const controller = new AbortController();
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
        controller.abort(new Error('cancelled'));
      }),
  );
  await assert.rejects(
    new OpenAiImports('test-key', 'fixture').extract(
      { filename: 'source.txt', mediaType: 'text/plain', content: Buffer.from('synthetic') },
      ['other'],
      { ...context(), signal: controller.signal },
    ),
    /cancelled/,
  );
});

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
        metadata: {
          title: 'User manual',
          documentType: 'MANUAL',
          publisher: 'Bosch',
          documentDate: null,
        },
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
      { headers: { 'Content-Type': 'application/json' } },
    );
  });
  const ai = new OpenAiImports('test-key', 'test-model');
  const result = await ai.discover(
    {
      id: 'candidate-1',
      name: 'Bosch SYNTHETIC/01',
      categoryId: 'appliances',
      fields: [],
      targets: [],
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

test('SDK document extraction uses the configured model, contained schema and per-task usage without search or write tools', async (t) => {
  const usage: Partial<Usage>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, 'document-model');
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.text.format.schema.properties.applicable.type, 'boolean');
    assert.ok(body.input[0].content.some((part: { type: string }) => part.type === 'input_file'));
    return jsonResponse({
      ...output({ applicable: false, applicability: null, values: [] }),
      usage: { input_tokens: 25, output_tokens: 10, input_tokens_details: { cached_tokens: 5 } },
    });
  });
  const ai = new OpenAiImports('test-key', 'import-model', 1000, 3, 'document-model');
  await ai.extractDocument(
    {
      attachmentId: 'document',
      url: 'https://example.com/manual.pdf',
      filename: 'manual.pdf',
      mediaType: 'application/pdf',
      content: Buffer.from('%PDF-synthetic'),
      pageCount: 1,
    },
    { id: 'subject', categoryId: 'devices', name: 'Example', fields: [], targets: [] },
    [],
    {
      ...context(),
      record: async (entry) => {
        usage.push(entry);
      },
    },
  );
  assert.equal(usage[0].entries?.[0].task, 'document_extraction');
  assert.equal(usage[0].entries?.[0].model, 'document-model');
  assert.equal(usage[0].entries?.[0].inputTokens, 25);
  assert.equal(usage[0].cachedTokens, 5);
});
