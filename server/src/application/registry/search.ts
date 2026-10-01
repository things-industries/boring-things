import type { FieldSearchLabel } from './registry.js';
/**
 * Searches registry metadata for fields and sets, expanding mandatory dependencies and returning
 * bounded suggestions for AI mapping.
 */

import type { Database } from '../../db/connection.js';
import { searchRegistry } from '../../db/entities/registry.js';
import type { Registry } from './registry.js';
import { ensure } from '../errors.js';

export async function searchFieldSets(
  db: Database,
  registry: Registry,
  category: string,
  terms: string[],
) {
  ensure(
    terms.length > 0 &&
      terms.length <= 20 &&
      terms.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 200),
    'Invalid search terms',
  );
  // Search both whole phrases and significant words; caps bound model context and database work.
  const queryTerms = [
    ...new Set(
      terms.flatMap((term) => [
        term,
        ...term.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2),
      ]),
    ),
  ].slice(0, 60);

  const found = await searchRegistry(db, 'field-sets', queryTerms, category, 13);
  const roots = found.slice(0, 12).map((r) => r.id);
  const included = registry.expand(roots, category);
  const suggestions = [
    ...new Set(included.flatMap((id) => registry.sets.get(id)!.considerAlongside)),
  ];
  const alongside = suggestions.slice(0, 12);
  return {
    matches: roots,
    sets: registry
      .expand([...included, ...alongside], category)
      .map((id) => registry.sets.get(id)!),
    truncated: found.length > 12 || suggestions.length > 12,
  };
}

export async function searchFields(db: Database, registry: Registry, labels: FieldSearchLabel[]) {
  ensure(
    labels.length > 0 &&
      labels.length <= 20 &&
      labels.every(
        (l) =>
          typeof l.label === 'string' &&
          l.label.length > 0 &&
          l.label.length <= 200 &&
          typeof l.context === 'string' &&
          l.context.length <= 500,
      ),
    'Invalid field search',
  );
  const results = [];

  for (const { label, context } of labels) {
    const found = await searchRegistry(
      db,
      'fields',
      [
        label,
        ...context
          .split(/\s+/)
          .filter((s) => s.length > 2)
          .slice(0, 8),
      ],
      undefined,
      6,
    );
    results.push({
      label,
      fields: found.slice(0, 5).map(({ id }) => ({
        ...registry.fields.get(id)!,
        sets: [...registry.sets.values()]
          .filter((s) => s.fields.some((f) => f.id === id))
          .map((s) => ({ id: s.id, categoryId: s.categoryId, name: s.name })),
      })),
      truncated: found.length > 5,
    });
  }

  return { results, truncated: results.some((r) => r.truncated) };
}
