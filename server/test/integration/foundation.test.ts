import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { createPool, transaction } from '../../src/db/connection.js';
import { seedRegistry } from '../../src/db/registry-seed.js';
const url = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
assert.ok(
  ['localhost', '127.0.0.1'].includes(url.hostname),
  'Integration tests require a local database',
);
const database = 'bt_test_' + randomUUID().replaceAll('-', '');
const admin = createPool(url.toString());
url.pathname = '/' + database;
const pool = createPool(url.toString());
let app: FastifyInstance;
let directory: string;
const verifyIdentity = async (token: string) => {
  if (!['alice', 'bob'].includes(token)) throw new Error('bad token');
  return { subject: token };
};
const request = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
async function create(input: Partial<Schema['ThingCreate']> = {}, owner = 'alice') {
  const res = await request(
    'POST',
    '/things',
    { name: 'Test thing', categoryId: 'other', ...input },
    owner,
  );
  assert.equal(res.statusCode, 201, res.body);
  return res.json<Schema['Thing']>();
}
before(async () => {
  directory = await mkdtemp(tmpdir() + '/boring-test-');
  await admin.query(`create database ${database}`);
  await pool.query(
    await readFile(
      new URL('../../../supabase/migrations/20260929000000_foundation.sql', import.meta.url),
      'utf8',
    ),
  );
  await transaction(pool, seedRegistry);
  app = await buildApp({
    pool,
    config: {
      ...readConfig(),
      blobDirectory: directory,
      sampleDataEnabled: true,
      maxUploadBytes: 64,
    },
    verifyIdentity,
  });
  await app.ready();
});
after(async () => {
  await app?.close();
  await pool.end();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test('all private routes require authentication and unknown tokens fail', async () => {
  for (const path of [
    '/profile',
    '/categories',
    '/things',
    '/tags',
    '/attachments',
    '/events',
    '/issues',
    '/purchasables',
  ])
    assert.equal((await app.inject('/api' + path)).statusCode, 401, path);
  assert.equal((await request('GET', '/things', undefined, 'bad')).statusCode, 401);
  assert.equal((await app.inject('/api/config')).statusCode, 200);
});
test('isolation covers reads, edits, reveal, lists and relationships', async () => {
  const thing = await create({
    categoryId: 'memberships',
    addFieldSetIds: ['memberships.museum'],
    values: [{ fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin', value: '0098' }],
  });
  for (const [method, path, body] of [
    ['GET', `/things/${thing.id}`, undefined],
    ['PATCH', `/things/${thing.id}`, { name: 'stolen' }],
    ['DELETE', `/things/${thing.id}`, undefined],
    [
      'POST',
      `/things/${thing.id}:reveal-field`,
      { fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin' },
    ],
  ] as const) {
    const response = await request(method, path, body, 'bob');
    assert.equal(response.statusCode, 404, method + ' ' + path + ' ' + response.body);
  }
  assert.equal((await request('GET', '/things', undefined, 'bob')).json().items.length, 0);
  const tag = (await request('POST', '/tags', { name: 'Private' }, 'bob')).json();
  assert.equal(
    (await request('PATCH', `/things/${thing.id}`, { tagIds: [tag.id] })).statusCode,
    422,
  );
  assert.equal(
    (await request('POST', '/issues', { thingId: thing.id, title: 'Not mine' }, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('POST', '/conversations', { thingId: thing.id }, 'bob')).statusCode,
    404,
  );
  const body = (await request('GET', `/things/${thing.id}`)).body;
  assert.ok(!body.includes('0098'));
  const reveal = await request('POST', `/things/${thing.id}:reveal-field`, {
    fieldSetId: 'memberships.museum',
    fieldId: 'membership.accessPin',
  });
  assert.equal(reveal.statusCode, 200, reveal.body);
  assert.equal(reveal.json().value, '0098');
  assert.match(reveal.headers['cache-control'] as string, /no-store/);
});
test('contract rejects unknown properties and invalid references; category counts are owner-scoped', async () => {
  assert.equal(
    (await request('POST', '/things', { name: 'x', categoryId: 'other', ownerId: randomUUID() }))
      .statusCode,
    422,
  );
  assert.equal(
    (await request('POST', '/things', { name: 'x', categoryId: 'invented' })).statusCode,
    422,
  );
  assert.equal((await request('GET', '/things/not-a-uuid')).statusCode, 422);
  assert.ok(
    (await request('GET', '/categories', undefined, 'bob'))
      .json()
      .items.every((c: Schema['Category']) => c.thingCount === 0),
  );
  assert.equal((await request('GET', '/things?limit=0')).statusCode, 422);
});
test('concurrent field patches preserve each other and insurance values stay independent', async () => {
  const thing = await create({ categoryId: 'insurance', addFieldSetIds: ['insurance.combined'] });
  const edits = await Promise.all(
    ['buildings', 'contents'].map((part, i) =>
      request('PATCH', `/things/${thing.id}`, {
        values: [
          {
            fieldSetId: 'insurance.' + part,
            fieldId: 'insurance.sumInsured',
            value: { amountMinor: (i + 1) * 10000, currency: 'GBP' },
          },
        ],
      }),
    ),
  );
  edits.forEach((r) => assert.equal(r.statusCode, 200, r.body));
  const result = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.deepEqual(result.fieldSets.find((s) => s.id === 'insurance.buildings')!.fields[0].value, {
    amountMinor: 10000,
    currency: 'GBP',
  });
  assert.deepEqual(result.fieldSets.find((s) => s.id === 'insurance.contents')!.fields[0].value, {
    amountMinor: 20000,
    currency: 'GBP',
  });
  assert.equal(result.fieldSets.find((s) => s.id === 'insurance.contents')!.fields[1].value, null);
});
async function upload(content = 'manual', type = 'text/plain', owner = 'alice') {
  const boundary = 'test-boundary';
  return app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer ' + owner,
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="manual.txt"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  });
}
test('shared attachments, authorized downloads, unlinking and retained-import deletion checks', async () => {
  const a = await create(),
    b = await create();
  const uploaded = await upload();
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const file = uploaded.json<Schema['Attachment']>();
  for (const thing of [a, b])
    assert.equal(
      (await request('PUT', `/attachments/${file.id}/things/${thing.id}`)).statusCode,
      204,
    );
  assert.equal(
    (await request('GET', `/attachments/${file.id}/content`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('PUT', `/attachments/${file.id}/things/${a.id}`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal((await request('DELETE', `/attachments/${file.id}`)).statusCode, 409);
  assert.equal((await request('DELETE', `/things/${a.id}`)).statusCode, 204);
  assert.equal((await request('GET', `/attachments/${file.id}/content`)).body, 'manual');
  assert.equal((await request('DELETE', `/attachments/${file.id}/things/${b.id}`)).statusCode, 204);
  const owner = (await request('GET', '/profile')).json().id;
  await pool.query("insert into bt.imports(owner_id,attachment_id,status) values($1,$2,'failed')", [
    owner,
    file.id,
  ]);
  assert.equal((await request('DELETE', `/attachments/${file.id}`)).statusCode, 409);
  await pool.query('delete from bt.imports where attachment_id=$1', [file.id]);
  assert.equal((await request('DELETE', `/attachments/${file.id}`)).statusCode, 204);
});
test('upload limits and content type checks are enforced', async () => {
  assert.equal((await upload('x'.repeat(100))).statusCode, 413);
  assert.equal((await upload('not a png', 'image/png')).statusCode, 415);
  assert.equal((await upload('<svg/>', 'image/svg+xml')).statusCode, 415);
});
test('activity transitions and conversation/message persistence are owner-scoped', async () => {
  const thing = await create();
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'A problem' })
  ).json();
  assert.equal((await request('GET', `/issues/${issue.id}`, undefined, 'bob')).statusCode, 404);
  assert.equal(
    (await request('POST', '/events', { thingId: thing.id, title: 'Task', status: 'scheduled' }))
      .statusCode,
    422,
  );
  const event = (
    await request('POST', '/events', { thingId: thing.id, title: 'Task', issueId: issue.id })
  ).json();
  const changed = await request('PATCH', `/events/${event.id}`, {
    status: 'scheduled',
    startsAt: '2026-10-01T09:00:00Z',
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const conversation = (await request('POST', '/conversations', { thingId: thing.id })).json();
  await pool.query(
    "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'user','A stored message','complete')",
    [conversation.id, randomUUID()],
  );
  assert.equal(
    (await request('GET', `/conversations/${conversation.id}`)).json().messages.length,
    1,
  );
  assert.equal(
    (await request('GET', `/conversations/${conversation.id}`, undefined, 'bob')).statusCode,
    404,
  );
  await request('DELETE', `/things/${thing.id}`);
  assert.equal((await request('GET', `/events/${event.id}`)).statusCode, 404);
  assert.equal((await request('GET', `/conversations/${conversation.id}`)).statusCode, 404);
  assert.equal(
    (await pool.query('select 1 from bt.messages where conversation_id=$1', [conversation.id]))
      .rowCount,
    0,
  );
});
test('sample data is explicit, labelled and idempotent', async () => {
  const before = (await request('GET', '/things?limit=100')).json().items.length;
  const result = await request('POST', '/profile:seed-samples');
  assert.equal(result.statusCode, 200, result.body);
  await request('POST', '/profile:seed-samples');
  const after = (await request('GET', '/things?limit=100')).json().items;
  assert.equal(after.length, before + 4);
  assert.equal(after.filter((t: Schema['ThingSummary']) => t.isSample).length, 4);
  const purchases = (await request('GET', '/purchasables')).json().items;
  assert.equal(purchases.length, 3);
  assert.ok(purchases.every((p: Schema['Purchasable']) => p.isSample));
  assert.equal((await request('GET', '/purchasables', undefined, 'bob')).json().items.length, 0);
});
test('private schema cannot be accessed by Supabase browser roles', async () => {
  const { rows } = await pool.query(
    "select has_schema_privilege('anon','bt','usage') as anon,has_schema_privilege('authenticated','bt','usage') as authenticated",
  );
  assert.deepEqual(rows[0], { anon: false, authenticated: false });
});
test('stored data survives application restart', async () => {
  const thing = await create({ name: 'Persists' });
  await app.close();
  app = await buildApp({
    pool,
    config: { ...readConfig(), blobDirectory: directory },
    verifyIdentity,
  });
  assert.equal((await request('GET', `/things/${thing.id}`)).json().name, 'Persists');
});
