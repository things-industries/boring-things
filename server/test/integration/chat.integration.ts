import { test, before, beforeEach, after } from 'node:test';
import { getEnv, setEnvMode, setEnvValue } from '../../src/config.js';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { FastifyInstance } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { FixtureChat } from '../fixtures/chat.js';
import { FixtureAi } from '../fixtures/imports.js';
import { loadRegistry } from '../../src/application/registry/index.js';
import { buildApp } from '../../src/app.js';
import * as database from '../../src/db/connection.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { ApplicationError } from '../../src/application/errors.js';
import type { ChatFieldInput } from '../../src/application/conversations/fields.js';
import { setDiagnosticLogger } from '../../src/metrics.js';

const url = new URL(getEnv('TEST_DATABASE_URL'));
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const databaseName = 'bt_chat_' + randomUUID().replaceAll('-', '');
const admin = database.createPool(url.toString());
url.pathname = '/' + databaseName;
const pool = database.createPool(url.toString());
const ai = new FixtureChat();
let app: FastifyInstance;
let directory: string;
let base: string;

const boot = async () => {
  setEnvMode('test');
  setEnvValue('BLOB_DIRECTORY', directory);
  setEnvValue('CHAT_TIMEOUT_MS', 3000);
  app = await buildApp({
    dbPool: pool,
    chatAi: ai,
    importAi: new FixtureAi({ db: pool, registry: await loadRegistry(pool) }),
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
        addFieldSetIds: ['appliances.appliance'],
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
  setDiagnosticLogger(app.log);
  t.after(() => setDiagnosticLogger(undefined));
  const { thing, chat } = await setup();
  const input = {
    text: 'Create a filter check',
    requestId: randomUUID(),
  };
  ai.creation = 'create_task';
  ai.failOnce = true;
  assert.equal(
    (await request('POST', `/conversations/${chat.id}/messages`, input)).statusCode,
    202,
  );
  const failed = await wait(chat.id);
  assert.equal(failed.message.status, 'FAILED');
  assert.partialDeepStrictEqual(failures, [
    {
      event: 'job_finished',
      jobKind: 'chat',
      conversationId: chat.id,
      jobId: failed.message.id,
      status: 'FAILED',
      stage: 'respond',
      reason: 'assistant_failed',
    },
  ]);
  assert.equal(failed.message.cards.filter((c) => c.type === 'TASK').length, 1);
  const events = (await request('GET', `/tasks?thingId=${thing.id}`)).json<{
    items: Schema['Task'][];
  }>();
  assert.equal(events.items.length, 1);
  assert.equal(events.items[0].status, 'ACTIVE');
  assert.equal(events.items[0].scheduledOn, null);
  assert.equal(
    (await request('POST', `/conversations/${chat.id}/messages`, input)).statusCode,
    202,
  );
  const complete = await wait(chat.id);
  assert.equal(complete.message.status, 'COMPLETE');
  assert.equal(complete.chat.messages.length, 2);
  assert.equal(complete.message.text, 'The saved details are ready.');
  assert.equal((await request('GET', `/tasks?thingId=${thing.id}`)).json().items.length, 1);
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
  assert.equal(updated.eventIds.length, 0);
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
      await request('PATCH', `/tasks/${events.items[0].id}`, {
        scheduledOn: startsAt.slice(0, 10),
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
    type: 'FIELD' as const,
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
  ai.creation = 'create_task';
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
  assert.equal((await request('GET', `/tasks?thingId=${thing.id}`)).json().items.length, 1);
});

test('deadline prevents a late model-selected write', { timeout: 10000 }, async () => {
  const { thing, chat } = await setup();
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  let completeAttempt!: (error: unknown) => void;
  const attempted = new Promise<unknown>((resolve) => {
    completeAttempt = resolve;
  });
  ai.probe = async (_input, execute) => {
    await paused;
    await execute('create_task', {
      thingId: thing.id,
      title: 'Check the filter',
      description: 'Synthetic maintenance task',
      issueId: null,
      importance: 'RECOMMENDED',
      recurrence: null,
      scheduledOn: null,
      deadlineOn: null,
    }).then(() => completeAttempt(null), completeAttempt);
  };
  try {
    const response = await request('POST', `/conversations/${chat.id}/messages`, {
      text: 'Create a maintenance Task',
      requestId: randomUUID(),
    });
    assert.equal(response.statusCode, 202, response.body);
    assert.equal((await wait(chat.id)).message.error, 'timeout');
  } finally {
    release();
  }
  const failure = await attempted;
  assert.ok(failure instanceof Error);
  assert.equal(failure.name, 'TimeoutError');
  assert.equal((await request('GET', `/tasks?thingId=${thing.id}`)).json().items.length, 0);
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
  for (const resource of ['tasks', 'issues'])
    assert.equal((await request('GET', `/${resource}?thingId=${thing.id}`)).json().items.length, 0);
});
// Moving tool schemas into tasks left application activity length checks unenforced.
test('writes require a retrieved owned Thing and valid arguments', async () => {
  const { thing } = await setup();
  const foreign = await setup('bob');
  for (const input of [
    { thingId: thing.id, title: 'Unread Thing' },
    { thingId: foreign.thing.id, title: 'Foreign Thing' },
    { title: '   ' },
    { title: 'x'.repeat(201) },
    { title: 'Check the seal', description: 'x'.repeat(4001) },
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
  for (const first of ['create_task', 'create_issue'] as const) {
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
        const run = (name: 'create_task' | 'create_issue', data: typeof args) =>
          execute(
            name,
            name === 'create_task'
              ? {
                  ...data,
                  issueId: null,
                  importance: 'RECOMMENDED',
                  recurrence: null,
                  scheduledOn: null,
                  deadlineOn: null,
                }
              : data,
          );
        const saved = await run(first, args);
        assert.deepEqual(await run(first, args), saved);
        replayed = true;
        const rejected = await run(
          change === 'type' ? (first === 'create_task' ? 'create_issue' : 'create_task') : first,
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
      for (const resource of ['tasks', 'issues']) {
        const expected = (first === 'create_task' ? 'tasks' : 'issues') === resource ? 1 : 0;
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
  for (const resource of ['purchasables', 'tasks', 'issues'])
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
    for (let call = 0; call <= getEnv('CHAT_TOOL_CALLS'); call++)
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

test('chat creates active dated and recurring Tasks and reports invalid schedules as tool errors', async () => {
  const { thing, chat } = await setup();
  for (const [scheduledOn, deadlineOn, recurrence, valid] of [
    ['2027-01-10', '2027-01-12', null, true],
    ['2027-01-10', null, { interval: 1, unit: 'MONTH', from: 'COMPLETION' }, true],
    [null, null, { interval: 1, unit: 'MONTH', from: 'COMPLETION' }, false],
    ['2027-01-10', '2027-01-12', { interval: 1, unit: 'MONTH', from: 'SCHEDULED' }, false],
  ] as const) {
    ai.probe = async (_input, execute) => {
      const result = await execute('create_task', {
        thingId: thing.id,
        issueId: null,
        title: 'Check filter',
        description: '',
        importance: 'RECOMMENDED',
        scheduledOn,
        deadlineOn,
        recurrence,
      });
      assert.equal('error' in (result.output as object), !valid);
    };
    await request('POST', `/conversations/${chat.id}/messages`, {
      text: 'Create a filter task',
      requestId: randomUUID(),
    });
    assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  }
  const tasks = (await request('GET', `/tasks?thingId=${thing.id}`)).json<{
    items: Schema['Task'][];
  }>().items;
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((task) => task.status === 'ACTIVE'));
  assert.equal(tasks.find((task) => task.recurrence)?.recurrence?.unit, 'MONTH');
});

test('chat field batches add sets, update custom fields, clear values and reuse receipts after owner edits', async (t) => {
  const { thing, chat } = await setup();
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(base + `/api/things/${thing.id}/stream`, {
    headers: { authorization: 'Bearer alice' },
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
  });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  await reader.read();
  const input = { text: 'Save these details', requestId: randomUUID() };
  const patch: ChatFieldInput = {
    thingId: thing.id,
    addFieldSetIds: ['appliances.dimensions'],
    values: [
      {
        fieldSetId: 'appliances.dimensions',
        fieldId: 'common.width',
        value: '60 cm',
        source: null,
      },
      { fieldSetId: null, fieldId: 'common.serialNumber', value: '000123', source: null },
    ],
    customFields: [
      {
        customFieldId: null,
        label: 'Filter size',
        value: 'Medium',
        sensitive: false,
        scope: 'CLASS',
        source: null,
      },
    ],
  };
  let firstResult: unknown;
  ai.probe = async (context, execute) => {
    assert.ok(
      context.activeThing?.thing.fieldSets
        .flatMap((set) => set.fields)
        .some((field) => field.value === null),
    );
    if (firstResult) {
      assert.ok(
        context.completedWrites.some(
          (receipt) => (receipt as { key: string }).key === 'update_thing_fields',
        ),
      );
      assert.deepEqual((await execute('update_thing_fields', patch)).output, firstResult);
      return;
    }
    await execute('search_field_sets', { categoryId: 'appliances', terms: ['dimensions'] });
    await execute('search_fields', { labels: [{ label: 'Serial number', context: '' }] });
    const result = await execute('update_thing_fields', patch);
    assert.ok(!('error' in (result.output as object)), JSON.stringify(result.output));
    firstResult = result.output;
    const customId = (
      result.output as { changedFields: { customFieldId: string | null }[] }
    ).changedFields.find((field) => field.customFieldId)!.customFieldId!;
    assert.deepEqual(
      (
        await execute('show_cards', {
          cards: [
            {
              type: 'FIELD',
              id: thing.id,
              fieldSetId: null,
              fieldId: null,
              customFieldId: customId,
              page: null,
            },
          ],
        })
      ).output,
      { shown: 1 },
    );
  };
  ai.creation = 'create_task';
  ai.failOnce = true;
  await request('POST', `/conversations/${chat.id}/messages`, input);
  const failed = (await wait(chat.id)).message;
  assert.equal(failed.status, 'FAILED');
  assert.equal(
    failed.cards.filter(
      (card) =>
        card.type === 'FIELD' &&
        (card.fieldId === 'common.serialNumber' ||
          card.fieldId === 'common.width' ||
          card.customFieldId),
    ).length,
    3,
  );
  let refreshed = '';
  while (!refreshed.includes('000123')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    refreshed += new TextDecoder().decode(chunk.value);
  }
  controller.abort();
  const saved = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.ok(saved.revision > thing.revision);
  assert.ok(saved.fieldSets.some((set) => set.id === 'appliances.appliance'));
  assert.ok(saved.fieldSets.some((set) => set.id === 'appliances.dimensions'));
  assert.equal(
    saved.standaloneFields.find((field) => field.id === 'common.serialNumber')?.value,
    '000123',
  );
  assert.equal(
    saved.standaloneFields.find((field) => field.id === 'common.serialNumber')?.origin,
    'USER',
  );
  assert.equal(
    saved.standaloneFields.find((field) => field.id === 'common.serialNumber')?.autoPopulate,
    false,
  );
  const custom = saved.customFields[0];
  await request('PATCH', `/things/${thing.id}`, {
    values: [{ fieldSetId: null, fieldId: 'common.serialNumber', value: 'owner-edit' }],
  });
  await request('POST', `/conversations/${chat.id}/messages`, input);
  const retried = (await wait(chat.id)).message;
  assert.equal(retried.status, 'COMPLETE');
  const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.equal(
    after.standaloneFields.find((field) => field.id === 'common.serialNumber')?.value,
    'owner-edit',
  );
  assert.equal(after.customFields.length, 1);
  assert.equal(after.customFields[0].id, custom.id);
  assert.equal((await request('GET', `/tasks?thingId=${thing.id}`)).json().items.length, 1);
  assert.ok(
    retried.cards.some((card) => card.type === 'FIELD' && card.customFieldId === custom.id),
  );
  ai.creation = undefined;
  ai.probe = async (_context, execute) => {
    await execute('search_fields', { labels: [{ label: 'Serial number', context: '' }] });
    const edited = await execute('update_thing_fields', {
      thingId: thing.id,
      addFieldSetIds: [],
      values: [{ fieldSetId: null, fieldId: 'common.serialNumber', value: null, source: null }],
      customFields: [
        {
          customFieldId: custom.id,
          label: 'Filter size',
          value: 'Large',
          sensitive: false,
          scope: 'CLASS',
          source: null,
        },
      ],
    });
    assert.ok(!('error' in (edited.output as object)));
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Clear the serial and update the filter size',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  const edited = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.equal(
    edited.standaloneFields.find((field) => field.id === 'common.serialNumber')?.value,
    null,
  );
  assert.equal(
    edited.standaloneFields.find((field) => field.id === 'common.serialNumber')?.autoPopulate,
    false,
  );
  assert.equal(edited.customFields[0].value, 'Large');
});

test('chat field validation rejects unread Things, unknown fields, invalid values and import conflicts', async () => {
  const { thing, chat } = await setup();
  const unread = await setup();
  const foreign = await setup('bob');
  ai.probe = async (_input, execute) => {
    const patch: ChatFieldInput = {
      thingId: thing.id,
      addFieldSetIds: [],
      values: [{ fieldSetId: null, fieldId: 'common.model', value: 'Example', source: null }],
      customFields: [],
    };
    for (const thingId of [unread.thing.id, foreign.thing.id])
      assert.deepEqual((await execute('update_thing_fields', { ...patch, thingId })).output, {
        error: 'Read the Thing first',
      });
    assert.deepEqual((await execute('update_thing_fields', patch)).output, {
      error: 'Search for the registry field first',
    });
    await execute('search_fields', {
      labels: [
        { label: 'common.model', context: '' },
        { label: 'common.width', context: '' },
      ],
    });
    for (const values of [
      [{ ...patch.values[0], fieldId: 'missing.field' }],
      [{ ...patch.values[0], value: false }],
      [
        {
          fieldSetId: 'appliances.dimensions',
          fieldId: 'common.width',
          value: '60 cm',
          source: null,
        },
      ],
      [patch.values[0], { ...patch.values[0], fieldId: 'missing.field' }],
    ]) {
      assert.ok(
        'error' in ((await execute('update_thing_fields', { ...patch, values })).output as object),
      );
    }
    const owner = (await pool.query('select owner_id from bt.things where id=$1', [thing.id]))
      .rows[0].owner_id;
    const id = randomUUID();
    await pool.query(
      "insert into bt.imports(id,owner_id,target_thing_id,status) values($1,$2,$3,'MAPPING')",
      [id, owner, thing.id],
    );
    try {
      assert.deepEqual((await execute('update_thing_fields', patch)).output, {
        error: 'Thing is processing an import; try again after it finishes',
      });
    } finally {
      await pool.query('delete from bt.imports where id=$1', [id]);
    }
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Try invalid changes',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.equal(after.revision, thing.revision);
  assert.equal(after.standaloneFields.length, 0);
});

test('chat field values keep retrieved attachment pages and research URLs while masking secrets', async (t) => {
  const { thing, chat } = await setup();
  const boundary = 'field-source';
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Example manual.');
  pdf.addPage().drawText('Model: Sample 10.');
  const upload = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer alice',
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="manual.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      Buffer.from(await pdf.save()),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  assert.equal(upload.statusCode, 201, upload.body);
  const file = upload.json<Schema['Attachment']>();
  await pool.query('update bt.attachments set page_count=$2 where id=$1', [
    file.id,
    pdf.getPageCount(),
  ]);
  // Link the source without queuing an Import, which would block the requested field edit.
  await pool.query(
    'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) select id,$2,owner_id from bt.things where id=$1',
    [thing.id, file.id],
  );
  const sourceUrl = 'https://manufacturer.example/specification';
  t.mock.method(ai, 'research', async () => ({
    text: 'Public colour: blue.',
    sources: [sourceUrl],
  }));
  ai.probe = async (_input, execute) => {
    await execute('search_fields', { labels: [{ label: 'common.model', context: '' }] });
    const patch: ChatFieldInput = {
      thingId: thing.id,
      addFieldSetIds: [],
      values: [
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'common.model',
          value: 'Sample 10',
          source: { attachmentId: file.id, page: 2, url: null },
        },
      ],
      customFields: [],
    };
    assert.deepEqual((await execute('update_thing_fields', patch)).output, {
      error: 'Read the attachment first',
    });
    await execute('read_attachment', { attachmentId: file.id, includeImages: null });
    assert.deepEqual(
      (
        await execute('update_thing_fields', {
          ...patch,
          values: [{ ...patch.values[0], source: { attachmentId: file.id, page: 3, url: null } }],
        })
      ).output,
      { error: 'Invalid attachment page' },
    );
    assert.deepEqual(
      (
        await execute('update_thing_fields', {
          ...patch,
          values: [
            { ...patch.values[0], source: { attachmentId: null, page: null, url: sourceUrl } },
          ],
        })
      ).output,
      { error: 'Use a source returned by research' },
    );
    await execute('research', { thingId: thing.id, question: 'What colour is this model?' });
    const saved = await execute('update_thing_fields', {
      ...patch,
      customFields: [
        {
          customFieldId: null,
          label: 'Colour',
          value: 'Blue',
          sensitive: false,
          scope: 'CLASS',
          source: { attachmentId: null, page: null, url: sourceUrl },
        },
        {
          customFieldId: null,
          label: 'Access code',
          value: 'private-0042',
          sensitive: true,
          scope: 'INSTANCE',
          source: null,
        },
      ],
    });
    assert.ok(!JSON.stringify(saved.output).includes('private-0042'));
    assert.ok(!('error' in (saved.output as object)), JSON.stringify(saved.output));
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Save the model and colour, and my access code',
    requestId: randomUUID(),
  });
  const result = (await wait(chat.id)).message;
  assert.equal(result.status, 'COMPLETE');
  assert.ok(!JSON.stringify(result).includes('private-0042'));
  const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  const model = after.fieldSets
    .find((set) => set.id === 'appliances.appliance')!
    .fields.find((field) => field.id === 'common.model')!;
  assert.equal(model.origin, 'IMPORT');
  assert.equal(model.autoPopulate, false);
  assert.deepEqual(model.sourceRefs, [{ attachmentId: file.id, page: 2 }]);
  const colour = after.customFields.find((field) => field.label === 'Colour')!;
  const secret = after.customFields.find((field) => field.label === 'Access code')!;
  assert.equal(colour.origin, 'DISCOVERY');
  assert.equal(colour.autoPopulate, false);
  assert.deepEqual(colour.sourceRefs, [{ url: sourceUrl }]);
  assert.equal(secret.value, null);
  assert.deepEqual(secret.sourceRefs, []);
  const stored = (
    await pool.query(
      'select value,auto_populate from bt.thing_fields where thing_id=$1 and field_key=$2',
      [thing.id, `local:${secret.id}`],
    )
  ).rows[0];
  assert.equal(stored.value, 'private-0042');
  assert.equal(stored.auto_populate, false);
});

// Selecting changed custom fields by their returned positions could cite an untouched field.
test('chat field cards identify the edited custom field after database ordering', async () => {
  const { thing, chat } = await setup();
  const saved = (
    await request('PATCH', `/things/${thing.id}`, {
      customFields: [
        { label: 'First custom field', value: 'Original', sensitive: false },
        { label: 'Second custom field', value: 'Original', sensitive: false },
      ],
    })
  ).json<Schema['Thing']>();
  const [edited, untouched] = [...saved.customFields].sort((a, b) => a.id.localeCompare(b.id));
  ai.probe = async (_input, execute) => {
    await execute('update_thing_fields', {
      thingId: thing.id,
      addFieldSetIds: [],
      values: [],
      customFields: [
        {
          customFieldId: edited.id,
          label: edited.label,
          value: 'Changed',
          sensitive: false,
          scope: 'INSTANCE',
          source: null,
        },
      ],
    });
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Change the custom field',
    requestId: randomUUID(),
  });
  const result = (await wait(chat.id)).message;
  assert.equal(result.status, 'COMPLETE');
  assert.ok(result.cards.some((card) => card.type === 'FIELD' && card.customFieldId === edited.id));
  assert.ok(
    !result.cards.some((card) => card.type === 'FIELD' && card.customFieldId === untouched.id),
  );
  const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.equal(after.customFields.find((field) => field.id === untouched.id)?.value, 'Original');
});

test('a field receipt persistence failure rolls back the field write and allows retry', async () => {
  const { thing, chat } = await setup();
  const input = { text: 'Save the model', requestId: randomUUID() };
  ai.probe = async (_input, execute) => {
    await execute('search_fields', { labels: [{ label: 'common.model', context: '' }] });
    await execute('update_thing_fields', {
      thingId: thing.id,
      addFieldSetIds: [],
      values: [{ fieldSetId: null, fieldId: 'common.model', value: 'Sample 10', source: null }],
      customFields: [],
    });
  };
  await pool.query(`create function bt.reject_field_receipt() returns trigger language plpgsql as $$
    begin
      if new.tool_results @> '[{"key":"update_thing_fields"}]'::jsonb then
        raise exception 'Synthetic receipt persistence failure';
      end if;
      return new;
    end $$;
    create trigger reject_field_receipt before update of tool_results on bt.messages
    for each row execute function bt.reject_field_receipt()`);
  try {
    await request('POST', `/conversations/${chat.id}/messages`, input);
    assert.equal((await wait(chat.id)).message.status, 'FAILED');
    const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
    assert.equal(after.revision, thing.revision);
    assert.equal(after.standaloneFields.length, 0);
  } finally {
    await pool.query(
      'drop trigger reject_field_receipt on bt.messages; drop function bt.reject_field_receipt()',
    );
  }
  await request('POST', `/conversations/${chat.id}/messages`, input);
  assert.equal((await wait(chat.id)).message.status, 'COMPLETE');
  const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.equal(
    after.standaloneFields.find((field) => field.id === 'common.model')?.value,
    'Sample 10',
  );
});

// PR #154 counted already-displayed fields twice and rejected updates below the distinct-card limit.
for (const newFieldCount of [0, 4, 5])
  test(`chat field card limit counts identities with ${newFieldCount} new custom fields`, async () => {
    const { thing, chat } = await setup();
    const saved = (
      await request('PATCH', `/things/${thing.id}`, {
        values: [{ fieldSetId: null, fieldId: 'common.model', value: 'Before' }],
        customFields: Array.from({ length: 18 }, (_, index) => ({
          label: `Example ${index}`,
          value: 'Before',
          sensitive: false,
        })),
      })
    ).json<Schema['Thing']>();
    const cardAddress = { fieldSetId: null, fieldId: null, customFieldId: null, page: null };
    const selected = [
      { ...cardAddress, type: 'THING' as const, id: thing.id },
      { ...cardAddress, type: 'FIELD' as const, id: thing.id, fieldId: 'common.model' },
      ...saved.customFields.map((field) => ({
        ...cardAddress,
        type: 'FIELD' as const,
        id: thing.id,
        customFieldId: field.id,
      })),
    ];
    const patch: ChatFieldInput = {
      thingId: thing.id,
      addFieldSetIds: [],
      values: [{ fieldSetId: null, fieldId: 'common.model', value: 'After', source: null }],
      customFields: [
        ...saved.customFields.slice(0, 4).map((field) => ({
          customFieldId: field.id,
          label: field.label,
          value: 'After',
          sensitive: false,
          scope: field.scope,
          source: null,
        })),
        ...Array.from({ length: newFieldCount }, (_, index) => ({
          customFieldId: null,
          label: `New ${index}`,
          value: 'After',
          sensitive: false,
          scope: 'INSTANCE' as const,
          source: null,
        })),
      ],
    };
    let output: unknown;
    ai.probe = async (_input, execute) => {
      await execute('search_fields', { labels: [{ label: 'common.model', context: '' }] });
      for (let index = 0; index < selected.length; index += 12)
        assert.deepEqual(
          (await execute('show_cards', { cards: selected.slice(index, index + 12) })).output,
          { shown: Math.min(12, selected.length - index) },
        );
      output = (await execute('update_thing_fields', patch)).output;
    };
    await request('POST', `/conversations/${chat.id}/messages`, {
      text: 'Update the displayed fields',
      requestId: randomUUID(),
    });
    const result = (await wait(chat.id)).message;
    assert.equal(result.status, 'COMPLETE');
    const after = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
    if (newFieldCount === 5) {
      assert.deepEqual(output, { error: 'Assistant card limit' });
      assert.equal(after.revision, saved.revision);
      assert.equal(after.customFields.length, saved.customFields.length);
      assert.equal(
        after.standaloneFields.find((field) => field.id === 'common.model')?.value,
        'Before',
      );
      assert.equal(result.cards.length, 20);
    } else {
      assert.ok(
        output && typeof output === 'object' && !('error' in output),
        JSON.stringify(output),
      );
      assert.equal(after.customFields.length, saved.customFields.length + newFieldCount);
      assert.equal(
        after.standaloneFields.find((field) => field.id === 'common.model')?.value,
        'After',
      );
      for (const field of patch.customFields.filter((field) => field.customFieldId))
        assert.equal(
          after.customFields.find((stored) => stored.id === field.customFieldId)?.value,
          'After',
        );
      assert.equal(result.cards.length, 20 + newFieldCount);
    }
  });
