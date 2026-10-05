import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/application/registry/registry.js';
import * as registrySeedDb from '../src/db/seeds/registry.js';
import { emptyData, type ThingData } from '../../shared/model.js';
import type { FactMapping } from '../src/application/import/types.js';
import { extractedThings } from './fixtures/imports.js';
import {
  applyFactMapping,
  applySelectedSets,
  localFactId,
  buildResearchThing,
  validateExtraction,
} from '../src/application/import/mapping.js';
import { patchData } from '../src/application/thing-data.js';
const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);
const candidate = extractedThings.neff;
const allowedSets = new Set(['appliances.neff', 'appliances.appliance']);
const allowedFields = new Set(['appliances.zNumber']);
const job = '3d65f18e-1a6e-487e-841f-f1e5f76f1b9a',
  attachment = '387e356c-3b0b-4f57-9b48-9e8061dac87a';
const select = () =>
  applySelectedSets(emptyData(), ['appliances.neff'], 'appliances', registry, allowedSets);
const mapped: FactMapping = {
  values: [
    {
      factId: 'fact-1',
      fieldSetId: 'appliances.neff',
      fieldId: 'appliances.zNumber',
      value: '0015',
      pin: true,
    },
  ],
  customFactIds: ['fact-2'],
  discardedFactIds: [],
};
const map = (data: ThingData = select(), batch = mapped, subject = candidate) =>
  applyFactMapping(data, batch, subject, registry, allowedFields, job, attachment);

test('mapping rejects unreturned IDs, incompatible sets, wrong membership and numeric identifiers atomically', () => {
  const data = select();
  for (const entry of [
    { ...mapped.values[0], fieldId: 'invented' },
    { ...mapped.values[0], fieldSetId: 'appliances.appliance' },
    { ...mapped.values[0], fieldId: 'common.model' },
    { ...mapped.values[0], value: 15 },
    { ...mapped.values[0], factId: 'invented' },
  ])
    assert.throws(() => map(data, { ...mapped, values: [entry] }));
  assert.throws(() =>
    applySelectedSets(data, ['appliances.neff'], 'insurance', registry, allowedSets),
  );
  assert.throws(() => applySelectedSets(data, ['invented'], 'appliances', registry, allowedSets));
  assert.deepEqual(data, select());
});

test('compound source facts can map to separate fields while retaining evidence', () => {
  const fact = {
    ...candidate.facts[0],
    label: 'Power supply',
    value: '220-240 V~ / 50 Hz',
    quote: '220-240 V~ / 50 Hz',
  };
  const values = [
    { fieldId: 'appliances.supplyVoltage', value: '220-240 V~' },
    { fieldId: 'appliances.supplyFrequency', value: '50 Hz' },
  ].map((entry) => ({
    ...entry,
    factId: fact.id,
    fieldSetId: null,
    pin: false,
  }));
  const data = applyFactMapping(
    emptyData(),
    { values, customFactIds: [], discardedFactIds: [] },
    { id: candidate.id, facts: [fact] },
    registry,
    new Set(values.map((entry) => entry.fieldId)),
    job,
    attachment,
  );
  for (const entry of values) {
    assert.equal(data.standalone[entry.fieldId].value, entry.value);
    assert.deepEqual(data.standalone[entry.fieldId].sourceRefs, [
      { attachmentId: attachment, quote: fact.quote },
    ]);
  }
});

test('every fact has one disposition and duplicate mapping addresses are rejected', () => {
  for (const batch of [
    { ...mapped, customFactIds: [] },
    { ...mapped, customFactIds: ['fact-2', 'fact-2'] },
    { ...mapped, customFactIds: ['invented'] },
    { ...mapped, discardedFactIds: ['fact-2'] },
    { ...mapped, discardedFactIds: ['fact-1'] },
    { ...mapped, values: [...mapped.values, ...mapped.values] },
  ])
    assert.throws(() => map(select(), batch));
});

test('useful custom facts retain evidence while unexplained markings are discarded', () => {
  const subject = structuredClone(candidate);
  subject.facts.push({
    ...subject.facts[1],
    id: 'fact-3',
    label: 'Additional label marking',
    value: 'V/C',
    quote: 'V/C',
    page: 1,
  });
  const data = map(select(), { ...mapped, discardedFactIds: ['fact-3'] }, subject);
  assert.equal(data.undefinedFields.length, 1);
  assert.equal(data.undefinedFields[0].value, 'ABC-12');
  assert.deepEqual(data.undefinedFields[0].sourceRefs, [
    { attachmentId: attachment, quote: candidate.facts[1].quote },
  ]);
  assert.equal(data.values['appliances.neff']['appliances.zNumber'].value, '0015');
});

test('cleared user values and removed custom facts remain cleared on retry', () => {
  const unknownId = localFactId(job, candidate.id, 'fact-2');
  const data = patchData(
    map(),
    {
      values: [{ fieldSetId: 'appliances.neff', fieldId: 'appliances.zNumber', value: null }],
      removeUndefinedFieldIds: [unknownId],
    },
    'appliances',
    registry,
  );
  const retried = map(data);
  assert.equal(retried.values['appliances.neff']['appliances.zNumber'], undefined);
  assert.ok(!retried.undefinedFields.some((field) => field.id === unknownId));
});

test('conflicting mapped evidence is retained without overwriting owner values', () => {
  const data = map();
  data.values['appliances.neff']['appliances.zNumber'] = {
    value: '0099',
    origin: 'USER',
    sourceRefs: [],
  };
  const result = map(data);
  assert.equal(result.values['appliances.neff']['appliances.zNumber'].value, '0099');
  assert.ok(result.undefinedFields.some((field) => field.value === '0015'));
});

test('legacy custom facts are reconciled while authored and edited fields remain intact', () => {
  const data = emptyData();
  data.undefinedFields = candidate.facts.map((fact) => ({
    id: localFactId(job, candidate.id, fact.id),
    label: fact.label,
    value: fact.value,
    origin: 'IMPORT',
    sensitive: false,
    sourceRefs: [{ attachmentId: attachment }],
  }));
  data.undefinedFields.push({ ...data.undefinedFields[0], id: 'authored', origin: 'USER' });
  const discarded: FactMapping = {
    values: [],
    customFactIds: [],
    discardedFactIds: ['fact-1', 'fact-2'],
  };
  const edited = structuredClone(data);
  edited.undefinedFields[0].origin = 'USER';
  assert.deepEqual(
    map(data, discarded).undefinedFields.map((field) => field.id),
    ['authored'],
  );
  assert.equal(map(edited, discarded).undefinedFields.length, 2);
});

test('sensitive facts cannot map to an unmasked definition and research only receives eligible fields', () => {
  const sensitive = structuredClone(candidate);
  sensitive.facts[0].sensitive = true;
  assert.throws(() => map(select(), mapped, sensitive));
  const data = select();
  data.values['appliances.neff'] = {
    'appliances.zNumber': { value: 'private-serial', origin: 'USER', sourceRefs: [] },
    'appliances.eNumber': { value: 'MODEL/01', origin: 'USER', sourceRefs: [] },
  };
  const query = buildResearchThing(candidate, data, registry)!;
  assert.equal(query.knownFields[0].value, 'MODEL/01');
  assert.deepEqual(Object.keys(query).sort(), ['categoryId', 'emptyFields', 'id', 'knownFields']);
  assert.ok(!JSON.stringify(query).includes('private-serial'));
});

test('extraction rejects invalid categories and cannot inject mapping checkpoints', () => {
  assert.throws(() =>
    validateExtraction(
      { text: 'source', extractedThings: [{ ...candidate, categoryId: 'invented' }] },
      ['appliances'],
    ),
  );
  const result = validateExtraction(
    {
      text: 'source',
      extractedThings: [
        { ...candidate, id: '__proto__', mapping: { setIds: ['invented'], batches: [mapped] } },
      ],
    },
    ['appliances'],
  );
  assert.equal(result.extractedThings[0].id, 'candidate-1');
  assert.equal(result.extractedThings[0].mapping, undefined);
});

test('historical extraction fixtures preserve identifiers and independent set values with explicit dispositions', async () => {
  const { readFile } = await import('node:fs/promises');
  const recording = JSON.parse(
    await readFile(new URL('./fixtures/import-recording.json', import.meta.url), 'utf8'),
  ) as {
    extraction: { text: string; candidates: (typeof candidate)[] };
    mapping: {
      candidate: string;
      result:
        { kind: 'sets'; setIds: string[] } | { kind: 'values'; values: FactMapping['values'] };
    }[];
  };
  const extracted = validateExtraction(
    { text: recording.extraction.text, extractedThings: recording.extraction.candidates },
    ['appliances', 'vehicles', 'insurance'],
  );
  assert.equal(extracted.extractedThings.length, 3);
  const results = extracted.extractedThings.map((subject) => {
    let data = emptyData();
    const stages = recording.mapping.filter((stage) => stage.candidate === subject.id);
    for (const { result } of stages)
      if (result.kind === 'sets')
        data = applySelectedSets(
          data,
          result.setIds,
          subject.categoryId,
          registry,
          new Set(registry.sets.keys()),
        );
    const values = stages.flatMap(({ result }) => (result.kind === 'values' ? result.values : []));
    const unmatched = subject.facts.filter(
      (fact) => !values.some((entry) => entry.factId === fact.id),
    );
    const batch = {
      values,
      customFactIds: unmatched
        .filter((fact) => fact.label === 'Installer reference')
        .map((fact) => fact.id),
      discardedFactIds: unmatched
        .filter((fact) => fact.label !== 'Installer reference')
        .map((fact) => fact.id),
    };
    return {
      candidate: subject,
      data: applyFactMapping(
        data,
        batch,
        subject,
        registry,
        new Set(registry.fields.keys()),
        job,
        attachment,
      ),
    };
  });
  const hob = results.find((result) => result.candidate.categoryId === 'appliances')!.data;
  assert.equal(hob.values['appliances.neff']['appliances.zNumber'].value, '0015');
  assert.ok(hob.undefinedFields.some((field) => field.value === 'ABC-12'));
  const van = results.find((result) => result.candidate.categoryId === 'vehicles')!.data;
  assert.ok(van.setIds.includes('vehicles.van') && van.setIds.includes('vehicles.vehicle'));
  const policy = results.find((result) => result.candidate.categoryId === 'insurance')!.data;
  assert.deepEqual(policy.values['insurance.buildings']['insurance.sumInsured'].value, {
    amountMinor: 40000000,
    currency: 'GBP',
  });
  assert.deepEqual(policy.values['insurance.contents']['insurance.sumInsured'].value, {
    amountMinor: 5000000,
    currency: 'GBP',
  });
});

test('custom PIN facts are masked even if extraction missed sensitivity', () => {
  const source = {
    ...candidate,
    facts: [{ ...candidate.facts[0], label: 'Access PIN', sensitive: false, value: '0077' }],
  };
  const data = map(
    emptyData(),
    { values: [], customFactIds: ['fact-1'], discardedFactIds: [] },
    source,
  );
  assert.equal(data.undefinedFields[0].sensitive, true);
});
