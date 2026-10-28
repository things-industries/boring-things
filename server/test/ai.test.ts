// Checks AI import adapters with mocked SDK responses and synthetic source documents.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { OpenAiImports } from '../src/providers/ai/openai-imports.js';
import type { Usage } from '../src/application/import/types.js';
import { extractedThings, extractionBaseline } from './fixtures/imports.js';
import { createAi } from '../src/providers/ai/index.js';
import { readConfig } from '../src/config.js';
import type { AiTurnCompleted } from '../src/providers/ai/types.js';

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
const sourceDetails = {
  summary: 'Synthetic source',
  terms: [],
  transcriptionStatus: 'COMPLETE',
};

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
    return jsonResponse(
      output({ ...sourceDetails, text: '', metadata: null, candidates: [subject] }),
    );
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
        ...sourceDetails,
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
      output({
        ...sourceDetails,
        text: 'Synthetic source',
        metadata: null,
        candidates: [subjects[request++]],
      }),
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
    /Invalid AI tool arguments/,
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

// Research omitted the source-derived name, losing the year for models with reused names.
test('public research keeps the source-derived product generation across its requests', async (t) => {
  const source = 'https://maker.example/watch-2021';
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    requests.push(body);
    const response = output(
      body.text?.format.schema.properties.identity ? { identity: null, items: [] } : { items: [] },
    );
    return jsonResponse({
      ...response,
      output: [
        { type: 'web_search_call', action: { sources: [{ url: source }] } },
        ...response.output,
      ],
    });
  });
  const research = {
    id: 'candidate-1',
    name: 'Example Watch (2021)',
    categoryId: 'devices',
    knownFields: [
      {
        fieldSetId: null,
        fieldId: 'common.model',
        label: 'Model',
        description: '',
        value: 'Example Watch',
      },
    ],
    emptyFields: [],
    referenceUrls: [],
  };
  const ai = new OpenAiImports('test-key', 'test-model', 12000, 3, 'test-model', async () => null);
  await ai.findResources(research, context());
  await ai.suggestTasks({ ...research, existingTasks: [] }, context());
  await ai.findPurchasables({ ...research, existingPurchasables: [] }, context());
  assert.equal(requests.length, 4);
  for (const request of requests) assert.ok(JSON.stringify(request.input).includes(research.name));
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
  assert.ok(ai instanceof OpenAiImports);
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
        ...sourceDetails,
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

test('SDK task suggestions research mapped public fields in one bounded structured request', async (t) => {
  const url = 'https://manufacturer.example/manual';
  const requests: Record<string, unknown>[] = [];
  const entries: Partial<Usage>[] = [];
  const research = {
    categoryId: 'appliances',
    knownFields: [
      {
        fieldSetId: null,
        fieldId: 'common.model',
        label: 'Model',
        description: '',
        value: 'Model A',
      },
    ],
    referenceUrls: [url],
    existingTasks: [{ title: 'Private owner title', status: 'DISMISSED' as const }],
  };
  let sourceUrl: string | null = url;
  const item = {
    title: 'Clean the filter',
    description: 'Clean every six months.',
    quote: 'Clean every six months.',
  };
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    requests.push(body);
    assert.equal(body.store, false);
    assert.match(body.input, /Model A/);
    assert.ok(!body.input.includes('Private owner title'));
    assert.ok(!body.input.includes('Imported facts'));
    const properties = body.text.format.schema.properties.items.items.properties;
    assert.ok(!('factId' in properties));
    assert.equal(properties.sourceUrl.type, 'string');
    const response = output({ items: [{ ...item, sourceUrl }] });
    return jsonResponse({
      ...response,
      output: [{ type: 'web_search_call', action: { sources: [{ url }] } }, ...response.output],
      usage: { input_tokens: 25, output_tokens: 10 },
    });
  });
  const ai = new OpenAiImports('test-key', 'import-model');
  const suggestions = await ai.suggestTasks(
    research,
    {
      ...context(),
      record: async (entry) => {
        entries.push(entry);
      },
    },
    2,
  );
  assert.deepEqual(suggestions.items, [
    {
      title: item.title,
      description: item.description,
      sourceRefs: [{ url, quote: item.quote }],
    },
  ]);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(requests[0].max_tool_calls, 2);
  assert.deepEqual(requests[0].tools, [{ type: 'web_search' }]);
  assert.deepEqual(requests[0].include, ['web_search_call.action.sources']);
  assert.deepEqual(
    entries.flatMap((entry) => entry.entries ?? []).map((entry) => entry.task),
    ['task_suggestions'],
  );
  assert.equal(entries.flatMap((entry) => entry.toolCalls ?? []).length, 1);
  assert.deepEqual(
    await ai.suggestTasks(
      { ...research, existingTasks: [{ title: item.title, status: 'DISMISSED' }] },
      context(),
    ),
    { items: [] },
  );
  sourceUrl = 'https://invented.example/manual';
  await assert.rejects(ai.suggestTasks(research, context()), /Uncited task source/);
  sourceUrl = 'http://localhost/private';
  await assert.rejects(ai.suggestTasks(research, context()), /Uncited task source/);
  sourceUrl = null;
  await assert.rejects(ai.suggestTasks(research, context()), /Invalid AI output/);
  const before = fetch.mock.callCount();
  assert.deepEqual(await ai.suggestTasks({ ...research, knownFields: [] }, context()), {
    items: [],
  });
  assert.equal(fetch.mock.callCount(), before);
});

test('SDK purchasable research discovers products and purchase links within one bounded operation', async (t) => {
  const url = 'https://manufacturer.example/filter-0015';
  const requests: Record<string, unknown>[] = [];
  let product = {
    kind: 'CONSUMABLE',
    name: 'Filter 0015',
    description: 'Fits Model A',
    merchantUrl: url,
    sourceUrl: url,
    quote: '0015 fits Model A',
  };
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    requests.push(body);
    assert.match(body.input, /Find useful purchasables/);
    assert.match(body.input, /consumables/);
    assert.ok(!body.input.includes('Private owner product'));
    assert.equal(body.text.format.schema.properties.items.type, 'array');
    const response = output({ items: [product] });
    return jsonResponse({
      ...response,
      output: [{ type: 'web_search_call', action: { sources: [{ url }] } }, ...response.output],
    });
  });
  const ai = new OpenAiImports('test-key', 'import-model');
  const research = {
    categoryId: 'appliances',
    knownFields: [
      {
        fieldSetId: null,
        fieldId: 'common.model',
        label: 'Model',
        description: '',
        value: 'Model A',
      },
    ],
    referenceUrls: [],
    existingPurchasables: [{ kind: 'CONSUMABLE' as const, name: 'Private owner product' }],
  };
  assert.deepEqual(await ai.findPurchasables(research, context(), 2), {
    items: [
      {
        kind: 'CONSUMABLE',
        name: 'Filter 0015',
        description: 'Fits Model A',
        merchantUrl: url,
        sourceRefs: [{ url, quote: product.quote }],
      },
    ],
  });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(requests[0].max_tool_calls, 2);
  assert.deepEqual(requests[0].tools, [{ type: 'web_search' }]);
  assert.deepEqual(requests[0].include, ['web_search_call.action.sources']);
  assert.deepEqual(
    await ai.findPurchasables(
      { ...research, existingPurchasables: [{ kind: 'CONSUMABLE', name: product.name }] },
      context(),
    ),
    { items: [] },
  );
  product = { ...product, merchantUrl: 'https://invented.example/filter' };
  await assert.rejects(ai.findPurchasables(research, context()), /Uncited purchasable/);
  const before = fetch.mock.callCount();
  assert.deepEqual(await ai.findPurchasables({ ...research, knownFields: [] }, context()), {
    items: [],
  });
  assert.equal(fetch.mock.callCount(), before);
});
