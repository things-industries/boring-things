/** Exercises optional Import failures, retry checkpoints and researched names with fixture providers. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createTestApp, type TestApp } from '../support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ImportAi } from '../../src/application/import/types.js';

import { searchFieldSets } from '../../src/providers/ai/tools/registry.js';
import { loadRegistry } from '../../src/application/registry/index.js';
import { ProviderHttpError } from '../../src/application/errors.js';
import { setDiagnosticLogger } from '../../src/metrics.js';

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

test('startup resumes an interrupted Import with a saved recommendation checkpoint', async (t) => {
  const env = await createTestApp();
  t.after(env.close);
  const request = (method: 'GET' | 'POST', url: string, payload?: object) =>
    env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
  const created = await request('POST', '/api/things', {
    name: 'Fixture oven',
    categoryId: 'appliances',
  });
  assert.equal(created.statusCode, 201, created.body);
  const { id: thingId } = created.json<Schema['Thing']>();
  let taskCalls = 0;
  let productCalls = 0;
  env.importAi.suggestTasks = async () => {
    taskCalls++;
    return { items: [{ title: 'Clean the tray', description: 'Wash it.', sourceRefs: [] }] };
  };
  env.importAi.findPurchasables = async () => {
    if (++productCalls === 1) throw new Error('Fixture product research failure');
    return { items: [] };
  };
  const submitted = await request('POST', `/api/things/${thingId}:recommend`);
  assert.equal(submitted.statusCode, 202, submitted.body);
  const { importId } = submitted.json<Schema['ImportAccepted']>();
  const initial = await waitForImport(env, importId);
  assert.equal(initial.status, 'COMPLETE');
  assert.equal(initial.warnings?.length, 1);
  const tasksUrl = `/api/tasks?thingId=${thingId}`;
  const tasks = (await request('GET', tasksUrl)).json<Schema['TaskList']>().items;
  assert.deepEqual(
    tasks.map(({ title }) => title),
    ['Clean the tray'],
  );

  // Recreate the persisted state of a process lost after committing the Task checkpoint.
  await env.restart(() =>
    env.pool.query("update bt.imports set status='RECOMMENDING', finished_at=null where id=$1", [
      importId,
    ]),
  );
  const resumed = await waitForImport(env, importId);
  assert.equal(resumed.status, 'COMPLETE');
  assert.equal(resumed.warnings?.length, 0);
  assert.equal(taskCalls, 1);
  assert.equal(productCalls, 2);
  assert.deepEqual((await request('GET', tasksUrl)).json<Schema['TaskList']>().items, tasks);
});

// The transcription wait caught database read failures and reported them as timeouts.
test('discovery reports a failed download separately from a failed transcription poll', async (t) => {
  const env = await createTestApp({
    importWorkflow: {
      specialists: [],
      download: async () => {
        throw new ProviderHttpError(403, 'Private download details');
      },
    },
  });
  const warnings: unknown[] = [];
  const failures: unknown[] = [];
  setDiagnosticLogger({
    info: () => {},
    warn: (details: unknown) => warnings.push(details),
    error: (details: unknown) => failures.push(details),
  });
  t.after(() => setDiagnosticLogger(undefined));
  try {
    const request = (url: string, payload?: object) =>
      env.app.inject({
        method: 'POST',
        url,
        payload,
        headers: { authorization: env.authorization },
      });
    const thing = (
      await request('/api/things', {
        name: 'Fixture oven',
        categoryId: 'appliances',
        values: [{ fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'X1' }],
      })
    ).json<Schema['Thing']>();
    let failRead = false;
    let failPoll = false;
    const query = env.pool.query;
    t.mock.method(env.pool, 'query', (statement: unknown, ...args: unknown[]) => {
      if (
        failRead &&
        typeof statement === 'string' &&
        statement.startsWith('select attachment_id from bt.import_sources')
      ) {
        failRead = false;
        return Promise.reject(
          Object.assign(new Error('Private database details'), { code: '08006' }),
        );
      }
      return Reflect.apply(query, env.pool, [statement, ...args]);
    });
    const url = 'https://manufacturer.example/manual.pdf';
    env.importAi.findResources = async () => {
      failRead = failPoll;
      return {
        items: failPoll
          ? []
          : [
              {
                kind: 'reference',
                url,
                sourceUrl: url,
                title: 'Oven manual',
                description: 'Instructions',
              },
            ],
        sources: [url],
      };
    };
    const submit = async () => {
      const response = await request('/api/imports', { attachmentIds: [], thingId: thing.id });
      assert.equal(response.statusCode, 202, response.body);
      return response.json<Schema['ImportAccepted']>().importId;
    };
    const downloaded = await submit();
    const partial = await waitForImport(env, downloaded);
    assert.equal(partial.status, 'COMPLETE');
    assert.equal(partial.warnings?.[0]?.code, 'UNAVAILABLE');
    assert.partialDeepStrictEqual(warnings[0], {
      event: 'import_stage_warning',
      jobId: downloaded,
      stage: 'resource',
      reason: 'http_403',
    });

    failPoll = true;
    const polled = await submit();
    const failed = await waitForImport(env, polled);
    assert.equal(failed.status, 'INCOMPLETE');
    assert.equal(failed.warnings?.length, 0);
    assert.partialDeepStrictEqual(failures[0], {
      event: 'job_finished',
      jobId: polled,
      status: 'INCOMPLETE',
      stage: 'wait_for_transcription',
      reason: 'database_08006',
    });
    assert.doesNotMatch(JSON.stringify([warnings, failures]), /Private|manufacturer\.example/);
  } finally {
    await env.close();
  }
});

test('additional-information retry resumes the unfinished range of a large transcript', async () => {
  const env = await createTestApp();
  try {
    const request = (url: string, payload?: object) =>
      env.app.inject({
        method: 'POST',
        url,
        payload,
        headers: { authorization: env.authorization },
      });
    const thing = (
      await request('/api/things', {
        name: 'Fixture oven',
        categoryId: 'appliances',
      })
    ).json<Schema['Thing']>();
    const source = randomUUID();
    const transcript = 'A'.repeat(66_650) + 'B'.repeat(40_000);
    await env.pool.query(
      `insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status)
       select $1,owner_id,'large.txt','text/plain',1,'large-fixture',$3,'COMPLETE' from bt.things where id=$2`,
      [source, thing.id, transcript],
    );
    await env.pool.query(
      'insert into bt.thing_attachments(attachment_id,thing_id,owner_id) select $1,id,owner_id from bt.things where id=$2',
      [source, thing.id],
    );
    const batches: string[] = [];
    env.importAi.additionalInformation = async ({ text }) => {
      batches.push(text);
      if (batches.length === 2) throw new Error('ai_provider_failed');
      return { findings: [] };
    };
    const submitted = await request('/api/imports', { attachmentIds: [], thingId: thing.id });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const { importId } = submitted.json<Schema['ImportAccepted']>();
    const first = await waitForImport(env, importId);
    assert.equal(first.warnings?.length, 1);
    assert.equal(batches.length, 2);
    assert.equal(batches[0] + batches[1], transcript);
    assert.ok(batches[0].length > 66_650);

    // A retry starts its own queue and source wait clocks.
    await env.pool.query("update bt.imports set queued_at='2000-01-01' where id=$1", [importId]);
    const retried = await request('/api/imports/' + importId + ':retry');
    assert.equal(retried.statusCode, 200, retried.body);
    const second = await waitForImport(env, importId);
    assert.equal(second.status, 'COMPLETE');
    assert.equal(second.warnings?.length, 0);
    assert.equal(batches.length, 3);
    assert.equal(batches[2], batches[1]);
    const { rows } = await env.pool.query(
      "select queued_at > '2000-01-01' as new_queue_entry, queued_at >= source_wait_started_at as source_wait_recorded from bt.imports where id=$1",
      [importId],
    );
    assert.deepEqual(rows[0], { new_queue_entry: true, source_wait_recorded: true });
  } finally {
    await env.close();
  }
});

// Additional-information validation aborted the single-Thing workflow before recommendations.
test('additional-information warnings permit recommendations and retry, while write failures stop the Import', async () => {
  const env = await createTestApp();
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
       select $1,owner_id,'plate.txt','text/plain',1,'fixture-plate',
         'Finish: black. Inspection: 28 February 2090. Service: 30 February 2090.',
         'COMPLETE' from bt.things where id=$2`,
      [source, thingId],
    );
    await env.pool.query(
      'insert into bt.thing_attachments(attachment_id,thing_id,owner_id) select $1,id,owner_id from bt.things where id=$2',
      [source, thingId],
    );
    let label = '',
      recommendations = 0,
      failWrite = false;
    env.importAi.suggestTasks = async () => {
      recommendations++;
      return { items: [] };
    };
    const ai: ImportAi = env.importAi;
    const registryResources = { db: env.pool, registry: await loadRegistry(env.pool) };
    const inspectionDates = [
      { label: 'Inspection', value: '2090-02-28', quote: 'Inspection: 28 February 2090' },
      { label: 'Service', value: '2090-02-30', quote: 'Service: 30 February 2090' },
    ];
    ai.additionalInformation = async (_input, context) => {
      await searchFieldSets(context, registryResources, 'appliances', ['appliance']);
      if (failWrite)
        await env.pool
          .query(`create function bt.reject_fixture_field() returns trigger language plpgsql as $$
          begin raise exception 'Private persistence details'; end $$;
          create trigger reject_fixture_field before insert or update on bt.thing_fields for each row execute function bt.reject_fixture_field()`);
      return {
        findings: [
          {
            label,
            fieldId: 'appliances.finish',
            value: 'black',
            sensitive: false,
            reason: 'Identifies the finish',
            attachmentId: source,
            page: null,
            quote: 'Finish: black',
          },
          ...inspectionDates.map((date) => ({
            ...date,
            fieldId: null,
            valueType: 'DATE' as const,
            sensitive: false,
            reason: 'Records a maintenance date',
            attachmentId: source,
            page: null,
          })),
        ],
      };
    };
    const submitted = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    const warned = await waitForImport(env, id);
    assert.equal(warned.status, 'COMPLETE', JSON.stringify(warned));
    assert.equal(recommendations, 1);
    assert.equal(warned.warnings?.length, 0);
    const checkpoint = await env.pool.query('select workflow from bt.imports where id=$1', [id]);
    assert.equal(checkpoint.rows[0].workflow.warnings.length, 0);
    assert.ok(
      checkpoint.rows[0].workflow.done.some((key: string) => key.startsWith('additional:')),
    );

    label = 'Finish';
    const corrected = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    const retried = await waitForImport(env, corrected.json<Schema['ImportAccepted']>().importId);
    assert.equal(retried.status, 'COMPLETE');
    assert.equal(retried.warnings?.length, 0);
    assert.equal(recommendations, 2);
    const fields = await env.pool.query(
      "select value from bt.thing_fields where thing_id=$1 and field_id='appliances.finish'",
      [thingId],
    );
    assert.equal(fields.rows[0].value, 'black');
    const customFields = await env.pool.query(
      'select value, custom_definition from bt.thing_fields where thing_id=$1 and custom_definition is not null',
      [thingId],
    );
    assert.deepEqual(
      customFields.rows.map(({ value, custom_definition: definition }) => ({
        value,
        label: definition.label,
        valueType: definition.valueType,
      })),
      [{ value: '2090-02-28', label: 'Inspection', valueType: 'DATE' }],
    );

    const findPurchasables = env.importAi.findPurchasables.bind(env.importAi);
    env.importAi.findPurchasables = async () => {
      throw new Error('tool_limit');
    };
    const limited = await request('POST', `/api/things/${thingId}:recommend`);
    const limitedId = limited.json<Schema['ImportAccepted']>().importId;
    assert.equal((await waitForImport(env, limitedId)).status, 'COMPLETE');
    const limitedCheckpoint = await env.pool.query('select workflow from bt.imports where id=$1', [
      limitedId,
    ]);
    assert.equal(limitedCheckpoint.rows[0].workflow.warnings[0].reason, 'tool_limit');
    env.importAi.findPurchasables = findPurchasables;

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
    assert.equal(recommendations, 3);
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
  const env = await createTestApp();
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
      'Replacement name',
    );
    assert.equal(
      (await request('GET', '/api/things/' + thingId)).json<Schema['Thing']>().name,
      'Kitchen oven',
    );
  } finally {
    await env.close();
  }
});
