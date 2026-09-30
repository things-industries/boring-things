import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from '../../shared/model.js';
import { fieldSections } from '../../src/app/utils/sections.util.js';
const set = (id: string, includes: string[] = []) =>
  ({
    id,
    name: id,
    includes,
    considerAlongside: [],
    fields: [{ id: id + '.field' }],
  }) as unknown as Schema['Thing']['fieldSets'][number];
test('unbranched inclusions collapse under the specialist with field ownership retained', () => {
  const result = fieldSections([set('vehicle'), set('van', ['vehicle']), set('electric')]);
  assert.deepEqual(
    result.map((s) => [s.id, s.sets.map((s) => s.id)]),
    [
      ['van', ['van', 'vehicle']],
      ['electric', ['electric']],
    ],
  );
});
test('siblings, policy fields and shared dependencies appear once', () => {
  const sets = [
    set('policy', ['buildings', 'contents']),
    set('buildings', ['base']),
    set('contents', ['base']),
    set('base'),
  ];
  const result = fieldSections(sets);
  assert.deepEqual(
    result.map((s) => s.id),
    ['policy', 'buildings', 'contents', 'base'],
  );
  assert.deepEqual(
    result.flatMap((s) => s.sets).map((s) => s.fields[0].id),
    sets.map((s) => s.fields[0].id),
  );
});
