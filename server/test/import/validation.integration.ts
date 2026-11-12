/** Exercises import continuation after proposal validation and optional provider failures. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createTestApp, type TestApp } from '../support/test-app.js';
import type { ImportAi } from '../../src/application/import/types.js';
import type { Schema } from '../../../shared/model.js';

// Waits for a fixture Import to reach a terminal status.
async function waitForImport(env: TestApp, id: string) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const response = await env.app.inject({
      url: '/api/imports/' + id,
      headers: { authorization: env.authorization },
    });
    const job = response.json<Schema['Import']>();
    if (['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(job.status)) return job;
    await setTimeout(20);
  }
  throw new Error('Fixture Import timed out');
}

// Import validation aborted field batches and rejected suggestions with unusable citations.
test('imports save valid proposals and optional citations while enforcing public field scope', async () => {
  const env = await createTestApp();
  try {
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
    const privateId = randomUUID(),
      publicId = randomUUID();
    await env.pool.query(
      `insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status,source_url)
      select $1,owner_id,'label.txt','text/plain',1,'fixture-private','Model AX1','COMPLETE',null from bt.things where id=$3
      union all select $2::uuid,null,'manual.txt','text/plain',1,'fixture-public','Manual AX1','COMPLETE','https://maker.example/manual'`,
      [privateId, publicId, thingId],
    );
    for (const id of [privateId, publicId])
      await env.pool.query(
        'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) select id,$1,owner_id from bt.things where id=$2',
        [id, thingId],
      );
    const ai: ImportAi = env.importAi;
    ai.assessResource = async () => {
      throw new Error('Synthetic assessment failure');
    };
    ai.selectFieldSets = async () => ({ setIds: ['appliances.warranty', 'unknown.set'] });
    ai.populateFields = async () => ({
      pinnedFields: [{ fieldSetId: 'unknown.set', fieldId: 'unknown.field' }],
      values: [
        { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 11, sourceRefs: [] },
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'common.model',
          value: 'AX1',
          sourceRefs: [],
        },
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'appliances.zNumber',
          value: '026',
          sourceRefs: [{ attachmentId: privateId, quote: 'Unmatched quotation', page: 99 }],
        },
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'common.serialNumber',
          value: 'PUBLIC_SERIAL',
          sourceRefs: [{ attachmentId: publicId }],
        },
      ],
    });
    ai.additionalInformation = async () => ({ findings: [] });
    ai.suggestTasks = async ({ sources }) => {
      assert.ok(sources.some((source) => source.attachmentId === publicId));
      return {
        items: [
          { title: 'x'.repeat(201), description: 'Invalid title', sourceRefs: [] },
          {
            title: 'Review the service',
            description: 'Review when needed.',
            sourceRefs: [{ url: 'javascript:invalid' }],
          },
        ],
      };
    };
    const submitted = await request('/api/imports', { attachmentIds: [], thingId });
    const job = await waitForImport(env, submitted.json<Schema['ImportAccepted']>().importId);
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    const saved = await env.app.inject({
      url: '/api/things/' + thingId,
      headers: { authorization: env.authorization },
    });
    const thing = saved.json<Schema['Thing']>();
    const fields = thing.fieldSets.flatMap((set) => set.fields);
    assert.equal(fields.find((field) => field.id === 'common.model')?.value, 'AX1');
    assert.equal(fields.find((field) => field.id === 'common.model')?.origin, 'DISCOVERY');
    assert.equal(fields.find((field) => field.id === 'appliances.zNumber')?.value, '026');
    assert.equal(fields.find((field) => field.id === 'common.serialNumber')?.value, null);
    assert.ok(thing.fieldSets.some((set) => set.id === 'appliances.warranty'));
    const refs = await env.pool.query(
      "select source_refs from bt.thing_fields where thing_id=$1 and field_id='appliances.zNumber'",
      [thingId],
    );
    assert.deepEqual(refs.rows[0].source_refs, [{ attachmentId: privateId }]);
    const tasks = await env.pool.query('select title,source_refs from bt.tasks where thing_id=$1', [
      thingId,
    ]);
    assert.deepEqual(tasks.rows, [{ title: 'Review the service', source_refs: [] }]);
  } finally {
    await env.close();
  }
});

// Selection and population errors stopped imports before later stages could run.
test('optional field stage failures allow recommendations and retry unfinished work', async () => {
  const env = await createTestApp();
  try {
    const request = (url: string, payload?: object) =>
      env.app.inject({
        method: 'POST',
        url,
        payload,
        headers: { authorization: env.authorization },
      });
    const ai: ImportAi = env.importAi;
    let recommendations = 0;
    ai.suggestTasks = async () => {
      recommendations++;
      return { items: [] };
    };
    for (const stage of ['selection', 'population']) {
      let fail = true;
      ai.selectFieldSets = async () => {
        if (fail && stage === 'selection') throw new Error('Synthetic selection failure');
        return { setIds: [] };
      };
      ai.populateFields = async () => {
        if (fail && stage === 'population') throw new Error('Synthetic population failure');
        return { values: [], pinnedFields: [] };
      };
      const created = await request('/api/things', {
        name: 'Fixture ' + stage,
        categoryId: 'appliances',
      });
      const thingId = created.json<Schema['Thing']>().id;
      const before = recommendations;
      const submitted = await request('/api/imports', { attachmentIds: [], thingId });
      const id = submitted.json<Schema['ImportAccepted']>().importId;
      const job = await waitForImport(env, id);
      assert.equal(job.status, 'COMPLETE');
      assert.ok(job.warnings?.length);
      assert.equal(recommendations, before + 1);
      fail = false;
      await request('/api/imports/' + id + ':retry');
      const retried = await waitForImport(env, id);
      assert.equal(retried.status, 'COMPLETE');
      assert.equal(retried.warnings?.length, 0);
      assert.equal(recommendations, before + 1);
    }
  } finally {
    await env.close();
  }
});

// A changed source aborted the whole recommendation commit, including unrelated suggestions.
test('source changes skip affected suggestions and save independent recommendations', async () => {
  const env = await createTestApp();
  try {
    const request = (url: string, payload?: object) =>
      env.app.inject({
        method: 'POST',
        url,
        payload,
        headers: { authorization: env.authorization },
      });
    const created = await request('/api/things', {
      name: 'Fixture policy',
      categoryId: 'insurance',
    });
    const thingId = created.json<Schema['Thing']>().id,
      source = randomUUID();
    await env.pool.query(
      `insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status)
      select $1,owner_id,'policy.txt','text/plain',1,'fixture-policy','Renewal terms','COMPLETE' from bt.things where id=$2`,
      [source, thingId],
    );
    await env.pool.query(
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) select id,$1,owner_id from bt.things where id=$2',
      [source, thingId],
    );
    env.importAi.suggestTasks = async () => {
      await env.pool.query("update bt.attachments set transcription='Updated terms' where id=$1", [
        source,
      ]);
      return {
        items: [
          {
            title: 'Review old terms',
            description: 'Old terms',
            sourceRefs: [{ attachmentId: source, quote: 'Renewal terms' }],
          },
          { title: 'Review the policy', description: 'Review annually.', sourceRefs: [] },
        ],
      };
    };
    const submitted = await request(`/api/things/${thingId}:recommend`);
    const job = await waitForImport(env, submitted.json<Schema['ImportAccepted']>().importId);
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    assert.deepEqual(
      (await env.pool.query('select title from bt.tasks where thing_id=$1', [thingId])).rows,
      [{ title: 'Review the policy' }],
    );
  } finally {
    await env.close();
  }
});
