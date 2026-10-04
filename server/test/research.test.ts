import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyData,
  type FieldDefinition,
  type FieldSet,
  type StoredValue,
} from '../../shared/model.js';
import { Registry } from '../src/application/registry/registry.js';
import { buildResearchContext } from '../src/application/import/mapping.js';
import { patchData, projectData } from '../src/application/thing-data.js';
import {
  applyDocumentValues,
  validateDocumentExtraction,
} from '../src/application/import/research.js';
import { categoryResearchPrompt, researchPrompt } from '../src/providers/ai/prompts.js';

const field = (
  id: string,
  instanceSpecific: boolean,
  sensitive: boolean,
  type: FieldDefinition['schema']['type'] = 'string',
): FieldDefinition => ({
  id,
  name: id,
  description: id,
  keywords: [],
  schema: { type },
  sensitive,
  instanceSpecific,
  uiHint: 'TEXT',
});
const fields = [
  field('public', false, false),
  field('maskedPublic', false, true),
  field('private', true, false),
  field('maskedPrivate', true, true),
  field('zero', false, false, 'number'),
  field('false', false, false, 'boolean'),
  field('empty', false, false),
  field('target', false, true),
  field('cleared', false, false),
];
const set = (id: string): FieldSet => ({
  id,
  name: id,
  categoryId: 'other',
  eligibility: '',
  keywords: [],
  includes: [],
  considerAlongside: [],
  fields,
});
const registry = new Registry(fields, [set('first'), set('second')]);
const subject = { id: 'subject', categoryId: 'other' };
const stored = (value: StoredValue['value']): StoredValue => ({
  value,
  origin: 'USER',
  sourceRefs: [],
});

test('research eligibility uses metadata independently of sensitivity and retains typed set, standalone and custom context', () => {
  const data = emptyData();
  data.setIds = ['first', 'second'];
  data.values.first = {
    public: stored('A'),
    maskedPublic: stored('B'),
    private: stored('private-instance'),
    maskedPrivate: stored('secret-instance'),
    zero: stored(0),
    false: stored(false),
    empty: stored(''),
  };
  data.values.second = { public: stored('C') };
  data.standalone.maskedPublic = stored('D');
  data.userEdited = ['first:cleared'];
  data.undefinedFields = [
    {
      id: 'local-default',
      label: 'Default',
      value: 'private-custom',
      sensitive: false,
      origin: 'USER',
      sourceRefs: [],
    },
    {
      id: 'local-public',
      label: 'Custom',
      value: 0,
      sensitive: true,
      instanceSpecific: false,
      origin: 'USER',
      sourceRefs: [],
    },
  ];
  const research = buildResearchContext(subject, data, registry)!;
  assert.equal(research.fields.length, 8);
  assert.ok(research.fields.some((f) => f.fieldSetId === 'second' && f.value === 'C'));
  assert.ok(research.fields.some((f) => f.fieldSetId === null && f.value === 'D'));
  for (const value of [0, false, '']) assert.ok(research.fields.some((f) => f.value === value));
  assert.ok(research.fields.some((f) => f.undefinedFieldId === 'local-public' && f.value === 0));
  assert.ok(research.targets.some((f) => f.fieldId === 'target'));
  assert.ok(!research.targets.some((f) => f.fieldSetId === 'first' && f.fieldId === 'cleared'));
  const prompt = researchPrompt(research, 'reference', 3);
  for (const secret of ['private-instance', 'secret-instance', 'private-custom'])
    assert.ok(!prompt.includes(secret));
});

test('custom classification defaults to private, survives edits and set removal, and is projected independently of masking', () => {
  const initial = patchData(
    emptyData(),
    {
      undefinedFields: [
        { label: 'Custom', value: 'A', sensitive: true, instanceSpecific: false },
        { label: 'Default', value: 0, sensitive: false },
      ],
    },
    'other',
    registry,
  );
  const id = initial.undefinedFields[0].id;
  const edited = patchData(
    initial,
    { undefinedFields: [{ id, label: 'Custom', value: 'B', sensitive: true }] },
    'other',
    registry,
  );
  assert.equal(edited.undefinedFields.find((f) => f.id === id)?.instanceSpecific, false);
  assert.equal(edited.undefinedFields.find((f) => f.label === 'Default')?.instanceSpecific, true);
  edited.setIds = ['first'];
  edited.values.first = { public: stored('Reference') };
  const removed = patchData(edited, { removeFieldSetIds: ['first'] }, 'other', registry);
  assert.equal(
    removed.undefinedFields.find((f) => f.value === 'Reference')?.instanceSpecific,
    false,
  );
  const projected = projectData(removed, registry).undefinedFields.find((f) => f.id === id)!;
  assert.equal(projected.instanceSpecific, false);
  assert.equal(projected.masked, true);
  assert.equal(projected.value, null);
});

test('document values validate addresses, types, applicability and page evidence and preserve intervening owner edits and clears', () => {
  const data = emptyData();
  data.setIds = ['first', 'second'];
  data.values.first = { public: stored('Model A') };
  const research = buildResearchContext(subject, data, registry)!;
  const document = {
    attachmentId: 'document-id',
    url: 'https://example.com/manual.pdf',
    pageCount: 2,
  };
  const result = {
    applicable: true,
    applicability: { page: 1, quote: 'Model A' },
    values: [
      { fieldSetId: 'first', fieldId: 'target', value: 'Supported', page: 2, quote: 'Supported' },
      {
        fieldSetId: 'second',
        fieldId: 'target',
        value: 'Independent',
        page: 2,
        quote: 'Independent',
      },
    ],
  };
  for (const invalid of [
    { ...result, applicable: false },
    { ...result, applicability: null },
    { ...result, values: [{ ...result.values[0], fieldId: 'private' }] },
    { ...result, values: [{ ...result.values[0], value: 1 }] },
    { ...result, values: [{ ...result.values[0], page: 3 }] },
    { ...result, values: [{ ...result.values[0], quote: '' }] },
    { ...result, values: [result.values[0], result.values[0]] },
  ])
    assert.throws(() => validateDocumentExtraction(invalid, document, research.targets, registry));
  const cleared = patchData(
    data,
    { values: [{ fieldSetId: 'first', fieldId: 'target', value: null }] },
    'other',
    registry,
  );
  const applied = applyDocumentValues(cleared, result, research, registry, document);
  assert.equal(applied.values.first.target, undefined);
  assert.equal(applied.values.second.target.value, 'Independent');
  assert.equal(applied.values.second.target.origin, 'DISCOVERY');
  assert.deepEqual(applied.values.second.target.sourceRefs, [
    { attachmentId: 'document-id', url: document.url, page: 2, quote: 'Independent' },
  ]);
  const edited = patchData(
    data,
    { values: [{ fieldSetId: 'second', fieldId: 'target', value: 'Owner' }] },
    'other',
    registry,
  );
  assert.equal(
    applyDocumentValues(edited, result, research, registry, document).values.second.target.value,
    'Owner',
  );
  const removed = patchData(data, { removeFieldSetIds: ['second'] }, 'other', registry);
  assert.equal(
    applyDocumentValues(removed, result, research, registry, document).values.second,
    undefined,
  );
});

test('category prompts use authored priorities and a general fallback while preserving chat modes', () => {
  assert.match(categoryResearchPrompt('insurance'), /policy.*version/);
  assert.match(categoryResearchPrompt('vehicles'), /variant/);
  assert.equal(categoryResearchPrompt('new-category'), categoryResearchPrompt('other'));
  const context = { ...subject, name: 'Provider Plan', fields: [], targets: [] };
  assert.match(researchPrompt(context, 'products', 3), /merchant/);
  assert.match(researchPrompt(context, 'maintenance', 3), /maintenance instructions/);
});
