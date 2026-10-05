/** Verifies resource identity grouping and preservation of document pages, including saved older cards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeResourceCards } from '../../shared/resource-cards.js';
import { messageCards } from '../../src/app/features/chat/chat.view.js';
import type { Schema } from '../../shared/model.js';
import { schemaValidator } from '../src/contracts/schemas.js';

test('the field card contract accepts one registry or custom address', () => {
  const validate = schemaValidator('ResourceCard');
  const card = {
    type: 'FIELD',
    thingId: '00000000-0000-4000-8000-000000000001',
    fieldSetId: null,
    fieldId: 'model',
  };
  const customFieldId = '00000000-0000-4000-8000-000000000002';
  assert.equal(validate(card), true);
  assert.equal(validate({ ...card, fieldId: null, customFieldId }), true);
  assert.equal(validate({ ...card, customFieldId }), false);
  assert.equal(validate({ ...card, fieldId: null }), false);
  assert.equal(
    validate({ ...card, fieldId: null, fieldSetId: 'appliances.appliance', customFieldId }),
    false,
  );
});

test('resource cards merge entities and document pages while keeping distinct field addresses', () => {
  const cards: Schema['ResourceCard'][] = [
    { type: 'ATTACHMENT', attachmentId: 'manual' },
    { type: 'ATTACHMENT', attachmentId: 'manual', page: 50 },
    { type: 'ATTACHMENT', attachmentId: 'manual', page: 29 },
    { type: 'ATTACHMENT', attachmentId: 'manual', page: 29 },
    { type: 'THING', thingId: 'thing' },
    { type: 'THING', thingId: 'thing' },
    { type: 'FIELD', thingId: 'thing', fieldSetId: 'first', fieldId: 'model' },
    { type: 'FIELD', thingId: 'thing', fieldSetId: 'second', fieldId: 'model' },
    {
      type: 'FIELD',
      thingId: 'thing',
      fieldSetId: null,
      fieldId: null,
      customFieldId: 'custom',
    },
  ];
  const original = structuredClone(cards);
  const merged = mergeResourceCards(cards);
  assert.equal(merged.length, 5);
  assert.deepEqual(merged[0], {
    type: 'ATTACHMENT',
    attachmentId: 'manual',
    page: 29,
    pages: [29, 50],
  });
  assert.deepEqual(cards, original);
  assert.deepEqual(mergeResourceCards(merged), merged);
  const view = messageCards(cards, 'thing', [{ attachmentId: 'manual', page: 10 }]);
  assert.deepEqual(view.things, []);
  assert.equal(view.others.length, 4);
  assert.deepEqual(view.others[0], {
    type: 'ATTACHMENT',
    attachmentId: 'manual',
    page: 10,
    pages: [10, 29, 50],
  });
});
