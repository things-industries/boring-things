// Paid synthetic chat discovery check. Temporary database; no application records are changed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildApp } from '../server/src/app.js';
import { readConfig } from '../server/src/config.js';
import * as database from '../server/src/db/connection.js';
import * as registrySeedDb from '../server/src/db/seeds/registry.js';
import type { Schema } from '../shared/model.js';
const config = readConfig();
assert.ok(config.openaiApiKey && config.openaiModel);
const url = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const name = 'bt_chat_smoke_' + randomUUID().replaceAll('-', '');
const admin = database.createPool(url.toString());
url.pathname = '/' + name;
const pool = database.createPool(url.toString());
const directory = await mkdtemp(tmpdir() + '/bt-chat-smoke-');
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
await admin.query(`create database ${name}`);
try {
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort())
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  await database.transaction(pool, registrySeedDb.seedRegistry);
  app = await buildApp({
    dbPool: pool,
    config: { ...config, blobDirectory: directory },
    verifyIdentity: async () => ({ subject: 'synthetic-products-smoke' }),
  });
  const headers = { authorization: 'Bearer synthetic-local-test' };
  const created = await app.inject({
    method: 'POST',
    url: '/api/things',
    headers,
    payload: {
      name: 'Miele dishwasher',
      categoryId: 'appliances',
      addFieldSetIds: ['appliances.appliance'],
      values: [
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'common.manufacturer',
          value: 'Miele',
        },
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'common.model',
          value: 'G 7310 SC AutoDos',
        },
      ],
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const thing = created.json<Schema['Thing']>();
  const chat = (
    await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers,
      payload: { thingId: thing.id },
    })
  ).json<Schema['Conversation']>();
  const accepted = await app.inject({
    method: 'POST',
    url: `/api/conversations/${chat.id}/messages`,
    headers,
    payload: {
      requestId: randomUUID(),
      text: 'Find a compatible detergent consumable for this model. Research products, verify compatibility from manufacturer evidence, and show a product card with a retrieved merchant link. Do not invent a price.',
    },
  });
  assert.equal(accepted.statusCode, 202, accepted.body);
  const deadline = Date.now() + config.chatTimeoutMs + 10000;
  let message: Schema['Message'] | undefined;
  while (Date.now() < deadline) {
    const current = (
      await app.inject({
        method: 'GET',
        url: `/api/conversations/${chat.id}`,
        headers,
      })
    ).json<Schema['Conversation']>();
    message = current.messages.filter((m) => m.role === 'ASSISTANT').at(-1);
    if (message && ['COMPLETE', 'FAILED'].includes(message.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const products = (
    await app.inject({
      method: 'GET',
      url: `/api/purchasables?thingId=${thing.id}`,
      headers,
    })
  ).json<{ items: Schema['Purchasable'][] }>();
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/assistant-products-smoke.json',
    JSON.stringify({ model: config.openaiModel, message, products }, null, 2),
  );
  console.log({
    status: message?.status,
    error: message?.error,
    usage: message?.usage,
    merchantLinks: products.items.length,
    cardTypes: message?.cards.map((c) => c.type),
    artifact: 'test-results/assistant-products-smoke.json',
  });
  assert.equal(message?.status, 'COMPLETE');
  assert.ok(products.items.length);
  assert.ok(message?.cards.some((c) => c.type === 'PURCHASABLE'));
  assert.ok(products.items.every((p) => p.sourceRefs.length && !p.price));
} finally {
  await app?.close();
  await pool.end();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
