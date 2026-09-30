import { test, before, after } from 'node:test';
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
import { seedRegistry } from '../../src/db/registry-seed.js';
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
    pool,
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
    intent: 'CREATE_EVENT',
  };
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
  assert.equal(
    (
      await request('POST', `/conversations/${chat.id}/messages`, {
        ...input,
        requestId: randomUUID(),
        intent: 'CREATE_ISSUE',
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
    intent: 'ANSWER',
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
test('tool owner checks reject guessed Thing IDs and new writes need matching intent', async () => {
  const foreign = await setup('bob');
  const { chat } = await setup();
  ai.foreignThing = foreign.thing.id;
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Read another Thing',
    intent: 'ANSWER',
    requestId: randomUUID(),
  });
  const failed = await wait(chat.id);
  assert.equal(failed.message.status, 'FAILED');
  assert.equal(failed.message.text, '');
  ai.foreignThing = undefined;
});
test('restart retains activity and marks interrupted messages retryable', async () => {
  const { chat, thing } = await setup();
  const input = {
    text: 'Create maintenance',
    intent: 'CREATE_EVENT',
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

test('write intent and deadline are enforced even when the provider requests a write', async () => {
  const { thing, chat } = await setup();
  ai.probe = async (_input, execute) => {
    await execute('create_event', {
      thingId: thing.id,
      title: 'Unauthorised',
      description: '',
    });
  };
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Just answer a question',
    intent: 'ANSWER',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.status, 'FAILED');
  assert.equal((await request('GET', `/events?thingId=${thing.id}`)).json().items.length, 0);
  ai.probe = undefined;
  let release!: () => void;
  ai.pause = new Promise((r) => {
    release = r;
  });
  await request('POST', `/conversations/${chat.id}/messages`, {
    text: 'Create an event',
    intent: 'CREATE_EVENT',
    requestId: randomUUID(),
  });
  assert.equal((await wait(chat.id)).message.error, 'timeout');
  release();
  ai.pause = undefined;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await request('GET', `/events?thingId=${thing.id}`)).json().items.length, 0);
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
    intent: 'ANSWER',
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
    { text: 'Read another file', intent: 'ANSWER', requestId: randomUUID() },
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
    intent: 'ANSWER',
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
