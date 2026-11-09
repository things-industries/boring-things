/** Checks Icecat triggers, catalogue identity, free-access outcomes and cited field mapping. */

// cspell:words generalinfo featuregroups
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IcecatProvider } from '../../src/application/import/specialists.js';
import { Registry } from '../../src/application/registry/registry.js';
import { fields, sets } from '../../src/db/seeds/registry.js';
import { addFieldSets, populateFields } from '../../src/application/thing-fields.js';
import { patchData } from '../../src/application/thing-data.js';
import { emptyData } from '../../../shared/model.js';
import type { ThingRow } from '../../src/db/entities/things.js';

const registry = new Registry(fields, sets);
const signal = new AbortController().signal;

// Builds an appliance or device with only the identifiers needed by a test.
function createThing(values: Record<string, string>, categoryId = 'appliances'): ThingRow {
  return {
    id: 'fixture',
    ownerId: 'owner',
    name: 'Test product',
    categoryId,
    description: '',
    imageAttachmentId: null,
    isSample: false,
    createdAt: '2030-01-01',
    updatedAt: '2030-01-01',
    revision: 1,
    accessCount: 0,
    lastViewedAt: null,
    data: {
      ...addFieldSets(emptyData(), categoryId, registry),
      standalone: Object.fromEntries(
        Object.entries(values).map(([id, value]) => [
          id,
          {
            value,
            origin: 'USER',
            sourceRefs: [],
            autoPopulate: false,
          },
        ]),
      ),
    },
  };
}

// Supplies invented product identity and only the features exercised by mapping checks.
function createProduct(info: Record<string, unknown> = {}) {
  return {
    msg: 'OK',
    data: {
      GeneralInfo: {
        IcecatId: 123,
        Brand: 'Example',
        BrandPartCode: 'X1/AB',
        GTIN: ['0012345678905'],
        ...info,
      },
      FeaturesGroups: [
        {
          Features: [
            { Feature: { ID: '1649' }, PresentationValue: '321 mm' },
            { Feature: { ID: '4098' }, PresentationValue: '1200 W' },
            { Feature: { ID: '8491' }, PresentationValue: '220 - 240 V' },
            { Feature: { ID: '1766' }, PresentationValue: 'Black' },
            { Feature: { ID: '944' }, PresentationValue: '127 cm (50 inches)' },
            { Feature: { ID: '1585' }, PresentationValue: '1920 x 1080 pixels' },
            { Feature: { ID: '3808' }, PresentationValue: '999 mm' },
          ],
        },
      ],
    },
  };
}

test('Icecat requires catalogue identifiers on appliances or devices', () => {
  const provider = new IcecatProvider('fixture-token');
  for (const category of ['appliances', 'devices']) {
    assert.equal(
      provider.applicable(createThing({ 'common.gtin': '0012345678905' }, category)),
      true,
    );
    assert.equal(
      provider.applicable(
        createThing({ 'common.manufacturer': 'Example', 'common.model': 'X1/AB' }, category),
      ),
      true,
    );
    const missingIdentifiers: Record<string, string>[] = [
      {},
      { 'common.manufacturer': 'Example' },
      { 'common.model': 'X1/AB' },
      { 'common.manufacturer': 'Example', 'common.serialNumber': 'X1/AB' },
      { 'common.gtin': 'not-a-barcode' },
      { 'common.manufacturer': ' ', 'common.model': 'X1/AB' },
    ];
    for (const values of missingIdentifiers)
      assert.equal(provider.applicable(createThing(values, category)), false);
  }
  assert.equal(
    provider.applicable(createThing({ 'common.gtin': '0012345678905' }, 'vehicles')),
    false,
  );
});

test('Icecat authenticates by header, prefers product code to model and maps cited fields', async () => {
  const thing = createThing({
    'common.manufacturer': 'Example',
    'appliances.productCode': 'X1/AB',
    'common.model': 'Marketing name',
  });
  const provider = new IcecatProvider('fixture-token', async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('Brand'), 'Example');
    assert.equal(url.searchParams.get('ProductCode'), 'X1/AB');
    assert.equal(url.searchParams.get('content'), 'generalinfo,featuregroups');
    assert.equal(url.href.includes('fixture-token'), false);
    assert.equal(new Headers(init?.headers).get('api-token'), 'fixture-token');
    return Response.json(createProduct());
  });
  const result = await provider.lookup(thing, registry, signal);
  const data = populateFields(
    addFieldSets(thing.data, 'appliances', registry, result.setIds),
    result.values,
    registry,
    'DISCOVERY',
  );
  assert.equal(data.values['appliances.dimensions']['common.width'].value, '321 mm');
  assert.equal(data.values['appliances.electrical']['appliances.ratedInputPower'].value, '1200 W');
  assert.equal(data.values['appliances.appliance']['common.gtin'].value, '0012345678905');
  assert.equal(data.values['appliances.appliance']['appliances.finish'].value, 'Black');
  assert.ok(
    result.values.every(
      (value) =>
        value.sourceRefs[0].provider === 'ICECAT' &&
        value.sourceRefs[0].url?.includes('icecat_id=123'),
    ),
  );
  assert.equal(
    result.values.some((value) => value.fieldId.startsWith('devices.')),
    false,
  );
});

test('Icecat accepts model numbers as product codes and rejects a different brand or variant', async () => {
  const thing = createThing(
    { 'common.manufacturer': 'Example', 'common.model': 'X1/AB' },
    'devices',
  );
  const provider = new IcecatProvider('fixture-token', async (input) => {
    assert.equal(new URL(String(input)).searchParams.get('ProductCode'), 'X1/AB');
    return Response.json(createProduct());
  });
  const result = await provider.lookup(thing, registry, signal);
  assert.equal(
    result.values.find((value) => value.fieldId === 'devices.displayResolution')?.value,
    '1920 x 1080 pixels',
  );
  for (const info of [{ Brand: 'Different' }, { BrandPartCode: 'X1/ZZ' }]) {
    const mismatched = new IcecatProvider('fixture-token', async () =>
      Response.json(createProduct(info)),
    );
    await assert.rejects(mismatched.lookup(thing, registry, signal), /identity mismatch/);
  }
});

test('Icecat GTIN lookup keeps leading zeroes and verifies the returned barcode', async () => {
  const thing = createThing({ 'common.gtin': '0012345678905' });
  const provider = new IcecatProvider('fixture-token', async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('GTIN'), '0012345678905');
    assert.equal(url.searchParams.has('Brand'), false);
    return Response.json(createProduct({ GTIN: ['12345678905'] }));
  });
  await assert.rejects(provider.lookup(thing, registry, signal), /identity mismatch/);
  const matched = new IcecatProvider('fixture-token', async () =>
    Response.json(createProduct({ GTIN: ['00012345678905'] })),
  );
  const result = await matched.lookup(thing, registry, signal);
  assert.equal(
    result.values.find((value) => value.fieldId === 'common.gtin')?.value,
    '0012345678905',
  );
});

test('Icecat catalogue misses and access restrictions return no field proposals', async () => {
  const thing = createThing({ 'common.gtin': '0012345678905' });
  for (const status of [8, 9, 12, 14, 15, 16, 17]) {
    const provider = new IcecatProvider('fixture-token', async () =>
      Response.json({ StatusCode: status }, { status: 404 }),
    );
    assert.deepEqual(await provider.lookup(thing, registry, signal), { setIds: [], values: [] });
  }
  for (const body of [{ StatusCode: 18 }, { msg: 'OK', data: {} }]) {
    const provider = new IcecatProvider('fixture-token', async () => Response.json(body));
    await assert.rejects(provider.lookup(thing, registry, signal));
  }
});

test('Icecat proposals respect owner edits and disabled empty fields', async () => {
  const thing = createThing({ 'common.manufacturer': 'Example', 'common.model': 'X1/AB' });
  thing.data = patchData(
    thing.data,
    {
      addFieldSetIds: ['appliances.dimensions'],
      values: [{ fieldSetId: 'appliances.dimensions', fieldId: 'common.width', value: null }],
    },
    thing.categoryId,
    registry,
  );
  const provider = new IcecatProvider('fixture-token', async () => Response.json(createProduct()));
  const result = await provider.lookup(thing, registry, signal);
  const data = populateFields(
    addFieldSets(thing.data, thing.categoryId, registry, result.setIds),
    result.values,
    registry,
    'DISCOVERY',
  );
  assert.equal(data.values['appliances.dimensions']['common.width'].value, null);
  assert.equal(data.values['appliances.dimensions']['common.width'].autoPopulate, false);
});
