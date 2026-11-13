import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Schema } from '../../shared/model.js';
import type { FieldInput } from '../app/interfaces/field-input.interface.js';
import type { ThingDetail } from '../app/interfaces/thing.interface.js';
import {
  type DetailRow,
  detailGroups,
  detailsDraft,
  detailsPatches,
} from '../app/features/things/thing-details/thing-details.view.js';
import { APP_CONFIG } from '../app/core/app.config.js';
import {
  customFieldInput,
  draftValue,
  fieldInput,
  formatMoneyDraft,
  getEmailLink,
  valueDraft,
} from '../app/utils/field.util.js';
import { fieldValueError } from '../app/validators/field-value.validator.js';

const field = (overrides: Partial<Schema['Field']> = {}): Schema['Field'] =>
  ({
    id: 'f',
    name: 'Field',
    schema: { type: 'string' },
    uiHint: 'TEXT',
    sensitive: false,
    value: null,
    masked: false,
    icon: null,
    ...overrides,
  }) as Schema['Field'];

const custom = (overrides: Partial<Schema['CustomField']> = {}): Schema['CustomField'] =>
  ({
    id: 'c1',
    label: 'Note',
    value: 'kept',
    sensitive: false,
    masked: false,
    valueType: 'STRING',
    ...overrides,
  }) as Schema['CustomField'];

test('registry fields choose the control for their type', () => {
  const kinds = [
    field({ uiHint: 'MONEY', schema: { type: 'object' } }),
    field({ uiHint: 'CHECKBOX', schema: { type: 'boolean' } }),
    field({ schema: { type: 'string', enum: ['A', 'B'] } }),
    field({ uiHint: 'DATE', schema: { type: 'string', format: 'date' } }),
    field({ schema: { type: 'string', format: 'date-time' } }),
    field({ uiHint: 'NUMBER', schema: { type: 'integer' } }),
    field({ uiHint: 'TEXTAREA' }),
    field({ name: 'Account email', icon: 'fieldEmail' }),
  ].map((f) => fieldInput(f).kind);

  assert.deepEqual(kinds, [
    'money',
    'boolean',
    'select',
    'date',
    'date-time',
    'number',
    'textarea',
    'text',
  ]);
  assert.equal(fieldInput(field({ schema: { type: 'integer' } })).integer, true);
  assert.equal(customFieldInput(custom({ valueType: 'MONEY' })).kind, 'money');
  assert.equal(customFieldInput(custom({ label: 'Support email' })).kind, 'text');
});

test('email fields use the email editor and link to a single valid address', () => {
  const schema = { type: 'string', format: 'email', maxLength: 500 } as const;
  const input = fieldInput(field({ schema }));
  assert.equal(input.kind, 'email');
  assert.equal(input.maxLength, 500);
  assert.equal(fieldInput(field({ uiHint: 'EMAIL' })).kind, 'email');
  assert.equal(fieldValueError(input, 'a..b@example.com'), 'invalid-email');
  assert.equal(getEmailLink('email', 'team?ops@example.com'), 'mailto:team%3Fops@example.com');
  assert.equal(getEmailLink('email', 'Contact support'), null);
  assert.equal(getEmailLink(null, 'team@example.com'), null);
});

test('the currency choices match the API currencies', () => {
  const openapi = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'));

  assert.deepEqual(APP_CONFIG.currencies, openapi.components.schemas.CurrencyEnum.enum);
});

test('custom dates use their stored type even when empty', () => {
  const detail = {
    fieldSets: [],
    standaloneFields: [],
    customFields: [
      custom({ id: 'renewal', valueType: 'DATE', value: '2027-05-16' }),
      custom({ id: 'empty', valueType: 'DATE', value: null }),
      custom({ id: 'text', value: '2027-05-16' }),
    ],
    pinnedFields: [],
  } as unknown as ThingDetail;

  assert.deepEqual(
    detailGroups(detail)
      .flatMap((group) => group.rows)
      .map((row) => row.format),
    ['date', 'date', null],
  );
});

test('drafts round-trip values and empty drafts clear them', () => {
  const money: FieldInput = { kind: 'money', sensitive: false };
  const draft = valueDraft(money, { amountMinor: 74900, currency: 'EUR' });

  assert.deepEqual(draft, { amount: '749.00', currency: 'EUR' });
  assert.deepEqual(draftValue(money, { amount: '12.5', currency: 'GBP' }), {
    amountMinor: 1250,
    currency: 'GBP',
  });
  assert.equal(draftValue(money, { amount: ' ', currency: 'GBP' }), null);
  assert.deepEqual(
    ['12', '.5', '3.', '90071992547409.9', '1.234', ''].map(
      (amount) => formatMoneyDraft({ amount, currency: 'GBP' }).amount,
    ),
    ['12.00', '0.50', '3.00', '90071992547409.90', '1.234', ''],
  );
  assert.equal(draftValue({ kind: 'boolean', sensitive: false }, 'false'), false);
  assert.equal(draftValue({ kind: 'number', sensitive: false }, '0'), 0);
  assert.equal(draftValue({ kind: 'text', sensitive: false }, '  '), null);
});

test('field errors cover email, money, numbers, dates, length and pattern', () => {
  const kind = (k: FieldInput['kind'], extra: Partial<FieldInput> = {}): FieldInput => ({
    kind: k,
    sensitive: false,
    ...extra,
  });

  assert.equal(fieldValueError(kind('email'), 'me@example'), 'invalid-email');
  assert.equal(fieldValueError(kind('email'), 'me@example.com'), null);
  assert.equal(
    fieldValueError(kind('money'), { amount: '1.234', currency: 'GBP' }),
    'invalid-money',
  );
  assert.equal(fieldValueError(kind('number', { integer: true }), '2.5'), 'whole-number-required');
  assert.equal(fieldValueError(kind('number', { maximum: 10 }), '11'), 'number-out-of-range');
  assert.equal(fieldValueError(kind('date'), '2026-02-30'), 'invalid-date');
  assert.equal(fieldValueError(kind('text', { required: true }), ' '), 'value-required');
  assert.equal(fieldValueError(kind('text', { maxLength: 2 }), 'abc'), 'text-too-long');
  assert.equal(fieldValueError(kind('text', { pattern: '^[0-9]+$' }), '12a'), 'invalid-format');
  assert.equal(fieldValueError(kind('number'), ''), null);
});

test('saving sends only changed values, then the category', () => {
  const thing = { name: 'Van', description: '', categoryId: 'vehicles' };
  const detail = {
    fieldSets: [],
    standaloneFields: [
      field({ id: 'make', name: 'Make', value: 'Acme' }),
      field({ id: 'model', name: 'Model' }),
      field({ id: 'pin', name: 'PIN', sensitive: true, masked: true, value: null }),
    ],
    customFields: [
      custom(),
      custom({ id: 'c2', label: 'Renewal', value: '2027-05-16', valueType: 'DATE' }),
    ],
    pinnedFields: [{ customFieldId: 'c2' }, { fieldSetId: null, fieldId: 'make' }],
  } as unknown as ThingDetail;
  const rows: DetailRow[] = detailGroups(detail).flatMap((group) => group.rows);
  const draft = detailsDraft(thing, rows, new Map());

  assert.equal(draft.fields[rows[2].anchor], '');
  draft.name = ' Camper ';
  draft.categoryId = 'appliances';
  draft.fields[rows[1].anchor] = 'X1';
  draft.fields[rows[4].anchor] = '';

  assert.deepEqual(detailsPatches(thing, rows, draft, new Map()), [
    {
      name: 'Camper',
      values: [{ fieldSetId: null, fieldId: 'model', value: 'X1' }],
      customFields: [
        { id: 'c2', label: 'Renewal', sensitive: false, valueType: 'DATE', value: null },
      ],
    },
    { categoryId: 'appliances' },
  ]);

  draft.fields[rows[2].anchor] = '4321';
  assert.deepEqual(detailsPatches(thing, rows, draft, new Map())[0].values?.[1], {
    fieldSetId: null,
    fieldId: 'pin',
    value: '4321',
  });
});

test('saving leaves out values the draft does not hold', () => {
  const thing = { name: 'Van', description: '', categoryId: 'vehicles' };
  const detail = {
    fieldSets: [],
    standaloneFields: [
      field({ id: 'make', name: 'Make', value: 'Newer make' }),
      field({ id: 'model', name: 'Model', value: 'X1' }),
    ],
    customFields: [],
    pinnedFields: [],
  } as unknown as ThingDetail;
  const rows: DetailRow[] = detailGroups(detail).flatMap((group) => group.rows);

  assert.deepEqual(detailsPatches(thing, rows, { fields: { [rows[1].anchor]: 'X2' } }, new Map()), [
    { values: [{ fieldSetId: null, fieldId: 'model', value: 'X2' }] },
  ]);
  assert.deepEqual(detailsPatches(thing, rows, { fields: {} }, new Map()), []);
});
