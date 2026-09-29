import type { FastifyInstance } from 'fastify';
import type { Registry } from '../application/registry.js';
import { route } from '../contracts/routes.js';
import { page, pageResult } from '../application/pagination.js';
import { rows, type Database } from '../db/connection.js';
import { searchRegistry } from '../application/registry-search.js';
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
      const ids = await searchRegistry(
        db,
        kind,
        [req.query.q ?? ''],
        req.query.categoryId,
        limit + 1,
        offset,
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
