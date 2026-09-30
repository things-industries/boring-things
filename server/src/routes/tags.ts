import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import { listTags, saveTag, deleteTag } from '../db/tags.js';
import type { OwnerChanges } from '../application/streams.js';

export function tagRoutes(app: FastifyInstance, db: pg.Pool, changes: OwnerChanges) {
  route(app, 'GET', '/api/tags', (req) => listTags(db, req.ownerId, req.query));
  route(app, 'POST', '/api/tags', async (req, reply) => {
    const result = await saveTag(db, req.ownerId, req.body);
    changes.publish(req.ownerId);
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/tags/{id}', async (req) => {
    const result = await saveTag(db, req.ownerId, req.body, req.params.id);
    changes.publish(req.ownerId);
    return result;
  });
  route(app, 'DELETE', '/api/tags/{id}', async (req, reply) => {
    await deleteTag(db, req.ownerId, req.params.id);
    changes.publish(req.ownerId);
    return reply.code(204).send();
  });
}
