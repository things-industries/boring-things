/** Checks registration precision and classification of vehicle ownership and specification fields. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyData } from '../../../shared/model.js';
import { patchData } from '../../src/application/thing-data.js';
import { publicFields } from '../../src/application/public-fields.js';
import { Registry } from '../../src/application/registry/registry.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';

const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);

test('first registration accepts months and rejects full dates and invalid month values', () => {
  for (const value of ['2020-01', '2020-12']) registry.validate('vehicles.firstRegistered', value);
  for (const value of ['2020-02-29', '2020-00', '2020-13', '2020-1', '2020'])
    assert.throws(() => registry.validate('vehicles.firstRegistered', value), /Invalid value/);
});

test('vehicle public specifications exclude registration, tax, test and recall details', () => {
  const data = patchData(
    emptyData(),
    {
      addFieldSetIds: [
        'vehicles.roadMotor',
        'vehicles.registration',
        'vehicles.roadTax',
        'vehicles.roadworthiness',
        'vehicles.maintenance',
      ],
      values: [
        { fieldSetId: 'vehicles.vehicle', fieldId: 'vehicles.yearOfManufacture', value: 2020 },
        {
          fieldSetId: 'vehicles.registration',
          fieldId: 'vehicles.firstRegistered',
          value: '2020-02',
        },
        { fieldSetId: 'vehicles.roadTax', fieldId: 'vehicles.taxDueOn', value: '2030-01-01' },
        {
          fieldSetId: 'vehicles.roadworthiness',
          fieldId: 'vehicles.testStatus',
          value: 'No details',
        },
        {
          fieldSetId: 'vehicles.maintenance',
          fieldId: 'vehicles.hasOutstandingRecall',
          value: false,
        },
        { fieldSetId: 'vehicles.roadMotor', fieldId: 'vehicles.londonUlezCompliant', value: false },
        { fieldSetId: 'vehicles.roadMotor', fieldId: 'vehicles.co2Emissions', value: '0 g/km' },
      ],
    },
    'vehicles',
    registry,
  );
  assert.deepEqual(
    publicFields(data, registry).map((field) => field.fieldId),
    ['vehicles.co2Emissions'],
  );
  for (const fieldId of [
    'vehicles.yearOfManufacture',
    'vehicles.firstRegistered',
    'vehicles.taxDueOn',
    'vehicles.testStatus',
    'vehicles.hasOutstandingRecall',
    'vehicles.londonUlezCompliant',
  ]) {
    assert.equal(registry.fields.get(fieldId)?.scope, 'INSTANCE');
    assert.equal(registry.fields.get(fieldId)?.isIdentifier, false);
  }
});
