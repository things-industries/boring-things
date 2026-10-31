/** Checks structured task execution, awaited source retrieval and request text limits with mocked HTTP. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiImports } from '../../src/providers/ai/openai-imports.js';
import type { PopulationInput, WorkflowTools } from '../../src/application/import/types.js';
import type { AiContext } from '../../src/providers/ai/types.js';
import { fields } from '../../src/db/seeds/registry.js';
import { readConfig } from '../../src/config.js';
import {
  taskRecommendationInstructions,
  purchasableRecommendationInstructions,
  thingDefinition,
} from '../../src/providers/ai/prompts.js';
import { ResolveThingTask } from '../../src/providers/ai/tasks/resolve-thing.js';
import { AdditionalInformationTask } from '../../src/providers/ai/tasks/additional-information.js';
const config = readConfig({ OPENAI_API_KEY: 'fixture-key' });
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
    assert.ok(body.instructions.includes(thingDefinition));
    assert.equal(body.model, 'gpt-6-luna');
    assert.deepEqual(body.reasoning, { mode: 'standard', effort: 'low' });
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
  const ai = new OpenAiImports(config);
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

test('Thing resolution receives the definition and reports each turn through its registered callback', async (t) => {
  const turns: string[] = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, 'gpt-6.1-sol');
    assert.deepEqual(body.reasoning, { mode: 'standard', effort: 'medium' });
    assert.ok(body.instructions.includes(thingDefinition));
    return response([
      {
        type: 'message',
        content: [{ type: 'output_text', text: '{"candidates":[],"contradiction":false}' }],
      },
    ]);
  });
  const task = new ResolveThingTask(
    config,
    { sources: [], categories: [], existingThings: [], thingContextId: null },
    tools,
  );
  assert.equal(
    task.onTurnCompleted((turn) => turns.push(turn.task)),
    task,
  );
  assert.deepEqual(await task.run(context), { candidates: [], contradiction: false });
  assert.deepEqual(turns, ['thing_resolution']);
  task.onTurnCompleted();
  await task.run(context);
  assert.deepEqual(turns, ['thing_resolution']);
  assert.equal(fetch.mock.callCount(), 2);
});

test('additional information selects its model and receives Thing instructions', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, 'gpt-6.1-sol');
    assert.deepEqual(body.reasoning, { mode: 'standard', effort: 'low' });
    assert.ok(body.instructions.includes(thingDefinition));
    return response([
      { type: 'message', content: [{ type: 'output_text', text: '{"findings":[]}' }] },
    ]);
  });
  const task = new AdditionalInformationTask(
    config,
    { thing: input.thing, knownFields: [], attachmentId: 'source', text: 'Model AX1' },
    tools,
  );
  assert.deepEqual(await task.run(context), { findings: [] });
});

test('an oversized task stops before contacting the model', async (t) => {
  t.after(() => mock.restoreAll());
  let requests = 0;
  mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Unexpected request');
  });
  const ai = new OpenAiImports(config);
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
test('attachment summaries use bounded text requests without requesting or returning source text', async (t) => {
  t.after(() => mock.restoreAll());
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
  const result = await new OpenAiImports(config).summarizeAttachment(text, context);
  assert.equal(requests, 3);
  assert.ok(!Object.hasOwn(result, 'text'));
  assert.equal(result.summary, 'Long source\nLong source\nLong source');
  assert.deepEqual(result.terms, ['source']);
  assert.equal(result.status, 'COMPLETE');
});

test('source recommendations return application citations without model citation properties', async (t) => {
  t.after(() => mock.restoreAll());
  const fetch = mock.method(globalThis, 'fetch', async (_url: unknown, _options: RequestInit) =>
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
                  description: 'Removes dirt from the seal when wiping with water is insufficient.',
                  merchantUrl: null,
                  attachmentId: 'source',
                  page: null,
                  quote: 'Use seal cleaner SC01 when water alone does not remove dirt.',
                },
              ],
            }),
          },
        ],
      },
    ]),
  );
  const result = await new OpenAiImports(config).recommendFromSources(
    {
      thing: { name: 'Fixture oven', categoryId: 'appliances' },
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
      existingTasks: [],
      existingPurchasables: [],
    },
    tools,
    context,
  );
  const request = JSON.parse(String(fetch.mock.calls[0].arguments[1]?.body));
  assert.ok(request.instructions.includes(taskRecommendationInstructions));
  assert.ok(request.instructions.includes(purchasableRecommendationInstructions));
  assert.ok(request.instructions.includes(thingDefinition));
  const supplied = JSON.parse(request.input[0].content.split('Input: ')[1]);
  assert.deepEqual(supplied.fields, [
    {
      id: definition.id,
      label: definition.name,
      description: definition.description,
      schema: definition.schema,
      value: 'AX1',
    },
  ]);
  assert.equal(fetch.mock.callCount(), 1);
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
        description: 'Removes dirt from the seal when wiping with water is insufficient.',
        merchantUrl: null,
        sourceRefs: [
          {
            attachmentId: 'source',
            quote: 'Use seal cleaner SC01 when water alone does not remove dirt.',
          },
        ],
      },
    ],
  });
});

// The application tool budget threw after four reads and discarded the task's gathered evidence.
test('source recommendations finish from gathered evidence when the tool budget is exhausted', async (t) => {
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
              tasks: [
                {
                  title: 'Check the seal',
                  description: 'Inspect monthly.',
                  attachmentId: 'source',
                  page: null,
                  quote: 'Inspect the seal monthly.',
                },
              ],
              purchasables: [],
            }),
          },
        ],
      },
    ]);
  });
  const result = await new OpenAiImports(config).recommendFromSources(
    {
      thing: { name: 'Fixture oven', categoryId: 'appliances' },
      fields: [],
      sources: input.sources,
      existingTasks: [],
      existingPurchasables: [],
    },
    {
      ...tools,
      searchTranscription: async () => {
        if (++reads > 4) throw new Error('tool_limit');
        return {
          attachmentId: 'source',
          text: 'Inspect the seal monthly.',
          offset: 0,
          nextOffset: null,
        };
      },
    },
    context,
  );
  assert.equal(requests, 6);
  assert.equal(reads, 5);
  assert.equal(result.tasks[0].title, 'Check the seal');
});

test('source recommendation lookup errors propagate without a finalization request', async (t) => {
  t.after(() => mock.restoreAll());
  const fetch = mock.method(globalThis, 'fetch', async () =>
    response([
      {
        type: 'function_call',
        call_id: 'read',
        name: 'search_transcription',
        arguments: JSON.stringify({ attachmentId: 'source', query: 'seal', offset: 0 }),
      },
    ]),
  );
  const failure = new Error('Fixture lookup failed');
  await assert.rejects(
    new OpenAiImports(config).recommendFromSources(
      {
        thing: { name: 'Fixture oven', categoryId: 'appliances' },
        fields: [],
        sources: input.sources,
        existingTasks: [],
        existingPurchasables: [],
      },
      {
        ...tools,
        searchTranscription: async () => {
          throw failure;
        },
      },
      context,
    ),
    failure,
  );
  assert.equal(fetch.mock.callCount(), 1);
});
