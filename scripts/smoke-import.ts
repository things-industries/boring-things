// Explicit, paid live smoke test. Only synthetic source data is sent to OpenAI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildApp } from '../server/src/app.js';
import { readConfig } from '../server/src/config.js';
import * as database from '../server/src/db/connection.js';
import * as registrySeedDb from '../server/src/db/seeds/registry.js';
import { OpenAiImports } from '../server/src/providers/ai/openai-imports.js';
import type { ImportAi } from '../server/src/application/import/types.js';
import type { Schema } from '../shared/model.js';
const config = readConfig();
assert.ok(config.openaiApiKey && config.openaiModel, 'Set OPENAI_API_KEY and OPENAI_MODEL');
const url = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Smoke test requires local Postgres');
const name = 'bt_smoke_' + randomUUID().replaceAll('-', '');
const admin = database.createPool(url.toString());
url.pathname = '/' + name;
const pool = database.createPool(url.toString());
const directory = await mkdtemp(tmpdir() + '/bt-smoke-');
const ai = new OpenAiImports(
  config.openaiApiKey,
  config.openaiModel,
  config.aiMaxOutputTokens,
  config.discoverySearchCalls,
);
const trace: unknown[] = [];
const recorded: ImportAi = {
  extractDocument: (...args) => ai.extractDocument(...args),
  async extract(source, categories, context) {
    const result = await ai.extract(source, categories, context);
    trace.push({ stage: 'extraction', result });
    return result;
  },
  async selectFieldSets(candidate, tools, context) {
    const tracedTools = {
      async searchFieldSets(category: string, terms: string[]) {
        const result = await tools.searchFieldSets(category, terms);
        trace.push({ tool: 'search_field_sets', category, terms, result });
        return result;
      },
      async searchFields(labels: { label: string; context: string }[]) {
        const result = await tools.searchFields(labels);
        trace.push({ tool: 'search_fields', labels, result });
        return result;
      },
    };
    const selection = await ai.selectFieldSets(candidate, tracedTools, context);
    trace.push({
      stage: 'field_selection',
      candidate: candidate.id,
      result: selection,
    });
    return selection;
  },
  async mapFacts(thing, facts, selectedSets, tools, context) {
    const tracedTools = {
      searchFieldSets: tools.searchFieldSets,
      async searchFields(labels: { label: string; context: string }[]) {
        const result = await tools.searchFields(labels);
        trace.push({ tool: 'search_fields', labels, result });
        return result;
      },
    };
    const result = await ai.mapFacts(thing, facts, selectedSets, tracedTools, context);
    trace.push({
      stage: 'fact_mapping',
      candidate: thing.id,
      factIds: facts.map((fact) => fact.id),
      result,
    });
    return result;
  },
  async findResources(candidate, context, searchCalls) {
    const result = await ai.findResources(candidate, context, searchCalls);
    trace.push({ stage: 'discovery', result });
    return result;
  },
};
await admin.query(`create database ${name}`);
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
try {
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort())
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  await database.transaction(pool, registrySeedDb.seedRegistry);
  app = await buildApp({
    dbPool: pool,
    config: { ...config, blobDirectory: directory },
    importAi: recorded,
    verifyIdentity: async () => ({ subject: 'synthetic-smoke' }),
  });
  const headers = { authorization: 'Bearer synthetic-local-test' };
  const source =
    'Synthetic test document. Three separate Things.\n1. Kitchen hob: manufacturer Neff, E-Nr T58TS6BN0/01, Z-Nr 0015, installer reference ABC-12.\n2. Cargo van: payload 1200 kg.\n3. Combined home insurance policy: buildings sum insured GBP 400000; contents sum insured GBP 50000.\n';
  const boundary = 'smoke-boundary';
  const upload = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      ...headers,
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.txt"\r\nContent-Type: text/plain\r\n\r\n${source}\r\n--${boundary}--\r\n`,
  });
  assert.equal(upload.statusCode, 201, upload.body);
  const start = await app.inject({
    method: 'POST',
    url: '/api/things:import',
    headers,
    payload: { attachmentId: upload.json().id },
  });
  assert.equal(start.statusCode, 202, start.body);
  const accepted = start.json<Schema['ImportAccepted']>();
  const deadline = Date.now() + 600000;
  let previous = '';
  let job: Schema['Import'] | undefined;
  while (Date.now() < deadline) {
    job = (
      await app.inject({
        method: 'GET',
        url: `/api/imports/${accepted.importId}`,
        headers,
      })
    ).json();
    if (job!.status !== previous) {
      console.log({ status: job!.status, elapsedMs: job!.usage.elapsedMs });
      previous = job!.status;
    }
    if (job!.status === 'AWAITING_SELECTION') {
      assert.equal(job!.candidates.length, 3);
      const confirm: { statusCode: number; body: string } = await app.inject({
        method: 'POST',
        url: `/api/imports/${job!.id}:confirm`,
        headers,
        payload: {
          selections: job!.candidates.map((c) => ({
            candidateId: c.id,
            targetThingId: null,
          })),
        },
      });
      assert.equal(confirm.statusCode, 200, confirm.body);
    } else if (['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(job!.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const things = await Promise.all(
    (job?.thingIds ?? []).map(async (id) =>
      (await app!.inject({ method: 'GET', url: `/api/things/${id}`, headers })).json<
        Schema['Thing']
      >(),
    ),
  );
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/import-smoke.json',
    JSON.stringify({ model: config.openaiModel, job, things, trace }, null, 2),
  );
  console.log({
    status: job?.status,
    error: job?.error,
    usage: job?.usage,
    thingCount: things.length,
    artifact: 'test-results/import-smoke.json',
  });
  assert.equal(job?.status, 'COMPLETE');
  const fields = things.flatMap((t) => t.fieldSets.flatMap((s) => s.fields));
  assert.equal(fields.find((f) => f.id === 'appliances.zNumber')?.value, '0015');
  assert.ok(
    things.some(
      (t) =>
        t.fieldSets.some((s) => s.id === 'vehicles.van') &&
        t.fieldSets.some((s) => s.id === 'vehicles.vehicle'),
    ),
  );
  const policy = things.find((t) => t.categoryId === 'insurance')!;
  assert.deepEqual(
    policy.fieldSets
      .find((s) => s.id === 'insurance.buildings')
      ?.fields.find((f) => f.id === 'insurance.sumInsured')?.value,
    { amountMinor: 40000000, currency: 'GBP' },
  );
  assert.deepEqual(
    policy.fieldSets
      .find((s) => s.id === 'insurance.contents')
      ?.fields.find((f) => f.id === 'insurance.sumInsured')?.value,
    { amountMinor: 5000000, currency: 'GBP' },
  );
  assert.ok(things.some((t) => t.undefinedFields.some((f) => f.value === 'ABC-12')));
  if (process.argv.includes('--assistant')) {
    const thing = things.find((t) => t.categoryId === 'appliances')!;
    const chat = (
      await app.inject({
        method: 'POST',
        url: '/api/conversations',
        headers,
        payload: { thingId: thing.id },
      })
    ).json<Schema['Conversation']>();
    const messages: Schema['Message'][] = [];
    const send = async (text: string) => {
      const accepted = await app!.inject({
        method: 'POST',
        url: `/api/conversations/${chat.id}/messages`,
        headers,
        payload: { text, requestId: randomUUID() },
      });
      assert.equal(accepted.statusCode, 202, accepted.body);
      const end = Date.now() + config.chatTimeoutMs + 10000;
      while (Date.now() < end) {
        const current = (
          await app!.inject({
            method: 'GET',
            url: `/api/conversations/${chat.id}`,
            headers,
          })
        ).json<Schema['Conversation']>();
        const message = current.messages.filter((m) => m.role === 'ASSISTANT').at(-1)!;
        if (['COMPLETE', 'FAILED'].includes(message.status)) {
          messages.push(message);
          await writeFile(
            'test-results/assistant-smoke.json',
            JSON.stringify({ model: config.openaiModel, messages }, null, 2),
          );
          console.log({
            assistant: message.status,
            error: message.error,
            usage: message.usage,
            cardTypes: message.cards.map((c) => c.type),
          });
          assert.equal(message.status, 'COMPLETE');
          return message;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Assistant smoke timed out');
    };
    const answer = await send('What is the stored Z-number? Cite the field and source document.');
    assert.match(answer.text, /0015/);
    assert.ok(answer.cards.some((c) => c.type === 'FIELD' || c.type === 'ATTACHMENT'));
    const maintenance = await send(
      'Create a maintenance event titled Review hob care instructions. It should remind the owner to read the saved manual before cleaning.',
    );
    const event = maintenance.cards.find((c) => c.type === 'EVENT');
    assert.ok(event && event.type === 'EVENT');
    const scheduled = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.eventId}`,
      headers,
      payload: { status: 'SCHEDULED', startsAt: '2026-10-01T09:00:00Z' },
    });
    assert.equal(scheduled.statusCode, 200, scheduled.body);
    await app.close();
    app = await buildApp({
      dbPool: pool,
      config: { ...config, blobDirectory: directory },
      verifyIdentity: async () => ({ subject: 'synthetic-smoke' }),
    });
    const reloaded = (
      await app.inject({
        method: 'GET',
        url: `/api/things/${thing.id}`,
        headers,
      })
    ).json<Schema['Thing']>();
    assert.ok(reloaded.eventIds.includes(event.eventId));
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: `/api/events/${event.eventId}`,
          headers,
        })
      ).json().status,
      'SCHEDULED',
    );
    console.log({
      assistantArtifact: 'test-results/assistant-smoke.json',
      restartVerified: true,
    });
  }
} finally {
  await app?.close();
  await pool.end();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
