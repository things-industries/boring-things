/**
 * Registers Thing listing, creation, editing, deletion and explicit field reveal, keeping stored
 * sensitive data out of list responses.
 */

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import type { ApplicationEvents } from '../application/events.js';
import type { Registry } from '../application/registry/registry.js';
import { route } from '../contracts/routes.js';
import { transaction } from '../db/connection.js';
import { detail, writeThing } from '../application/things.js';
import { assertEditable } from '../db/entities/imports.js';
import { ownedThing, listThings, deleteThing, recordThingView } from '../db/entities/things.js';
import { revealValue } from '../application/thing-data.js';

interface Options {
  db: pg.Pool;
  registry: Registry;
  events: ApplicationEvents;
}

const thingRoutes: FastifyPluginAsync<Options> = async (app, { db, registry, events }) => {
  route(app, 'GET', '/api/things', (req) => listThings(db, req.ownerId, req.query));

  route(app, 'POST', '/api/things', async (req, reply) => {
    const result = await writeThing(db, req.ownerId, req.body, registry);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(201).send(result);
  });

  route(app, 'GET', '/api/things/{id}', (req) => detail(db, req.ownerId, req.params.id, registry));

  route(app, 'POST', '/api/things/{id}:view', async (req) => {
    const result = await recordThingView(db, req.ownerId, req.params.id);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return result;
  });

  route(app, 'PATCH', '/api/things/{id}', async (req) => {
    const result = await writeThing(db, req.ownerId, req.body, registry, req.params.id);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return result;
  });

  route(app, 'DELETE', '/api/things/{id}', async (req, reply) => {
    await transaction(db, async (tx) => {
      await ownedThing(tx, req.ownerId, req.params.id, true);
      await assertEditable(tx, req.ownerId, req.params.id);
      await deleteThing(tx, req.ownerId, req.params.id);
    });
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(204).send();
  });

  route(app, 'POST', '/api/things/{id}:reveal-field', async (req) => ({
    value: revealValue((await ownedThing(db, req.ownerId, req.params.id)).data, req.body, registry),
  }));
};

export default thingRoutes;
