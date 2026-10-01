import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from '../../shared/model.js';
import { applyThingPatch } from '../../src/app/core/state/thing-patch.js';
import type { ThingRecord } from '../../src/app/interfaces/thing.interface.js';

const definition = (id: string, sensitive = false): Schema['FieldDefinition'] => ({
  id,
  name: id,
  description: '',
  keywords: [],
  schema: { type: 'string' },
  uiHint: 'TEXT',
  sensitive,
});

const fieldSet = (id: string, fields: Schema['FieldDefinition'][]): Schema['FieldSet'] => ({
  id,
  categoryId: 'appliances',
  name: id,
  eligibility: '',
  keywords: [],
  includes: [],
  considerAlongside: [],
  fields,
});

const registry = {
  fieldSets: { warranty: fieldSet('warranty', [definition('provider')]) },
  fields: { pin: definition('pin', true), provider: definition('provider') },
};

const thing: ThingRecord = {
  id: 't1',
  name: 'Hob',
  description: '',
  categoryId: 'appliances',
  revision: 1,
  imageAttachmentId: null,
  tagIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isSample: false,
  accessCount: 0,
  lastViewedAt: null,
  detail: {
    fieldSets: [],
    standaloneFields: [],
    undefinedFields: [],
    pinnedFields: [],
    import: null,
  },
};

test('a Thing patch applies scalar fields, tags and pins', () => {
  const next = applyThingPatch(
    thing,
    {
      name: 'Kitchen hob',
      tagIds: ['tag-1'],
      pinnedFields: [{ fieldSetId: null, fieldId: 'pin' }],
    },
    registry,
  );

  assert.equal(next.name, 'Kitchen hob');
  assert.deepEqual(next.tagIds, ['tag-1']);
  assert.deepEqual(next.detail?.pinnedFields, [{ fieldSetId: null, fieldId: 'pin' }]);
});

test('a Thing patch builds added field sets and applies values to the detail', () => {
  const next = applyThingPatch(
    thing,
    {
      addFieldSetIds: ['warranty'],
      values: [
        { fieldSetId: 'warranty', fieldId: 'provider', value: 'Acme' },
        { fieldSetId: null, fieldId: 'pin', value: '1234' },
      ],
    },
    registry,
  );

  const provider = next.detail?.fieldSets[0]?.fields[0];

  assert.equal(provider?.value, 'Acme');
  assert.equal(provider?.origin, 'USER');

  const pin = next.detail?.standaloneFields[0];

  assert.equal(pin?.value, null, 'sensitive values stay masked');
  assert.equal(pin?.masked, true);
});

test('a Thing summary without detail takes only the scalar changes', () => {
  const { detail: _detail, ...summary } = thing;
  const next = applyThingPatch(summary, { name: 'Oven', addFieldSetIds: ['warranty'] }, registry);

  assert.equal(next.name, 'Oven');
  assert.equal(next.detail, undefined);
});
