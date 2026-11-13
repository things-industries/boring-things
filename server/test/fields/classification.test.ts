/** Checks field scope, Thing identifiers and custom-field classification through application APIs. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyData, type FieldDefinition } from '../../../shared/model.js';
import { Registry } from '../../src/application/registry/registry.js';
import { publicFields } from '../../src/application/public-fields.js';
import { identifierValues } from '../../src/application/thing-fields.js';
import { patchData, projectData } from '../../src/application/thing-data.js';
import { schemaValidator } from '../../src/contracts/schemas.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';

const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);

test('registry scopes distinguish public identifiers from instance attributes', () => {
  for (const [id, scope, isIdentifier] of [
    ['common.manufacturer', 'GROUP', true],
    ['common.model', 'CLASS', true],
    ['common.serialNumber', 'INSTANCE', true],
    ['common.acquiredOn', 'INSTANCE', false],
    ['common.pricePaid', 'INSTANCE', false],
    ['common.orderReference', 'INSTANCE', false],
    ['subscriptions.domainName', 'INSTANCE', true],
    ['vehicles.registrationCountry', 'INSTANCE', true],
    ['appliances.fdNumber', 'INSTANCE', true],
  ] as const) {
    const field = registry.fields.get(id);
    assert.equal(field?.scope, scope, id);
    assert.equal(field?.isIdentifier, isIdentifier, id);
  }
});

test('public research uses scope while identifier extraction uses identifier status', () => {
  const fields = [
    { id: 'provider', scope: 'GROUP', isIdentifier: true, value: 'Example' },
    { id: 'model', scope: 'CLASS', isIdentifier: true, value: 'A1' },
    { id: 'capacity', scope: 'CLASS', isIdentifier: false, value: 0 },
    { id: 'feature', scope: 'CLASS', isIdentifier: false, value: false },
    { id: 'description', scope: 'CLASS', isIdentifier: false, value: '' },
    { id: 'serial', scope: 'INSTANCE', isIdentifier: true, value: '0012' },
    { id: 'price', scope: 'INSTANCE', isIdentifier: false, value: 25 },
  ] as const;
  const definitions: FieldDefinition[] = fields.map(({ id, scope, isIdentifier, value }) => ({
    id,
    name: id,
    description: id,
    keywords: [],
    schema: {
      type:
        typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
    },
    uiHint: 'TEXT',
    sensitive: true,
    scope,
    isIdentifier,
  }));
  const localRegistry = new Registry(definitions, []);
  const data = emptyData();
  for (const { id, value } of fields)
    data.standalone[id] = { value, origin: 'IMPORT', sourceRefs: [] };
  assert.deepEqual(
    publicFields(data, localRegistry).map((field) => field.fieldId),
    ['provider', 'model', 'capacity', 'feature', 'description'],
  );
  assert.deepEqual(
    identifierValues(data, localRegistry).map((field) => field.fieldId),
    ['provider', 'model', 'serial'],
  );
});

test('custom scopes default to INSTANCE and survive edits and set removal', () => {
  let data = patchData(
    emptyData(),
    {
      customFields: [
        { label: 'Private note', value: 'Owner data', sensitive: false },
        { label: 'Model note', value: 'Public data', sensitive: false, scope: 'CLASS' },
      ],
      values: [{ fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'A1' }],
    },
    'appliances',
    registry,
  );
  const custom = data.customFields[1];
  data = patchData(
    data,
    {
      customFields: [
        { id: custom.id, label: 'Renamed note', value: 'Updated data', sensitive: false },
      ],
    },
    'appliances',
    registry,
  );
  assert.deepEqual(
    data.customFields.map((field) => field.scope),
    ['INSTANCE', 'CLASS'],
  );
  assert.deepEqual(
    publicFields(data, registry).map((field) => field.fieldId),
    ['common.model', custom.id],
  );
  data = patchData(data, {}, 'other', registry);
  const migrated = data.customFields.find((field) => field.label.endsWith(': Model'));
  assert.equal(migrated?.scope, 'CLASS');
  assert.equal(migrated?.value, 'A1');
  assert.equal(projectData(data, registry).customFields[1].scope, 'CLASS');
  assert.deepEqual(identifierValues(data, registry), []);
});

test('custom field input validates scope through the HTTP contract', () => {
  const validate = schemaValidator('CustomFieldPatch');
  const field = { label: 'Note', value: 'Text', sensitive: false };
  for (const scope of ['GROUP', 'CLASS', 'INSTANCE']) assert.ok(validate({ ...field, scope }));
  assert.ok(validate(field));
  assert.equal(validate({ ...field, scope: 'PUBLIC' }), false);
});

test('category changes use registry schemas to type displaced custom fields', () => {
  const values = [
    { fieldId: 'common.warrantyEnds', value: '2090-02-28' },
    { fieldId: 'common.warrantyProvider', value: '2090-02-28' },
  ];
  const data = patchData(
    emptyData(),
    {
      addFieldSetIds: ['appliances.warranty'],
      values: values.map((value) => ({ ...value, fieldSetId: 'appliances.warranty' })),
      pinnedFields: [{ fieldId: 'common.warrantyEnds', fieldSetId: 'appliances.warranty' }],
    },
    'appliances',
    registry,
  );
  const moved = patchData(data, {}, 'other', registry);
  const end = moved.customFields.find((field) => field.label.endsWith(': Warranty ends'));
  const provider = moved.customFields.find((field) => field.label.endsWith(': Warranty provider'));
  assert.equal(end?.valueType, 'DATE');
  assert.equal(provider?.valueType, 'STRING');
  assert.deepEqual(moved.pins, [{ customFieldId: end?.id }]);
});
