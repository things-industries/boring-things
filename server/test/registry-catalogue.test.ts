import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fields, sets } from '../src/db/registry-seed.js';
import { Registry } from '../src/application/registry/registry.js';
import { emptyData } from '../../shared/model.js';
import { patchData } from '../src/application/thing-data.js';
const registry = new Registry(fields, sets);

test('catalogue covers reviewed categories with compatible dependencies and resolvable Remix icons', async () => {
  assert.deepEqual(
    new Set(sets.map((set) => set.categoryId)),
    new Set([
      'appliances',
      'devices',
      'vehicles',
      'memberships',
      'subscriptions',
      'utilities',
      'insurance',
    ]),
  );
  const catalogue = await readFile(
    new URL('../../src/app/core/app-icons.ts', import.meta.url),
    'utf8',
  );
  const exports = await readFile(
    new URL(
      '../../node_modules/@ng-icons/remixicon/types/ng-icons-remixicon.d.ts',
      import.meta.url,
    ),
    'utf8',
  );
  for (const field of fields) {
    assert.ok(field.icon, field.id);
    const match = catalogue.match(new RegExp(`export const ${field.icon} = (remix\\w+);`));
    assert.ok(match, field.id);
    assert.ok(exports.includes('declare const ' + match[1] + ' ='), match[1]);
  }
  for (const set of sets) {
    assert.equal(new Set(set.fields.map((f) => f.id)).size, set.fields.length, set.id);
    assert.equal(new Set(set.includes).size, set.includes.length, set.id);
    registry.expand([set.id], set.categoryId);
  }
  for (const retired of [
    'appliances.purchaseDate',
    'appliances.warrantyEnd',
    'appliances.retailer',
    'insurance.renewalDate',
  ])
    assert.equal(registry.fields.has(retired), false);
});

test('manufacturer markings, measurements and rates preserve context and leading zeroes', () => {
  registry.validate('appliances.zNumber', '007');
  registry.validate('devices.imeiLine1', '000000000000000');
  registry.validate('utilities.electricityMeterPointMpan', '0000000000000');
  registry.validate('common.width', '600 mm');
  registry.validate('utilities.electricityUnitRate', 'GBP 0.24567 per kWh');
  registry.validate('insurance.cancellationLimit', 'GBP 5000.00 per person');
  registry.validate('appliances.manufacturedOn', '2025-11');
  registry.validate('membership.level', 'Corporate');
  registry.validate('common.acquiredOn', '2024-02-29');
  assert.throws(() => registry.validate('common.acquiredOn', '2025-02-29'), /Invalid value/);
  registry.validate('subscriptions.simultaneousStreams', 4);
  assert.throws(() => registry.validate('subscriptions.simultaneousStreams', 1.5), /Invalid value/);
  assert.equal(registry.fields.get('subscriptions.licenceKey')!.sensitive, true);
  assert.equal(registry.fields.get('insurance.medicalScreeningReference')!.sensitive, true);
  assert.ok(
    !registry.sets.get('appliances.bosch')!.fields.some((f) => f.id === 'common.serialNumber'),
  );
});

test('composite utility and medical/dental cover components retain independent values', () => {
  const utility = patchData(
    emptyData(),
    {
      addFieldSetIds: ['utilities.dualFuel'],
      values: [
        {
          fieldSetId: 'utilities.electricity',
          fieldId: 'utilities.electricitySupplier',
          value: 'Electricity supplier',
        },
        { fieldSetId: 'utilities.gas', fieldId: 'utilities.gasSupplier', value: 'Gas supplier' },
      ],
    },
    'utilities',
    registry,
  );
  assert.equal(
    utility.values['utilities.electricity']['utilities.electricitySupplier'].value,
    'Electricity supplier',
  );
  assert.equal(utility.values['utilities.gas']['utilities.gasSupplier'].value, 'Gas supplier');
  const medical = patchData(
    emptyData(),
    {
      addFieldSetIds: ['insurance.medical', 'insurance.dental'],
      values: [
        {
          fieldSetId: 'insurance.medical',
          fieldId: 'insurance.waitingPeriodEnds',
          value: '2027-04-01',
        },
        {
          fieldSetId: 'insurance.dental',
          fieldId: 'insurance.waitingPeriodEnds',
          value: '2027-08-01',
        },
      ],
    },
    'insurance',
    registry,
  );
  assert.equal(
    medical.values['insurance.medical']['insurance.waitingPeriodEnds'].value,
    '2027-04-01',
  );
  assert.equal(
    medical.values['insurance.dental']['insurance.waitingPeriodEnds'].value,
    '2027-08-01',
  );
  assert.equal(medical.setIds.filter((id) => id === 'insurance.policy').length, 1);
});
