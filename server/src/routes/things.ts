/**
 * Registers user-scoped Thing listing, creation, editing, deletion and view tracking.
 */

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import type { ApplicationEvents } from '../application/events.js';
import type { JobRunner } from '../application/jobs/runner.js';
import type { Registry } from '../application/registry/registry.js';
import { route } from '../contracts/routes.js';
import * as database from '../db/connection.js';
import { changeThingCategory, detail, writeThing } from '../application/things.js';
import { ensure } from '../application/errors.js';
import * as importsDb from '../db/entities/imports.js';
import * as thingsDb from '../db/entities/things.js';

interface Options {
  db: pg.Pool;
  registry: Registry;
  events: ApplicationEvents;
  runner: JobRunner;
  importEnabled: boolean;
}

const thingRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, registry, events, runner, importEnabled },
) => {
  route(app, 'GET', '/api/things', (req) => thingsDb.listThings(db, req.userId, req.query));

  route(app, 'POST', '/api/things', async (req, reply) => {
    const result = await writeThing(db, req.userId, req.body, registry);
    events.publish({ type: 'data.changed', userId: req.userId });
    return reply.code(201).send(result);
  });

  route(app, 'GET', '/api/things/{id}', (req) => detail(db, req.userId, req.params.id, registry));

  route(app, 'POST', '/api/things/{id}:view', async (req) => {
    const result = await thingsDb.recordThingView(db, req.userId, req.params.id);
    events.publish({ type: 'data.changed', userId: req.userId });
    return result;
  });

  route(app, 'PATCH', '/api/things/{id}', async (req) => {
    const result = await writeThing(db, req.userId, req.body, registry, req.params.id);
    events.publish({ type: 'data.changed', userId: req.userId });
    return result;
  });

  route(app, 'POST', '/api/things/{id}:change-category', async (req) => {
    ensure(!req.body.findDetails || importEnabled, 'Import is not configured', 'UNAVAILABLE');
    const result = await changeThingCategory(db, req.userId, req.params.id, req.body, registry);
    events.publish({ type: 'data.changed', userId: req.userId });
    if (req.body.findDetails) runner.wake();
    return result;
  });

  route(app, 'DELETE', '/api/things/{id}', async (req, reply) => {
    await database.transaction(db, async (tx) => {
      await thingsDb.getThingForUserOrThrow(tx, req.userId, req.params.id, { lock: true });
      await importsDb.removeQueuedThingImports(tx, req.userId, req.params.id);
      await importsDb.assertThingEditable(tx, req.userId, req.params.id);
      await thingsDb.deleteThing(tx, req.userId, req.params.id);
    });
    events.publish({ type: 'data.changed', userId: req.userId });
    return reply.code(204).send();
  });
};

export default thingRoutes;
