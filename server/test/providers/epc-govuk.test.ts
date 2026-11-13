/** Checks EPC identity matching, field mapping and lookup failures using synthetic responses. */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { emptyData } from '../../../shared/model.js';
import type { ThingRow } from '../../src/db/entities/things.js';
import { Registry } from '../../src/application/registry/registry.js';
import { patchData } from '../../src/application/thing-data.js';
import { addFieldSets, populateFields } from '../../src/application/thing-fields.js';
import { ProviderHttpError } from '../../src/application/errors.js';
import { setEnvMode, setEnvValue } from '../../src/config.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { EpcGovUkProvider } from '../../src/providers/epc-govuk/index.js';

const basics = 'household.household';
const energy = 'household.energyPerformance';
const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);
const signal = new AbortController().signal;
const reference = '0012-3456-7890-1234-5678';
const otherReference = '1012-3456-7890-1234-5678';
const row = {
  certificateNumber: reference,
  postcode: 'LS6 1AA',
  addressLine1: 'Flat 2',
  addressLine2: '15 Example Street',
  postTown: 'Exampletown',
  registrationDate: '2024-06-12',
  uprn: 123456789,
};
const certificate = {
  status: 'entered',
  uprn: '000123456789',
  report_type: 2,
  postcode: row.postcode,
  address_line_1: row.addressLine1,
  address_line_2: row.addressLine2,
  post_town: row.postTown,
  registration_date: row.registrationDate,
  inspection_date: '2024-06-09',
  current_energy_efficiency_band: 'C',
  property_type: 2,
  built_form: 3,
  total_floor_area: 65.5,
  walls: [{ description: 'Solid brick, as built (assumed)' }],
  schema_type: 'RdSAP-Schema-21.0.1',
  sap_building_parts: [
    { building_part_number: 2, construction_age_band: 'F' },
    { building_part_number: 1, construction_age_band: 'B' },
  ],
};

beforeEach(() => {
  setEnvMode('test');
  setEnvValue('EPC_GOVUK_API_KEY', 'fixture-key');
});

// Builds a Household with optional owner-supplied identity and a user-edited rating.
function createThing(
  address: string | null = 'Flat 2, 15 Example Street, Exampletown, ls61aa',
  country: string | null = 'GB',
  certificateNumber: string | null = null,
): ThingRow {
  return {
    id: 'fixture',
    ownerId: 'owner',
    name: 'Example home',
    categoryId: 'household',
    description: '',
    imageAttachmentId: null,
    isSample: false,
    createdAt: '2024-06-15',
    updatedAt: '2024-06-15',
    revision: 1,
    accessCount: 0,
    lastViewedAt: null,
    data: patchData(
      emptyData(),
      {
        addFieldSetIds: [energy],
        values: [
          { fieldSetId: basics, fieldId: 'household.address', value: address },
          { fieldSetId: basics, fieldId: 'household.country', value: country },
          { fieldSetId: energy, fieldId: 'household.energyRating', value: 'B' },
          ...(certificateNumber
            ? [
                {
                  fieldSetId: energy,
                  fieldId: 'household.energyCertificateReference',
                  value: certificateNumber,
                },
              ]
            : []),
        ],
      },
      'household',
      registry,
    ),
  };
}

// Wraps the search response with the pagination fields used for match completeness.
function searchResponse(data: unknown[], totalPages = 1) {
  return Response.json({ data, pagination: { totalPages } });
}

test('EPC lookup matches the latest certificate for a flat without a UPRN', async () => {
  const calls: string[] = [];
  const provider = new EpcGovUkProvider(async (input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture-key');
    assert.equal(init?.redirect, 'error');
    const url = new URL(String(input));
    calls.push(url.pathname);
    switch (url.pathname) {
      case '/api/domestic/search':
        assert.equal(url.searchParams.get('postcode'), 'LS61AA');
        assert.equal(url.searchParams.has('address'), false);
        assert.equal(url.searchParams.has('uprn'), false);
        return searchResponse([
          { ...row, addressLine1: 'Flat 12', registrationDate: '2025-06-12' },
          { ...row, certificateNumber: otherReference, registrationDate: '2021-01-02' },
          row,
        ]);
      case '/api/certificate':
        assert.equal(url.searchParams.get('certificate_number'), reference);
        return Response.json({ data: certificate });
      default:
        assert.equal(url.pathname, '/api/codes/info');
        assert.equal(url.searchParams.get('key'), 'B');
        assert.equal(url.searchParams.get('schemaVersion'), certificate.schema_type);
        return Response.json({
          data: [
            {
              key: 'B',
              values: [
                { schemaVersion: certificate.schema_type, value: 'England and Wales: 1900-1929' },
              ],
            },
          ],
        });
    }
  });
  const thing = createThing();
  const result = await provider.lookup(thing, registry, signal);
  assert.deepEqual(calls, ['/api/domestic/search', '/api/certificate', '/api/codes/info']);
  assert.deepEqual(
    Object.fromEntries(result.values.map(({ fieldId, value }) => [fieldId, value])),
    {
      'household.uprn': '123456789',
      'household.country': 'GB',
      'household.dwellingType': 'Flat',
      'household.energyCertificateScheme': 'EPC',
      'household.energyRating': 'C',
      'household.energyAssessedOn': '2024-06-09',
      'household.energyCertificateExpires': '2034-06-11',
      'household.energyCertificateReference': reference,
      'household.floorArea': 65.5,
      'household.wallConstruction': 'Solid brick, as built (assumed)',
      'household.constructionPeriod': '1900-1929',
    },
  );
  assert.equal(result.matchesThing?.(thing), true);
  assert.equal(result.matchesThing?.(createThing('Flat 1, 15 Example Street, LS6 1AA')), false);
  for (const field of result.values.filter(
    (entry) => entry.fieldId !== 'household.energyCertificateReference',
  )) {
    assert.equal(field.sourceRefs[0]?.provider, provider.id);
    assert.doesNotMatch(JSON.stringify(field.sourceRefs), /0012-3456|LS6|Example Street/);
  }
  const saved = populateFields(
    addFieldSets(thing.data, thing.categoryId, registry, result.setIds),
    result.values,
    registry,
    'DISCOVERY',
  );
  assert.equal(saved.values[energy]['household.energyRating'].value, 'B');
  assert.equal(saved.values[energy]['household.energyAssessedOn'].origin, 'DISCOVERY');
});

test('EPC lookup uses a supplied certificate number directly and accepts older wall descriptions', async () => {
  const provider = new EpcGovUkProvider(async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/certificate');
    assert.equal(url.searchParams.get('certificate_number'), reference);
    return Response.json({
      data: {
        ...certificate,
        uprn: 0,
        property_type: 0,
        built_form: 3,
        walls: [{ value: 'Stone wall', language: '1' }],
        sap_building_parts: [],
      },
    });
  });
  const thing = createThing(null, null, reference);
  assert.equal(provider.applicable(thing), true);
  assert.equal(provider.applicable(createThing(null)), false);
  assert.equal(provider.applicable(createThing(undefined, 'FR')), false);
  assert.equal(provider.applicable(createThing('Flat 2, 15 Example Street, BT1 1AA')), false);
  const result = await provider.lookup(thing, registry, signal);
  assert.ok(!result.values.some(({ fieldId }) => fieldId === 'household.uprn'));
  assert.equal(
    result.values.find(({ fieldId }) => fieldId === 'household.houseForm')?.value,
    'End-terrace',
  );
  assert.equal(
    result.values.find(({ fieldId }) => fieldId === 'household.wallConstruction')?.value,
    'Stone wall',
  );
});

test('EPC lookup skips partial addresses, competing identities and incomplete searches', async () => {
  const responses = [
    searchResponse([{ ...row, addressLine1: 'Flat 12' }]),
    searchResponse([row, { ...row, certificateNumber: otherReference }]),
    searchResponse([
      { ...row, uprn: 100000000001 },
      { ...row, uprn: 100000000002, registrationDate: '2021-01-02' },
    ]),
    searchResponse([row], 2),
    new Response(null, { status: 404 }),
  ];
  for (const response of responses) {
    const provider = new EpcGovUkProvider(async (input) => {
      assert.equal(new URL(String(input)).pathname, '/api/domestic/search');
      return response;
    });
    const result = await provider.lookup(createThing(), registry, signal);
    assert.deepEqual(result.values, []);
  }
});

test('EPC lookup rejects a conflicting dwelling and surfaces provider failures', async () => {
  for (const mismatch of [{ address_line_1: 'Flat 12' }, { uprn: '000123456788' }]) {
    const wrong = new EpcGovUkProvider(async (input) =>
      new URL(String(input)).pathname === '/api/domestic/search'
        ? searchResponse([row])
        : Response.json({ data: { ...certificate, ...mismatch } }),
    );
    assert.deepEqual((await wrong.lookup(createThing(), registry, signal)).values, []);
  }
  const unavailable = new EpcGovUkProvider(async () => new Response(null, { status: 503 }));
  await assert.rejects(
    unavailable.lookup(createThing(), registry, signal),
    (error) => error instanceof ProviderHttpError && error.status === 503,
  );
});
