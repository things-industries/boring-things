import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
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
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  }
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
test('appliance purchase details persist through reseeding with registry icons', async () => {
  const values = [
    { fieldId: 'appliances.purchaseDate', value: '2022-03-12' },
    { fieldId: 'appliances.warrantyEnd', value: '2027-03-12' },
    { fieldId: 'appliances.retailer', value: 'Example retailer' },
  ].map((value) => ({ ...value, fieldSetId: 'appliances.appliance' }));
  const thing = await create({
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.bosch'],
    values,
    pinnedFields: [{ fieldSetId: 'appliances.appliance', fieldId: 'appliances.purchaseDate' }],
  });
  await transaction(pool, seedRegistry);
  const saved = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  const appliance = saved.fieldSets.find((set) => set.id === 'appliances.appliance')!;
  for (const value of values) {
    const field = appliance.fields.find((field) => field.id === value.fieldId)!;
    assert.equal(field.value, value.value);
    assert.ok(field.icon);
    const definition = (await request('GET', `/fields/${value.fieldId}`)).json();
    assert.equal(definition.icon, field.icon);
  }
  assert.deepEqual(saved.pinnedFields, thing.pinnedFields);
  const invalid = await request('PATCH', `/things/${thing.id}`, {
    values: [{ ...values[0], value: '2022-02-30' }],
  });
  assert.equal(invalid.statusCode, 422, invalid.body);
  assert.equal((await request('GET', `/things/${thing.id}`, undefined, 'bob')).statusCode, 404);
});
test('isolation covers reads, edits, reveal, lists and relationships', async () => {
  const thing = await create({
    categoryId: 'memberships',
    addFieldSetIds: ['memberships.museum'],
    values: [
      {
        fieldSetId: 'memberships.museum',
        fieldId: 'membership.accessPin',
        value: '0098',
      },
    ],
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
    (
      await request('POST', '/things', {
        name: 'x',
        categoryId: 'other',
        ownerId: randomUUID(),
      })
    ).statusCode,
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
  const thing = await create({
    categoryId: 'insurance',
    addFieldSetIds: ['insurance.combined'],
  });
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
  await pool.query("insert into bt.imports(owner_id,attachment_id,status) values($1,$2,'FAILED')", [
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
test('attachment metadata edits are partial, owner-scoped and shared without changing downloads', async () => {
  const file = (await upload()).json<Schema['Attachment']>();
  assert.equal(file.title, null);
  assert.equal(file.pageCount, null);
  assert.deepEqual(file.metadataSources, {});
  const a = await create(),
    b = await create();
  for (const thing of [a, b]) await request('PUT', `/attachments/${file.id}/things/${thing.id}`);
  const revisions = await Promise.all(
    [a, b].map(async (thing) => (await request('GET', `/things/${thing.id}`)).json().revision),
  );
  const path = `/attachments/${file.id}`;
  assert.equal((await request('PATCH', path, { title: 'Foreign edit' }, 'bob')).statusCode, 404);
  assert.equal(
    (await app.inject({ method: 'PATCH', url: '/api' + path, payload: { title: 'Anonymous' } }))
      .statusCode,
    401,
  );
  for (const patch of [
    { pageCount: 44 },
    { filename: 'changed.pdf' },
    { metadataSources: {} },
    { documentType: 'UNKNOWN' },
    { documentDate: '2026-02-30' },
    { documentDate: '0000-01-01' },
    { title: '   ' },
    {},
  ])
    assert.equal((await request('PATCH', path, patch)).statusCode, 422);
  const edits = await Promise.all([
    request('PATCH', path, { title: '  Owner manual  ', documentType: 'MANUAL' }),
    request('PATCH', path, { publisher: 'Example manufacturer', documentDate: '2022-03-12' }),
  ]);
  for (const edit of edits) assert.equal(edit.statusCode, 200, edit.body);
  const saved = (await request('GET', path)).json<Schema['Attachment']>();
  assert.equal(saved.title, 'Owner manual');
  assert.equal(saved.publisher, 'Example manufacturer');
  assert.equal(saved.documentDate, '2022-03-12');
  assert.deepEqual(saved.metadataSources.title, { origin: 'USER', sourceRefs: [] });
  for (const [index, thing] of [a, b].entries()) {
    assert.ok((await request('GET', `/things/${thing.id}`)).json().revision > revisions[index]);
    assert.equal(
      (await request('GET', `/attachments?thingId=${thing.id}`)).json().items[0].title,
      saved.title,
    );
  }
  const cleared = (await request('PATCH', path, { title: null })).json<Schema['Attachment']>();
  assert.equal(cleared.title, null);
  assert.equal(cleared.publisher, saved.publisher);
  assert.equal(cleared.metadataSources.title?.origin, 'USER');
  assert.equal(cleared.filename, file.filename);
  const download = await request('GET', `${path}/content`);
  assert.equal(download.body, 'manual');
  assert.ok(String(download.headers['content-disposition']).includes(file.filename));
  assert.ok(!JSON.stringify(cleared).includes('storageKey'));
});
test('activity transitions and conversation/message persistence are owner-scoped', async () => {
  const thing = await create();
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'A problem' })
  ).json();
  assert.equal((await request('GET', `/issues/${issue.id}`, undefined, 'bob')).statusCode, 404);
  assert.equal(
    (
      await request('POST', '/events', {
        thingId: thing.id,
        title: 'Task',
        status: 'SCHEDULED',
      })
    ).statusCode,
    422,
  );
  const event = (
    await request('POST', '/events', {
      thingId: thing.id,
      title: 'Task',
      issueId: issue.id,
    })
  ).json();
  const changed = await request('PATCH', `/events/${event.id}`, {
    status: 'SCHEDULED',
    startsAt: '2026-10-01T09:00:00Z',
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const conversation = (await request('POST', '/conversations', { thingId: thing.id })).json();
  await pool.query(
    "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'USER','A stored message','COMPLETE')",
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

test('Issue status text and due dates preserve omission, clear with null and stay owner-scoped', async () => {
  const thing = await create();
  const res = await request('POST', '/issues', {
    thingId: thing.id,
    title: 'Renew cover',
    statusText: 'Renewal due',
    dueDate: '2026-10-12',
  });
  assert.equal(res.statusCode, 201, res.body);
  const issue = res.json<Schema['Issue']>();
  assert.equal(issue.dueDate, '2026-10-12');
  const path = `/issues/${issue.id}`;
  const changed = await request('PATCH', path, { title: 'Review cover' });
  assert.equal(changed.json().statusText, 'Renewal due');
  assert.equal(changed.json().dueDate, '2026-10-12');
  for (const dueDate of ['2026-02-30', '2026-10-12T12:00:00Z'])
    assert.equal((await request('PATCH', path, { dueDate })).statusCode, 422);
  assert.equal((await request('PATCH', path, { statusText: 'x'.repeat(501) })).statusCode, 422);
  assert.equal((await request('PATCH', path, { dueDate: null }, 'bob')).statusCode, 404);
  const listed = (await request('GET', `/issues?thingId=${thing.id}`)).json().items[0];
  assert.equal(listed.statusText, 'Renewal due');
  assert.equal(listed.dueDate, '2026-10-12');
  const cleared = await request('PATCH', path, {
    statusText: null,
    dueDate: null,
    status: 'RESOLVED',
  });
  assert.equal(cleared.json().statusText, null);
  assert.equal(cleared.json().dueDate, null);
  assert.ok(cleared.json().resolvedAt);
  assert.equal((await request('PATCH', path, { statusText: '' })).json().statusText, '');
});

test('date-only Events retain calendar dates, enforce one schedule and filter mixed schedules by viewer timezone', async () => {
  const thing = await create();
  const add = async (schedule: object, title = 'Task') => {
    const res = await request('POST', '/events', {
      thingId: thing.id,
      title,
      status: 'SCHEDULED',
      ...schedule,
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json<Schema['Event']>();
  };
  const day = await add({ startsOn: '2026-10-25' }, 'Date only');
  const before = await add({ startsAt: '2026-10-24T22:30:00Z' }, 'Previous local day');
  const timed = await add({ startsAt: '2026-10-25T09:00:00Z' }, 'Timed');
  const after = await add({ startsOn: '2026-10-26' }, 'Next day');
  assert.equal(day.startsAt, null);
  assert.equal(day.startsOn, '2026-10-25');
  const path = `/events/${day.id}`;
  assert.equal((await request('GET', path)).json().startsOn, '2026-10-25');
  assert.equal(
    (await request('PATCH', path, { title: 'Clean oven' })).json().startsOn,
    '2026-10-25',
  );
  for (const patch of [
    { startsAt: '2026-10-25T09:00:00Z' },
    { startsOn: null },
    { startsOn: '2026-02-30' },
    { startsOn: '2026-10-25T00:00:00Z' },
  ])
    assert.equal((await request('PATCH', path, patch)).statusCode, 422, JSON.stringify(patch));
  assert.equal((await request('PATCH', path, { startsOn: '2026-11-01' }, 'bob')).statusCode, 404);
  assert.equal(
    (
      await request('POST', '/events', {
        thingId: thing.id,
        title: 'Both',
        startsOn: '2026-10-25',
        startsAt: '2026-10-25T09:00:00Z',
      })
    ).statusCode,
    422,
  );
  const query = new URLSearchParams({
    thingId: thing.id,
    timeZone: 'Europe/London',
    from: '2026-10-24T23:00:00Z',
    to: '2026-10-25T23:59:59Z',
    limit: '1',
  });
  const first = (await request('GET', '/events?' + query)).json();
  assert.deepEqual(
    first.items.map((e: Schema['Event']) => e.id),
    [day.id],
  );
  query.set('cursor', first.nextCursor);
  const second = (await request('GET', '/events?' + query)).json();
  assert.deepEqual(
    second.items.map((e: Schema['Event']) => e.id),
    [timed.id],
  );
  assert.equal(second.nextCursor, null);
  query.delete('cursor');
  query.set('limit', '100');
  query.set('from', '2026-10-25T12:00:00Z');
  const afternoon = (await request('GET', '/events?' + query)).json();
  assert.deepEqual(
    afternoon.items.map((e: Schema['Event']) => e.id),
    [day.id],
  );
  const all = (await request('GET', `/events?thingId=${thing.id}&timeZone=Europe%2FLondon`)).json();
  assert.deepEqual(
    all.items.map((e: Schema['Event']) => e.id),
    [before.id, day.id, timed.id, after.id],
  );
  assert.equal((await request('GET', '/events?timeZone=Invalid%2FZone')).statusCode, 422);
  const switched = await request('PATCH', path, {
    startsOn: null,
    startsAt: '2026-10-25T10:00:00Z',
  });
  assert.equal(switched.statusCode, 200, switched.body);
  assert.equal(switched.json().startsOn, null);
  const back = await request('PATCH', path, { startsAt: null, startsOn: '2026-10-25' });
  assert.equal(back.statusCode, 200, back.body);
  const done = await request('PATCH', path, { status: 'COMPLETED' });
  assert.equal(done.json().startsOn, '2026-10-25');
  assert.ok(done.json().completedAt);
});

test('explicit Thing views increment atomically without changing content timestamps and support paginated rankings', async () => {
  const a = await create({ name: 'Usage fixture A' }),
    b = await create({ name: 'Usage fixture B' }),
    c = await create({ name: 'Usage fixture C' });
  assert.equal(a.accessCount, 0);
  assert.equal(a.lastViewedAt, null);
  for (let i = 0; i < 2; i++) await request('GET', `/things/${a.id}`);
  assert.equal((await request('GET', `/things/${a.id}`)).json().accessCount, 0);
  const path = `/things/${a.id}:view`;
  assert.equal((await app.inject({ method: 'POST', url: '/api' + path })).statusCode, 401);
  assert.equal((await request('POST', path, undefined, 'bob')).statusCode, 404);
  const views = await Promise.all(Array.from({ length: 8 }, () => request('POST', path)));
  views.forEach((res) => assert.equal(res.statusCode, 200, res.body));
  assert.deepEqual(
    views.map((res) => res.json().accessCount).sort((x, y) => x - y),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  const viewed = (await request('GET', `/things/${a.id}`)).json<Schema['Thing']>();
  assert.equal(viewed.accessCount, 8);
  assert.ok(viewed.lastViewedAt);
  assert.equal(viewed.updatedAt, a.updatedAt);
  assert.equal(viewed.revision, a.revision);
  await request('POST', `/things/${b.id}:view`);
  const list = async (sort: string, cursor?: string) =>
    (
      await request(
        'GET',
        '/things?' +
          new URLSearchParams({
            q: 'Usage fixture',
            sort,
            limit: '1',
            ...(cursor ? { cursor } : {}),
          }),
      )
    ).json();
  const frequent = await list('MOST_VIEWED');
  assert.equal(frequent.items[0].id, a.id);
  assert.equal(frequent.items[0].accessCount, 8);
  const next = await list('MOST_VIEWED', frequent.nextCursor);
  assert.equal(next.items[0].id, b.id);
  assert.equal((await list('MOST_VIEWED', next.nextCursor)).items[0].id, c.id);
  assert.equal((await list('RECENTLY_VIEWED')).items[0].id, b.id);
  assert.equal((await list('UPDATED')).items[0].id, c.id);
  const edited = await request('PATCH', `/things/${a.id}`, { description: 'An edit' });
  assert.equal(edited.json().accessCount, 8);
  assert.notEqual(edited.json().updatedAt, a.updatedAt);
  assert.equal((await list('UPDATED')).items[0].id, a.id);
  assert.equal((await request('GET', '/things?sort=INVENTED')).statusCode, 422);
  assert.equal(
    (await request('GET', '/things?sort=MOST_VIEWED&q=Usage%20fixture', undefined, 'bob')).json()
      .items.length,
    0,
  );
});
