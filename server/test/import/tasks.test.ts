/** Checks structured task execution, awaited source retrieval and request text limits with mocked HTTP. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Registry } from '../../src/application/registry/registry.js';
import { createFieldSetsTool } from '../../src/providers/ai/tools/registry.js';
import { OpenAiImports } from '../../src/providers/ai/openai-imports.js';
import type { Usage } from '../../src/application/import/types.js';
import type { PopulationInput } from '../../src/providers/ai/tasks/populate-fields.js';
import { createImportTaskContext } from '../support/import-context.js';
import { fields } from '../../src/db/seeds/registry.js';
import { setEnvMode } from '../../src/env.js';
import type { AiTurnCompleted } from '../../src/providers/ai/types.js';
import { getPrompt } from '../../src/providers/ai/prompts.js';
import { ResolveThingTask } from '../../src/providers/ai/tasks/resolve-thing.js';
import { AdditionalInformationTask } from '../../src/providers/ai/tasks/additional-information.js';
setEnvMode('test');
const definition = fields.find((field) => field.id === 'common.model')!;
const input: PopulationInput = {
  thing: { id: 'thing', name: 'Fixture oven', categoryId: 'appliances' },
  sources: [{ attachmentId: 'source', summary: 'Data plate', terms: ['model'] }],
  fields: [{ fieldSetId: 'appliances.appliance', field: definition, value: null }],
};
const createContext = () =>
  createImportTaskContext({ sources: [{ attachmentId: 'source', text: 'Model AX1' }] });

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
  const turns: Parameters<AiTurnCompleted>[0][] = [];
  let requests = 0,
    retrieved = false;
  mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.ok(body.instructions.includes(getPrompt('thing-definition')));
    assert.equal(body.model, 'gpt-6-luna');
    assert.deepEqual(body.reasoning, { mode: 'standard', effort: 'low' });
    requests++;
    if (requests === 1) {
      assert.ok(!JSON.stringify(body.input).includes('Private source marker'));
      return response([
        {
          type: 'function_call',
          call_id: 'lookup',
          name: 'search_transcription',
          arguments: JSON.stringify({ attachmentId: 'source', query: 'Model', offset: 0 }),
        },
      ]);
    }
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
  const ai = new OpenAiImports((turn) => turns.push(turn));
  const result = await ai.populateFields(
    input,
    createImportTaskContext({
      sources: [{ attachmentId: 'source', text: 'Model AX1\nPrivate source marker' }],
      record: async (entry) => {
        if (entry.toolCalls?.length) {
          await Promise.resolve();
          retrieved = true;
        }
      },
    }),
  );
  assert.deepEqual(result.values[0], {
    fieldSetId: 'appliances.appliance',
    fieldId: 'common.model',
    value: 'AX1',
    sourceRefs: [{ attachmentId: 'source', quote: 'Model AX1' }],
  });
  assert.equal(requests, 2);
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0].toolCalls, ['search_transcription']);
  assert.equal(turns[0].metrics.aiCount, undefined);
  assert.deepEqual(turns[1].toolCalls, []);
  assert.equal(turns[1].metrics.aiCount, 1);
  assert.equal(turns[1].metrics.validCount, 1);
});

test('Thing resolution receives the definition and reports each turn through its registered callback', async (t) => {
  const turns: string[] = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, 'gpt-6.1-sol');
    assert.deepEqual(body.reasoning, { mode: 'standard', effort: 'medium' });
    assert.ok(body.instructions.includes(getPrompt('thing-definition')));
    return response([
      {
        type: 'message',
        content: [{ type: 'output_text', text: '{"candidates":[],"contradiction":false}' }],
      },
    ]);
  });
  const task = new ResolveThingTask(
    {
      sources: [],
      categories: [],
      existingThings: [],
      thingContextId: null,
    },
    createContext(),
  );
  assert.equal(
    task.onTurnCompleted((turn) => turns.push(turn.task)),
    task,
  );
  assert.deepEqual(await task.run(), { candidates: [], contradiction: false });
  assert.deepEqual(turns, ['thing_resolution']);
  task.onTurnCompleted();
  await task.run();
  assert.deepEqual(turns, ['thing_resolution']);
  assert.equal(fetch.mock.callCount(), 2);
});

test('registry tools use provider-bound resources and record retrieved definitions', async (t) => {
  const db = new pg.Pool();
  t.after(() => db.end());
  const registry = new Registry(
    [
      {
        id: 'fixture.field',
        name: 'Fixture field',
        description: '',
        keywords: [],
        schema: { type: 'string' },
        uiHint: 'TEXT',
        sensitive: false,
        scope: 'INSTANCE',
        isIdentifier: false,
      },
    ],
    [
      {
        id: 'fixture.set',
        name: 'Fixture set',
        categoryId: 'appliances',
        eligibility: 'Fixture model',
        keywords: [],
        includes: [],
        considerAlongside: [],
        fields: [],
      },
    ],
  );
  const query = t.mock.method(db, 'query', async (sql: string) => ({
    rows: [{ id: sql.includes('field_sets') ? 'fixture.set' : 'fixture.field' }],
  }));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    requests++;
    const body = JSON.parse(String(options.body));
    const selection = Object.hasOwn(body.text.format.schema.properties, 'setIds');
    if (requests % 2 === 1)
      return response([
        {
          type: 'function_call',
          call_id: 'search-' + requests,
          name: selection ? 'search_field_sets' : 'search_fields',
          arguments: JSON.stringify(
            selection
              ? { categoryId: 'appliances', terms: ['fixture'] }
              : { labels: [{ label: 'Fixture field', context: '' }] },
          ),
        },
      ]);
    return response([
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(selection ? { setIds: ['fixture.set'] } : { findings: [] }),
          },
        ],
      },
    ]);
  });
  const resources = { db, registry };
  const ai = new OpenAiImports(undefined, undefined, resources);
  const selectionContext = createContext();
  assert.deepEqual(
    await ai.selectFieldSets(
      {
        id: 'fixture',
        name: 'Fixture model',
        categoryId: 'appliances',
        terms: ['fixture'],
        facts: [],
      },
      selectionContext,
    ),
    { setIds: ['fixture.set'] },
  );
  assert.deepEqual([...selectionContext.retrievedSetIds], ['fixture.set']);
  const fieldContext = createContext();
  assert.deepEqual(
    await ai.additionalInformation(
      { thing: input.thing, knownFields: [], attachmentId: 'source', text: 'Fixture field' },
      fieldContext,
    ),
    { findings: [] },
  );
  assert.deepEqual([...fieldContext.retrievedFieldIds], ['fixture.field']);
  assert.equal(query.mock.callCount(), 2);
  await assert.rejects(
    createFieldSetsTool(createContext(), resources).execute({
      categoryId: 'insurance',
      terms: ['fixture'],
    }),
    /Wrong category/,
  );
  assert.equal(query.mock.callCount(), 2);
});

test('additional information selects its model and receives Thing instructions', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, 'gpt-6.1-sol');
    assert.deepEqual(body.reasoning, { mode: 'standard', effort: 'low' });
    assert.ok(body.instructions.includes(getPrompt('thing-definition')));
    return response([
      { type: 'message', content: [{ type: 'output_text', text: '{"findings":[]}' }] },
    ]);
  });
  const task = new AdditionalInformationTask(
    {
      thing: input.thing,
      knownFields: [],
      attachmentId: 'source',
      text: 'Model AX1',
    },
    createContext(),
  );
  assert.deepEqual(await task.run(), { findings: [] });
});

test('an oversized task stops before contacting the model', async (t) => {
  t.after(() => mock.restoreAll());
  let requests = 0;
  mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Unexpected request');
  });
  const ai = new OpenAiImports();
  await assert.rejects(
    ai.populateFields(
      { ...input, sources: [{ attachmentId: 'source', summary: 'x'.repeat(120000), terms: [] }] },
      createContext(),
    ),
    /text_limit/,
  );
  assert.equal(requests, 0);
});

// The shared task text cap rejected a parsed document before its transcription could be saved.
test('attachment summaries use bounded text requests without requesting or returning source text', async (t) => {
  t.after(() => mock.restoreAll());
  const turns: Parameters<AiTurnCompleted>[0][] = [];
  let requests = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    requests++;
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, 'gpt-6-luna');
    assert.ok(!Object.hasOwn(body.text.format.schema.properties, 'text'));
    assert.ok(!body.text.format.schema.required.includes('text'));
    const parts = body.input.flatMap((message: { content?: unknown }) =>
      Array.isArray(message.content) ? message.content : [],
    );
    assert.ok(parts.every((part: { text?: string }) => !part.text || part.text.length <= 80000));
    assert.ok(parts.every((part: { type: string }) => part.type === 'input_text'));
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
  const result = await new OpenAiImports((turn) => turns.push(turn)).summarizeAttachment(
    text,
    createContext(),
  );
  assert.equal(requests, 3);
  assert.equal(turns.length, 3);
  assert.ok(
    turns.every(
      ({ metrics }) =>
        metrics.aiCount === 0 &&
        metrics.validCount === 0 &&
        metrics.termCount === 1 &&
        metrics.summaryCharacters === 11,
    ),
  );
  assert.ok(!Object.hasOwn(result, 'text'));
  assert.equal(result.summary, 'Long source\nLong source\nLong source');
  assert.deepEqual(result.terms, ['source']);
  assert.equal(result.status, 'COMPLETE');
});

for (const capability of ['tasks', 'purchasables'] as const) {
  test(`${capability} combine attachment evidence with web research across model turns`, async (t) => {
    const webCalls = capability === 'tasks' ? 3 : 2;
    const merchantUrl = 'https://maker.example/cleaner';
    const quote = 'Use seal cleaner SC01 when water alone does not remove dirt.';
    const sourceRefs = [
      { attachmentId: 'source', page: 2, quote },
      { url: merchantUrl, quote: 'SC01 seal cleaner.' },
    ];
    const item =
      capability === 'tasks'
        ? {
            title: 'Clean the seal',
            importance: 'RECOMMENDED',
            recurrence: null,
            completionActions: [],
            description: 'Use cleaner when water is insufficient.',
            sourceRefs,
          }
        : {
            kind: 'CONSUMABLE',
            name: 'Seal cleaner',
            description: 'Use when water is insufficient.',
            merchantUrl,
            sourceRefs,
          };
    let reads = 0;
    const entries: Partial<Usage>[] = [];
    const fetch = t.mock.method(
      globalThis,
      'fetch',
      async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(String(options.body));
        const request = fetch.mock.callCount() + 1;
        assert.ok(body.instructions.includes(getPrompt('thing-definition')));
        if (capability === 'tasks') {
          assert.match(
            body.instructions,
            /Select work worth remembering or tracking to completion/,
          );
          assert.match(body.instructions, /Name each task with a verb and its object/);
          const properties = body.text.format.schema.properties.items.items.properties;
          assert.ok(!Object.hasOwn(properties, 'scheduledOn'));
          assert.ok(!Object.hasOwn(properties, 'deadlineOn'));
        } else {
          assert.match(body.instructions, /Name each purchasable with its basic item name/);
          assert.match(
            body.instructions,
            /Describe why the item is useful and when the owner should buy it/,
          );
        }
        assert.deepEqual(
          body.tools.map((tool: { type: string }) => tool.type),
          request === 3 && webCalls === 3 ? ['function'] : ['function', 'web_search'],
        );
        assert.equal(body.max_tool_calls, request === 3 ? (webCalls === 3 ? undefined : 1) : 3);
        if (request === 1 || request === 2) {
          if (request === 2) {
            assert.equal(reads, 1);
            assert.ok(JSON.stringify(body.input).includes(quote));
          }
          return response([
            ...(request === 2
              ? Array.from({ length: webCalls }, () => ({
                  type: 'web_search_call',
                  action: { sources: [{ url: merchantUrl }] },
                }))
              : []),
            {
              type: 'function_call',
              call_id: 'read-' + request,
              name: 'search_transcription',
              arguments: JSON.stringify({ attachmentId: 'source', query: 'cleaner', offset: 0 }),
            },
          ]);
        }
        return response([
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify({ items: [item] }) }],
          },
        ]);
      },
    );
    const research = {
      name: 'Fixture oven',
      categoryId: 'appliances',
      knownFields: [],
      referenceUrls: [],
      fields: [
        {
          id: definition.id,
          label: definition.name,
          description: definition.description,
          schema: definition.schema,
          value: 'AX1',
        },
      ],
      sources: input.sources,
    };
    const usageContext = {
      ...createImportTaskContext({ sources: [{ attachmentId: 'source', text: quote }] }),
      record: async (entry: Partial<Usage>) => {
        entries.push(entry);
        if (entry.toolCalls?.some((call) => call.name === 'search_transcription')) reads++;
      },
    };
    const ai = new OpenAiImports();
    const result =
      capability === 'tasks'
        ? await ai.suggestTasks({ ...research, existingTasks: [] }, usageContext)
        : await ai.findPurchasables({ ...research, existingPurchasables: [] }, usageContext);
    assert.deepEqual(result, { items: [item] });
    assert.equal(fetch.mock.callCount(), 3);
    assert.equal(reads, 2);
    assert.equal(
      entries.flatMap((entry) => entry.toolCalls ?? []).filter((call) => call.name === 'web_search')
        .length,
      webCalls,
    );
    const supplied = JSON.parse(String(fetch.mock.calls[0].arguments[1]?.body));
    assert.ok(
      supplied.input.includes(JSON.stringify(research.fields)),
      'Recommendation input includes the saved field definitions and values',
    );
  });
}

test('purchasable research skips categories without guidance without making AI requests', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected AI request');
  });
  const ai = new OpenAiImports();
  for (const categoryId of ['memberships', 'subscriptions', 'insurance', 'utilities', 'unknown']) {
    assert.deepEqual(
      await ai.findPurchasables(
        {
          categoryId,
          knownFields: [],
          fields: [],
          sources: input.sources,
          referenceUrls: [],
          existingPurchasables: [],
        },
        createContext(),
      ),
      { items: [] },
    );
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('purchasables can use purchase links printed in attachment evidence without web search', async (t) => {
  const merchantUrl = 'https://maker.example/cleaner';
  const quote = 'Use cleaner C1: ' + merchantUrl;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.deepEqual(
      body.tools.map((tool: { type: string }) => tool.type),
      ['function', 'web_search'],
    );
    return response([
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              items: [
                {
                  kind: 'CONSUMABLE',
                  name: 'Cleaner',
                  description: 'Use when the seal is dirty.',
                  merchantUrl,
                  sourceRefs: [{ attachmentId: 'source', page: null, quote }],
                },
              ],
            }),
          },
        ],
      },
    ]);
  });
  const result = await new OpenAiImports().findPurchasables(
    {
      categoryId: 'appliances',
      knownFields: [],
      fields: [],
      sources: input.sources,
      referenceUrls: [],
      existingPurchasables: [],
    },
    createContext(),
  );
  assert.deepEqual(result.items[0].sourceRefs, [{ attachmentId: 'source', quote }]);
  assert.equal(result.items[0].merchantUrl, merchantUrl);
});

// The application tool budget threw after four reads and discarded the task's gathered evidence.
test('task recommendations finish from gathered evidence when the tool budget is exhausted', async (t) => {
  t.after(() => mock.restoreAll());
  let requests = 0,
    reads = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    requests++;
    if (requests <= 5)
      return response([
        {
          type: 'function_call',
          call_id: 'read-' + requests,
          name: 'search_transcription',
          arguments: JSON.stringify({ attachmentId: 'source', query: 'seal', offset: 0 }),
        },
      ]);
    assert.equal(body.tool_choice, 'none');
    assert.ok(
      body.input.some(
        (item: { type?: string; output?: string }) =>
          item.type === 'function_call_output' &&
          item.output?.includes('Inspect the seal monthly.'),
      ),
    );
    assert.ok(
      body.input.some(
        (item: { type?: string; output?: string }) =>
          item.type === 'function_call_output' && item.output?.includes('tool_limit'),
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
              items: [
                {
                  title: 'Check the seal',
                  importance: 'RECOMMENDED',
                  recurrence: null,
                  completionActions: [],
                  description: 'Inspect monthly.',
                  sourceRefs: [
                    { attachmentId: 'source', page: null, quote: 'Inspect the seal monthly.' },
                  ],
                },
              ],
            }),
          },
        ],
      },
    ]);
  });
  const result = await new OpenAiImports().suggestTasks(
    {
      name: 'Fixture oven',
      categoryId: 'appliances',
      knownFields: [],
      referenceUrls: [],
      fields: [],
      sources: input.sources,
      existingTasks: [],
    },
    createImportTaskContext({
      sources: [{ attachmentId: 'source', text: 'Inspect the seal monthly.' }],
      record: async (entry) => {
        if (entry.toolCalls?.some((call) => call.name === 'search_transcription')) reads++;
      },
    }),
  );
  assert.equal(requests, 6);
  assert.equal(reads, 4);
  assert.equal(result.items[0].title, 'Check the seal');
});

test('recommendation tools reject attachment IDs outside the run scope', async (t) => {
  t.after(() => mock.restoreAll());
  const fetch = mock.method(globalThis, 'fetch', async () =>
    response([
      {
        type: 'function_call',
        call_id: 'read',
        name: 'search_transcription',
        arguments: JSON.stringify({ attachmentId: 'unavailable-source', query: 'seal', offset: 0 }),
      },
    ]),
  );
  await assert.rejects(
    new OpenAiImports().suggestTasks(
      {
        name: 'Fixture oven',
        categoryId: 'appliances',
        knownFields: [],
        referenceUrls: [],
        fields: [],
        sources: input.sources,
        existingTasks: [],
      },
      createContext(),
    ),
    /Invalid source search/,
  );
  assert.equal(fetch.mock.callCount(), 1);
});
