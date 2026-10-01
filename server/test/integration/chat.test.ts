import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { FixtureAi } from '../fixtures/imports.js';
import type { ImportAi } from '../../src/application/import/types.js';
import { FixtureChat } from '../fixtures/chat.js';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { createPool, transaction } from '../../src/db/connection.js';
import { seedRegistry } from '../../src/db/seeds/registry.js';
const url = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const database = 'bt_chat_' + randomUUID().replaceAll('-', '');
const admin = createPool(url.toString());
url.pathname = '/' + database;
const pool = createPool(url.toString());
const ai = new FixtureChat();
const discoveryAi: ImportAi = new FixtureAi();
let app: FastifyInstance;
let directory: string;
let base: string;
const config = () => ({
  ...readConfig(),
  blobDirectory: directory,
  openaiApiKey: '',
  openaiModel: '',
  chatTimeoutMs: 3000,
});
const boot = async () => {
  app = await buildApp({
    dbPool: pool,
    config: config(),
    chatAi: ai,
    importAi: discoveryAi,
    verifyIdentity: async (token) => ({ subject: token }),
  });
  base = await app.listen({ host: '127.0.0.1', port: 0 });
};
const request = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: object,
  owner = 'alice',
) =>
  app.inject({
    method,
    url: '/api' + path,
    payload: body,
    headers: { authorization: 'Bearer ' + owner },
  });
before(async () => {
  directory = await mkdtemp(tmpdir() + '/boring-chat-');
  await admin.query(`create database ${database}`);
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort())
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  await transaction(pool, seedRegistry);
  await boot();
});
beforeEach(() => {
  ai.creation = undefined;
  ai.probe = undefined;
  ai.pause = undefined;
  ai.foreignThing = undefined;
  ai.failOnce = false;
});
after(async () => {
  await app?.close();
  await pool.end();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup(owner = 'alice') {
  const thing = (
    await request(
      'POST',
      '/things',
      {
        name: 'Chat Thing',
        categoryId: 'appliances',
        addFieldSetIds: ['appliances.neff'],
      },
      owner,
    )
  ).json<Schema['Thing']>();
  assert.ok(thing.id);
  const chat = (await request('POST', '/conversations', { thingId: thing.id }, owner)).json<
    Schema['Conversation']
  >();
  return { thing, chat };
}
async function wait(id: string, statuses = ['COMPLETE', 'FAILED']) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const chat = (await request('GET', `/conversations/${id}`)).json<Schema['Conversation']>();
    const message = chat.messages.filter((m) => m.role === 'ASSISTANT').at(-1);
    if (message && statuses.includes(message.status)) return { chat, message };
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Assistant timed out');
}
test('chat writes, retry receipts, multiple messages, owner isolation and deleted cards', async () => {
  const { thing, chat } = await setup();
  const input = {
    text: 'Create a filter check',
    requestId: randomUUID(),
  };
  ai.creation = 'create_event';
  ai.failOnce = true;
  assert.equal(
    (await request('POST', `/conversations/${chat.id}/messages`, input)).statusCode,
    202,
  );
  const failed = await wait(chat.id);
  assert.equal(failed.message.status, 'FAILED');
  assert.equal(failed.message.cards.filter((c) => c.type === 'EVENT').length, 1);
  const events = (await request('GET', `/events?thingId=${thing.id}`)).json<{
    items: Schema['Event'][];
  }>();
  assert.equal(events.items.length, 1);
  assert.equal(
    (await request('POST', `/conversations/${chat.id}/messages`, input)).statusCode,
    202,
  );
  const complete = await wait(chat.id);
  assert.equal(complete.message.status, 'COMPLETE');
  assert.equal(complete.chat.messages.length, 2);
  assert.equal(complete.message.text, 'The saved details are ready.');
  assert.equal((await request('GET', `/events?thingId=${thing.id}`)).json().items.length, 1);
  const calls = ai.calls;
  await request('POST', `/conversations/${chat.id}/messages`, input);
  assert.equal(ai.calls, calls);
  assert.equal(
    (
      await request('POST', `/conversations/${chat.id}/messages`, {
        ...input,
        text: 'Changed request',
      })
    ).statusCode,
    409,
  );
  ai.creation = 'create_issue';
  assert.equal(
    (
      await request('POST', `/conversations/${chat.id}/messages`, {
        ...input,
        text: 'Report a filter issue',
        requestId: randomUUID(),
      })
    ).statusCode,
    202,
  );
  assert.equal((await wait(chat.id)).chat.messages.length, 4);
  const updated = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.equal(updated.eventIds.length, 1);
  assert.equal(updated.issueIds.length, 1);
  assert.ok(updated.revision > thing.revision);
  for (const path of [`/conversations/${chat.id}`, `/conversations/${chat.id}/stream`])
    assert.equal((await request('GET', path, undefined, 'bob')).statusCode, 404);
  assert.equal(
    (await request('POST', `/conversations/${chat.id}/messages`, input, 'bob')).statusCode,
    404,
  );
  const startsAt = '2026-10-01T09:00:00.000Z';
  assert.equal(
    (
      await request('PATCH', `/events/${events.items[0].id}`, {
        status: 'SCHEDULED',
        startsAt,
      })
    ).statusCode,
    200,
  );
  const dashboard = (await request('POST', '/conversations', {})).json<Schema['Conversation']>();
  await pool.query(
    "insert into bt.messages(conversation_id,request_id,role,text,cards,status) values($1,$2,'ASSISTANT','Saved record',$3,'COMPLETE')",
    [dashboard.id, randomUUID(), JSON.stringify([{ type: 'THING', thingId: thing.id }])],
  );
  await request('DELETE', `/things/${thing.id}`);
  assert.equal((await request('GET', `/conversations/${chat.id}`)).statusCode, 404);
  assert.equal(
    (await request('GET', `/conversations/${dashboard.id}`)).json().messages[0].cards[0].available,
    false,
  );
});
test('single in-flight response, SSE snapshots and reconnect without duplicate text', async () => {
  const { chat } = await setup();
  let release!: () => void;
  ai.pause = new Promise((r) => {
    release = r;
  });
  const input = {
    text: 'Read the saved details',
    requestId: randomUUID(),
  };
  await request('POST', `/conversations/${chat.id}/messages`, input);
  await wait(chat.id, ['PROCESSING']);
  assert.equal(
    (
      await request('POST', `/conversations/${chat.id}/messages`, {
        ...input,
        requestId: randomUUID(),
      })
    ).statusCode,
    409,
  );
  const abort = new AbortController();
  const stream = await fetch(base + `/api/conversations/${chat.id}/stream`, {
    headers: { Authorization: 'Bearer alice' },
    signal: abort.signal,
  });
  assert.equal(stream.status, 200);
  assert.equal(stream.headers.get('cache-control'), 'private, no-store');
  const reader = stream.body!.getReader();
  let received = '';
  const reading = (async () => {
    while (true) {
      const part = await reader.read();
      if (part.done) return;
      received += new TextDecoder().decode(part.value);
      if (
        received.includes('conversation.delta') &&
        received
          .split('\n')
          .some(
            (line) =>
              line.startsWith('data: ') &&
              (JSON.parse(line.slice(6)) as { messages?: Schema['Message'][] }).messages?.some(
                (message) => message.role === 'ASSISTANT' && message.status === 'COMPLETE',
              ),
          )
      )
        return;
    }
  })();
  release();
  ai.pause = undefined;
  await reading;
  abort.abort();
  await reader.cancel().catch(() => {});
  assert.match(received, /"offset":0/);
  assert.match(received, /"offset":18/);
  const again = new AbortController();
  const reconnect = await fetch(base + `/api/conversations/${chat.id}/stream`, {
    headers: { Authorization: 'Bearer alice' },
    signal: again.signal,
  });
  const snapshot = new TextDecoder().decode((await reconnect.body!.getReader().read()).value);
  again.abort();
  assert.match(snapshot, /The saved details are ready\./);
  assert.doesNotMatch(snapshot, /ready\.The/);
});
test('tool owner checks reject guessed Thing IDs', async () => {
  const foreign = await setup('bob');
  const { chat } = await setup();
  ai.foreignThing = foreign.thing.id;
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Read another Thing',
    requestId: randomUUID(),
  });
  const failed = await wait(chat.id);
  assert.equal(failed.message.status, 'FAILED');
  assert.equal(failed.message.text, '');
  ai.foreignThing = undefined;
});
test('restart retains activity and marks interrupted messages retryable', async () => {
  ai.creation = 'create_event';
  const { chat, thing } = await setup();
  const input = {
    text: 'Create maintenance',
    requestId: randomUUID(),
  };
  await request('POST', `/conversations/${chat.id}/messages`, input);
  await wait(chat.id);
  await app.close();
  await pool.query(
    "update bt.messages set status='PROCESSING',text='' where conversation_id=$1 and role='ASSISTANT'",
    [chat.id],
  );
  await boot();
  const interrupted = await wait(chat.id);
  assert.equal(interrupted.message.error, 'interrupted');
  await request('POST', `/conversations/${chat.id}/messages`, input);
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  assert.equal((await request('GET', `/events?thingId=${thing.id}`)).json().items.length, 1);
});

test('deadline prevents a late model-selected write', async () => {
  const { thing, chat } = await setup();
  ai.creation = 'create_event';
  let release!: () => void;
  ai.pause = new Promise((r) => {
    release = r;
  });
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Create an event',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.error, 'timeout');
  release();
  ai.pause = undefined;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await request('GET', `/events?thingId=${thing.id}`)).json().items.length, 0);
});
test('text-only questions return messages without intent or new activity', async () => {
  const { thing, chat } = await setup();
  assert.equal(
    (
      await request('POST', `/conversations/${chat.id}/messages`, {
        text: 'How do I clean the filter?',
        requestId: randomUUID(),
        intent: 'ANSWER',
      })
    ).statusCode,
    422,
  );
  const response = await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'How do I clean the filter?',
    requestId: randomUUID(),
  });
  assert.equal(response.statusCode, 202);
  const result = await wait(chat.id);
  assert.equal(result.message.status, 'COMPLETE');
  assert.ok(result.chat.messages.every((message) => !Object.hasOwn(message, 'intent')));
  for (const resource of ['events', 'issues'])
    assert.equal((await request('GET', `/${resource}?thingId=${thing.id}`)).json().items.length, 0);
});
test('writes require a retrieved owned Thing and valid arguments', async () => {
  const { thing } = await setup();
  const foreign = await setup('bob');
  for (const input of [
    { thingId: thing.id, title: 'Unread Thing' },
    { thingId: foreign.thing.id, title: 'Foreign Thing' },
    { title: '   ' },
    { title: 'x'.repeat(201) },
  ]) {
    const current = await setup();
    ai.probe = async (_input, execute) => {
      await execute('create_issue', {
        thingId: current.thing.id,
        description: '',
        ...input,
      });
    };
    await request('POST', `/conversations/${current.chat.id}/messages`, {
      text: 'Log an issue for the leak',
      requestId: randomUUID(),
    });
    assert.equal((await wait(current.chat.id)).message.status, 'FAILED');
    assert.equal(
      (await request('GET', `/issues?thingId=${current.thing.id}`)).json().items.length,
      0,
    );
  }
  assert.equal((await request('GET', `/issues?thingId=${thing.id}`)).json().items.length, 0);
  assert.equal(
    (await request('GET', `/issues?thingId=${foreign.thing.id}`, undefined, 'bob')).json().items
      .length,
    0,
  );
});
test('one creation spans both tools and targets, including retries after a completed write', async () => {
  const other = await setup();
  for (const first of ['create_event', 'create_issue'] as const) {
    for (const change of ['type', 'target'] as const) {
      const { thing, chat } = await setup();
      const input = { text: 'Add the requested activity', requestId: randomUUID() };
      ai.creation = first;
      ai.failOnce = true;
      await request('POST', `/conversations/${chat.id}/messages`, input);
      assert.equal((await wait(chat.id)).message.status, 'FAILED');
      ai.creation = undefined;
      let replayed = false;
      ai.probe = async (context, execute) => {
        assert.equal(context.completedWrites.length, 1);
        await execute('read_thing', { thingId: other.thing.id });
        const args = { thingId: thing.id, title: 'Repeated creation', description: '' };
        const saved = await execute(first, args);
        assert.deepEqual(await execute(first, args), saved);
        replayed = true;
        await execute(
          change === 'type' ? (first === 'create_event' ? 'create_issue' : 'create_event') : first,
          {
            ...args,
            thingId: change === 'target' ? other.thing.id : thing.id,
          },
        );
      };
      await request('POST', `/conversations/${chat.id}/messages`, input);
      assert.equal((await wait(chat.id)).message.status, 'FAILED');
      assert.equal(replayed, true);
      for (const resource of ['events', 'issues']) {
        const expected = (first === 'create_event' ? 'events' : 'issues') === resource ? 1 : 0;
        assert.equal(
          (await request('GET', `/${resource}?thingId=${thing.id}`)).json().items.length,
          expected,
        );
        assert.equal(
          (await request('GET', `/${resource}?thingId=${other.thing.id}`)).json().items.length,
          0,
        );
      }
      ai.probe = undefined;
      ai.creation = first;
      await request('POST', `/conversations/${chat.id}/messages`, input);
      assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
    }
  }
});
test('shared attachments can ground dashboard chat while foreign files stay inaccessible', async () => {
  const first = await setup();
  const second = await setup();
  const boundary = 'chat-file';
  const upload = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer alice',
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="manual.txt"\r\nContent-Type: text/plain\r\n\r\nSynthetic manual: inspect the filter monthly.\r\n--${boundary}--\r\n`,
  });
  assert.equal(upload.statusCode, 201, upload.body);
  const file = upload.json<Schema['Attachment']>();
  for (const thing of [first.thing, second.thing])
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/attachments/${file.id}/things/${thing.id}`,
          headers: { authorization: 'Bearer alice' },
        })
      ).statusCode,
      204,
    );
  ai.probe = async (_input, execute) => {
    await execute('read_thing', { thingId: first.thing.id });
    const source = await execute('read_attachment', { attachmentId: file.id });
    assert.match(source.source!.content.toString(), /inspect the filter monthly/);
  };
  const chat = (await request('POST', '/conversations', {})).json<Schema['Conversation']>();
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Read the manual',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  const bob = await setup('bob');
  ai.probe = async (_input, execute) => {
    await execute('read_attachment', { attachmentId: file.id });
  };
  const accepted = await request(
    'POST',
    `/conversations/${bob.chat.id}/messages`,
    { text: 'Read another file', requestId: randomUUID() },
    'bob',
  );
  assert.equal(accepted.statusCode, 202);
  for (let tries = 0; tries < 100; tries++) {
    const messages = (await request('GET', `/conversations/${bob.chat.id}`, undefined, 'bob')).json<
      Schema['Conversation']
    >().messages;
    const message = messages.at(-1);
    if (message?.status === 'FAILED') {
      assert.equal(message.text, '');
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(tries < 99);
  }
  ai.probe = undefined;
});
test('product discovery is cited, bounded and reused after a response failure', async () => {
  const { thing, chat } = await setup();
  await request('PATCH', `/things/${thing.id}`, {
    values: [
      {
        fieldSetId: 'appliances.appliance',
        fieldId: 'common.model',
        value: 'Synthetic model',
      },
    ],
  });
  let discoveries = 0;
  discoveryAi.discover = async (candidate, _context, focus) => {
    discoveries++;
    assert.equal(candidate.name, 'Synthetic model');
    assert.equal(focus, 'products');
    return {
      sources: ['https://manufacturer.example/compatible', 'https://merchant.example/filter'],
      items: [
        {
          kind: 'consumable',
          title: 'Cited filter',
          description: 'Synthetic supported product',
          url: 'https://merchant.example/filter',
          sourceUrl: 'https://manufacturer.example/compatible',
        },
      ],
    };
  };
  ai.probe = async (_input, execute) => {
    await execute('discover', { thingId: thing.id, focus: 'products' });
  };
  ai.failOnce = true;
  const input = {
    text: 'Find a filter',
    requestId: randomUUID(),
  };
  await request('POST', `/conversations/${chat.id}/messages`, input);
  assert.equal((await wait(chat.id)).message.status, 'FAILED');
  await request('POST', `/conversations/${chat.id}/messages`, input);
  const result = await wait(chat.id);
  assert.equal(result.message.status, 'COMPLETE');
  assert.equal(discoveries, 1);
  const products = (await request('GET', `/purchasables?thingId=${thing.id}`)).json<{
    items: Schema['Purchasable'][];
  }>();
  assert.equal(products.items.length, 1);
  assert.equal(products.items[0].price, null);
  assert.deepEqual(products.items[0].sourceRefs, [
    { url: 'https://manufacturer.example/compatible' },
  ]);
  assert.ok(
    result.message.sourceRefs.some((s) => s.url === 'https://manufacturer.example/compatible'),
  );
  ai.probe = undefined;
});
