import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../../shared/model.js';
import { fields, sets } from '../src/db/registry-seed.js';
import { Registry } from '../src/application/registry.js';
import { patchData, projectData, revealValue } from '../src/application/thing-data.js';
const registry = new Registry(fields, sets);
test('mandatory inclusion expands and a required dependency cannot be removed', () => {
  const data = patchData(emptyData(), { addFieldSetIds: ['vehicles.van'] }, 'vehicles', registry);
  assert.deepEqual(data.setIds, ['vehicles.vehicle', 'vehicles.van']);
  assert.throws(
    () => patchData(data, { removeFieldSetIds: ['vehicles.vehicle'] }, 'vehicles', registry),
    /still required/,
  );
  assert.throws(
    () => patchData(data, { addFieldSetIds: ['appliances.bosch'] }, 'vehicles', registry),
    /incompatible/,
  );
});
test('cycles and bad alongside references are rejected', () => {
  const bad = structuredClone(sets);
  bad[0].includes = [bad[1].id];
  assert.throws(() => new Registry(fields, bad), /cycle/);
  const badLinks = structuredClone(sets);
  badLinks[0].considerAlongside = ['missing'];
  assert.throws(() => new Registry(fields, badLinks), /Invalid relation/);
});
test('shared definitions have independent set-scoped values', () => {
  const data = patchData(
    emptyData(),
    {
      addFieldSetIds: ['insurance.combined'],
      values: [
        {
          fieldSetId: 'insurance.buildings',
          fieldId: 'insurance.sumInsured',
          value: { amountMinor: 50000000, currency: 'GBP' },
        },
        {
          fieldSetId: 'insurance.contents',
          fieldId: 'insurance.sumInsured',
          value: { amountMinor: 6000000, currency: 'GBP' },
        },
      ],
    },
    'insurance',
    registry,
  );
  const projection = projectData(data, registry);
  assert.deepEqual(
    projection.fieldSets.find((s) => s.id === 'insurance.buildings')!.fields[0].value,
    { amountMinor: 50000000, currency: 'GBP' },
  );
  assert.deepEqual(
    projection.fieldSets.find((s) => s.id === 'insurance.contents')!.fields[0].value,
    { amountMinor: 6000000, currency: 'GBP' },
  );
  assert.equal(
    projection.fieldSets.find((s) => s.id === 'insurance.contents')!.fields[1].value,
    null,
  );
});
test('false, zero and empty strings are values; null clears', () => {
  let data = patchData(
    emptyData(),
    {
      addFieldSetIds: ['memberships.museum'],
      values: [
        { fieldSetId: 'memberships.museum', fieldId: 'membership.autoRenew', value: false },
        { fieldSetId: null, fieldId: 'vehicles.payloadKg', value: 0 },
        { fieldSetId: null, fieldId: 'common.model', value: '' },
      ],
    },
    'memberships',
    registry,
  );
  assert.equal(data.values['memberships.museum']['membership.autoRenew'].value, false);
  assert.equal(data.standalone['vehicles.payloadKg'].value, 0);
  assert.equal(data.standalone['common.model'].value, '');
  data = patchData(
    data,
    { values: [{ fieldSetId: null, fieldId: 'common.model', value: null }] },
    'memberships',
    registry,
  );
  assert.equal(data.standalone['common.model'], undefined);
});
test('identifier types, membership, bounds, dates, enums and money are validated without coercion', () => {
  assert.throws(() => registry.validate('appliances.zNumber', 15), /Invalid value/);
  registry.validate('appliances.zNumber', '00015');
  assert.throws(() => registry.validate('vehicles.payloadKg', -1), /Invalid value/);
  assert.throws(() => registry.validate('membership.expires', '2026-02-30'), /Invalid value/);
  assert.throws(() => registry.validate('membership.level', 'Invented'), /Invalid value/);
  assert.throws(
    () => registry.validate('insurance.excess', { amountMinor: 1.5, currency: 'GBP' }),
    /Invalid value/,
  );
  assert.throws(
    () =>
      patchData(
        emptyData(),
        {
          addFieldSetIds: ['vehicles.van'],
          values: [{ fieldSetId: 'vehicles.van', fieldId: 'appliances.zNumber', value: '15' }],
        },
        'vehicles',
        registry,
      ),
    /not a member/,
  );
});
test('masked fields require reveal; category changes preserve sensitivity, provenance and pins', () => {
  let data = patchData(
    emptyData(),
    {
      addFieldSetIds: ['memberships.museum'],
      values: [
        { fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin', value: '0042' },
      ],
      pinnedFields: [{ fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin' }],
    },
    'memberships',
    registry,
  );
  data.values['memberships.museum']['membership.accessPin'].sourceRefs = [{ quote: 'PIN 0042' }];
  assert.ok(!JSON.stringify(projectData(data, registry)).includes('0042'));
  assert.equal(
    revealValue(
      data,
      { fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin' },
      registry,
    ),
    '0042',
  );
  data = patchData(data, {}, 'other', registry);
  assert.equal(data.undefinedFields[0].sensitive, true);
  assert.equal(data.undefinedFields[0].sourceRefs[0].quote, 'PIN 0042');
  assert.deepEqual(data.pins, [{ undefinedFieldId: data.undefinedFields[0].id }]);
  const masked = projectData(data, registry).undefinedFields[0];
  assert.equal(masked.value, null);
  assert.equal(masked.masked, true);
  assert.deepEqual(masked.sourceRefs, []);
});
