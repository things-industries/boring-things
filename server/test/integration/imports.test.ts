import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { FixtureAi } from '../fixtures/imports.js';
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
const ai = new FixtureAi();
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
    importAi: ai,
    config: {
      ...readConfig(),
      blobDirectory: directory,
      sampleDataEnabled: true,
      maxUploadBytes: 4096,
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
async function start(source: string, thingId?: string) {
  const boundary = 'import-boundary';
  const file = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer alice',
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="source.txt"\r\nContent-Type: text/plain\r\n\r\n${source}\r\n--${boundary}--\r\n`,
  });
  assert.equal(file.statusCode, 201, file.body);
  const response = await request('POST', '/things:import', {
    attachmentId: file.json().id,
    ...(thingId ? { thingId } : {}),
  });
  assert.equal(response.statusCode, 202, response.body);
  return response.json<Schema['ImportAccepted']>();
}
async function wait(
  id: string,
  states = ['complete', 'incomplete', 'failed', 'awaiting_selection'],
) {
  const deadline = Date.now() + 10000;
  do {
    const response = await request('GET', `/imports/${id}`);
    assert.equal(response.statusCode, 200, response.body);
    const job = response.json<Schema['Import']>();
    if (states.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  throw new Error('Import timed out');
}
test('immediate skeleton, progressive empty sets, source retention, string IDs and unknown fields', async () => {
  let release!: () => void;
  ai.pause = new Promise((resolve) => {
    release = resolve;
  });
  const accepted = await start('neff');
  const initial = await request('GET', `/things/${accepted.thingId}`);
  assert.equal(initial.statusCode, 200);
  const deadline = Date.now() + 5000;
  let thing: Schema['Thing'];
  do {
    thing = (await request('GET', `/things/${accepted.thingId}`)).json();
    if (thing.fieldSets.length) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  assert.ok(thing!.fieldSets.length);
  assert.equal(
    thing!.fieldSets
      .find((s) => s.id === 'appliances.neff')!
      .fields.find((f) => f.id === 'appliances.zNumber')!.value,
    null,
  );
  assert.equal(
    (await request('PATCH', `/things/${accepted.thingId}`, { name: 'Race' })).statusCode,
    409,
  );
  release();
  ai.pause = undefined;
  const job = await wait(accepted.importId);
  assert.equal(job.status, 'complete', JSON.stringify(job));
  thing = (await request('GET', `/things/${accepted.thingId}`)).json();
  assert.equal(
    thing.fieldSets
      .find((s) => s.id === 'appliances.neff')!
      .fields.find((f) => f.id === 'appliances.zNumber')!.value,
    '0015',
  );
  assert.equal(thing.undefinedFields.length, 1);
  assert.equal(thing.undefinedFields[0].value, 'ABC-12');
  assert.equal(
    (await pool.query('select extraction from bt.imports where id=$1', [job.id])).rows[0].extraction
      .text,
    'neff',
  );
  assert.equal(job.usage.toolCalls[0].name, 'search_field_sets');
  assert.equal(job.usage.inputTokens, 100);
  assert.equal((await request('GET', `/imports/${job.id}`, undefined, 'bob')).statusCode, 404);
  assert.equal(
    (await request('POST', `/imports/${job.id}:retry`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('GET', `/things/${accepted.thingId}/stream`, undefined, 'bob')).statusCode,
    404,
  );
});
test('van inclusion and independent buildings/contents values', async () => {
  for (const source of ['van', 'policy']) {
    const accepted = await start(source),
      job = await wait(accepted.importId);
    assert.equal(job.status, 'complete', JSON.stringify(job));
    const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
    if (source === 'van') assert.ok(thing.fieldSets.some((s) => s.id === 'vehicles.vehicle'));
    else {
      assert.deepEqual(
        thing.fieldSets.find((s) => s.id === 'insurance.buildings')!.fields[0].value,
        { amountMinor: 40000000, currency: 'GBP' },
      );
      assert.deepEqual(
        thing.fieldSets.find((s) => s.id === 'insurance.contents')!.fields[0].value,
        { amountMinor: 5000000, currency: 'GBP' },
      );
    }
  }
});
test('multiple candidates require confirmation and reuse one shared attachment', async () => {
  const accepted = await start('two'),
    job = await wait(accepted.importId);
  assert.equal(job.status, 'awaiting_selection');
  assert.equal(job.thingIds.length, 0);
  const response = await request('POST', `/imports/${job.id}:confirm`, {
    selections: job.candidates.map((c) => ({ candidateId: c.id, targetThingId: null })),
  });
  assert.equal(response.statusCode, 200, response.body);
  const done = await wait(job.id);
  assert.equal(done.status, 'complete', JSON.stringify(done));
  assert.equal(done.thingIds[0], accepted.thingId);
  assert.equal(done.thingIds.length, 2);
  for (const id of done.thingIds)
    assert.ok(
      (await request('GET', `/things/${id}`))
        .json<Schema['Thing']>()
        .attachmentIds.includes(job.attachmentId),
    );
  assert.equal(
    (await request('POST', `/imports/${job.id}:confirm`, { selections: [] })).statusCode,
    422,
  );
});
test('failed mapping retry reuses targets, preserves user edits and has no duplicate facts', async () => {
  ai.failOnce = true;
  const accepted = await start('neff'),
    failed = await wait(accepted.importId);
  assert.equal(failed.status, 'incomplete');
  const edit = await request('PATCH', `/things/${accepted.thingId}`, {
    values: [{ fieldSetId: 'appliances.neff', fieldId: 'appliances.zNumber', value: '0099' }],
  });
  assert.equal(edit.statusCode, 200, edit.body);
  const retry = await request('POST', `/imports/${failed.id}:retry`);
  assert.equal(retry.statusCode, 200, retry.body);
  const done = await wait(failed.id);
  assert.equal(done.status, 'complete', JSON.stringify(done));
  assert.deepEqual(done.thingIds, [accepted.thingId]);
  const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.equal(
    thing.fieldSets
      .find((s) => s.id === 'appliances.neff')!
      .fields.find((f) => f.id === 'appliances.zNumber')!.value,
    '0099',
  );
  assert.equal(new Set(thing.undefinedFields.map((f) => f.id)).size, thing.undefinedFields.length);
  assert.equal((await request('POST', `/imports/${failed.id}:retry`)).statusCode, 409);
});
test('arbitrary model IDs never enter storage and tool exhaustion preserves partial data', async () => {
  ai.arbitraryId = true;
  const accepted = await start('neff');
  assert.equal((await wait(accepted.importId)).status, 'incomplete');
  let thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.equal(thing.fieldSets.length, 0);
  assert.equal(thing.undefinedFields.length, 2);
  ai.arbitraryId = false;
  ai.exhaustTools = true;
  const bounded = await start('neff'),
    job = await wait(bounded.importId);
  assert.equal(job.error, 'tool_limit');
  assert.equal(job.usage.toolCalls.length, 4);
  thing = (await request('GET', `/things/${bounded.thingId}`)).json();
  assert.ok(thing.fieldSets.length);
  assert.equal(thing.undefinedFields.length, 2);
  ai.exhaustTools = false;
});
test('all-existing confirmation removes untouched skeleton and redirects to selected target', async () => {
  const existing = await create({ categoryId: 'appliances', name: 'Existing hob' });
  const accepted = await start('two'),
    job = await wait(accepted.importId);
  const response = await request('POST', `/imports/${job.id}:confirm`, {
    selections: [{ candidateId: job.candidates[0].id, targetThingId: existing.id }],
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().thingId, existing.id);
  assert.equal((await wait(job.id)).status, 'complete');
  assert.equal((await request('GET', `/things/${accepted.thingId}`)).statusCode, 404);
  assert.equal((await request('GET', `/things/${existing.id}`)).json().name, 'Existing hob');
});
test('SSE reconnect sends persisted snapshots, updates after commit and masks sensitive fields', async () => {
  const thing = await create({
    categoryId: 'memberships',
    addFieldSetIds: ['memberships.museum'],
    values: [
      { fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin', value: '123456' },
    ],
  });
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  async function connect() {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/things/${thing.id}/stream`, {
      headers: { authorization: 'Bearer alice' },
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const reader = response.body!.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    return {
      controller,
      reader,
      async next() {
        while (true) {
          const end = buffer.indexOf('\n\n');
          if (end >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (frame.includes('event: thing.snapshot')) {
              assert.ok(!frame.includes('123456'));
              return JSON.parse(
                frame
                  .split('\n')
                  .find((l) => l.startsWith('data: '))!
                  .slice(6),
              ) as Schema['Thing'];
            }
          }
          const read = await reader.read();
          assert.ok(!read.done);
          buffer += decoder.decode(read.value, { stream: true });
        }
      },
    };
  }
  const stream = await connect();
  const first = await stream.next();
  await request('PATCH', `/things/${thing.id}`, { name: 'Updated after connect' });
  const second = await stream.next();
  assert.ok(second.revision > first.revision);
  assert.equal(second.name, 'Updated after connect');
  stream.controller.abort();
  await stream.reader.cancel().catch(() => {});
  const again = await connect();
  assert.equal((await again.next()).revision, second.revision);
  again.controller.abort();
  await again.reader.cancel().catch(() => {});
});
test('restart marks interrupted jobs retryable and queued work resumes without duplicate results', async () => {
  const accepted = await start('neff');
  const job = await wait(accepted.importId);
  await app.close();
  await pool.query("update bt.imports set status='mapping' where id=$1", [job.id]);
  app = await buildApp({
    pool,
    config: { ...readConfig(), blobDirectory: directory },
    importAi: ai,
    verifyIdentity,
  });
  await app.ready();
  const interrupted = (await request('GET', `/imports/${job.id}`)).json<Schema['Import']>();
  assert.equal(interrupted.status, 'failed');
  assert.equal(interrupted.error, 'interrupted');
  assert.equal((await request('POST', `/imports/${job.id}:retry`)).statusCode, 200);
  const done = await wait(job.id);
  assert.equal(done.status, 'complete');
  assert.deepEqual(done.thingIds, [accepted.thingId]);
});

test('discovery persists cited resources once and preserves edits on repeated writes', async () => {
  const { persistDiscovery } = await import('../../src/application/discovery.js');
  const { ownedImport, targets } = await import('../../src/db/imports.js');
  const { LocalBlobs } = await import('../../src/providers/blobs.js');
  const accepted = await start('neff');
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await ownedImport(pool, owner, accepted.importId),
    [target] = await targets(pool, job);
  const discovery = {
    sources: ['https://example.com/manual', 'https://example.com/product'],
    items: [
      {
        kind: 'reference' as const,
        title: 'Manual reference',
        description: 'Synthetic model source',
        url: 'https://example.com/manual',
        sourceUrl: 'https://example.com/manual',
      },
      {
        kind: 'maintenance' as const,
        title: 'Clean filter',
        description: 'Synthetic cited task',
        url: 'https://example.com/manual',
        sourceUrl: 'https://example.com/manual',
      },
      {
        kind: 'consumable' as const,
        title: 'Filter',
        description: 'Synthetic cited compatibility',
        url: 'https://example.com/product',
        sourceUrl: 'https://example.com/manual',
      },
    ],
  };
  const blobs = new LocalBlobs(directory);
  const options = { maxBytes: 4096, signal: new AbortController().signal };
  const pdf = Buffer.from('%PDF-1.7\nSynthetic manual\n%%EOF');
  let downloads = 0;
  const download = async () => {
    downloads++;
    return pdf;
  };
  await persistDiscovery(pool, blobs, job, target, discovery, options, download);
  const event = (await request('GET', `/events?thingId=${accepted.thingId}`)).json().items[0];
  await request('PATCH', `/events/${event.id}`, { status: 'dismissed' });
  await persistDiscovery(pool, blobs, job, target, discovery, options, download);
  assert.equal(downloads, 1);
  const files = (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json<
    Schema['AttachmentList']
  >().items;
  const manual = files.find((file) => file.mediaType === 'application/pdf')!;
  assert.equal(manual.filename, 'Manual reference.pdf');
  assert.equal(manual.sourceUrl, 'https://example.com/manual');
  assert.deepEqual((await request('GET', `/attachments/${manual.id}/content`)).rawPayload, pdf);
  assert.equal(
    (await request('GET', `/attachments/${manual.id}/content`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('GET', `/events?thingId=${accepted.thingId}`)).json().items.length,
    1,
  );
  assert.equal((await request('GET', `/events/${event.id}`)).json().status, 'dismissed');
  const purchases = (await request('GET', `/purchasables?thingId=${accepted.thingId}`)).json()
    .items;
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].price, null);
  assert.equal(purchases[0].sourceRefs[0].url, 'https://example.com/manual');
  assert.equal(
    (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json().items.length,
    2,
  );
  await assert.rejects(
    persistDiscovery(
      pool,
      blobs,
      job,
      target,
      {
        ...discovery,
        items: [{ ...discovery.items[0], url: 'https://invented.example/source' }],
      },
      options,
      download,
    ),
  );
});

test('discovered names use only owner collisions and preserve existing or edited names', async () => {
  const { persistDiscovery } = await import('../../src/application/discovery.js');
  const { ownedImport, targets } = await import('../../src/db/imports.js');
  const { LocalBlobs } = await import('../../src/providers/blobs.js');
  await create({ name: 'Bosch Oven' }, 'bob');
  const accepted = await start('neff');
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await ownedImport(pool, owner, accepted.importId);
  const [target] = await targets(pool, job);
  const blobs = new LocalBlobs(directory);
  const options = { maxBytes: 4096, signal: new AbortController().signal };
  const discovery = {
    identity: { name: 'Bosch Oven', sourceUrl: 'https://example.com/oven' },
    items: [],
    sources: ['https://example.com/oven'],
  };
  await persistDiscovery(pool, blobs, job, target, discovery, options);
  assert.equal((await request('GET', `/things/${target.thingId}`)).json().name, 'Bosch Oven');
  await create({ name: 'Bosch Oven' });
  assert.equal(
    (
      await request('PATCH', `/things/${target.thingId}`, {
        values: [
          { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'SYNTHETIC/01' },
        ],
      })
    ).statusCode,
    200,
  );
  await persistDiscovery(pool, blobs, job, target, discovery, options);
  assert.equal(
    (await request('GET', `/things/${target.thingId}`)).json().name,
    'Bosch Oven (SYNTHETIC/01)',
  );
  await persistDiscovery(pool, blobs, job, target, discovery, options);
  assert.equal(
    (await request('GET', `/things/${target.thingId}`)).json().name,
    'Bosch Oven (SYNTHETIC/01)',
  );
  await request('PATCH', `/things/${target.thingId}`, { name: 'Kitchen oven' });
  await persistDiscovery(pool, blobs, job, target, discovery, options);
  assert.equal((await request('GET', `/things/${target.thingId}`)).json().name, 'Kitchen oven');
  const existing = await create({ name: 'Existing oven', categoryId: 'appliances' });
  const other = await start('neff', existing.id);
  await wait(other.importId);
  const otherJob = await ownedImport(pool, owner, other.importId);
  const [otherTarget] = await targets(pool, otherJob);
  await persistDiscovery(pool, blobs, otherJob, otherTarget, discovery, options);
  assert.equal((await request('GET', `/things/${existing.id}`)).json().name, 'Existing oven');
  await assert.rejects(
    persistDiscovery(
      pool,
      blobs,
      job,
      target,
      { ...discovery, identity: { name: 'Invented', sourceUrl: 'https://uncited.example/' } },
      options,
    ),
  );
});

test('failed PDF downloads preserve other results and retries skip saved files; HTML creates no attachment', async () => {
  const { persistDiscovery } = await import('../../src/application/discovery.js');
  const { ownedImport, targets } = await import('../../src/db/imports.js');
  const { LocalBlobs } = await import('../../src/providers/blobs.js');
  const accepted = await start('neff');
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await ownedImport(pool, owner, accepted.importId);
  const [target] = await targets(pool, job);
  const blobs = new LocalBlobs(directory);
  const options = { maxBytes: 4096, signal: new AbortController().signal };
  const sources = [
    'https://example.com/a.pdf',
    'https://example.com/b.pdf',
    'https://example.com/page',
  ];
  const discovery = {
    sources,
    items: sources.map((url, i) => ({
      kind: 'reference' as const,
      title: `Document ${i}`,
      description: '',
      url,
      sourceUrl: url,
    })),
  };
  const pdf = Buffer.from('%PDF-1.7\nSynthetic manual\n%%EOF');
  const files = async () =>
    (await request('GET', `/attachments?thingId=${target.thingId}`)).json<
      Schema['AttachmentList']
    >().items;
  await assert.rejects(
    persistDiscovery(pool, blobs, job, target, discovery, options, async (url) => {
      if (url === sources[0]) throw new Error('download failed');
      return url === sources[2] ? null : pdf;
    }),
  );
  assert.equal((await files()).length, 2);
  const fetched: string[] = [];
  await persistDiscovery(pool, blobs, job, target, discovery, options, async (url) => {
    fetched.push(url);
    return url === sources[2] ? null : pdf;
  });
  assert.deepEqual(fetched, [sources[0], sources[2]]);
  assert.equal((await files()).length, 3);
  assert.equal((await files()).filter((file) => file.mediaType === 'application/pdf').length, 2);
});
