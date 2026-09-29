import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateModel, importedName } from '../src/application/import-naming.js';
import { candidates } from './fixtures/imports.js';

test('import names stay short until a collision needs a model or number', () => {
  assert.equal(importedName('Bosch Oven', 'MODEL/01', []), 'Bosch Oven');
  assert.equal(importedName('Bosch Oven', 'MODEL/01', ['bosch oven']), 'Bosch Oven (MODEL/01)');
  assert.equal(
    importedName('Bosch Oven', 'MODEL/01', ['Bosch Oven', 'Bosch Oven (MODEL/01)']),
    'Bosch Oven (MODEL/01) (2)',
  );
  assert.equal(
    importedName('Bosch Oven', undefined, ['Bosch Oven', 'Bosch Oven (2)']),
    'Bosch Oven (3)',
  );
  const long = 'a'.repeat(200);
  assert.ok(importedName(long, 'b'.repeat(200), [long]).length <= 200);
});

test('only nonsensitive model identifiers are eligible for disambiguation', () => {
  assert.equal(candidateModel(candidates.neff), undefined);
  const candidate = structuredClone(candidates.neff);
  candidate.facts[0] = { ...candidate.facts[0], label: 'E-Nr', value: 'MODEL/01' };
  assert.equal(candidateModel(candidate), 'MODEL/01');
  candidate.facts[0].sensitive = true;
  assert.equal(candidateModel(candidate), undefined);
});
