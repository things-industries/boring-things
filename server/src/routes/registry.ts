import type { FastifyPluginAsync } from 'fastify';
import type { Registry } from '../application/registry/registry.js';
import { route } from '../contracts/routes.js';
import { page, pageResult, type PageQuery } from '../application/pagination.js';
import type { Database } from '../db/connection.js';
import { listCategories, searchRegistry } from '../db/entities/registry.js';
import { ensure } from '../application/errors.js';

interface RegistryQuery extends PageQuery {
  q?: string;
  categoryId?: string;
}
interface Options {
  db: Database;
  registry: Registry;
}

const registryRoutes: FastifyPluginAsync<Options> = async (app, { db, registry }) => {
  async function list<T>(
    kind: 'fields' | 'field-sets',
    records: Map<string, T>,
    query: RegistryQuery,
  ) {
    const { limit, offset } = page(query);
    const ids = await searchRegistry(
      db,
      kind,
      [query.q ?? ''],
      query.categoryId,
      limit + 1,
      offset,
    );
    return pageResult(
      ids.map(({ id }) => {
        const item = records.get(id);
        ensure(item, 'Registry record unavailable');
        return item;
      }),
      query,
    );
  }
  function get<T>(records: Map<string, T>, id: string) {
    const item = records.get(id);
    ensure(item, 'Registry record not found', 'NOT_FOUND');
    return item;
  }
  route(app, 'GET', '/api/categories', (req) => listCategories(db, req.ownerId, req.query));
  route(app, 'GET', '/api/fields', (req) => list('fields', registry.fields, req.query));
  route(app, 'GET', '/api/field-sets', (req) => list('field-sets', registry.sets, req.query));
  route(app, 'GET', '/api/fields/{id}', (req) => get(registry.fields, req.params.id));
  route(app, 'GET', '/api/field-sets/{id}', (req) => get(registry.sets, req.params.id));
};

export default registryRoutes;
