/** Checks that an EPC lookup populates owner-scoped Household fields through an Import. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import type { Schema } from '../../../shared/model.js';
import { setEnvValue } from '../../src/config.js';
import { EpcGovUkProvider } from '../../src/providers/epc-govuk/index.js';
import { createTestApp } from '../support/test-app.js';

test('Household import saves EPC fields and masks the certificate reference', async () => {
  const reference = '0012-3456-7890-1234-5678';
  const provider = new EpcGovUkProvider(async (input) => {
    if (new URL(String(input)).pathname === '/api/domestic/search')
      return Response.json({
        data: [
          {
            certificateNumber: reference,
            addressLine1: '15 Example Street',
            postcode: 'LS6 1AA',
            registrationDate: '2024-06-12',
          },
        ],
        pagination: { totalPages: 1 },
      });
    return Response.json({
      data: {
        status: 'entered',
        report_type: 2,
        postcode: 'LS6 1AA',
        address_line_1: '15 Example Street',
        current_energy_efficiency_band: 'C',
        property_type: 0,
        built_form: 2,
        total_floor_area: 80,
      },
    });
  });
  const env = await createTestApp({ importWorkflow: { specialists: [provider] } });
  setEnvValue('EPC_GOVUK_API_KEY', 'fixture-key');
  try {
    const request = (method: 'GET' | 'POST', url: string, payload?: object) =>
      env.app.inject({ method, url, payload, headers: { authorization: env.authorization } });
    const created = await request('POST', '/api/things', {
      name: 'Example home',
      categoryId: 'household',
      values: [
        {
          fieldSetId: 'household.household',
          fieldId: 'household.address',
          value: '15 Example Street, LS6 1AA',
        },
      ],
    });
    assert.equal(created.statusCode, 201, created.body);
    const { id: thingId } = created.json<Schema['Thing']>();
    const submitted = await request('POST', '/api/imports', { attachmentIds: [], thingId });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const { importId } = submitted.json<Schema['ImportAccepted']>();
    let job: Schema['Import'] | undefined;
    for (let attempt = 0; attempt < 250; attempt++) {
      const response = await request('GET', '/api/imports/' + importId);
      assert.equal(response.statusCode, 200, response.body);
      job = response.json<Schema['Import']>();
      if (['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(job.status)) break;
      await setTimeout(20);
    }
    assert.equal(job?.status, 'COMPLETE');
    assert.deepEqual(job.warnings ?? [], []);
    const detail = await request('GET', '/api/things/' + thingId);
    assert.equal(detail.statusCode, 200, detail.body);
    const fields = detail.json<Schema['Thing']>().fieldSets.flatMap((set) => set.fields);
    const rating = fields.find((field) => field.id === 'household.energyRating');
    assert.equal(rating?.value, 'C');
    assert.equal(rating?.sourceRefs[0]?.provider, 'EPC_GOVUK');
    assert.equal(fields.find((field) => field.id === 'household.floorArea')?.value, 80);
    assert.equal(
      fields.find((field) => field.id === 'household.energyCertificateReference')?.masked,
      true,
    );
    assert.doesNotMatch(detail.body, new RegExp(reference));
  } finally {
    await env.close();
  }
});
