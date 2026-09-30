import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiChat } from '../src/providers/chat.js';
import type { ChatContext } from '../src/application/conversations/types.js';
const task = {
  thingId: null,
  messages: [{ role: 'USER' as const, content: 'Read the Thing' }],
  completedWrites: [],
};
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
    async (name, args) => {
      assert.equal(name, 'search_things');
      assert.deepEqual(args, { query: 'hob' });
      return { output: { items: [] } };
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
      async () => ({ output: {} }),
      {
        signal: new AbortController().signal,
        delta: () => {},
        record: async () => {},
      },
    ),
    /incomplete/,
  );
});
