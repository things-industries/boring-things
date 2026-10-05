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
import * as database from '../../src/db/connection.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { PDFDocument } from 'pdf-lib';
import type { Discovery, ImportAi, AiContext } from '../../src/application/import/types.js';
import {
  researchThing,
  type ImportResearchOptions,
} from '../../src/application/import/research.js';
import { Registry } from '../../src/application/registry/registry.js';
import { ApplicationEvents } from '../../src/application/events.js';
import * as importsDb from '../../src/db/entities/imports.js';
import { LocalBlobs } from '../../src/providers/blobs/local.js';
import { DocumentSizeError } from '../../src/lib/document-limits.js';
const url = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
assert.ok(
  ['localhost', '127.0.0.1'].includes(url.hostname),
  'Integration tests require a local database',
);
const databaseName = 'bt_test_' + randomUUID().replaceAll('-', '');
const admin = database.createPool(url.toString());
url.pathname = '/' + databaseName;
const pool = database.createPool(url.toString());
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
  await admin.query(`create database ${databaseName}`);
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  }
  await database.transaction(pool, registrySeedDb.seedRegistry);
  app = await buildApp({
    dbPool: pool,
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
  await admin.query(`drop database if exists ${databaseName} with (force)`);
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
  states = ['COMPLETE', 'INCOMPLETE', 'FAILED', 'AWAITING_SELECTION'],
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
test('PDF uploads derive page counts and extraction preserves metadata edits and clears across retries', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const boundary = 'metadata-boundary';
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer alice',
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="source.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const file = uploaded.json<Schema['Attachment']>();
  assert.equal(file.pageCount, 2);
  const path = `/attachments/${file.id}`;
  try {
    ai.metadata = {
      title: 'Imported manual',
      documentType: 'MANUAL',
      publisher: 'Maker',
      documentDate: null,
    };
    ai.failOnce = true;
    const started = (await request('POST', '/things:import', { attachmentId: file.id })).json<
      Schema['ImportAccepted']
    >();
    assert.equal((await wait(started.importId)).status, 'INCOMPLETE');
    const extracted = (await request('GET', path)).json<Schema['Attachment']>();
    assert.equal(extracted.title, 'Imported manual');
    assert.deepEqual(extracted.metadataSources.publisher, {
      origin: 'IMPORT',
      sourceRefs: [{ attachmentId: file.id }],
    });
    assert.equal(
      (await request('PATCH', path, { title: 'My manual', publisher: null })).statusCode,
      200,
    );
    await request('POST', `/imports/${started.importId}:retry`);
    assert.equal((await wait(started.importId)).status, 'COMPLETE');
    ai.metadata = {
      title: 'Replacement title',
      publisher: 'Replacement publisher',
      documentType: 'OTHER',
      documentDate: '2022-03-12',
    };
    const second = (
      await request('POST', '/things:import', { attachmentId: file.id, thingId: started.thingId })
    ).json<Schema['ImportAccepted']>();
    assert.equal((await wait(second.importId)).status, 'COMPLETE');
    const saved = (await request('GET', path)).json<Schema['Attachment']>();
    assert.equal(saved.title, 'My manual');
    assert.equal(saved.publisher, null);
    assert.equal(saved.documentType, 'MANUAL');
    assert.equal(saved.documentDate, '2022-03-12');
    assert.equal(saved.metadataSources.publisher?.origin, 'USER');
    assert.equal(saved.pageCount, 2);
    assert.deepEqual((await request('GET', `${path}/content`)).rawPayload, bytes);
  } finally {
    ai.metadata = undefined;
    ai.failOnce = false;
  }
});
test('camera imports retain the uploaded filename and persist a descriptive display title', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const bytes = await createCanvas(10, 10).encode('png');
  const boundary = 'camera-boundary';
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer alice',
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="IMG_1234.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const file = uploaded.json<Schema['Attachment']>();
  try {
    ai.metadata = {
      title: 'Data plate photo',
      documentType: null,
      publisher: null,
      documentDate: null,
    };
    const accepted = (await request('POST', '/things:import', { attachmentId: file.id })).json<
      Schema['ImportAccepted']
    >();
    assert.equal((await wait(accepted.importId)).status, 'COMPLETE');
    const saved = (await request('GET', `/attachments/${file.id}`)).json<Schema['Attachment']>();
    assert.equal(saved.filename, 'IMG_1234.png');
    assert.equal(saved.title, 'Data plate photo');
    assert.equal(saved.metadataSources.title?.origin, 'IMPORT');
  } finally {
    ai.metadata = undefined;
  }
});

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
  assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
  thing = (await request('GET', `/things/${accepted.thingId}`)).json();
  assert.equal(
    thing.fieldSets
      .find((s) => s.id === 'appliances.neff')!
      .fields.find((f) => f.id === 'appliances.zNumber')!.value,
    '0015',
  );
  assert.equal(thing.customFields.length, 1);
  assert.equal(thing.customFields[0].value, 'ABC-12');
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
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
    if (source === 'van') assert.ok(thing.fieldSets.some((s) => s.id === 'vehicles.vehicle'));
    else {
      assert.deepEqual(
        thing.fieldSets
          .find((s) => s.id === 'insurance.buildings')!
          .fields.find((field) => field.id === 'insurance.sumInsured')!.value,
        { amountMinor: 40000000, currency: 'GBP' },
      );
      assert.deepEqual(
        thing.fieldSets
          .find((s) => s.id === 'insurance.contents')!
          .fields.find((field) => field.id === 'insurance.sumInsured')!.value,
        { amountMinor: 5000000, currency: 'GBP' },
      );
    }
  }
});
test('multiple candidates require confirmation and reuse one shared attachment', async () => {
  const accepted = await start('two'),
    job = await wait(accepted.importId);
  assert.equal(job.status, 'AWAITING_SELECTION');
  assert.equal(job.thingIds.length, 0);
  const response = await request('POST', `/imports/${job.id}:confirm`, {
    selections: job.candidates.map((c) => ({
      candidateId: c.id,
      targetThingId: null,
    })),
  });
  assert.equal(response.statusCode, 200, response.body);
  const done = await wait(job.id);
  assert.equal(done.status, 'COMPLETE', JSON.stringify(done));
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
  assert.equal(failed.status, 'INCOMPLETE');
  const edit = await request('PATCH', `/things/${accepted.thingId}`, {
    values: [
      {
        fieldSetId: 'appliances.neff',
        fieldId: 'appliances.zNumber',
        value: '0099',
      },
    ],
  });
  assert.equal(edit.statusCode, 200, edit.body);
  const retry = await request('POST', `/imports/${failed.id}:retry`);
  assert.equal(retry.statusCode, 200, retry.body);
  const done = await wait(failed.id);
  assert.equal(done.status, 'COMPLETE', JSON.stringify(done));
  assert.deepEqual(done.thingIds, [accepted.thingId]);
  const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.equal(
    thing.fieldSets
      .find((s) => s.id === 'appliances.neff')!
      .fields.find((f) => f.id === 'appliances.zNumber')!.value,
    '0099',
  );
  assert.equal(new Set(thing.customFields.map((f) => f.id)).size, thing.customFields.length);
  assert.equal((await request('POST', `/imports/${failed.id}:retry`)).statusCode, 409);
});
test('application fact batches have separate tool budgets, reject out-of-batch values and retry saved extraction', async (t) => {
  const originalExtract = ai.extract.bind(ai);
  const originalSelect = ai.selectFieldSets.bind(ai);
  const originalMap = ai.mapFacts.bind(ai);
  let extractions = 0;
  const batches: number[] = [];
  let invalidBatch = true;
  t.mock.method(ai, 'selectFieldSets', async (...args: Parameters<typeof ai.selectFieldSets>) => {
    const [subject, tools] = args;
    for (let call = 0; call < 2; call++)
      await tools.searchFieldSets(subject.categoryId, subject.terms);
    return originalSelect(...args);
  });
  t.mock.method(ai, 'extract', async (...args: Parameters<typeof ai.extract>) => {
    extractions++;
    const extraction = await originalExtract(...args);
    const subject = extraction.extractedThings[0];
    subject.facts.push(
      ...Array.from({ length: 19 }, (_, i) => ({
        ...subject.facts[1],
        id: `fact-${i + 3}`,
        label: `Installer reference ${i + 3}`,
      })),
    );
    return extraction;
  });
  t.mock.method(ai, 'mapFacts', async (...args: Parameters<typeof ai.mapFacts>) => {
    const [subject, facts, selectedSets, tools] = args;
    assert.equal(subject.name, 'Neff hob');
    assert.equal(subject.facts.length, 21);
    assert.deepEqual(
      selectedSets.map((set) => set.id),
      ['appliances.appliance', 'appliances.neff'],
    );
    assert.ok(
      selectedSets.some((set) => set.fields.some((field) => field.id === 'appliances.zNumber')),
    );
    batches.push(facts.length);
    if (facts.length === 1)
      await tools.searchFields([{ label: 'Installer reference', context: '' }]);
    if (facts.length === 1 && invalidBatch) {
      invalidBatch = false;
      return {
        customFactIds: [],
        discardedFactIds: [],
        values: [
          {
            factId: 'fact-1',
            fieldSetId: 'appliances.neff',
            fieldId: 'appliances.zNumber',
            value: '0015',
            pin: false,
          },
        ],
      };
    }
    return originalMap(...args);
  });
  const accepted = await start('neff');
  const failed = await wait(accepted.importId);
  assert.equal(failed.status, 'INCOMPLETE');
  assert.equal(failed.error, 'import_failed');
  const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.equal(
    thing.fieldSets
      .find((s) => s.id === 'appliances.neff')!
      .fields.find((f) => f.id === 'appliances.zNumber')!.value,
    '0015',
  );
  assert.deepEqual(batches, [20, 1]);
  assert.equal(thing.customFields.length, 19);
  assert.equal((await request('POST', `/imports/${accepted.importId}:retry`)).statusCode, 200);
  const completed = await wait(accepted.importId);
  assert.equal(completed.status, 'COMPLETE', JSON.stringify(completed));
  assert.deepEqual(completed.thingIds, [accepted.thingId]);
  assert.equal(extractions, 1);
  assert.deepEqual(batches, [20, 1, 1]);
});
test('fact decisions and Thing values roll back together, then retry preserves selection and source', async (t) => {
  const extract = ai.extract.bind(ai),
    select = ai.selectFieldSets.bind(ai),
    map = ai.mapFacts.bind(ai);
  let selections = 0;
  t.mock.method(ai, 'extract', async (...args: Parameters<typeof ai.extract>) => {
    const result = await extract(...args);
    result.extractedThings[0].facts.push({
      id: 'fact-3',
      label: 'Additional label marking',
      value: 'V/C',
      quote: 'V/C',
      page: null,
      sensitive: false,
    });
    return result;
  });
  t.mock.method(ai, 'selectFieldSets', async (...args: Parameters<typeof ai.selectFieldSets>) => {
    selections++;
    return select(...args);
  });
  t.mock.method(ai, 'mapFacts', async (...args: Parameters<typeof ai.mapFacts>) => {
    const result = await map(...args);
    return { ...result, customFactIds: ['fact-2'], discardedFactIds: ['fact-3'] };
  });
  await pool.query(
    "alter table bt.imports add constraint test_checkpoint_rejection check (jsonb_array_length(coalesce(extraction->'candidates'->0->'mapping'->'batches', '[]'::jsonb))=0) not valid",
  );
  const accepted = await start('neff');
  try {
    assert.equal((await wait(accepted.importId)).status, 'INCOMPLETE');
    const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
    assert.equal(thing.customFields.length, 0);
    assert.equal(
      thing.fieldSets
        .find((set) => set.id === 'appliances.neff')!
        .fields.find((field) => field.id === 'appliances.zNumber')!.value,
      null,
    );
  } finally {
    await pool.query('alter table bt.imports drop constraint test_checkpoint_rejection');
  }
  assert.equal((await request('POST', `/imports/${accepted.importId}:retry`)).statusCode, 200);
  const done = await wait(accepted.importId);
  assert.equal(done.status, 'COMPLETE');
  assert.equal(selections, 1);
  assert.equal('extraction' in done, false);
  const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.deepEqual(
    thing.customFields.map((field) => field.value),
    ['ABC-12'],
  );
  assert.ok(thing.attachmentIds.includes(done.attachmentId));
  const [saved] = await database.rows<{
    extraction: { candidates: { mapping: { batches: { discardedFactIds: string[] }[] } }[] };
  }>(pool, 'select extraction from bt.imports where id=$1', [accepted.importId]);
  assert.deepEqual(saved.extraction.candidates[0].mapping.batches[0].discardedFactIds, ['fact-3']);
});

test('arbitrary model IDs never enter storage and tool exhaustion preserves partial data', async () => {
  ai.arbitraryId = true;
  const accepted = await start('neff');
  assert.equal((await wait(accepted.importId)).status, 'INCOMPLETE');
  let thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.equal(thing.fieldSets.length, 0);
  assert.equal(thing.customFields.length, 0);
  ai.arbitraryId = false;
  ai.exhaustTools = true;
  const bounded = await start('neff'),
    job = await wait(bounded.importId);
  assert.equal(job.error, 'tool_limit');
  assert.equal(job.usage.toolCalls.filter((call) => call.name === 'search_field_sets').length, 1);
  assert.equal(job.usage.toolCalls.filter((call) => call.name === 'search_fields').length, 4);
  thing = (await request('GET', `/things/${bounded.thingId}`)).json();
  assert.ok(thing.fieldSets.length);
  assert.equal(thing.customFields.length, 0);
  ai.exhaustTools = false;
});
test('all-existing confirmation removes untouched skeleton and redirects to selected target', async () => {
  const existing = await create({
    categoryId: 'appliances',
    name: 'Existing hob',
  });
  const accepted = await start('two'),
    job = await wait(accepted.importId);
  const response = await request('POST', `/imports/${job.id}:confirm`, {
    selections: [{ candidateId: job.candidates[0].id, targetThingId: existing.id }],
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().thingId, existing.id);
  assert.equal((await wait(job.id)).status, 'COMPLETE');
  assert.equal((await request('GET', `/things/${accepted.thingId}`)).statusCode, 404);
  assert.equal((await request('GET', `/things/${existing.id}`)).json().name, 'Existing hob');
});
test('SSE reconnect sends persisted snapshots, updates after commit and masks sensitive fields', async () => {
  const thing = await create({
    categoryId: 'memberships',
    addFieldSetIds: ['memberships.museum', 'memberships.access'],
    values: [
      {
        fieldSetId: 'memberships.access',
        fieldId: 'membership.accessPin',
        value: '123456',
      },
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
  await request('PATCH', `/things/${thing.id}`, {
    name: 'Updated after connect',
  });
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
  await pool.query("update bt.imports set status='MAPPING' where id=$1", [job.id]);
  app = await buildApp({
    dbPool: pool,
    config: { ...readConfig(), blobDirectory: directory },
    importAi: ai,
    verifyIdentity,
  });
  await app.ready();
  const interrupted = (await request('GET', `/imports/${job.id}`)).json<Schema['Import']>();
  assert.equal(interrupted.status, 'FAILED');
  assert.equal(interrupted.error, 'interrupted');
  assert.equal((await request('POST', `/imports/${job.id}:retry`)).statusCode, 200);
  const done = await wait(job.id);
  assert.equal(done.status, 'COMPLETE');
  assert.deepEqual(done.thingIds, [accepted.thingId]);
});

async function researchRunner(
  accepted: { importId: string; thingId: string },
  discovery: Discovery | ImportAi['findResources'],
  options: ImportResearchOptions,
  input: {
    extractDocument?: ImportAi['extractDocument'];
    events?: ApplicationEvents;
    record?: AiContext['record'];
  } = {},
) {
  const patched = await request('PATCH', `/things/${accepted.thingId}`, {
    values: [
      { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'SYNTHETIC/01' },
    ],
  });
  assert.equal(patched.statusCode, 200, patched.body);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await importsDb.getOwnedImportOrThrow(pool, owner, accepted.importId);
  const researchAi: ImportAi = new FixtureAi();
  researchAi.findResources = typeof discovery === 'function' ? discovery : async () => discovery;
  researchAi.extractDocument =
    input.extractDocument ??
    (async () => ({
      metadata: null,
      applicable: true,
      applicability: { page: 1, quote: 'Synthetic manual' },
      values: [],
    }));
  return async (overrides: Partial<ImportResearchOptions> = {}) => {
    const [target] = await importsDb.listImportTargets(pool, job);
    await researchThing(
      pool,
      new Registry(registrySeedDb.fields, registrySeedDb.sets),
      new LocalBlobs(directory),
      researchAi,
      input.events ?? new ApplicationEvents(),
      job,
      target,
      { signal: new AbortController().signal, record: input.record ?? (async () => {}) },
      { ...options, ...overrides },
    );
    return (await request('GET', `/imports/${job.id}`)).json<Schema['Import']>();
  };
}

test('imported documents preserve metadata, ownership and edits across retries', async () => {
  const accepted = await start('neff');
  await wait(accepted.importId);
  const url = 'https://example.com/manual.pdf';
  const sourceUrl = 'https://example.com/support';
  const discovery = {
    sources: [url, sourceUrl],
    items: [
      {
        kind: 'reference' as const,
        title: 'Manual reference',
        description: 'Synthetic model source',
        url,
        sourceUrl,
        metadata: {
          title: 'Oven manual',
          documentType: 'MANUAL' as const,
          publisher: 'Example maker',
          documentDate: '2022-03-12',
        },
      },
    ],
  };
  const document = await PDFDocument.create();
  document.addPage();
  const pdf = Buffer.from(await document.save());
  let downloads = 0,
    extractions = 0;
  const run = await researchRunner(
    accepted,
    discovery,
    {
      maxBytes: 4096,
      searchCalls: 3,
      download: async () => {
        downloads++;
        return pdf;
      },
    },
    {
      extractDocument: async () => {
        extractions++;
        return {
          metadata: {
            title: 'Content oven manual',
            documentType: 'MANUAL',
            publisher: 'Content maker',
            documentDate: null,
          },
          applicable: true,
          applicability: { page: 1, quote: 'Synthetic manual' },
          values: [],
        };
      },
    },
  );
  await run();
  await pool.query(
    "update bt.import_targets set discovery=jsonb_set(discovery,'{documentBatches}', (select jsonb_agg(batch || '{\"firstPage\":1,\"lastPage\":1}'::jsonb) from jsonb_array_elements(discovery->'documentBatches') batch)) where import_id=$1",
    [accepted.importId],
  );
  await run();
  assert.equal(extractions, 2);
  assert.equal(downloads, 1);
  const files = (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json<
    Schema['AttachmentList']
  >().items;
  const manual = files.find((file) => file.mediaType === 'application/pdf')!;
  assert.equal(manual.filename, 'Content oven manual.pdf');
  assert.equal(manual.title, 'Content oven manual');
  assert.equal(manual.documentType, 'MANUAL');
  assert.equal(manual.publisher, 'Content maker');
  assert.equal(manual.documentDate, '2022-03-12');
  assert.equal(manual.pageCount, 1);
  assert.deepEqual(manual.metadataSources.documentDate, {
    origin: 'DISCOVERY',
    sourceRefs: [{ url: sourceUrl }],
  });
  assert.deepEqual(manual.metadataSources.title, { origin: 'DISCOVERY', sourceRefs: [{ url }] });
  await request('PATCH', `/attachments/${manual.id}`, { title: 'My oven manual', publisher: null });
  await pool.query(
    "update bt.import_targets set discovery=discovery - 'documentBatches' where import_id=$1",
    [accepted.importId],
  );
  await run();
  const edited = (await request('GET', `/attachments/${manual.id}`)).json<Schema['Attachment']>();
  assert.equal(edited.title, 'My oven manual');
  assert.equal(edited.publisher, null);
  assert.equal(downloads, 1);
  assert.equal(manual.sourceUrl, url);
  assert.deepEqual((await request('GET', `/attachments/${manual.id}/content`)).rawPayload, pdf);
  assert.equal(
    (await request('GET', `/attachments/${manual.id}/content`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json().items.length,
    2,
  );
  const { validateResource } = await import('../../src/application/import/resources.js');
  assert.throws(() =>
    validateResource({ ...discovery.items[0], url: 'https://invented.example/source' }, [url]),
  );
});

test('rejected documents leave no blobs or warnings and allow three applicable references', async () => {
  const accepted = await start('neff');
  await wait(accepted.importId);
  const urls = ['wrong', 'first', 'second', 'third', 'fourth'].map(
    (name) => `https://example.com/${name}.pdf`,
  );
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Synthetic manual');
  const bytes = Buffer.from(await pdf.save());
  const downloaded: string[] = [];
  const run = await researchRunner(
    accepted,
    {
      sources: urls,
      items: urls.map((url) => ({
        kind: 'reference',
        title: 'Search title',
        description: 'Synthetic source',
        url,
        sourceUrl: url,
      })),
    },
    {
      maxBytes: 4096,
      searchCalls: 3,
      download: async (url) => {
        downloaded.push(url);
        return bytes;
      },
    },
    {
      extractDocument: async (document) => ({
        metadata: {
          title: 'Content manual',
          documentType: 'MANUAL',
          publisher: null,
          documentDate: null,
        },
        applicable: document.url !== urls[0],
        applicability: document.url === urls[0] ? null : { page: 1, quote: 'Synthetic manual' },
        values: [],
      }),
    },
  );
  const blobsBefore = (await readdir(directory)).length;
  const result = await run();
  assert.deepEqual(downloaded, urls.slice(0, 4));
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.warnings, []);
  const files = (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json<
    Schema['AttachmentList']
  >().items;
  assert.equal(files.filter((file) => file.mediaType === 'application/pdf').length, 3);
  assert.ok(!files.some((file) => file.sourceUrl === urls[0]));
  assert.equal((await readdir(directory)).length, blobsBefore + 3);
  await pool.query(
    "update bt.import_targets set discovery=jsonb_set(discovery, '{items}', (select jsonb_agg(item order by item->>'url' desc) from jsonb_array_elements(discovery->'items') item)) where import_id=$1",
    [accepted.importId],
  );
  await run();
  assert.deepEqual(downloaded, urls.slice(0, 4));
});

test('discovered names use only owner collisions and preserve existing or edited names', async () => {
  const { refineImportedName } = await import('../../src/application/import/resources.js');
  await create({ name: 'Bosch Oven' }, 'bob');
  const accepted = await start('neff');
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await importsDb.getOwnedImportOrThrow(pool, owner, accepted.importId);
  const [target] = await importsDb.listImportTargets(pool, job);
  const signal = new AbortController().signal;
  const discovery = {
    identity: { name: 'Bosch Oven', sourceUrl: 'https://example.com/oven' },
    items: [],
    sources: ['https://example.com/oven'],
  };
  await refineImportedName(pool, job, target, discovery, signal);
  assert.equal((await request('GET', `/things/${target.thingId}`)).json().name, 'Bosch Oven');
  await create({ name: 'Bosch Oven' });
  assert.equal(
    (
      await request('PATCH', `/things/${target.thingId}`, {
        values: [
          {
            fieldSetId: 'appliances.appliance',
            fieldId: 'common.model',
            value: 'SYNTHETIC/01',
          },
        ],
      })
    ).statusCode,
    200,
  );
  await refineImportedName(pool, job, target, discovery, signal);
  assert.equal(
    (await request('GET', `/things/${target.thingId}`)).json().name,
    'Bosch Oven (SYNTHETIC/01)',
  );
  await refineImportedName(pool, job, target, discovery, signal);
  assert.equal(
    (await request('GET', `/things/${target.thingId}`)).json().name,
    'Bosch Oven (SYNTHETIC/01)',
  );
  await request('PATCH', `/things/${target.thingId}`, { name: 'Kitchen oven' });
  await refineImportedName(pool, job, target, discovery, signal);
  assert.equal((await request('GET', `/things/${target.thingId}`)).json().name, 'Kitchen oven');
  const existing = await create({
    name: 'Existing oven',
    categoryId: 'appliances',
  });
  const other = await start('neff', existing.id);
  await wait(other.importId);
  const otherJob = await importsDb.getOwnedImportOrThrow(pool, owner, other.importId);
  const [otherTarget] = await importsDb.listImportTargets(pool, otherJob);
  await refineImportedName(pool, otherJob, otherTarget, discovery, signal);
  assert.equal((await request('GET', `/things/${existing.id}`)).json().name, 'Existing oven');
  await assert.rejects(
    refineImportedName(
      pool,
      job,
      target,
      {
        ...discovery,
        identity: { name: 'Invented', sourceUrl: 'https://uncited.example/' },
      },
      signal,
    ),
  );
});

test('failed PDF downloads preserve documents and retries skip saved files; HTML creates no attachment', async () => {
  const accepted = await start('neff');
  await wait(accepted.importId);
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
  const document = await PDFDocument.create();
  document.addPage();
  const pdf = Buffer.from(await document.save());
  let fail = true;
  const fetched: string[] = [];
  const run = await researchRunner(accepted, discovery, {
    maxBytes: 4096,
    searchCalls: 3,
    download: async (url) => {
      fetched.push(url);
      if (url === sources[0] && fail) throw new Error('download failed');
      return url === sources[2] ? null : pdf;
    },
  });
  await run();
  const files = async () =>
    (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json<
      Schema['AttachmentList']
    >().items;
  assert.equal((await files()).length, 2);
  fail = false;
  fetched.length = 0;
  await run();
  assert.deepEqual(fetched, [sources[0], sources[2]]);
  assert.equal((await files()).length, 3);
  assert.equal((await files()).filter((file) => file.mediaType === 'application/pdf').length, 2);
});

test('category document enrichment validates variants, commits cited values progressively, preserves owner clears and resumes without duplicate downloads', async () => {
  const accepted = await start('neff');
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const updated = await request('PATCH', `/things/${accepted.thingId}`, {
    addFieldSetIds: ['appliances.cookingOutput', 'appliances.electrical'],
    values: [
      { fieldSetId: 'appliances.neff', fieldId: 'appliances.eNumber', value: 'SYNTHETIC/01' },
    ],
    customFields: [
      { label: 'Public variant', value: 'UK', sensitive: true, instanceSpecific: false },
      { label: 'Policy number', value: 'private-policy', sensitive: false },
    ],
  });
  assert.equal(updated.statusCode, 200, updated.body);
  const job = await importsDb.getOwnedImportOrThrow(pool, owner, accepted.importId);
  const events = new ApplicationEvents();
  let progress = 0;
  const unsubscribe = events.subscribe({ ownerId: owner })(() => {
    progress++;
  });
  let downloads = 0,
    extractions = 0,
    searches = 0;
  const budget: number[] = [];
  const reference = (url: string) => ({
    kind: 'reference' as const,
    title: 'Synthetic manual',
    description: 'Applies to SYNTHETIC/01',
    url,
    sourceUrl: url,
  });
  const findResources: ImportAi['findResources'] = async (research, _context, calls) => {
    searches++;
    budget.push(calls!);
    assert.ok(research.knownFields.some((field) => field.customFieldId && field.value === 'UK'));
    assert.ok(!JSON.stringify(research).includes('private-policy'));
    const urls = [
      'https://example.com/wrong.pdf',
      'https://example.com/manual.pdf',
      'https://example.com/failure.pdf',
    ];
    return { sources: urls, items: urls.map(reference) };
  };
  const extractDocument: ImportAi['extractDocument'] = async (document, _research, targets) => {
    extractions++;
    if (document.url.endsWith('/wrong.pdf'))
      return { metadata: null, applicable: false, applicability: null, values: [] };
    assert.ok(targets.some((field) => field.fieldId === 'appliances.outputPower'));
    const cleared = await request('PATCH', `/things/${accepted.thingId}`, {
      values: [
        { fieldSetId: 'appliances.electrical', fieldId: 'appliances.ratedInputPower', value: null },
      ],
    });
    assert.equal(cleared.statusCode, 200, cleared.body);
    return {
      metadata: null,
      applicable: true,
      applicability: { page: 1, quote: 'SYNTHETIC/01 UK' },
      values: [
        {
          fieldSetId: 'appliances.cookingOutput',
          fieldId: 'appliances.outputPower',
          value: '900 W',
          page: 1,
          quote: 'Output power 900 W',
        },
        {
          fieldSetId: 'appliances.electrical',
          fieldId: 'appliances.ratedInputPower',
          value: '1500 W',
          page: 1,
          quote: 'Input power 1500 W',
        },
      ],
    };
  };
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.drawText('SYNTHETIC/01 UK. Output power 900 W. Input power 1500 W.');
  const content = Buffer.from(await pdf.save());
  let fail = true;
  const options = {
    maxBytes: 4096,
    searchCalls: 3,
    download: async (url: string) => {
      downloads++;
      if (url.endsWith('/failure.pdf') && fail) throw new Error('synthetic download failure');
      return url.endsWith('/failure.pdf') ? null : content;
    },
  };
  const run = await researchRunner(accepted, findResources, options, { extractDocument, events });
  await run();
  assert.ok(
    (await request('GET', `/imports/${job.id}`))
      .json<Schema['Import']>()
      .warnings?.some((warning) => warning.code === 'UNAVAILABLE'),
  );
  const result = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  const power = result.fieldSets
    .find((set) => set.id === 'appliances.cookingOutput')!
    .fields.find((field) => field.id === 'appliances.outputPower')!;
  assert.equal(power.value, '900 W');
  assert.equal(power.origin, 'DISCOVERY');
  assert.equal(power.instanceSpecific, false);
  assert.equal(power.sourceRefs[0].page, 1);
  assert.equal(
    result.fieldSets
      .find((set) => set.id === 'appliances.electrical')!
      .fields.find((field) => field.id === 'appliances.ratedInputPower')!.value,
    null,
  );
  assert.ok(progress >= 3);
  assert.equal(
    (await request('GET', `/attachments?thingId=${accepted.thingId}`))
      .json<Schema['AttachmentList']>()
      .items.filter((file) => file.mediaType === 'application/pdf').length,
    1,
  );
  assert.equal('researchOutcomes' in (await request('GET', `/imports/${job.id}`)).json(), false);
  assert.equal((await request('GET', `/imports/${job.id}`, undefined, 'bob')).statusCode, 404);
  const before = { downloads, extractions };
  fail = false;
  await run();
  assert.equal(extractions, before.extractions); // Rejected variants are saved.
  assert.equal(downloads, before.downloads + 1); // Saved and rejected documents are skipped.
  assert.deepEqual(budget, [3, 3]);
  assert.equal(searches, 2);
  unsubscribe();
});

test('optional research failures complete with warnings and retry without reimporting fields', async (t) => {
  const failing = t.mock.method(ai, 'findResources', async () => {
    throw new Error('Synthetic research failure');
  });
  const existing = await create({
    categoryId: 'appliances',
    values: [{ fieldSetId: null, fieldId: 'common.model', value: 'SYNTHETIC/01' }],
  });
  const accepted = await start('neff', existing.id);
  const completed = await wait(accepted.importId);
  assert.equal(completed.status, 'COMPLETE');
  assert.equal(completed.error, null);
  assert.equal(completed.warnings?.[0].code, 'RESEARCH_FAILED');
  assert.equal(completed.warnings?.[0].retryable, true);
  const before = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.ok(before.fieldSets.length);
  assert.equal(before.import?.warnings?.[0].code, 'RESEARCH_FAILED');
  failing.mock.restore();
  assert.equal((await request('POST', `/imports/${accepted.importId}:retry`)).statusCode, 200);
  const retried = await wait(accepted.importId);
  assert.equal(retried.status, 'COMPLETE');
  assert.deepEqual(retried.warnings, []);
  assert.deepEqual(retried.thingIds, completed.thingIds);
  const after = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.deepEqual(after.fieldSets, before.fieldSets);
  await pool.query('update bt.import_targets set discovery=null where import_id=$1', [
    accepted.importId,
  ]);
  const failure = new Error('Synthetic usage persistence failure');
  const run = await researchRunner(
    accepted,
    async (_research, context) => {
      await context.record({});
      return { items: [], sources: [] };
    },
    { maxBytes: 4096, searchCalls: 1 },
    {
      record: async () => {
        throw failure;
      },
    },
  );
  await assert.rejects(run(), { cause: failure });
});

test('research values and checkpoints roll back together on persistence failure', async () => {
  const accepted = await start('neff');
  await wait(accepted.importId);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const content = Buffer.from(await pdf.save());
  const url = 'https://example.com/manual.pdf';
  const run = await researchRunner(
    accepted,
    {
      sources: [url],
      items: [{ kind: 'reference', title: 'Manual', description: '', url, sourceUrl: url }],
    },
    { maxBytes: 4096, searchCalls: 1, download: async () => content },
    {
      extractDocument: async () => ({
        metadata: null,
        applicable: true,
        applicability: { page: 1, quote: 'Synthetic manual' },
        values: [
          {
            fieldSetId: 'appliances.appliance',
            fieldId: 'common.manufacturer',
            value: 'Example maker',
            page: 1,
            quote: 'Example maker',
          },
        ],
      }),
    },
  );
  await pool.query(
    "alter table bt.import_targets add constraint test_checkpoint_rejection check (jsonb_array_length(coalesce(discovery->'documentBatches', '[]'::jsonb))=0) not valid",
  );
  try {
    await assert.rejects(run(), { code: '23514' });
    const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
    assert.equal(
      thing.fieldSets
        .find((set) => set.id === 'appliances.appliance')!
        .fields.find((field) => field.id === 'common.manufacturer')!.value,
      null,
    );
    assert.deepEqual(
      (await request('GET', `/imports/${accepted.importId}`)).json<Schema['Import']>().warnings,
      [],
    );
  } finally {
    await pool.query('alter table bt.import_targets drop constraint test_checkpoint_rejection');
  }
  await run();
  const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.equal(
    thing.fieldSets
      .find((set) => set.id === 'appliances.appliance')!
      .fields.find((field) => field.id === 'common.manufacturer')!.value,
    'Example maker',
  );
});

test('oversized research documents are cached, skipped on retry and reconsidered after a limit change', async () => {
  const existing = await create({
    categoryId: 'appliances',
    values: [{ fieldSetId: null, fieldId: 'common.model', value: 'SYNTHETIC/01' }],
  });
  const accepted = await start('neff', existing.id);
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await importsDb.getOwnedImportOrThrow(pool, owner, accepted.importId);
  const url = 'https://example.com/large.pdf';
  const discovery: Discovery = {
    sources: [url],
    items: [{ kind: 'reference', title: 'Manual', description: '', url, sourceUrl: url }],
  };
  const [initialTarget] = await importsDb.listImportTargets(pool, job);
  await importsDb.saveTargetDiscovery(pool, job, initialTarget.candidateId, {
    sources: [url],
    items: [{ kind: 'reference', title: 'Manual', description: '', url, sourceUrl: url }],
  });
  let downloads = 0;
  const options = {
    maxBytes: 1000,
    searchCalls: 1,
    download: async (_url: string, input: { maxBytes: number }) => {
      downloads++;
      if (input.maxBytes < 2000) throw new DocumentSizeError(2000, input.maxBytes);
      return null;
    },
  };
  const run = await researchRunner(accepted, discovery, options);
  const rejected = await run({ maxBytes: 1000 });
  assert.equal(rejected.warnings?.[0].code, 'SIZE_LIMIT');
  assert.equal(rejected.warnings?.[0].actual, 2000);
  assert.equal(rejected.warnings?.[0].limit, 1000);
  await run({ maxBytes: 1000 });
  assert.equal(downloads, 1);
  const reconsidered = await run({ maxBytes: 3000 });
  assert.equal(downloads, 2);
  assert.ok(!reconsidered.warnings?.some((warning) => warning.code === 'SIZE_LIMIT'));
});

test('research retry searches once for alternatives and extracts text beyond page 100', async () => {
  const existing = await create({
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.cookingOutput'],
    values: [{ fieldSetId: null, fieldId: 'common.model', value: 'SYNTHETIC/01' }],
  });
  const accepted = await start('neff', existing.id);
  await wait(accepted.importId);
  const owner = (await request('GET', '/profile')).json().id;
  const job = await importsDb.getOwnedImportOrThrow(pool, owner, accepted.importId);
  const [initialTarget] = await importsDb.listImportTargets(pool, job);
  const large = 'https://example.com/large.pdf';
  const alternative = 'https://example.com/english.pdf';
  const reference = (url: string) => ({
    kind: 'reference' as const,
    title: 'Manual',
    description: '',
    url,
    sourceUrl: url,
  });
  await importsDb.saveTargetDiscovery(pool, job, initialTarget.candidateId, {
    sources: [large],
    items: [reference(large)],
    warnings: [
      { code: 'SIZE_LIMIT', sourceUrl: large, retryable: false, actual: 100001, limit: 100000 },
    ],
  });
  const pdf = await PDFDocument.create();
  for (let page = 1; page <= 101; page++) {
    const sheet = pdf.addPage();
    if (page === 1) sheet.drawText('SYNTHETIC/01');
    if (page === 101) sheet.drawText('Output power 900 W');
  }
  const content = Buffer.from(await pdf.save());
  let searches = 0,
    downloads = 0,
    extractions = 0;
  const findResources: ImportAi['findResources'] = async (research, _context, calls) => {
    searches++;
    assert.equal(calls, 3);
    assert.deepEqual(research.documentLimits, { maxBytes: 100000, maxTextCharacters: 1000000 });
    assert.equal(research.rejectedDocuments?.[0].sourceUrl, large);
    assert.equal(research.rejectedDocuments?.[0].code, 'SIZE_LIMIT');
    return { sources: [alternative], items: [reference(alternative)] };
  };
  const extractDocument: ImportAi['extractDocument'] = async (document) => {
    extractions++;
    assert.equal(document.pageCount, 101);
    assert.equal(document.text, '[PDF page 1]\nSYNTHETIC/01\n\n[PDF page 101]\nOutput power 900 W');
    return {
      metadata: null,
      applicable: true,
      applicability: { page: 1, quote: 'SYNTHETIC/01' },
      values: [
        {
          fieldSetId: 'appliances.cookingOutput',
          fieldId: 'appliances.outputPower',
          value: '900 W',
          page: 101,
          quote: 'Output power 900 W',
        },
      ],
    };
  };
  const options = {
    maxBytes: 100000,
    searchCalls: 3,
    download: async (url: string) => {
      downloads++;
      if (url === large) throw new DocumentSizeError(100001, 100000);
      return content;
    },
  };
  const run = await researchRunner(accepted, findResources, options, { extractDocument });
  await run();
  assert.equal(searches, 1);
  assert.equal(downloads, 1);
  assert.equal(extractions, 1);
  const completed = (await request('GET', `/imports/${job.id}`)).json<Schema['Import']>();
  assert.ok(completed.warnings?.some((warning) => warning.code === 'SIZE_LIMIT'));
  const thing = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  const output = thing.fieldSets
    .find((set) => set.id === 'appliances.cookingOutput')
    ?.fields.find((field) => field.id === 'appliances.outputPower');
  assert.equal(output?.value, '900 W');
  assert.equal(output?.sourceRefs?.[0].page, 101);
  const files = (await request('GET', `/attachments?thingId=${accepted.thingId}`)).json<
    Schema['AttachmentList']
  >().items;
  assert.equal(files.filter((file) => file.mediaType === 'application/pdf').length, 1);
  assert.equal(files.find((file) => file.mediaType === 'application/pdf')?.pageCount, 101);
  await run();
  assert.equal(downloads, 1);
  assert.equal(extractions, 1);
});

test('research images preserve provenance, owner choices and removals; image failures preserve documents', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { validateProductImage } = await import('../../src/providers/web/image.js');
  const photo = await validateProductImage(await createCanvas(300, 300).encode('png'));
  const imageUrl = 'https://manufacturer.example/model/photo.png';
  const sourceUrl = 'https://manufacturer.example/model';
  const image = {
    kind: 'image' as const,
    title: 'Product photo',
    description: 'Official model photo',
    url: imageUrl,
    sourceUrl,
  };
  const discovery = { items: [image], sources: [imageUrl, sourceUrl] };
  const options = { maxBytes: 100000, searchCalls: 3, downloadImage: async () => photo };
  const accepted = await start('neff');
  await wait(accepted.importId);
  const save = await researchRunner(accepted, discovery, options);
  await save();
  const saved = (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>();
  assert.ok(saved.imageAttachmentId);
  const metadata = (await request('GET', `/attachments/${saved.imageAttachmentId}`)).json<
    Schema['Attachment']
  >();
  assert.equal(metadata.mediaType, 'image/png');
  assert.equal(metadata.sourceUrl, imageUrl);
  assert.deepEqual(metadata.metadataSources.title, {
    origin: 'DISCOVERY',
    sourceRefs: [{ url: sourceUrl }],
  });
  assert.equal(
    (await request('GET', `/attachments/${saved.imageAttachmentId}`, undefined, 'bob')).statusCode,
    404,
  );
  await save();
  assert.equal(
    (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>().attachmentIds
      .length,
    2,
  );
  await request('PATCH', `/things/${accepted.thingId}`, { imageAttachmentId: null });
  await save();
  assert.equal(
    (await request('GET', `/things/${accepted.thingId}`)).json<Schema['Thing']>().imageAttachmentId,
    null,
  );

  const second = await start('neff');
  await wait(second.importId);
  const saveSecond = await researchRunner(second, discovery, options);
  await saveSecond();
  const secondSaved = (await request('GET', `/things/${second.thingId}`)).json<Schema['Thing']>();
  assert.ok(secondSaved.imageAttachmentId);
  const unlinked = await request(
    'DELETE',
    `/attachments/${secondSaved.imageAttachmentId}/things/${second.thingId}`,
  );
  assert.equal(unlinked.statusCode, 204, unlinked.body);
  await saveSecond();
  const removed = (await request('GET', `/things/${second.thingId}`)).json<Schema['Thing']>();
  assert.equal(removed.imageAttachmentId, null);
  assert.ok(!removed.attachmentIds.includes(secondSaved.imageAttachmentId));

  const third = await start('neff');
  await wait(third.importId);
  const manualUrl = 'https://manufacturer.example/manual.pdf';
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const content = Buffer.from(await pdf.save());
  const manual = {
    kind: 'reference' as const,
    title: 'Manual',
    description: '',
    url: manualUrl,
    sourceUrl: manualUrl,
  };
  const fail = await researchRunner(
    third,
    { items: [manual, image], sources: [manualUrl, imageUrl, sourceUrl] },
    {
      ...options,
      download: async () => content,
      downloadImage: async () => validateProductImage(Buffer.from('invalid image')),
    },
  );
  await fail();
  const failed = (await request('GET', `/things/${third.thingId}`)).json<Schema['Thing']>();
  assert.equal(failed.attachmentIds.length, 2);
  assert.equal(failed.imageAttachmentId, null);
  const result = (await request('GET', `/imports/${third.importId}`)).json<Schema['Import']>();
  assert.equal(result.status, 'COMPLETE');
  assert.ok(result.warnings?.some((warning) => warning.sourceUrl === imageUrl));
});
