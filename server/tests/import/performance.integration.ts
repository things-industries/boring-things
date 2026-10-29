/** Verifies product-photo handling and concurrent research using isolated databases and fixture AI. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { createCanvas } from '@napi-rs/canvas';
import { startTestApp, type TestApp } from '../../test/support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ImportAi } from '../../src/application/import/types.js';

// Waits for a fixture Import or Recommendation to reach its persisted outcome.
async function waitForImport(env: TestApp, id: string) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const response = await env.app.inject({
      url: '/api/imports/' + id,
      headers: { authorization: env.authorization },
    });
    assert.equal(response.statusCode, 200, response.body);
    const job = response.json<Schema['Import']>();
    if (['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(job.status)) return job;
    await setTimeout(20);
  }
  throw new Error('Fixture Import timed out');
}

// Product-photo transcription and applicability added model calls without providing field evidence.
test('product photos remain display assets while uploaded photos still receive transcription', async () => {
  const content = await createCanvas(300, 300).encode('png');
  const env = await startTestApp({
    importWorkflow: {
      downloadImage: async () => ({ content, mediaType: 'image/png' }),
    },
  });
  try {
    const ai: ImportAi = env.importAi;
    let transcriptions = 0,
      assessments = 0;
    const transcribe = env.importAi.transcribe.bind(env.importAi);
    ai.transcribe = async (source) => {
      transcriptions++;
      return transcribe(source);
    };
    ai.assessResource = async () => {
      assessments++;
      return { applicable: true, identifiers: [] };
    };
    ai.findResources = async () => ({
      items: [
        {
          kind: 'image',
          title: 'Product photo',
          description: 'Official model photo',
          url: 'https://maker.example/oven.png',
          sourceUrl: 'https://maker.example/oven',
        },
      ],
      sources: ['https://maker.example/oven.png', 'https://maker.example/oven'],
    });
    const request = (method: 'GET' | 'POST', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    const created = await request('POST', '/api/things', {
      name: 'Fixture oven',
      categoryId: 'appliances',
      values: [{ fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'X1' }],
    });
    const thingId = created.json<Schema['Thing']>().id;
    const submitted = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    const job = await waitForImport(env, submitted.json<Schema['ImportAccepted']>().importId);
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    assert.equal(transcriptions, 0);
    assert.equal(assessments, 0);
    const thing = (await request('GET', '/api/things/' + thingId)).json<Schema['Thing']>();
    assert.ok(thing.imageAttachmentId);
    assert.ok(thing.attachmentIds.includes(thing.imageAttachmentId));
    const photoId = thing.imageAttachmentId;
    const photo = await env.pool.query(
      'select transcription_status,transcription from bt.attachments where id=$1',
      [photoId],
    );
    assert.equal(photo.rows[0].transcription_status, 'SKIPPED');
    assert.equal(photo.rows[0].transcription, null);

    // Older saved photo text must also stay outside recommendation and field evidence.
    await env.pool.query(
      "update bt.attachments set transcription_status='COMPLETE',transcription='Display text' where id=$1",
      [photoId],
    );
    ai.recommendFromSources = async () => {
      throw new Error('Photo became recommendation evidence');
    };
    const refresh = await request('POST', `/api/things/${thingId}:recommend`);
    const refreshed = await waitForImport(env, refresh.json<Schema['ImportAccepted']>().importId);
    assert.equal(refreshed.status, 'COMPLETE');
    assert.equal(refreshed.warnings?.length, 0);
    assert.equal(assessments, 0);

    const uploaded = await env.app.inject({
      method: 'POST',
      url: '/api/attachments',
      headers: {
        authorization: env.authorization,
        'content-type': 'multipart/form-data; boundary=fixture',
      },
      payload: Buffer.concat([
        Buffer.from(
          '--fixture\r\nContent-Disposition: form-data; name="file"; filename="plate.png"\r\nContent-Type: image/png\r\n\r\n',
        ),
        content,
        Buffer.from('\r\n--fixture--\r\n'),
      ]),
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const uploadedId = uploaded.json<Schema['Attachment']>().id;
    for (let attempt = 0; attempt < 250; attempt++) {
      const source = await env.pool.query(
        'select transcription_status from bt.attachments where id=$1',
        [uploadedId],
      );
      if (source.rows[0].transcription_status === 'COMPLETE') break;
      assert.ok(attempt < 249, 'Uploaded photo transcription timed out');
      await setTimeout(20);
    }
    assert.equal(transcriptions, 1);
  } finally {
    await env.close();
  }
});

// Sequential public research delayed independent suggestions and risked losing concurrent usage writes.
test('public research overlaps, saves successful work and retries only its failed operation', async () => {
  const env = await startTestApp();
  try {
    const ai: ImportAi = env.importAi;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0,
      taskCalls = 0,
      productCalls = 0,
      failProduct = true;
    const awaitOtherSearch = async () => {
      if (++started === 2) release();
      await Promise.race([
        bothStarted,
        setTimeout(1500, undefined, { ref: false }).then(() => {
          throw new Error('Research did not overlap');
        }),
      ]);
    };
    ai.suggestTasks = async (_input, context) => {
      taskCalls++;
      await awaitOtherSearch();
      await context.record({ inputTokens: 2 });
      return {
        items: [
          {
            title: 'Clean the tray',
            description: 'Wash the tray.',
            sourceRefs: [{ url: 'https://maker.example/care' }],
          },
        ],
      };
    };
    ai.findPurchasables = async (_input, context) => {
      productCalls++;
      if (failProduct) await awaitOtherSearch();
      await context.record({ inputTokens: 3 });
      if (failProduct) throw new Error('Fixture product research failure');
      return {
        items: [
          {
            kind: 'ACCESSORY',
            name: 'Baking tray',
            description: 'Model X1 tray.',
            merchantUrl: 'https://maker.example/tray',
            sourceRefs: [{ url: 'https://maker.example/oven' }],
          },
        ],
      };
    };
    const request = (url: string, payload?: object) =>
      env.app.inject({
        method: 'POST',
        url,
        payload,
        headers: { authorization: env.authorization },
      });
    const created = await request('/api/things', {
      name: 'Fixture oven',
      categoryId: 'appliances',
    });
    const thingId = created.json<Schema['Thing']>().id;
    const submitted = await request(`/api/things/${thingId}:recommend`);
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    const job = await waitForImport(env, id);
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    assert.equal(job.usage?.inputTokens, 5);
    assert.equal(job.warnings?.length, 1);
    assert.equal(
      (await env.pool.query('select 1 from bt.events where thing_id=$1', [thingId])).rowCount,
      1,
    );
    failProduct = false;
    assert.equal((await request(`/api/imports/${id}:retry`)).statusCode, 200);
    const retried = await waitForImport(env, id);
    assert.equal(retried.status, 'COMPLETE');
    assert.equal(retried.warnings?.length, 0);
    assert.equal(retried.usage?.inputTokens, 8);
    assert.equal(taskCalls, 1);
    assert.equal(productCalls, 2);
    assert.equal(
      (await env.pool.query('select 1 from bt.purchasables where thing_id=$1', [thingId])).rowCount,
      1,
    );
  } finally {
    await env.close();
  }
});
