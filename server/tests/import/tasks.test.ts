/** Checks structured task execution, awaited source retrieval and request text limits with mocked HTTP. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiImports } from '../../src/providers/ai/openai-imports.js';
import type { PopulationInput, WorkflowTools } from '../../src/application/import/types.js';
import type { AiContext } from '../../src/providers/ai/types.js';
import { fields } from '../../src/db/seeds/registry.js';
const definition = fields.find((field) => field.id === 'common.model')!;
const input: PopulationInput = {
  thing: { id: 'thing', name: 'Fixture oven', categoryId: 'appliances' },
  sources: [{ attachmentId: 'source', summary: 'Data plate', terms: ['model'] }],
  fields: [{ fieldSetId: 'appliances.appliance', field: definition, value: null }],
};
const context: AiContext = { signal: new AbortController().signal, record: async () => {} };
const tools: WorkflowTools = {
  searchFieldSets: async () => ({}),
  searchFields: async () => ({}),
  searchTranscription: async () => ({
    attachmentId: 'source',
    text: 'Model AX1',
    offset: 0,
    nextOffset: null,
  }),
};

// Builds a minimal Responses payload accepted by the SDK transport.
function response(output: object[]) {
  return Response.json({
    id: 'fixture',
    status: 'completed',
    model: 'fixture-model',
    output,
    usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0 } },
  });
}

test('field population awaits source retrieval before continuing the model conversation', async (t) => {
  t.after(() => mock.restoreAll());
  let requests = 0,
    retrieved = false;
  mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    requests++;
    if (requests === 1)
      return response([
        {
          type: 'function_call',
          call_id: 'lookup',
          name: 'search_transcription',
          arguments: JSON.stringify({ attachmentId: 'source', query: 'Model', offset: 0 }),
        },
      ]);
    assert.equal(retrieved, true);
    assert.ok(
      body.input.some(
        (entry: { type?: string; output?: string }) =>
          entry.type === 'function_call_output' && entry.output?.includes('Model AX1'),
      ),
    );
    return response([
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              values: [
                {
                  fieldSetId: 'appliances.appliance',
                  fieldId: 'common.model',
                  value: 'AX1',
                  attachmentId: 'source',
                  page: null,
                  quote: 'Model AX1',
                },
              ],
              pinnedFields: [],
            }),
            annotations: [],
          },
        ],
      },
    ]);
  });
  const ai = new OpenAiImports('fixture-key', 'fixture-model');
  const result = await ai.populateFields(
    input,
    {
      ...tools,
      searchTranscription: async () => {
        await Promise.resolve();
        retrieved = true;
        return tools.searchTranscription('source', 'Model', 0);
      },
    },
    context,
  );
  assert.deepEqual(result.values[0], {
    fieldSetId: 'appliances.appliance',
    fieldId: 'common.model',
    value: 'AX1',
    sourceRefs: [{ attachmentId: 'source', quote: 'Model AX1' }],
  });
  assert.equal(requests, 2);
});

test('an oversized task stops before contacting the model', async (t) => {
  t.after(() => mock.restoreAll());
  let requests = 0;
  mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Unexpected request');
  });
  const ai = new OpenAiImports('fixture-key', 'fixture-model');
  await assert.rejects(
    ai.populateFields(
      { ...input, sources: [{ attachmentId: 'source', summary: 'x'.repeat(120000), terms: [] }] },
      tools,
      context,
    ),
    /text_limit/,
  );
  assert.equal(requests, 0);
});

// The shared task text cap rejected a parsed document before its transcription could be saved.
test('large parsed sources use bounded transcription requests and retain the complete text', async (t) => {
  t.after(() => mock.restoreAll());
  let requests = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    requests++;
    const body = JSON.parse(String(options.body));
    const parts = body.input.flatMap((message: { content?: unknown }) =>
      Array.isArray(message.content) ? message.content : [],
    );
    assert.ok(parts.every((part: { text?: string }) => !part.text || part.text.length <= 80000));
    assert.ok(parts.every((part: object) => !Object.hasOwn(part, 'page')));
    return response([
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            annotations: [],
            text: JSON.stringify({
              text: '',
              summary: 'Long source',
              terms: ['source'],
              status: 'COMPLETE',
              metadata: null,
              identifiers: [],
            }),
          },
        ],
      },
    ]);
  });
  const text = 'x'.repeat(180000);
  const result = await new OpenAiImports('fixture-key', 'fixture-model').transcribe(
    { filename: 'long.txt', mediaType: 'text/plain', content: Buffer.from(text) },
    context,
  );
  assert.equal(requests, 3);
  assert.equal(result.text, text);
  assert.equal(result.status, 'COMPLETE');
});

test('source recommendations return application citations without model citation properties', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(globalThis, 'fetch', async () =>
    response([
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              tasks: [
                {
                  title: 'Check the seal',
                  description: 'Inspect monthly.',
                  attachmentId: 'source',
                  page: 2,
                  quote: 'Inspect the seal monthly.',
                },
              ],
              purchasables: [
                {
                  kind: 'CONSUMABLE',
                  name: 'Seal cleaner',
                  description: 'Use on the seal.',
                  merchantUrl: null,
                  attachmentId: 'source',
                  page: null,
                  quote: 'Use seal cleaner.',
                },
              ],
            }),
          },
        ],
      },
    ]),
  );
  const result = await new OpenAiImports('fixture-key', 'fixture-model').recommendFromSources(
    {
      thing: { name: 'Fixture oven', categoryId: 'appliances' },
      fields: [],
      sources: input.sources,
      existingTasks: [],
      existingPurchasables: [],
    },
    tools,
    context,
  );
  assert.deepEqual(result, {
    tasks: [
      {
        title: 'Check the seal',
        description: 'Inspect monthly.',
        sourceRefs: [{ attachmentId: 'source', page: 2, quote: 'Inspect the seal monthly.' }],
      },
    ],
    purchasables: [
      {
        kind: 'CONSUMABLE',
        name: 'Seal cleaner',
        description: 'Use on the seal.',
        merchantUrl: null,
        sourceRefs: [{ attachmentId: 'source', quote: 'Use seal cleaner.' }],
      },
    ],
  });
});
