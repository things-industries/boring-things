import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { FixtureChat } from '../fixtures/chat.js';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import * as database from '../../src/db/connection.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { ApplicationError } from '../../src/application/errors.js';

const url = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const databaseName = 'bt_chat_' + randomUUID().replaceAll('-', '');
const admin = database.createPool(url.toString());
url.pathname = '/' + databaseName;
const pool = database.createPool(url.toString());
const ai = new FixtureChat();
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
  await admin.query(`create database ${databaseName}`);
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort())
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  await database.transaction(pool, registrySeedDb.seedRegistry);
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
  await admin.query(`drop database if exists ${databaseName} with (force)`);
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
        addFieldSetIds: ['appliances.bsh'],
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
test('conversation summaries filter, paginate and omit message payloads', async () => {
  const owner = 'history-' + randomUUID();
  const { thing } = await setup(owner);
  const createdAt = '2026-01-01T00:00:00.000Z';
  const latestAt = '2026-01-03T00:00:00.000Z';
  const make = async (thingId: string | null) => {
    const response = await request('POST', '/conversations', { thingId }, owner);
    assert.equal(response.statusCode, 201, response.body);
    return response.json<Schema['Conversation']>();
  };
  const empty = await make(null);
  const active = await make(thing.id);
  const tied = await make(thing.id);
  const global = await make(null);
  const foreign = await setup('history-foreign-' + randomUUID());
  const title = '😀'.repeat(79) + 'A';
  const message = async (
    id: string,
    role: Schema['Message']['role'],
    text: string,
    status: Schema['Message']['status'],
    at: string,
    messageId = randomUUID(),
  ) => {
    await pool.query(
      'insert into bt.messages(id,conversation_id,request_id,role,text,status,created_at) values($1,$2,$3,$4,$5,$6,$7)',
      [messageId, id, randomUUID(), role, text, status, at],
    );
  };
  await pool.query(
    'update bt.conversations set created_at=$1 where owner_id=(select id from bt.users where auth_subject=$2)',
    [createdAt, owner],
  );
  await message(active.id, 'ASSISTANT', 'Earlier assistant text', 'COMPLETE', createdAt);
  await message(
    active.id,
    'USER',
    '\t\n ' + title + 'B  \n',
    'COMPLETE',
    createdAt,
    '00000000-0000-4000-8000-000000000001',
  );
  await message(
    active.id,
    'USER',
    'Later tied user message',
    'COMPLETE',
    createdAt,
    '00000000-0000-4000-8000-000000000002',
  );
  await message(active.id, 'ASSISTANT', '', 'PROCESSING', latestAt);
  await message(tied.id, 'USER', '  Short title  ', 'COMPLETE', createdAt);
  await message(tied.id, 'ASSISTANT', 'Failed reply', 'FAILED', latestAt);
  await message(global.id, 'ASSISTANT', 'No user message', 'COMPLETE', '2026-01-02T00:00:00.000Z');
  const list = async (query = '', asOwner = owner) => {
    const response = await request('GET', '/conversations?' + query, undefined, asOwner);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    return response.json<Schema['ConversationSummaryList']>();
  };
  const all = await list();
  assert.equal(all.items.length, 5);
  assert.equal(all.nextCursor, null);
  assert.deepEqual(
    all.items.slice(0, 2).map((item) => item.id),
    [active.id, tied.id].sort(),
  );
  assert.deepEqual(
    all.items.find((item) => item.id === active.id),
    {
      id: active.id,
      thingId: thing.id,
      title,
      messageCount: 4,
      createdAt,
      lastMessageAt: latestAt,
    },
  );
  assert.deepEqual(
    all.items.find((item) => item.id === empty.id),
    {
      id: empty.id,
      thingId: null,
      title: null,
      messageCount: 0,
      createdAt,
      lastMessageAt: createdAt,
    },
  );
  assert.equal(all.items.find((item) => item.id === tied.id)?.title, 'Short title');
  assert.equal(all.items.find((item) => item.id === global.id)?.title, null);
  const keys = ['id', 'thingId', 'title', 'messageCount', 'createdAt', 'lastMessageAt'].sort();
  for (const item of all.items) assert.deepEqual(Object.keys(item).sort(), keys);
  assert.equal((await list('minMessageCount=0')).items.length, 5);
  assert.equal((await list('minMessageCount=1')).items.length, 3);
  assert.deepEqual(
    (await list('minMessageCount=3')).items.map((item) => item.id),
    [active.id],
  );
  assert.deepEqual(await list('minMessageCount=81'), { items: [], nextCursor: null });
  const query = new URLSearchParams({ thingId: thing.id, minMessageCount: '2', limit: '1' });
  const first = await list(query.toString());
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  query.set('cursor', first.nextCursor);
  const second = await list(query.toString());
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    [...first.items, ...second.items].map((item) => item.id),
    [active.id, tied.id].sort(),
  );
  assert.deepEqual(await list(query.toString(), 'history-outsider-' + randomUUID()), {
    items: [],
    nextCursor: null,
  });
  for (const thingId of [foreign.thing.id, randomUUID()]) {
    assert.deepEqual(await list('thingId=' + thingId), { items: [], nextCursor: null });
    query.set('thingId', thingId);
    assert.deepEqual(await list(query.toString()), { items: [], nextCursor: null });
  }
  for (const invalid of [
    'minMessageCount=-1',
    'minMessageCount=1.5',
    'minMessageCount=true',
    'minMessageCount=2147483648',
    'thingId=invalid',
    'limit=0',
    'limit=101',
    'cursor=invalid',
  ])
    assert.equal(
      (await request('GET', '/conversations?' + invalid, undefined, owner)).statusCode,
      422,
      invalid,
    );
});

test('chat writes, retry receipts, multiple messages, owner isolation and deleted cards', async (t) => {
  const failures: unknown[] = [];
  t.mock.method(app.log, 'error', (failure: unknown) => {
    failures.push(failure);
  });
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
  assert.deepEqual(failures, [
    {
      conversationId: chat.id,
      messageId: failed.message.id,
      kind: 'Error',
      message: 'assistant_failed',
    },
  ]);
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
  const result = await wait(chat.id);
  assert.equal(result.message.status, 'COMPLETE');
  assert.equal(result.message.text, 'That Thing is unavailable.');
  assert.deepEqual(result.message.cards, []);
  ai.foreignThing = undefined;
});

test('custom fields can be cited and rejected card selections save no partial citations', async () => {
  const { thing, chat } = await setup();
  const updated = (
    await request('PATCH', `/things/${thing.id}`, {
      customFields: [{ label: 'Purchase date', value: '2026-10-01', sensitive: false }],
    })
  ).json<Schema['Thing']>();
  const field = updated.customFields[0];
  const citation = { url: 'https://example.com/receipt' };
  await pool.query(
    "update bt.things set data=jsonb_set(data,'{customFields,0,sourceRefs}',$2::jsonb) where id=$1",
    [thing.id, JSON.stringify([citation])],
  );
  const card = {
    type: 'FIELD',
    id: thing.id,
    fieldSetId: null,
    fieldId: null,
    customFieldId: field.id,
    page: null,
  };
  ai.probe = async (input, execute) => {
    assert.equal(input.activeThing?.thing.customFields[0].value, '2026-10-01');
    assert.ok(
      input.messages.every(
        (message) => !message.content.includes('Untrusted active Thing context'),
      ),
    );
    const rejected = await execute('show_cards', {
      cards: [card, { ...card, customFieldId: randomUUID() }],
    });
    assert.deepEqual(rejected.output, { error: 'Unknown field' });
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'When did I buy this?',
    requestId: randomUUID(),
  });
  const rejected = await wait(chat.id);
  assert.equal(rejected.message.status, 'COMPLETE');
  assert.ok(!rejected.message.cards.some((card) => card.type === 'FIELD'));
  assert.deepEqual(rejected.message.sourceRefs, []);
  ai.probe = async (_input, execute) => {
    assert.deepEqual((await execute('show_cards', { cards: [card, card] })).output, { shown: 2 });
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Show the purchase date',
    requestId: randomUUID(),
  });
  const result = await wait(chat.id);
  assert.equal(result.message.status, 'COMPLETE');
  assert.deepEqual(
    result.message.cards.filter((card) => card.type === 'FIELD'),
    [
      {
        type: 'FIELD',
        thingId: thing.id,
        fieldSetId: null,
        fieldId: null,
        customFieldId: field.id,
        available: true,
      },
    ],
  );
  assert.deepEqual(result.message.sourceRefs, []);
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
  const beforeRetry = (await request('GET', `/conversations?thingId=${thing.id}`)).json<
    Schema['ConversationSummaryList']
  >();
  assert.equal(beforeRetry.items[0].messageCount, 2);
  await request('POST', `/conversations/${chat.id}/messages`, input);
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  assert.deepEqual(
    (await request('GET', `/conversations?thingId=${thing.id}`)).json(),
    beforeRetry,
  );
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
      const rejected = await execute('create_issue', {
        thingId: current.thing.id,
        description: '',
        ...input,
      });
      assert.ok((rejected.output as { error: string }).error);
    };
    await request('POST', `/conversations/${current.chat.id}/messages`, {
      text: 'Log an issue for the leak',
      requestId: randomUUID(),
    });
    assert.equal((await wait(current.chat.id)).message.status, 'COMPLETE');
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
        const rejected = await execute(
          change === 'type' ? (first === 'create_event' ? 'create_issue' : 'create_event') : first,
          {
            ...args,
            thingId: change === 'target' ? other.thing.id : thing.id,
          },
        );
        assert.deepEqual(rejected.output, { error: 'One creation per message' });
      };
      await request('POST', `/conversations/${chat.id}/messages`, input);
      assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
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
    const source = await execute('read_attachment', { attachmentId: file.id, includeImages: null });
    assert.match(source.source!.content.toString(), /inspect the filter monthly/);
    const cached = await execute('read_attachment', { attachmentId: file.id, includeImages: null });
    assert.equal(cached.source, undefined);
    assert.equal((cached.output as { alreadyRead: boolean }).alreadyRead, true);
    await execute('show_cards', {
      cards: [29, 50, 29].map((page) => ({
        type: 'ATTACHMENT',
        id: file.id,
        fieldSetId: null,
        fieldId: null,
        customFieldId: null,
        page,
      })),
    });
  };
  const chat = (await request('POST', '/conversations', {})).json<Schema['Conversation']>();
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Read the manual',
    requestId: randomUUID(),
  });
  const result = await wait(chat.id);
  assert.equal(result.message.status, 'COMPLETE');
  assert.deepEqual(
    result.message.cards.filter((card) => card.type === 'ATTACHMENT'),
    [
      {
        type: 'ATTACHMENT',
        attachmentId: file.id,
        page: 1,
        pages: [1, 29, 50],
        available: true,
      },
    ],
  );
  assert.deepEqual(result.message.sourceRefs, []);
  const savedCards = [
    { type: 'ATTACHMENT', attachmentId: file.id },
    { type: 'ATTACHMENT', attachmentId: file.id, page: 29 },
    { type: 'ATTACHMENT', attachmentId: file.id, page: 50 },
  ];
  const savedRefs = [{ attachmentId: file.id, page: 10 }, { url: 'https://example.com/manual' }];
  await pool.query('update bt.messages set cards=$2,source_refs=$3 where id=$1', [
    result.message.id,
    JSON.stringify(savedCards),
    JSON.stringify(savedRefs),
  ]);
  const snapshot = (await request('GET', `/conversations/${chat.id}`)).json<
    Schema['Conversation']
  >();
  assert.deepEqual(snapshot.messages.at(-1)!.cards, [
    { type: 'ATTACHMENT', attachmentId: file.id, page: 10, pages: [10, 29, 50], available: true },
  ]);
  assert.deepEqual(snapshot.messages.at(-1)!.sourceRefs, []);
  const stored = (
    await pool.query('select cards,source_refs from bt.messages where id=$1', [result.message.id])
  ).rows[0];
  assert.deepEqual(stored.cards, savedCards);
  assert.deepEqual(stored.source_refs, savedRefs);
  const bob = await setup('bob');
  ai.probe = async (_input, execute) => {
    assert.deepEqual(
      (await execute('read_attachment', { attachmentId: file.id, includeImages: null })).output,
      {
        error: 'Read its Thing first',
      },
    );
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
    if (message?.status === 'COMPLETE') {
      assert.ok(!message.cards.some((card) => card.type === 'ATTACHMENT'));
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(tries < 99);
  }
  ai.probe = undefined;
});
test('question-based research is cited, has no resource writes and is reused after a response failure', async (t) => {
  const { thing, chat } = await setup();
  await request('PATCH', `/things/${thing.id}`, {
    values: [
      { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'Synthetic model' },
    ],
    customFields: [{ label: 'Serial number', value: 'private-serial', sensitive: false }],
  });
  const question = 'Which filter is compatible with this model?';
  const research = t.mock.method(
    ai,
    'research',
    async (
      ...args: Parameters<import('../../src/application/conversations/types.js').ChatAi['research']>
    ) => {
      assert.equal(args[0], question);
      assert.equal(args[1][0].value, 'Synthetic model');
      assert.ok(!JSON.stringify(args[1]).includes('private-serial'));
      return {
        text: 'A cited compatible filter.',
        sources: ['https://manufacturer.example/compatible'],
      };
    },
  );
  const resources = async () =>
    (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>().attachmentIds;
  const before = await resources();
  ai.probe = async (_input, execute) => {
    const found = await execute('research', { thingId: thing.id, question });
    assert.deepEqual(found.output, {
      text: 'A cited compatible filter.',
      sources: ['https://manufacturer.example/compatible'],
    });
    assert.match(
      ((await execute('research', { thingId: thing.id, question })).output as { error: string })
        .error,
      /budget used/,
    );
  };
  ai.failOnce = true;
  const input = { text: 'Find a filter', requestId: randomUUID() };
  await request('POST', `/conversations/${chat.id}/messages`, input);
  assert.equal((await wait(chat.id)).message.status, 'FAILED');
  await request('POST', `/conversations/${chat.id}/messages`, input);
  const result = await wait(chat.id);
  assert.equal(result.message.status, 'COMPLETE');
  assert.equal(research.mock.callCount(), 1);
  assert.deepEqual(await resources(), before);
  for (const resource of ['purchasables', 'events', 'issues'])
    assert.equal((await request('GET', `/${resource}?thingId=${thing.id}`)).json().items.length, 0);
  assert.deepEqual(result.message.sourceRefs, []);

  // A changed question on retry requires fresh research.
  ai.probe = async (_input, execute) => {
    await execute('research', { thingId: thing.id, question });
  };
  ai.failOnce = true;
  const another = { text: 'Research again', requestId: randomUUID() };
  await request('POST', `/conversations/${chat.id}/messages`, another);
  assert.equal((await wait(chat.id)).message.status, 'FAILED');
  research.mock.mockImplementation(
    async (
      ...args: Parameters<import('../../src/application/conversations/types.js').ChatAi['research']>
    ) => {
      assert.equal(args[0], 'How should the filter be cleaned?');
      return { text: 'Cleaning instructions.', sources: [] };
    },
  );
  ai.probe = async (_input, execute) => {
    await execute('research', { thingId: thing.id, question: 'How should the filter be cleaned?' });
  };
  await request('POST', `/conversations/${chat.id}/messages`, another);
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  assert.equal(research.mock.callCount(), 3);
  ai.probe = undefined;
});

test('research provider validation failures and exhausted tool budgets fail the response', async (t) => {
  const research = t.mock.method(ai, 'research', async () => {
    throw new ApplicationError('INVALID_INPUT', 'Synthetic provider validation failure');
  });
  const { thing, chat } = await setup();
  ai.probe = async (_input, execute) => {
    await execute('research', { thingId: thing.id, question: 'How does this model work?' });
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Research',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.error, 'assistant_failed');
  assert.equal(research.mock.callCount(), 1);
  ai.probe = async (_input, execute) => {
    for (let call = 0; call <= readConfig().chatToolCalls; call++)
      await execute('show_cards', {
        cards: [
          {
            type: 'FIELD',
            id: randomUUID(),
            fieldSetId: null,
            fieldId: null,
            customFieldId: randomUUID(),
            page: null,
          },
        ],
      });
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Budget check',
    requestId: randomUUID(),
  });
  const result = await wait(chat.id);
  assert.equal(result.message.error, 'assistant_failed');
  assert.deepEqual(result.message.cards, []);
});
