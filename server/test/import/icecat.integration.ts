/** Checks specialist fields reach public research and completed Icecat lookups survive retries. */

import { setEnvValue } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setTimeout } from 'node:timers/promises';
import { IcecatProvider } from '../../src/providers/icecat/index.js';
import type { ResearchThing } from '../../src/application/import/types.js';
import { startTestApp } from '../support/test-app.js';
import type { Schema } from '../../../shared/model.js';

// Resource research discarded its failure reason when recording a retryable warning.
test('Icecat fields are saved before public research and reused when research is retried', async () => {
  let lookups = 0;
  const provider = new IcecatProvider(async () => {
    lookups++;
    return Response.json({
      msg: 'OK',
      data: {
        GeneralInfo: { IcecatId: 123, Brand: 'Example', BrandPartCode: 'X1' },
        FeaturesGroups: [{ Features: [{ Feature: { ID: '8491' }, PresentationValue: '240 V' }] }],
      },
    });
  });
  const env = await startTestApp({ importWorkflow: { specialists: [provider] } });
  setEnvValue('ICECAT_ACCESS_TOKEN', 'fixture-token');
  try {
    const request = (method: 'GET' | 'POST', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    let researchCalls = 0;
    env.importAi.findResources = async (research?: ResearchThing) => {
      assert.equal(
        research?.knownFields.find((field) => field.fieldId === 'appliances.supplyVoltage')?.value,
        '240 V',
      );
      if (++researchCalls === 1) throw new Error('text_limit');
      return { items: [], sources: [] };
    };
    const created = await request('POST', '/api/things', {
      name: 'Test appliance',
      categoryId: 'appliances',
      values: [
        { fieldSetId: 'appliances.appliance', fieldId: 'common.manufacturer', value: 'Example' },
        { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'X1' },
      ],
    });
    assert.equal(created.statusCode, 201, created.body);
    const thing = created.json<Schema['Thing']>();
    const submitted = await request('POST', '/api/imports', {
      attachmentIds: [],
      thingId: thing.id,
    });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    const wait = async () => {
      for (let n = 0; n < 250; n++) {
        const response = await request('GET', '/api/imports/' + id);
        assert.equal(response.statusCode, 200, response.body);
        const job = response.json<Schema['Import']>();
        if (['COMPLETE', 'FAILED', 'INCOMPLETE'].includes(job.status)) return job;
        await setTimeout(20);
      }
      throw new Error('Import timed out');
    };
    const first = await wait();
    assert.equal(first.status, 'COMPLETE');
    assert.equal(first.warnings?.length, 1);
    const checkpoint = await env.pool.query('select workflow from bt.imports where id=$1', [id]);
    assert.equal(checkpoint.rows[0].workflow.warnings[0].reason, 'text_limit');
    const retry = await request('POST', '/api/imports/' + id + ':retry');
    assert.equal(retry.statusCode, 200, retry.body);
    const completed = await wait();
    assert.equal(completed.status, 'COMPLETE');
    assert.equal(completed.warnings?.length, 0);
    assert.equal(lookups, 1);
    assert.equal(researchCalls, 2);
    const detail = await request('GET', '/api/things/' + thing.id);
    const voltage = detail
      .json<Schema['Thing']>()
      .fieldSets.flatMap((set) => set.fields)
      .find((field) => field.id === 'appliances.supplyVoltage');
    assert.equal(voltage?.value, '240 V');
    assert.equal(voltage?.sourceRefs[0].provider, 'ICECAT');
  } finally {
    await env.close();
  }
});
