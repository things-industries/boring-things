// Checks AI import adapters with mocked SDK responses and synthetic source documents.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { OpenAiImports } from '../src/providers/ai/openai-imports.js';
import type { Usage } from '../src/application/import/types.js';
import { extractedThings, extractionBaseline } from './fixtures/imports.js';
import * as registrySeedDb from '../src/db/seeds/registry.js';
import { createAi } from '../src/providers/ai/index.js';
import { readConfig } from '../src/config.js';
import type { AiTurnCompleted } from '../src/providers/ai/responses.js';

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

test('PDF source text uses one request, retains original pages and skips model transcription', async (t) => {
  const pdf = await PDFDocument.create();
  for (let page = 1; page <= 26; page++) {
    const sheet = pdf.addPage();
    if (page === 26) sheet.drawText('Z-number 0015');
  }
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls++;
    const body = JSON.parse(init.body as string);
    assert.equal(body.input[0].content.length, 2);
    assert.equal(body.input[0].content[1].type, 'input_text');
    assert.equal(body.input[0].content[1].text, '[PDF page 26]\nZ-number 0015');
    assert.match(body.input[0].content[0].text, /return an empty 'text' property/);
    assert.match(body.input[0].content[0].text, /ignore translated repetitions/);
    const subject = structuredClone(extractedThings.neff);
    subject.facts = [{ ...subject.facts[0], page: 26 }];
    return jsonResponse(output({ text: '', metadata: null, candidates: [subject] }));
  });
  const result = await new OpenAiImports('test-key', 'fixture').extract(
    {
      filename: 'source.pdf',
      mediaType: 'application/pdf',
      content: Buffer.from(await pdf.save()),
    },
    ['appliances'],
    context(),
  );
  assert.equal(calls, 1);
  assert.equal(result.text, '[PDF page 26]\nZ-number 0015');
  assert.equal(result.extractedThings[0].facts[0].page, 26);
});

test('camera source extraction requests and returns a descriptive attachment title', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.match(body.input[0].content[0].text, /Data plate photo/);
    assert.equal(body.input[0].content[1].type, 'input_image');
    return jsonResponse(
      output({
        text: 'Manufacturer label',
        metadata: {
          title: 'Data plate photo',
          documentType: null,
          publisher: null,
          documentDate: null,
        },
        candidates: [extractedThings.neff],
      }),
    );
  });
  const result = await new OpenAiImports('test-key', 'fixture').extract(
    { filename: 'IMG_1234.png', mediaType: 'image/png', content: Buffer.from('fixture image') },
    ['appliances'],
    context(),
  );
  assert.equal(result.metadata?.title, 'Data plate photo');
});

test('reference extraction consumes page-labelled PDF text with original citations', async (t) => {
  const pdf = await PDFDocument.create();
  for (let page = 1; page <= 101; page++) {
    const sheet = pdf.addPage();
    if (page === 1) sheet.drawText('Cover');
    if (page === 101) sheet.drawText('Supported');
  }
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.deepEqual(body.input[0].content[1], {
      type: 'input_text',
      text: '[PDF page 1]\nCover\n\n[PDF page 101]\nSupported',
    });
    return jsonResponse(
      output({
        metadata: null,
        applicable: true,
        applicability: { page: 1, quote: 'Cover' },
        values: [
          {
            fieldSetId: null,
            fieldId: 'common.model',
            value: 'Supported',
            page: 101,
            quote: 'Supported',
          },
        ],
      }),
    );
  });
  const result = await new OpenAiImports('test-key', 'fixture').extractDocument(
    {
      attachmentId: 'document',
      url: 'https://example.com/manual.pdf',
      filename: 'manual.pdf',
      mediaType: 'application/pdf',
      content: Buffer.from(await pdf.save()),
      pageCount: 101,
    },
    { id: 'subject', categoryId: 'devices', knownFields: [], emptyFields: [] },
    [],
    context(),
  );
  assert.equal(result.values[0].page, 101);
});

test('PDFs without embedded text reject excessive pages before calling the model', async (t) => {
  const { DocumentSizeError, maxModelDocumentPages } =
    await import('../src/lib/document-limits.js');
  const pdf = await PDFDocument.create();
  for (let page = 0; page <= maxModelDocumentPages; page++) pdf.addPage();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return jsonResponse({});
  });
  await assert.rejects(
    new OpenAiImports('test-key', 'fixture').extract(
      {
        filename: 'scan.pdf',
        mediaType: 'application/pdf',
        content: Buffer.from(await pdf.save()),
      },
      ['other'],
      context(),
    ),
    (error: unknown) => error instanceof DocumentSizeError && error.limit === maxModelDocumentPages,
  );
  assert.equal(requests, 0);
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
  const turns: Parameters<AiTurnCompleted>[0][] = [];
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
        assert.match(prompt, /Account for every supplied fact/);
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
    return jsonResponse(
      output(
        round === 0
          ? { setIds: ['appliances.neff'] }
          : {
              values: [],
              customFactIds: [extractedThings.neff.facts[round - 1].id],
              discardedFactIds: [],
            },
      ),
    );
  });
  const tools = {
    searchFieldSets: async () => ({ sets: selectedSets }),
    searchFields: async () => fieldResults,
  };
  const ai = createAi(
    readConfig({ OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'fixture' }),
    {},
    (entry) => turns.push(entry),
  ).importAi!;
  const selection = await ai.selectFieldSets(extractedThings.neff, tools, context());
  assert.deepEqual(selection, { setIds: ['appliances.neff'] });
  for (const fact of extractedThings.neff.facts)
    assert.deepEqual(
      await ai.mapFacts(extractedThings.neff, [fact], selectedSets, tools, context()),
      { values: [], customFactIds: [fact.id], discardedFactIds: [] },
    );
  assert.equal(request, 6);
  assert.deepEqual(
    turns.map((turn) => turn.toolCalls),
    [['search_field_sets'], [], ['search_fields'], [], ['search_fields'], []],
  );
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
  const linkedPdf = 'https://documents.example/manual.pdf';
  const requests: Record<string, unknown>[] = [];
  const usage: Partial<Usage>[] = [];
  const expected = {
    identity: { name: 'Bosch Oven', sourceUrl: source },
    items: [
      {
        kind: 'reference',
        title: 'User manual',
        description: 'Applies to the identified model',
        url: linkedPdf,
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
  const ai = new OpenAiImports('test-key', 'test-model', 12000, 3, 'test-model', async (url) =>
    url === source
      ? { url, links: [{ url: linkedPdf, context: 'Official user manual for the model' }] }
      : null,
  );
  const result = await ai.findResources(
    {
      id: 'candidate-1',
      categoryId: 'appliances',
      knownFields: [],
      emptyFields: [],
    },
    {
      signal: new AbortController().signal,
      record: async (entry) => {
        usage.push(entry);
      },
    },
  );
  assert.deepEqual(result, { ...expected, sources: [source, pdf, linkedPdf] });
  assert.equal(requests[0].max_tool_calls, 3);
  assert.ok(JSON.stringify(requests[1].input).includes(linkedPdf));
  assert.equal(usage.flatMap((entry) => entry.toolCalls ?? []).length, 2);
});

test('SDK document extraction uses the configured model, contained schema and per-task usage without search or write tools', async (t) => {
  const usage: Partial<Usage>[] = [];
  const turns: Parameters<AiTurnCompleted>[0][] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, 'document-model');
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.text.format.schema.properties.applicable.type, 'boolean');
    assert.ok(body.input[0].content.some((part: { type: string }) => part.type === 'input_file'));
    return jsonResponse({
      ...output({ metadata: null, applicable: false, applicability: null, values: [] }),
      usage: { input_tokens: 25, output_tokens: 10, input_tokens_details: { cached_tokens: 5 } },
    });
  });
  const ai = createAi(
    readConfig({
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'import-model',
      AI_MAX_OUTPUT_TOKENS: '1000',
      DOCUMENT_EXTRACTION_MODEL: 'document-model',
    }),
    {},
    (entry) => turns.push(entry),
  ).importAi!;
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await ai.extractDocument(
    {
      attachmentId: 'document',
      url: 'https://example.com/manual.pdf',
      filename: 'manual.pdf',
      mediaType: 'application/pdf',
      content: Buffer.from(await pdf.save()),
      pageCount: 1,
    },
    { id: 'subject', categoryId: 'devices', knownFields: [], emptyFields: [] },
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
  assert.deepEqual(turns, [{ ...usage[0].entries![0], toolCalls: [] }]);
  assert.equal(turns[0].outputTokens, 10);
  assert.ok(turns[0].elapsedMs >= 0);
});

test('AI attachment metadata validates calendar dates without unknown-format warnings', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  let documentDate: string | null = null;
  t.mock.method(globalThis, 'fetch', async () =>
    jsonResponse(
      output({
        text: '',
        metadata: { title: null, documentType: null, publisher: null, documentDate },
        candidates: [extractedThings.neff],
      }),
    ),
  );
  const ai = new OpenAiImports('test-key', 'fixture');
  const source = {
    filename: 'source.txt',
    mediaType: 'text/plain',
    content: Buffer.from('Source'),
  };
  for (const date of [null, '2026-10-05', '2024-02-29']) {
    documentDate = date;
    assert.equal(
      (await ai.extract(source, ['appliances'], context())).metadata?.documentDate,
      date,
    );
  }
  for (const date of ['not-a-date', '2026-02-30', '2025-02-29']) {
    documentDate = date;
    await assert.rejects(ai.extract(source, ['appliances'], context()), /Invalid AI output/);
  }
  assert.equal(warnings.mock.callCount(), 0);
});
