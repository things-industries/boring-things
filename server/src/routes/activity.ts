import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import * as database from '../db/connection.js';
import * as activityDb from '../db/entities/activity.js';
import { writeEvent, writeIssue } from '../application/activity.js';
import type { ApplicationEvents } from '../application/events.js';

interface Options {
  db: pg.Pool;
  events: ApplicationEvents;
}

const activityRoutes: FastifyPluginAsync<Options> = async (app, { db, events }) => {
  route(app, 'GET', '/api/issues', (req) =>
    activityDb.listActivity(db, req.ownerId, 'issues', req.query),
  );
  route(app, 'GET', '/api/events', (req) =>
    activityDb.listActivity(db, req.ownerId, 'events', req.query),
  );
  route(app, 'GET', '/api/purchasables', (req) =>
    activityDb.listActivity(db, req.ownerId, 'purchasables', req.query),
  );
  route(app, 'GET', '/api/issues/{id}', (req) =>
    activityDb.getOwnedActivityOrThrow(db, req.ownerId, 'issues', req.params.id),
  );
  route(app, 'GET', '/api/events/{id}', (req) =>
    activityDb.getOwnedActivityOrThrow(db, req.ownerId, 'events', req.params.id),
  );
  route(app, 'GET', '/api/purchasables/{id}', (req) =>
    activityDb.getOwnedActivityOrThrow(db, req.ownerId, 'purchasables', req.params.id),
  );
  route(app, 'POST', '/api/issues', async (req, reply) => {
    const result = await database.transaction(db, (tx) => writeIssue(tx, req.ownerId, req.body));
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/issues/{id}', async (req) => {
    const result = await database.transaction(db, (tx) =>
      writeIssue(tx, req.ownerId, req.body, req.params.id),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return result;
  });
  route(app, 'POST', '/api/events', async (req, reply) => {
    const result = await database.transaction(db, (tx) => writeEvent(tx, req.ownerId, req.body));
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/events/{id}', async (req) => {
    const result = await database.transaction(db, (tx) =>
      writeEvent(tx, req.ownerId, req.body, req.params.id),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return result;
  });
};

export default activityRoutes;
