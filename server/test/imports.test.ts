import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/application/registry.js';
import { fields, sets } from '../src/db/registry-seed.js';
import { emptyData } from '../../shared/model.js';
import { candidates } from './fixtures/imports.js';
import {
  applyImportStage,
  localFactId,
  publicDiscoveryCandidate,
  retainFacts,
  validateExtraction,
} from '../src/application/import-mapping.js';
import { patchData } from '../src/application/thing-data.js';
import { withDeadline } from '../src/application/import-deadline.js';
const registry = new Registry(fields, sets);
const candidate = candidates.neff;
const allowedSets = new Set(['appliances.neff', 'appliances.appliance']);
const allowedFields = new Set(['appliances.zNumber']);
const job = '3d65f18e-1a6e-487e-841f-f1e5f76f1b9a',
  attachment = '387e356c-3b0b-4f57-9b48-9e8061dac87a';
const select = () =>
  applyImportStage(
    retainFacts(emptyData(), candidate, job, attachment),
    { kind: 'sets', setIds: ['appliances.neff'] },
    candidate,
    'appliances',
    registry,
    allowedSets,
    allowedFields,
    job,
    attachment,
  );
const mapped = {
  kind: 'values' as const,
  values: [
    {
      factId: 'fact-1',
      fieldSetId: 'appliances.neff',
      fieldId: 'appliances.zNumber',
      value: '0015',
      pin: true,
    },
  ],
};
test('mapping rejects unreturned IDs, incompatible sets, wrong membership and numeric identifiers atomically', () => {
  const data = select();
  for (const entry of [
    { ...mapped.values[0], fieldId: 'invented' },
    { ...mapped.values[0], fieldSetId: 'appliances.appliance' },
    { ...mapped.values[0], fieldId: 'common.model' },
    { ...mapped.values[0], value: 15 },
    { ...mapped.values[0], factId: 'invented' },
  ])
    assert.throws(() =>
      applyImportStage(
        data,
        { kind: 'values', values: [entry] },
        candidate,
        'appliances',
        registry,
        allowedSets,
        allowedFields,
        job,
        attachment,
      ),
    );
  assert.throws(() =>
    applyImportStage(
      data,
      { kind: 'sets', setIds: ['appliances.neff'] },
      candidate,
      'insurance',
      registry,
      allowedSets,
      allowedFields,
      job,
      attachment,
    ),
  );
  assert.deepEqual(data.values, {});
});
test('cleared user values and removed custom facts remain cleared on retry', () => {
  let data = applyImportStage(
    select(),
    mapped,
    candidate,
    'appliances',
    registry,
    allowedSets,
    allowedFields,
    job,
    attachment,
  );
  const unknownId = localFactId(job, candidate.id, 'fact-2');
  data = patchData(
    data,
    {
      values: [
        {
          fieldSetId: 'appliances.neff',
          fieldId: 'appliances.zNumber',
          value: null,
        },
      ],
      removeUndefinedFieldIds: [unknownId],
    },
    'appliances',
    registry,
  );
  data = retainFacts(data, candidate, job, attachment);
  data = applyImportStage(
    data,
    mapped,
    candidate,
    'appliances',
    registry,
    allowedSets,
    allowedFields,
    job,
    attachment,
  );
  assert.equal(data.values['appliances.neff']['appliances.zNumber'], undefined);
  assert.ok(!data.undefinedFields.some((f) => f.id === unknownId));
});
test('sensitive facts cannot map to an unmasked definition and discovery only receives public model IDs', () => {
  const sensitive = structuredClone(candidate);
  sensitive.facts[0].sensitive = true;
  assert.throws(() =>
    applyImportStage(
      select(),
      mapped,
      sensitive,
      'appliances',
      registry,
      allowedSets,
      allowedFields,
      job,
      attachment,
    ),
  );
  const data = select();
  data.values['appliances.neff'] = {
    'appliances.zNumber': {
      value: 'private-serial',
      origin: 'user',
      sourceRefs: [],
    },
    'appliances.eNumber': { value: 'MODEL/01', origin: 'user', sourceRefs: [] },
  };
  const query = publicDiscoveryCandidate(candidate, data)!;
  assert.equal(query.name, 'MODEL/01');
  assert.deepEqual(query.facts, []);
  assert.ok(!JSON.stringify(query).includes('private-serial'));
});
test('extraction cannot smuggle category IDs and normalizes candidate/fact identifiers', () => {
  assert.throws(() =>
    validateExtraction(
      {
        text: 'source',
        candidates: [{ ...candidate, categoryId: 'invented' }],
      },
      ['appliances'],
    ),
  );
  const result = validateExtraction(
    { text: 'source', candidates: [{ ...candidate, id: '__proto__' }] },
    ['appliances'],
  );
  assert.equal(result.candidates[0].id, 'candidate-1');
});
test('deadline rejects adapters that ignore cancellation and suppresses late completion', async () => {
  const controller = new AbortController();
  let complete!: (value: string) => void;
  const result = withDeadline(
    new Promise<string>((resolve) => {
      complete = resolve;
    }),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(result);
  complete('late');
});

test('recorded live extraction and mapping retain the required fixture invariants', async () => {
  const { readFile } = await import('node:fs/promises');
  const recording = JSON.parse(
    await readFile(new URL('./fixtures/import-recording.json', import.meta.url), 'utf8'),
  ) as {
    extraction: import('../src/application/import-types.js').Extraction;
    mapping: {
      candidate: string;
      result: import('../src/application/import-types.js').MappingStage;
    }[];
  };
  const extracted = validateExtraction(recording.extraction, [
    'appliances',
    'vehicles',
    'insurance',
  ]);
  assert.equal(extracted.candidates.length, 3);
  const results = extracted.candidates.map((c) => {
    let data = retainFacts(emptyData(), c, job, attachment);
    for (const stage of recording.mapping.filter((s) => s.candidate === c.id))
      data = applyImportStage(
        data,
        stage.result,
        c,
        c.categoryId,
        registry,
        new Set(registry.sets.keys()),
        new Set(registry.fields.keys()),
        job,
        attachment,
      );
    return { candidate: c, data };
  });
  const hob = results.find((r) => r.candidate.categoryId === 'appliances')!.data;
  assert.equal(hob.values['appliances.neff']['appliances.zNumber'].value, '0015');
  assert.ok(hob.undefinedFields.some((f) => f.value === 'ABC-12'));
  const van = results.find((r) => r.candidate.categoryId === 'vehicles')!.data;
  assert.ok(van.setIds.includes('vehicles.van') && van.setIds.includes('vehicles.vehicle'));
  const policy = results.find((r) => r.candidate.categoryId === 'insurance')!.data;
  assert.deepEqual(policy.values['insurance.buildings']['insurance.sumInsured'].value, {
    amountMinor: 40000000,
    currency: 'GBP',
  });
  assert.deepEqual(policy.values['insurance.contents']['insurance.sumInsured'].value, {
    amountMinor: 5000000,
    currency: 'GBP',
  });
});

test('retained PIN facts are masked before registry mapping even if extraction missed sensitivity', () => {
  const source = structuredClone(candidate);
  source.facts = [
    {
      ...source.facts[0],
      label: 'Access PIN',
      sensitive: false,
      value: '0077',
    },
  ];
  const data = retainFacts(emptyData(), source, job, attachment, registry);
  assert.equal(data.undefinedFields[0].sensitive, true);
});
