/**
 * Searches registry metadata for fields and sets, expanding mandatory dependencies and returning
 * bounded suggestions for AI mapping.
 */

import type { Database } from '../db/connection.js';
import { rows } from '../db/connection.js';
import type { Registry } from './registry.js';
import { ensure } from './errors.js';

export async function searchRegistry(
  db: Database,
  kind: 'fields' | 'field-sets',
  terms: string[],
  categoryId?: string,
  limit = 12,
  offset = 0,
) {
  // SQL identifiers come from fixed choices; search terms remain bound parameters.
  const table = kind === 'fields' ? 'field_definitions' : 'field_sets';
  const description = kind === 'fields' ? 'description' : 'eligibility';
  const category = kind === 'field-sets' ? 'and ($4::text is null or category_id=$4)' : '';
  const params: unknown[] = [terms.length ? terms : [''], limit, offset];
  if (kind === 'field-sets') params.push(categoryId ?? null);
  return rows<{ id: string }>(
    db,
    `select id from bt.${table} where exists(select 1 from unnest($1::text[]) term where term='' or to_tsvector('simple',name || ' ' || ${description} || ' ' || array_to_string(keywords,' ')) @@ plainto_tsquery('simple',term) or strpos(lower(id),lower(term))>0 or strpos(lower(name || ' ' || array_to_string(keywords,' ')),lower(term))>0) ${category} order by id limit $2 offset $3`,
    params,
  );
}

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

export async function searchFields(
  db: Database,
  registry: Registry,
  labels: { label: string; context: string }[],
) {
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
