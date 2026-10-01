import { execute, rows, type Database } from '../connection.js';
import type { FieldDefinition, FieldSet, Schema } from '../../../../shared/model.js';
import type { PageQuery } from '../../application/pagination.js';
import { page, pageResult } from '../../application/pagination.js';
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

export async function registryRecords(db: Database) {
  const fields = await rows<FieldDefinition>(db, 'select * from bt.field_definitions order by id');
  const sets = await rows<Omit<FieldSet, 'fields'> & { fieldIds: string[] }>(
    db,
    'select * from bt.field_sets order by id',
  );
  return { fields, sets };
}
export async function categoryExists(db: Database, id: string): Promise<boolean> {
  return !!(await execute(db, 'select id from bt.categories where id=$1', [id])).rowCount;
}
export async function categoryIds(db: Database): Promise<string[]> {
  return (await rows<{ id: string }>(db, 'select id from bt.categories')).map((c) => c.id);
}
export async function listCategories(
  db: Database,
  owner: string,
  query: PageQuery,
): Promise<Schema['CategoryList']> {
  const { limit, offset } = page(query);
  return pageResult(
    await rows<Schema['Category']>(
      db,
      'select c.*, (select count(*)::integer from bt.things t where t.category_id=c.id and t.owner_id=$1) as thing_count from bt.categories c order by sort_order,id limit $2 offset $3',
      [owner, limit + 1, offset],
    ),
    query,
  );
}
