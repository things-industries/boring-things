/** Checks field population permissions, mandatory identifier addresses and invalid proposal handling. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../../src/application/registry/registry.js';
import { fields, sets, categories } from '../../src/db/seeds/registry.js';
import { emptyData } from '../../../shared/model.js';
import { patchData } from '../../src/application/thing-data.js';
import { addFieldSets, populateFields } from '../../src/application/thing-fields.js';

const registry = new Registry(fields, sets);

test('empty manually added fields accept values and manual removals prevent every automatic update', () => {
  let data = patchData(
    emptyData(),
    { addFieldSetIds: ['appliances.warranty'] },
    'appliances',
    registry,
  );
  assert.equal(data.values['appliances.warranty']['common.warrantyEnds'].autoPopulate, true);
  const proposal = {
    fieldSetId: 'appliances.warranty',
    fieldId: 'common.warrantyEnds',
    value: '2030-01-01',
    sourceRefs: [],
  };
  data = populateFields(data, [proposal], registry);
  assert.equal(data.values['appliances.warranty']['common.warrantyEnds'].value, '2030-01-01');
  data = patchData(
    data,
    { values: [{ fieldSetId: proposal.fieldSetId, fieldId: proposal.fieldId, value: null }] },
    'appliances',
    registry,
  );
  const protectedData = populateFields(data, [proposal], registry, 'DISCOVERY');
  assert.equal(protectedData.values['appliances.warranty']['common.warrantyEnds'].value, null);
  assert.equal(
    protectedData.values['appliances.warranty']['common.warrantyEnds'].autoPopulate,
    false,
  );
});

// Automatic population aborted every field when one proposal had an invalid address or value.
test('invalid proposals and duplicates leave valid fields and the original snapshot intact', () => {
  const data = addFieldSets(emptyData(), 'appliances', registry);
  const before = structuredClone(data);
  const result = populateFields(
    data,
    [
      { fieldSetId: 'vehicles.vehicle', fieldId: 'common.model', value: 'AX1', sourceRefs: [] },
      {
        fieldSetId: 'appliances.appliance',
        fieldId: 'common.serialNumber',
        value: 15,
        sourceRefs: [],
      },
      { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'AX1', sourceRefs: [] },
      { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'AX2', sourceRefs: [] },
    ],
    registry,
  );
  assert.deepEqual(data, before);
  assert.equal(result.values['appliances.appliance']['common.serialNumber'].value, null);
  assert.equal(result.values['appliances.appliance']['common.model'].value, 'AX1');
});

test('categories provide a mandatory occurrence for each identification field', () => {
  for (const category of categories) {
    const selected = registry.expand([], category.id);
    assert.ok(selected.some((id) => registry.sets.get(id)?.eligibility === null));
    const categorySets = sets.filter((set) => set.categoryId === category.id);
    for (const field of new Map(
      categorySets.flatMap((set) => set.fields).map((field) => [field.id, field]),
    ).values())
      if (field.isIdentifier) {
        const occurrences = categorySets.filter((set) =>
          set.fields.some((candidate) => candidate.id === field.id),
        );
        assert.equal(occurrences.length, 1);
        assert.equal(occurrences[0].eligibility, null);
      }
  }
});

test('changing population permission preserves the value and its provenance', () => {
  const proposal = {
    fieldSetId: 'appliances.appliance',
    fieldId: 'common.model',
    value: 'AX1',
    sourceRefs: [{ quote: 'Model AX1' }],
  };
  const data = populateFields(
    addFieldSets(emptyData(), 'appliances', registry),
    [proposal],
    registry,
  );
  const edited = patchData(
    data,
    {
      values: [{ fieldSetId: proposal.fieldSetId, fieldId: proposal.fieldId, autoPopulate: false }],
    },
    'appliances',
    registry,
  );
  assert.deepEqual(edited.values[proposal.fieldSetId][proposal.fieldId], {
    ...data.values[proposal.fieldSetId][proposal.fieldId],
    autoPopulate: false,
  });
});

test('email fields reject invalid values in manual and automatic writes', () => {
  const address = { fieldSetId: 'memberships.support', fieldId: 'common.supportEmail' };
  const data = addFieldSets(emptyData(), 'memberships', registry, [address.fieldSetId]);
  const invalid = { ...address, value: 'team@example' };
  const valid = { ...address, value: 'team+support@example.com' };

  assert.throws(
    () => patchData(data, { values: [invalid] }, 'memberships', registry),
    /Invalid value for Support email/,
  );
  const proposals = [invalid, valid].map((entry) => ({ ...entry, sourceRefs: [] }));
  const populated = populateFields(data, proposals, registry);
  assert.equal(populated.values[address.fieldSetId][address.fieldId].value, valid.value);
  assert.throws(() => registry.validate('common.accountEmail', 'account'), /Invalid value/);
  registry.validate('common.accountEmail', 'account@example.com');
});
