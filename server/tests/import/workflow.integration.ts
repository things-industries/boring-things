/** Exercises the persisted single-Thing workflow, retries and shared resources with fixture providers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as attachmentsDb from '../../src/db/entities/attachments.js';
import { setTimeout } from 'node:timers/promises';
import { startTestApp } from '../../test/support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ResearchThing } from '../../src/application/import/types.js';

test('contextual Import and Recommendation preserve owner fields and retry unfinished work', async () => {
  const app = await startTestApp({ importWorkflow: { specialists: [] } });
  try {
    const researchNames: (string | undefined)[] = [];
    app.importAi.findResources = async (research?: ResearchThing) => {
      researchNames.push(research?.name);
      return { items: [], sources: [] };
    };
    const request = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
      app.app.inject({ method, url, payload, headers: { authorization: app.authorization } });
    const created = await request('POST', '/api/things', {
      name: 'Test oven',
      categoryId: 'appliances',
      addFieldSetIds: ['appliances.warranty'],
      values: [
        { fieldSetId: 'appliances.appliance', fieldId: 'appliances.zNumber', value: 'OWNER' },
        { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'X1' },
      ],
    });
    assert.equal(created.statusCode, 201, created.body);
    const thing = created.json<Schema['Thing']>();
    const empty = await request('POST', '/api/imports', { attachmentIds: [] });
    assert.equal(empty.json<Schema['ImportAccepted']>().status, 'COMPLETE');
    app.importAi.failOnce = true;
    const submitted = await request('POST', '/api/imports', {
      attachmentIds: [],
      thingId: thing.id,
    });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    const wait = async (id: string) => {
      for (let n = 0; n < 200; n++) {
        const response = await request('GET', '/api/imports/' + id);
        assert.equal(response.statusCode, 200, response.body);
        const job = response.json<Schema['Import']>();
        if (['COMPLETE', 'FAILED', 'INCOMPLETE'].includes(job.status)) return job;
        await setTimeout(20);
      }
      throw new Error('Import timed out');
    };
    assert.equal((await wait(id)).status, 'INCOMPLETE');
    const retry = await request('POST', '/api/imports/' + id + ':retry');
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal((await wait(id)).status, 'COMPLETE');
    assert.deepEqual(researchNames, [undefined]);
    const saved = await request('GET', '/api/things/' + thing.id);
    assert.equal(saved.statusCode, 200, saved.body);
    const detail = saved.json<Schema['Thing']>();
    assert.equal(
      detail.fieldSets
        .flatMap((set) => set.fields)
        .find((field) => field.id === 'appliances.zNumber')?.value,
      'OWNER',
    );
    const recommended = await request('POST', '/api/things/' + thing.id + ':recommend');
    assert.equal(recommended.statusCode, 202, recommended.body);
    const recommendation = await wait(recommended.json<Schema['ImportAccepted']>().importId);
    assert.equal(recommendation.operation, 'RECOMMENDATION');
    assert.equal(recommendation.status, 'COMPLETE');
    assert.equal(recommendation.attachmentId, null);
  } finally {
    await app.close();
  }
});

test('uploaded evidence populates one Thing and shared manuals are reused without exposing associations', async () => {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const content = Buffer.from(await pdf.save());
  let downloads = 0;
  const env = await startTestApp({
    importWorkflow: {
      specialists: [],
      download: async () => {
        downloads++;
        return content;
      },
    },
  });
  try {
    const resolve = env.importAi.resolveThing.bind(env.importAi);
    env.importAi.resolveThing = async (input, tools) => {
      const result = await resolve(input, tools);
      for (const candidate of result.candidates) candidate.name = 'Example oven (2021)';
      return result;
    };
    const researchNames: (string | undefined)[] = [];
    const request = (method: 'GET' | 'POST' | 'DELETE' | 'PATCH', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    const baseTranscribe = env.importAi.transcribe.bind(env.importAi);
    env.importAi.transcribe = async (source) =>
      source.mediaType === 'application/pdf'
        ? {
            text: 'public-manual X1',
            summary: 'public-manual X1',
            terms: ['manual'],
            status: 'COMPLETE',
            metadata: null,
            identifiers: [],
          }
        : baseTranscribe(source);
    env.importAi.findResources = async (research?: ResearchThing) => {
      researchNames.push(research?.name);
      return {
        items: [
          {
            kind: 'reference' as const,
            title: 'Official manual',
            description: 'Model X1 manual',
            url: 'https://example.com/manual.pdf',
            sourceUrl: 'https://example.com/oven',
            metadata: null,
          },
        ],
        sources: ['https://example.com/manual.pdf', 'https://example.com/oven'],
      };
    };
    env.importAi.assessResource = async () => {
      const source = await env.pool.query<{ id: string }>(
        'select id from bt.attachments where owner_id is null',
      );
      return {
        applicable: true,
        identifiers: [
          {
            fieldId: 'common.model',
            value: 'X1',
            attachmentId: source.rows[0].id,
            page: 1,
            quote: 'public-manual X1',
          },
        ],
      };
    };
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
    assert.equal(upload.statusCode, 201, upload.body);
    const privateId = upload.json<Schema['Attachment']>().id;
    const submit = await request('POST', '/api/imports', { attachmentIds: [privateId] });
    assert.equal(submit.statusCode, 202, submit.body);
    const wait = async (id: string) => {
      for (let n = 0; n < 250; n++) {
        const response = await request('GET', '/api/imports/' + id);
        assert.equal(response.statusCode, 200, response.body);
        const job = response.json<Schema['Import']>();
        if (['COMPLETE', 'FAILED', 'INCOMPLETE'].includes(job.status)) return job;
        await setTimeout(20);
      }
      throw new Error('Import timed out');
    };
    const job = await wait(submit.json<Schema['ImportAccepted']>().importId);
    assert.equal(job.status, 'COMPLETE', JSON.stringify(job));
    assert.deepEqual(researchNames, ['Example oven (2021)']);
    assert.equal(job.thingIds.length, 1);
    const first = job.thingIds[0];
    const shared = (
      await env.pool.query<{ id: string; owner_id: string | null; identifier_coverage: unknown }>(
        'select id,owner_id,identifier_coverage from bt.attachments where owner_id is null',
      )
    ).rows[0];
    assert.equal(shared.owner_id, null);
    assert.deepEqual(shared.identifier_coverage, [{ fieldId: 'common.model', value: 'X1' }]);
    const fields = (await request('GET', '/api/things/' + first))
      .json<Schema['Thing']>()
      .fieldSets.flatMap((set) => set.fields);
    assert.equal(fields.find((field) => field.id === 'appliances.zNumber')?.value, '0015');
    const foreignOwner = randomUUID(),
      foreignThing = randomUUID();
    await env.pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      foreignOwner,
      'foreign-fixture',
    ]);
    await env.pool.query(
      "insert into bt.things(id,owner_id,category_id,name,data) values($1,$2,'appliances','Other owner oven','{}')",
      [foreignThing, foreignOwner],
    );
    await env.pool.query(
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3)',
      [foreignThing, shared.id, foreignOwner],
    );
    const visible = (await request('GET', '/api/attachments/' + shared.id)).json<
      Schema['Attachment']
    >();
    assert.ok(!visible.thingIds.includes(foreignThing));
    await assert.rejects(
      attachmentsDb.getOwnedAttachmentOrThrow(env.pool, foreignOwner, privateId),
      /not found/,
    );
    assert.equal(downloads, 1);
    assert.equal(
      (await request('PATCH', '/api/attachments/' + shared.id, { title: 'Owner edit' })).statusCode,
      409,
    );
    assert.equal((await request('DELETE', '/api/attachments/' + shared.id)).statusCode, 409);
    const secondResponse = await request('POST', '/api/things', {
      name: 'Second oven',
      categoryId: 'appliances',
      values: [{ fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'X1' }],
    });
    assert.equal(secondResponse.statusCode, 201, secondResponse.body);
    const second = secondResponse.json<Schema['Thing']>().id;
    const resubmitted = await request('POST', '/api/imports', {
      attachmentIds: [],
      thingId: second,
    });
    assert.equal(
      (await wait(resubmitted.json<Schema['ImportAccepted']>().importId)).status,
      'COMPLETE',
    );
    assert.equal(downloads, 1);
    const unlinked = await request('DELETE', `/api/attachments/${shared.id}/things/${second}`);
    assert.equal(unlinked.statusCode, 204, unlinked.body);
    const refresh = await request('POST', '/api/imports', { attachmentIds: [], thingId: second });
    assert.equal(
      (await wait(refresh.json<Schema['ImportAccepted']>().importId)).status,
      'COMPLETE',
    );
    const after = (await request('GET', '/api/things/' + second)).json<Schema['Thing']>();
    assert.ok(!after.attachmentIds.includes(shared.id));
    assert.deepEqual(researchNames, ['Example oven (2021)', undefined, undefined]);
    assert.equal((await request('DELETE', '/api/things/' + first)).statusCode, 204);
    assert.equal(
      (await env.pool.query('select 1 from bt.attachments where id=$1', [shared.id])).rowCount,
      1,
    );
  } finally {
    await env.close();
  }
});

// The new checkpoint workflow skipped restored evidence when its first transcription had failed.
test('retry transcribes a failed source and links its evidence to the existing target', async () => {
  const env = await startTestApp();
  try {
    const request = (method: 'GET' | 'POST', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    const created = await request('POST', '/api/things', {
      name: 'Retry fixture oven',
      categoryId: 'appliances',
    });
    const target = created.json<Schema['Thing']>().id;
    const transcribe = env.importAi.transcribe.bind(env.importAi);
    let fail = true;
    env.importAi.transcribe = async (source) => {
      if (fail) {
        fail = false;
        throw new Error('Synthetic transcription failure');
      }
      return transcribe(source);
    };
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
    assert.equal(upload.statusCode, 201, upload.body);
    const source = upload.json<Schema['Attachment']>().id;
    const submitted = await request('POST', '/api/imports', {
      attachmentIds: [source],
      thingId: target,
    });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    const wait = async () => {
      for (let n = 0; n < 250; n++) {
        const job = (await request('GET', '/api/imports/' + id)).json<Schema['Import']>();
        if (['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(job.status)) return job;
        await setTimeout(20);
      }
      throw new Error('Import timed out');
    };
    const before = await wait();
    assert.equal(before.status, 'COMPLETE');
    assert.ok(before.warnings?.some((warning) => warning.code === 'EXTRACTION_FAILED'));
    const retried = await request('POST', '/api/imports/' + id + ':retry');
    assert.equal(retried.statusCode, 200, retried.body);
    const after = await wait();
    assert.equal(after.status, 'COMPLETE', JSON.stringify(after));
    assert.deepEqual(after.thingIds, [target]);
    assert.equal(after.candidates[0].id, before.candidates[0].id);
    assert.equal(after.warnings?.length, 0);
    const detail = (await request('GET', '/api/things/' + target)).json<Schema['Thing']>();
    assert.ok(detail.attachmentIds.includes(source));
    assert.equal(
      detail.fieldSets
        .flatMap((set) => set.fields)
        .find((field) => field.id === 'appliances.zNumber')?.value,
      '0015',
    );
  } finally {
    await env.close();
  }
});
