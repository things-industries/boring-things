/** Checks vehicle lookup persistence, owner permissions and saved-field handoff to public research. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { ZyfyProvider } from '../../src/providers/zyfy/index.js';
import { startTestApp } from '../support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ResearchThing } from '../../src/application/import/types.js';

// Requiring registration country skipped UK plate imports before specialist research.
test('Zyfy looks up a UK plate without country before public research and reuses it on retry', async () => {
  let lookups = 0;
  const provider = new ZyfyProvider('fixture-key', async () => {
    lookups++;
    return Response.json({
      registration: 'XY12ZZZ',
      enrichmentPending: false,
      make: 'EXAMPLE',
      model: 'SOURCE MODEL',
      monthOfFirstRegistration: '2012-05',
      signals: {
        co2EmissionsGPerKm: 100,
        taxStatus: 'taxed',
        vedAnnualCostGbp: 200,
        hasOutstandingRecall: false,
      },
    });
  });
  const env = await startTestApp({ importWorkflow: { specialists: [provider] } });
  try {
    const request = (method: 'GET' | 'POST', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    let researchCalls = 0;
    env.importAi.findResources = async (research?: ResearchThing) => {
      assert.equal(
        research?.knownFields.find((field) => field.fieldId === 'vehicles.co2Emissions')?.value,
        '100 g/km',
      );
      assert.equal(
        research?.knownFields.some((field) =>
          [
            'vehicles.firstRegistered',
            'vehicles.taxStatus',
            'vehicles.hasOutstandingRecall',
          ].includes(field.fieldId),
        ),
        false,
      );
      if (++researchCalls === 1) throw new Error('research unavailable');
      return { items: [], sources: [] };
    };
    const created = await request('POST', '/api/things', {
      name: 'Test vehicle',
      categoryId: 'vehicles',
      values: [
        { fieldSetId: 'vehicles.vehicle', fieldId: 'vehicles.registration', value: 'XY12ZZZ' },
        { fieldSetId: 'vehicles.vehicle', fieldId: 'common.model', value: 'OWNER MODEL' },
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
      for (let attempt = 0; attempt < 250; attempt++) {
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
    const retry = await request('POST', '/api/imports/' + id + ':retry');
    assert.equal(retry.statusCode, 200, retry.body);
    const completed = await wait();
    assert.equal(completed.status, 'COMPLETE');
    assert.equal(completed.warnings?.length, 0);
    assert.equal(lookups, 1);
    assert.equal(researchCalls, 2);
    const detail = await request('GET', '/api/things/' + thing.id);
    assert.equal(detail.statusCode, 200, detail.body);
    const fields = new Map(
      detail
        .json<Schema['Thing']>()
        .fieldSets.flatMap((set) => set.fields)
        .map((field) => [field.id, field]),
    );
    assert.equal(fields.get('common.model')?.value, 'OWNER MODEL');
    assert.equal(fields.get('vehicles.firstRegistered')?.value, '2012-05');
    assert.equal(fields.get('vehicles.hasOutstandingRecall')?.value, false);
    assert.deepEqual(fields.get('vehicles.annualTaxCost')?.value, {
      amountMinor: 20000,
      currency: 'GBP',
    });
    assert.equal(fields.get('vehicles.annualTaxCost')?.sourceRefs[0].provider, 'ZYFY');
  } finally {
    await env.close();
  }
});
