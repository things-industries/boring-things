import type { FastifyInstance } from 'fastify';
import type { Registry } from '../application/registry.js';
import { route } from '../contracts/routes.js';
import { page, pageResult } from '../application/pagination.js';
import { rows, type Database } from '../db/connection.js';
import { ensure } from '../application/errors.js';
export function registryRoutes(app: FastifyInstance, db: Database, registry: Registry) {
  route(app, 'GET', '/api/categories', async (req) => {
    const { limit, offset } = page(req.query);
    const result = await rows(
      db,
      'select c.*, (select count(*)::integer from bt.things t where t.category_id=c.id and t.owner_id=$1) as thing_count from bt.categories c order by sort_order,id limit $2 offset $3',
      [req.ownerId, limit + 1, offset],
    );
    return pageResult(result, req.query);
  });
  for (const kind of ['field-sets', 'fields'] as const) {
    route(app, 'GET', `/api/${kind}`, async (req) => {
      const { limit, offset } = page(req.query);
      const table = kind === 'fields' ? 'field_definitions' : 'field_sets';
      const description = kind === 'fields' ? 'description' : 'eligibility';
      const params: unknown[] = [req.query.q ?? '', limit + 1, offset];
      const category = kind === 'field-sets' && req.query.categoryId ? 'and category_id=$4' : '';
      if (category) params.push(req.query.categoryId);
      const ids = await rows<{ id: string }>(
        db,
        `select id from bt.${table} where ($1='' or to_tsvector('simple',name || ' ' || ${description}) @@ plainto_tsquery('simple',$1) or strpos(lower(id),lower($1))>0 or strpos(lower(array_to_string(keywords,' ')),lower($1))>0) ${category} order by id limit $2 offset $3`,
        params,
      );
      return pageResult(
        ids.map(({ id }) => (kind === 'fields' ? registry.fields.get(id) : registry.sets.get(id))),
        req.query,
      );
    });
    route(app, 'GET', `/api/${kind}/{id}`, async (req) => {
      const item =
        kind === 'fields' ? registry.fields.get(req.params.id) : registry.sets.get(req.params.id);
      ensure(item, 'Registry record not found', 404);
      return item;
    });
  }
}
