/** Checks UK lookup applicability, source mapping, retries and owner field permissions. */

import { setEnvMode, setEnvValue } from '../../src/config.js';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ZyfyProvider } from '../../src/providers/zyfy/index.js';
import { Registry } from '../../src/application/registry/registry.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { addFieldSets, populateFields } from '../../src/application/thing-fields.js';
import { patchData } from '../../src/application/thing-data.js';
import { emptyData } from '../../../shared/model.js';
import type { ThingRow } from '../../src/db/entities/things.js';

beforeEach(() => {
  setEnvMode('test');
  setEnvValue('ZYFY_API_KEY', 'fixture-key');
});

const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);
const signal = new AbortController().signal;

// Supplies a vehicle with invented registration details and no other evidence.
function createThing(country: string | null = 'GB', registration = 'xy12 zzz'): ThingRow {
  return {
    id: 'fixture',
    userId: 'owner',
    name: 'Test vehicle',
    categoryId: 'vehicles',
    description: '',
    imageAttachmentId: null,
    isSample: false,
    createdAt: '2030-01-01',
    updatedAt: '2030-01-01',
    revision: 1,
    accessCount: 0,
    lastViewedAt: null,
    data: patchData(
      emptyData(),
      {
        values: [
          {
            fieldSetId: 'vehicles.vehicle',
            fieldId: 'vehicles.registrationCountry',
            value: country,
          },
          { fieldSetId: 'vehicles.vehicle', fieldId: 'vehicles.registration', value: registration },
        ],
      },
      'vehicles',
      registry,
    ),
  };
}

// Supplies only the source fields needed to exercise vehicle mapping.
function createVehicle() {
  return {
    registration: 'XY12ZZZ',
    enrichmentPending: false,
    make: 'EXAMPLE',
    model: 'CAR ONE',
    yearOfManufacture: 2012,
    monthOfFirstRegistration: '2012-05',
    fuelType: 'petrol',
    engineCapacityCc: 1200,
    dataAsOf: '2030-01-01T10:00:00Z',
    signals: {
      co2EmissionsGPerKm: 0,
      ulezCompliant: false,
      hasOutstandingRecall: null,
      motStatus: 'no_details',
      motExpiryDate: '2030-06-01',
      firstMotDue: null,
      lastMotDate: '2029-06-01',
      lastMotResult: 'passed',
      taxStatus: 'taxed',
      taxDueDate: '2030-07-01',
      vedAnnualCostGbp: 200,
    },
  };
}

test('Zyfy accepts UK plate patterns without a country and skips conflicting countries', async () => {
  let calls = 0;
  const provider = new ZyfyProvider(async () => {
    calls++;
    return Response.json(createVehicle());
  });
  for (const country of [null, 'GB']) assert.equal(provider.applicable(createThing(country)), true);
  for (const registration of [
    'xy12 zzz',
    'A1 ABC',
    'ABC 12A',
    'AB 1234',
    '1234 AB',
    'ABC 1234',
    '1 A',
  ])
    assert.equal(provider.applicable(createThing(null, registration)), true, registration);
  const otherCategory = { ...createThing(), categoryId: 'devices' };
  for (const thing of [
    createThing('FR'),
    createThing('GB', ''),
    createThing('GB', 'TESTVIN00000000001'),
    ...['12345', 'LETTERS', 'AB-123', 'A1B2C3D', 'AB12345', '12345AB'].map((registration) =>
      createThing(null, registration),
    ),
    otherCategory,
  ]) {
    assert.equal(provider.applicable(thing), false);
    await assert.rejects(provider.lookup(thing, registry, signal), /Missing UK/);
  }
  assert.equal(calls, 0);
});

test('Zyfy maps source values with units, currency and provenance before applying automatic-population permissions', async () => {
  const thing = createThing();
  thing.data = patchData(
    thing.data,
    {
      addFieldSetIds: ['vehicles.roadMotor'],
      values: [
        { fieldSetId: 'vehicles.vehicle', fieldId: 'common.model', value: 'OWNER MODEL' },
        { fieldSetId: 'vehicles.roadMotor', fieldId: 'vehicles.londonUlezCompliant', value: null },
      ],
    },
    'vehicles',
    registry,
  );
  thing.data.userEdited = ['set:vehicles.roadTax'];
  const provider = new ZyfyProvider(async (url, init) => {
    assert.equal(String(url), 'https://zyfy.uk/v1/vehicle/XY12ZZZ');
    assert.equal(new Headers(init?.headers).get('X-Api-Key'), 'fixture-key');
    assert.equal(init?.redirect, 'error');
    return Response.json(createVehicle());
  });
  const result = await provider.lookup(thing, registry, signal);
  const mapped = new Map(result.values.map((field) => [field.fieldId, field.value]));
  assert.equal(mapped.get('vehicles.firstRegistered'), '2012-05');
  assert.equal(mapped.get('vehicles.yearOfManufacture'), 2012);
  assert.equal(mapped.has('vehicles.modelYear'), false);
  assert.equal(mapped.get('vehicles.engineCapacity'), '1200 cm³');
  assert.equal(mapped.get('vehicles.co2Emissions'), '0 g/km');
  assert.equal(mapped.get('vehicles.londonUlezCompliant'), false);
  assert.equal(mapped.get('vehicles.testStatus'), 'No details');
  assert.equal(mapped.has('vehicles.hasOutstandingRecall'), false);
  assert.equal(result.setIds.includes('vehicles.roadTax'), false);
  assert.ok(
    result.values.every(
      (field) =>
        field.sourceRefs[0].provider === 'ZYFY' &&
        field.sourceRefs[0].quote?.includes('2030-01-01T10:00:00Z') &&
        field.sourceRefs[0].retrievedAt &&
        !field.sourceRefs[0].url?.includes('fixture-key'),
    ),
  );
  const data = populateFields(
    addFieldSets(thing.data, 'vehicles', registry, result.setIds),
    result.values,
    registry,
    'DISCOVERY',
  );
  assert.equal(data.values['vehicles.vehicle']['common.model'].value, 'OWNER MODEL');
  assert.equal(data.values['vehicles.roadMotor']['vehicles.londonUlezCompliant'].value, null);
});

test('Zyfy keeps valid proposals when individual dates are invalid and preserves false and zero', async () => {
  const body = createVehicle();
  const provider = new ZyfyProvider(async () =>
    Response.json({
      ...body,
      signals: {
        ...body.signals,
        motExpiryDate: 'not a date',
        vedAnnualCostGbp: 0,
        hasOutstandingRecall: false,
      },
    }),
  );
  const result = await provider.lookup(createThing(), registry, signal);
  const mapped = new Map(result.values.map((field) => [field.fieldId, field.value]));
  assert.equal(mapped.has('vehicles.testExpiresOn'), false);
  assert.equal(mapped.get('common.manufacturer'), 'EXAMPLE');
  assert.equal(mapped.get('vehicles.hasOutstandingRecall'), false);
  assert.deepEqual(mapped.get('vehicles.annualTaxCost'), { amountMinor: 0, currency: 'GBP' });
});

test('Zyfy rejects a mismatched registration and provider errors, and accepts a missing vehicle', async () => {
  const mismatch = new ZyfyProvider(async () =>
    Response.json({ ...createVehicle(), registration: 'XY12AAA' }),
  );
  await assert.rejects(mismatch.lookup(createThing(), registry, signal), /identity mismatch/);
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const provider = new ZyfyProvider(async () => {
      calls++;
      return Response.json({ error: 'Provider error' }, { status });
    });
    await assert.rejects(provider.lookup(createThing(), registry, signal), /unavailable/);
    assert.equal(calls, 1);
  }
  const missing = new ZyfyProvider(async () =>
    Response.json({ error: 'Not found' }, { status: 404 }),
  );
  assert.deepEqual(await missing.lookup(createThing(), registry, signal), {
    setIds: [],
    values: [],
  });
});

test('Zyfy retries pending enrichment and stops after three requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const ready of [true, false]) {
    let calls = 0;
    const provider = new ZyfyProvider(async () => {
      calls++;
      return ready && calls === 2
        ? Response.json(createVehicle())
        : Response.json(
            { registration: 'XY12ZZZ', enrichmentPending: true },
            { headers: { 'Retry-After': '2' } },
          );
    });
    const lookup = provider.lookup(createThing(), registry, signal);
    const completed = ready
      ? lookup.then((result) => assert.ok(result.values.length))
      : assert.rejects(lookup, /pending/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    t.mock.timers.tick(1999);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    t.mock.timers.tick(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (!ready) {
      t.mock.timers.tick(2000);
    }
    await completed;
    assert.equal(calls, ready ? 2 : 3);
  }
});

test('Zyfy pending wait stops when its import is cancelled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let calls = 0;
  const provider = new ZyfyProvider(async () => {
    calls++;
    return Response.json(
      { registration: 'XY12ZZZ', enrichmentPending: true },
      { headers: { 'Retry-After': '4' } },
    );
  });
  const lookup = provider.lookup(createThing(), registry, controller.signal);
  const rejected = assert.rejects(lookup, { name: 'AbortError' });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await rejected;
  assert.equal(calls, 1);
});
