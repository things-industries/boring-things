/** Exercises optional Import failures, retry checkpoints and researched names with fixture providers. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { startTestApp, type TestApp } from '../../test/support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ImportAi } from '../../src/application/import/types.js';

// Waits for a fixture request to finish without external AI calls.
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

// Additional-information validation aborted the single-Thing workflow before recommendations.
test('additional-information warnings permit recommendations and retry, while write failures stop the Import', async () => {
  const env = await startTestApp();
  try {
    const request = (method: 'POST', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    const created = await request('POST', '/api/things', {
      name: 'Fixture oven',
      categoryId: 'appliances',
    });
    const thingId = created.json<Schema['Thing']>().id,
      source = randomUUID();
    await env.pool.query(
      `insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status)
       select $1,owner_id,'plate.txt','text/plain',1,'fixture-plate','Finish: black','COMPLETE' from bt.things where id=$2`,
      [source, thingId],
    );
    await env.pool.query(
      'insert into bt.thing_attachments(attachment_id,thing_id,owner_id) select $1,id,owner_id from bt.things where id=$2',
      [source, thingId],
    );
    let quote = 'Invented quotation',
      recommendations = 0,
      failWrite = false;
    env.importAi.suggestTasks = async () => {
      recommendations++;
      return { items: [] };
    };
    const ai: ImportAi = env.importAi;
    ai.additionalInformation = async (_input, tools) => {
      await tools.searchFieldSets('appliances', ['appliance']);
      if (failWrite)
        await env.pool
          .query(`create function bt.reject_fixture_field() returns trigger language plpgsql as $$
          begin raise exception 'Private persistence details'; end $$;
          create trigger reject_fixture_field before insert or update on bt.thing_fields for each row execute function bt.reject_fixture_field()`);
      return {
        findings: [
          {
            label: 'Finish',
            fieldId: 'appliances.finish',
            value: 'black',
            sensitive: false,
            reason: 'Identifies the finish',
            attachmentId: source,
            page: null,
            quote,
          },
        ],
      };
    };
    const submitted = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    const warned = await waitForImport(env, id);
    assert.equal(warned.status, 'COMPLETE', JSON.stringify(warned));
    assert.equal(recommendations, 1);
    assert.ok(warned.warnings?.some((warning) => warning.retryable));
    const checkpoint = await env.pool.query('select workflow from bt.imports where id=$1', [id]);
    assert.equal(checkpoint.rows[0].workflow.warnings[0].reason, 'Invalid source evidence');
    assert.ok(
      !checkpoint.rows[0].workflow.done.some((key: string) => key.startsWith('additional:')),
    );

    quote = 'Finish: black';
    assert.equal((await request('POST', `/api/imports/${id}:retry`)).statusCode, 200);
    const retried = await waitForImport(env, id);
    assert.equal(retried.status, 'COMPLETE');
    assert.equal(retried.warnings?.length, 0);
    assert.equal(recommendations, 1);
    const fields = await env.pool.query(
      "select value from bt.thing_fields where thing_id=$1 and field_id='appliances.finish'",
      [thingId],
    );
    assert.equal(fields.rows[0].value, 'black');

    failWrite = true;
    const failed = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    const failedId = failed.json<Schema['ImportAccepted']>().importId;
    assert.equal((await waitForImport(env, failedId)).status, 'INCOMPLETE');
    const failure = await env.pool.query('select workflow from bt.imports where id=$1', [failedId]);
    assert.deepEqual(failure.rows[0].workflow.failure, {
      stage: 'ADDITIONAL_INFORMATION',
      reason: 'database_P0001',
    });
    assert.ok(!failure.rows[0].workflow.done.some((key: string) => key.startsWith('additional:')));
    assert.equal(recommendations, 1);
    await env.pool.query(
      'drop trigger reject_fixture_field on bt.thing_fields; drop function bt.reject_fixture_field()',
    );
    failWrite = false;
    assert.equal((await request('POST', `/api/imports/${failedId}:retry`)).statusCode, 200);
    assert.equal((await waitForImport(env, failedId)).status, 'COMPLETE');
    const recovered = await env.pool.query('select workflow from bt.imports where id=$1', [
      failedId,
    ]);
    assert.equal(recovered.rows[0].workflow.failure, undefined);
  } finally {
    await env.close();
  }
});

// Resource discovery returned an everyday name that the workflow never applied.
test('research names update new imports, reach field selection and respect owner names', async () => {
  const env = await startTestApp();
  try {
    let cited = true,
      name = 'Example Oven';
    const selectedNames: string[] = [];
    const select = env.importAi.selectFieldSets.bind(env.importAi);
    env.importAi.selectFieldSets = async (candidate, tools) => {
      selectedNames.push(candidate.name);
      return select(candidate, tools);
    };
    env.importAi.findResources = async () => ({
      identity: { name, sourceUrl: 'https://maker.example/oven' },
      items: [],
      sources: cited ? ['https://maker.example/oven'] : [],
    });
    const request = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    await request('POST', '/api/things', { name: 'Example Oven', categoryId: 'appliances' });
    const upload = await env.app.inject({
      method: 'POST',
      url: '/api/attachments',
      headers: {
        authorization: env.authorization,
        'content-type': 'multipart/form-data; boundary=fixture',
      },
      payload:
        '--fixture\r\nContent-Disposition: form-data; name="file"; filename="plate.txt"\r\nContent-Type: text/plain\r\n\r\nmodel-only X1 neff\r\n--fixture--\r\n',
    });
    const attachmentId = upload.json<Schema['Attachment']>().id;
    const submit = await request('POST', '/api/imports', { attachmentIds: [attachmentId] });
    const id = submit.json<Schema['ImportAccepted']>().importId;
    const job = await waitForImport(env, id);
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    const thingId = job.thingId!;
    assert.equal(
      (await request('GET', '/api/things/' + thingId)).json<Schema['Thing']>().name,
      'Example Oven (X1)',
    );
    assert.deepEqual(selectedNames, ['Example Oven (X1)']);
    await request('PATCH', '/api/things/' + thingId, { name: 'Kitchen oven' });
    name = 'Replacement name';
    const refresh = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    assert.equal(
      (await waitForImport(env, refresh.json<Schema['ImportAccepted']>().importId)).status,
      'COMPLETE',
    );
    assert.equal(
      (await request('GET', '/api/things/' + thingId)).json<Schema['Thing']>().name,
      'Kitchen oven',
    );

    cited = false;
    const resolve = env.importAi.resolveThing.bind(env.importAi);
    env.importAi.resolveThing = async (input, tools) => {
      const result = await resolve(input, tools);
      for (const candidate of result.candidates) {
        candidate.matchedThingId = null;
        candidate.name = 'Unidentified appliance';
      }
      return result;
    };
    const unproved = await request('POST', '/api/imports', { attachmentIds: [attachmentId] });
    const unprovedId = unproved.json<Schema['ImportAccepted']>().importId;
    const unprovedJob = await waitForImport(env, unprovedId);
    assert.equal(unprovedJob.status, 'COMPLETE');
    assert.equal(
      (await request('GET', '/api/things/' + unprovedJob.thingId)).json<Schema['Thing']>().name,
      'Unidentified appliance',
    );
    assert.equal(
      (await request('GET', '/api/things/' + thingId)).json<Schema['Thing']>().name,
      'Kitchen oven',
    );
  } finally {
    await env.close();
  }
});
