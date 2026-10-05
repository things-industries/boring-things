import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { OpenAiChat } from '../src/providers/ai/openai-chat.js';
import type { ChatContext } from '../src/application/conversations/types.js';
import { chatFunctions } from '../src/contracts/chat-tools.js';
import type { Usage } from '../src/application/import/types.js';
const task = {
  thingId: null,
  messages: [{ role: 'USER' as const, content: 'Read the Thing' }],
  completedWrites: [],
};

test('assistant research answers the supplied question in one bounded request with observed citations and usage', async (t) => {
  const source = 'https://manufacturer.example/filter';
  const opened = 'https://manufacturer.example/instructions';
  const entries: Partial<Usage>[] = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.store, false);
    assert.equal(body.max_tool_calls, 2);
    assert.deepEqual(body.tools, [{ type: 'web_search' }]);
    assert.deepEqual(body.include, ['web_search_call.action.sources']);
    assert.equal(body.text, undefined);
    assert.match(body.input, /How should the filter be cleaned\?/);
    assert.match(body.input, /Synthetic model/);
    assert.ok(!body.input.includes('fieldSetId'));
    return Response.json({
      status: 'completed',
      output: [
        {
          type: 'web_search_call',
          action: { sources: [{ url: source }, { url: 'http://localhost/private' }] },
        },
        { type: 'web_search_call', action: { url: opened } },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Supported cleaning instructions.',
              annotations: [{ type: 'url_citation', url: source }],
            },
          ],
        },
      ],
      usage: { input_tokens: 20, output_tokens: 8, input_tokens_details: { cached_tokens: 4 } },
    });
  });
  const ai = new OpenAiChat('synthetic-key', 'fixture', 1000, 3, 2);
  const context = {
    signal: new AbortController().signal,
    record: async (entry: Partial<Usage>) => {
      entries.push(entry);
    },
  };
  const result = await ai.research(
    'How should the filter be cleaned?',
    [
      {
        fieldSetId: null,
        fieldId: 'common.model',
        label: 'Model',
        description: '',
        value: 'Synthetic model',
      },
    ],
    context,
  );
  assert.deepEqual(result, { text: 'Supported cleaning instructions.', sources: [source, opened] });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(entries[0].entries?.[0].task, 'research');
  assert.equal(entries[0].cachedTokens, 4);
  assert.equal(entries.flatMap((entry) => entry.toolCalls ?? []).length, 2);

  fetch.mock.mockImplementation(async () => Response.json({ status: 'incomplete', output: [] }));
  await assert.rejects(ai.research('Question', [], context), /incomplete/);
  fetch.mock.mockImplementation(async () =>
    Response.json({
      status: 'completed',
      output: Array.from({ length: 3 }, () => ({
        type: 'web_search_call',
        action: { sources: [] },
      })),
    }),
  );
  await assert.rejects(ai.research('Question', [], context), /tool limit/);
  fetch.mock.mockImplementation(async () =>
    Response.json({ error: { message: 'private provider error' } }, { status: 429 }),
  );
  await assert.rejects(ai.research('Question', [], context), {
    message: 'ai_http_429',
  });
});
function stream(events: unknown[]) {
  const encoded = new TextEncoder().encode(
    events.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join(''),
  );
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < encoded.length; i += 7) c.enqueue(encoded.slice(i, i + 7));
        c.close();
      },
    }),
  );
}
test('Responses streaming collects split frames, passes function results and records usage', async (t) => {
  let requests = 0;
  const text: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.deepEqual(
      body.tools
        .filter((f: { name: string }) => f.name.startsWith('create_'))
        .map((f: { name: string }) => f.name),
      ['create_event', 'create_issue'],
    );
    requests++;
    if (requests === 1)
      return stream([
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [
              {
                type: 'function_call',
                name: 'search_things',
                arguments: '{"query":"hob"}',
                call_id: 'call-1',
              },
            ],
            usage: { input_tokens: 4, output_tokens: 2 },
          },
        },
      ]);
    assert.ok(
      body.input.some(
        (i: { type: string; call_id: string }) =>
          i.type === 'function_call_output' && i.call_id === 'call-1',
      ),
    );
    return stream([
      { type: 'response.output_text.delta', delta: 'Saved ' },
      { type: 'response.output_text.delta', delta: 'details.' },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [],
          usage: { input_tokens: 6, output_tokens: 3 },
        },
      },
    ]);
  });
  let tokens = 0;
  const context: ChatContext = {
    signal: new AbortController().signal,
    delta: (delta) => text.push(delta),
    record: async (usage) => {
      tokens += usage.inputTokens ?? 0;
    },
  };
  const answer = await new OpenAiChat('synthetic-key', 'fixture', 1000, 3).respond(
    task,
    {
      definitions: chatFunctions,
      execute: async (name, args) => {
        assert.equal(name, 'search_things');
        assert.deepEqual(args, { query: 'hob' });
        return { output: { items: [] } };
      },
    },
    context,
  );
  assert.equal(answer, 'Saved details.');
  assert.equal(text.join(''), answer);
  assert.equal(tokens, 10);
  assert.equal(requests, 2);
});
test('an interrupted provider stream cannot complete an assistant response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    stream([{ type: 'response.output_text.delta', delta: 'Partial' }]),
  );
  await assert.rejects(
    new OpenAiChat('synthetic-key', 'fixture', 1000, 1).respond(
      task,
      { definitions: chatFunctions, execute: async () => ({ output: {} }) },
      {
        signal: new AbortController().signal,
        delta: () => {},
        record: async () => {},
      },
    ),
    /incomplete/,
  );
});

test('one AI turn handles multiple tool calls and returns rejected calls for correction', async (t) => {
  let requests = 0;
  const calls: string[] = [];
  const definitions = chatFunctions.filter((tool) => tool.name === 'show_cards');
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.deepEqual(body.tools, definitions);
    assert.equal(body.parallel_tool_calls, true);
    requests++;
    if (requests === 1)
      return stream([
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: ['rejected', 'valid'].map((id) => ({
              type: 'function_call',
              name: 'show_cards',
              arguments: JSON.stringify({ id }),
              call_id: id,
            })),
          },
        },
      ]);
    assert.deepEqual(
      body.input
        .filter((item: { type: string }) => item.type === 'function_call_output')
        .map((item: { output: string }) => JSON.parse(item.output)),
      [{ error: 'Unknown field' }, { shown: 1 }],
    );
    return stream([
      { type: 'response.output_text.delta', delta: 'The recorded purchase date is 1 October.' },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ]);
  });
  const answer = await new OpenAiChat('synthetic-key', 'fixture', 1000, 3).respond(
    task,
    {
      definitions,
      execute: async (_name, args) => {
        const { id } = args as { id: string };
        calls.push(id);
        return { output: id === 'rejected' ? { error: 'Unknown field' } : { shown: 1 } };
      },
    },
    { signal: new AbortController().signal, delta: () => {}, record: async () => {} },
  );
  assert.equal(answer, 'The recorded purchase date is 1 October.');
  assert.deepEqual(calls, ['rejected', 'valid']);
  assert.equal(requests, 2);
});

test('PDF attachment input preserves text pages and original files for diagrams', async (t) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage();
  pdf.addPage().drawText('The two compartments share one temperature setting.', { font });
  const content = Buffer.from(await pdf.save());
  for (const includeImages of [false, true]) {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (++requests === 1)
        return stream([
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'function_call',
                  name: 'read_attachment',
                  arguments: '{}',
                  call_id: 'manual',
                },
              ],
            },
          },
        ]);
      const evidence = body.input.at(-1).content;
      if (includeImages) {
        assert.equal(evidence[1].type, 'input_file');
        assert.equal(
          evidence[1].file_data,
          'data:application/pdf;base64,' + content.toString('base64'),
        );
      } else {
        assert.equal(evidence[1].type, 'input_text');
        assert.match(evidence[1].text, /\[PDF page 2\]/);
        assert.match(evidence[1].text, /share one temperature setting/);
        assert.ok(!JSON.stringify(body.input).includes('file_data'));
      }
      return stream([
        {
          type: 'response.output_text.delta',
          delta: 'No. Both compartments share one temperature setting.',
        },
        { type: 'response.completed', response: { status: 'completed', output: [] } },
      ]);
    });
    const answer = await new OpenAiChat('synthetic-key', 'fixture', 1000, 2).respond(
      task,
      {
        definitions: chatFunctions,
        execute: async () => ({
          output: { attachmentId: 'manual' },
          source: { filename: 'manual.pdf', mediaType: 'application/pdf', content, includeImages },
        }),
      },
      { signal: new AbortController().signal, delta: () => {}, record: async () => {} },
    );
    assert.equal(answer, 'No. Both compartments share one temperature setting.');
    assert.equal(requests, 2);
  }
});

test('SDK streaming cancellation closes the response and prevents tool execution', async (t) => {
  const controller = new AbortController();
  let cancelled = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.output_text.delta","delta":"Partial"}\n\n',
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(
    new OpenAiChat('synthetic-key', 'fixture', 1000, 1).respond(
      task,
      {
        definitions: chatFunctions,
        execute: async () => assert.fail('tool executed after cancellation'),
      },
      {
        signal: controller.signal,
        delta: () => controller.abort(new Error('cancelled')),
        record: async () => assert.fail('cancelled response recorded as complete'),
      },
    ),
    /cancelled/,
  );
  assert.equal(cancelled, true);
});

test('SDK failed and incomplete stream events expose sanitised errors', async (t) => {
  for (const type of ['error', 'response.failed', 'response.incomplete']) {
    t.mock.method(globalThis, 'fetch', async () =>
      stream([{ type, message: 'private source text' }]),
    );
    await assert.rejects(
      new OpenAiChat('synthetic-key', 'fixture', 1000, 1).respond(
        task,
        {
          definitions: chatFunctions,
          execute: async () => assert.fail('failed response executed a tool'),
        },
        {
          signal: new AbortController().signal,
          delta: () => {},
          record: async () => {},
        },
      ),
      { message: 'chat_provider_failed' },
    );
  }
});

test('SDK HTTP failures retain status without provider error text', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      {
        error: { message: 'Private provider details', code: 'insufficient_quota' },
      },
      { status: 429 },
    ),
  );
  await assert.rejects(
    new OpenAiChat('synthetic-key', 'fixture', 1000, 1).respond(
      task,
      {
        definitions: chatFunctions,
        execute: async () => assert.fail('HTTP failure executed a tool'),
      },
      { signal: new AbortController().signal, delta: () => {}, record: async () => {} },
    ),
    { message: 'ai_http_429' },
  );
});
