import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import * as tagsDb from '../db/entities/tags.js';
import type { ApplicationEvents } from '../application/events.js';

interface Options {
  db: pg.Pool;
  events: ApplicationEvents;
}

const tagRoutes: FastifyPluginAsync<Options> = async (app, { db, events }) => {
  route(app, 'GET', '/api/tags', (req) => tagsDb.listTags(db, req.userId, req.query));
  route(app, 'POST', '/api/tags', async (req, reply) => {
    const result = await tagsDb.saveTag(db, req.userId, req.body);
    events.publish({ type: 'data.changed', userId: req.userId });
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/tags/{id}', async (req) => {
    const result = await tagsDb.saveTag(db, req.userId, req.body, req.params.id);
    events.publish({ type: 'data.changed', userId: req.userId });
    return result;
  });
  route(app, 'DELETE', '/api/tags/{id}', async (req, reply) => {
    await tagsDb.deleteTag(db, req.userId, req.params.id);
    events.publish({ type: 'data.changed', userId: req.userId });
    return reply.code(204).send();
  });
};

export default tagRoutes;
