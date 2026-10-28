/** Checks field population permissions, mandatory identifier addresses and atomic validation failures. */
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

test('invalid addresses and values do not mutate the original field snapshot', () => {
  const data = addFieldSets(emptyData(), 'appliances', registry);
  const before = structuredClone(data);
  assert.throws(() =>
    populateFields(
      data,
      [{ fieldSetId: 'vehicles.vehicle', fieldId: 'common.model', value: 'AX1', sourceRefs: [] }],
      registry,
    ),
  );
  assert.throws(() =>
    populateFields(
      data,
      [
        {
          fieldSetId: 'appliances.appliance',
          fieldId: 'common.serialNumber',
          value: 15,
          sourceRefs: [],
        },
      ],
      registry,
    ),
  );
  assert.deepEqual(data, before);
});

test('categories provide a mandatory occurrence for each identification field', () => {
  for (const category of categories) {
    const selected = registry.expand([], category.id);
    assert.ok(selected.some((id) => registry.sets.get(id)?.eligibility === null));
    const categorySets = sets.filter((set) => set.categoryId === category.id);
    for (const field of new Map(
      categorySets.flatMap((set) => set.fields).map((field) => [field.id, field]),
    ).values())
      if (field.identifierKind !== 'NONE') {
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
