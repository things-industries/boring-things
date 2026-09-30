import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import { transaction } from '../db/connection.js';
import { listActivity, ownedActivity } from '../db/activity.js';
import { writeEvent, writeIssue } from '../application/activity.js';
import type { OwnerChanges } from '../application/streams.js';

export function activityRoutes(app: FastifyInstance, db: pg.Pool, changes: OwnerChanges) {
  route(app, 'GET', '/api/issues', (req) => listActivity(db, req.ownerId, 'issues', req.query));
  route(app, 'GET', '/api/events', (req) => listActivity(db, req.ownerId, 'events', req.query));
  route(app, 'GET', '/api/purchasables', (req) =>
    listActivity(db, req.ownerId, 'purchasables', req.query),
  );
  route(app, 'GET', '/api/issues/{id}', (req) =>
    ownedActivity(db, req.ownerId, 'issues', req.params.id),
  );
  route(app, 'GET', '/api/events/{id}', (req) =>
    ownedActivity(db, req.ownerId, 'events', req.params.id),
  );
  route(app, 'GET', '/api/purchasables/{id}', (req) =>
    ownedActivity(db, req.ownerId, 'purchasables', req.params.id),
  );
  route(app, 'POST', '/api/issues', async (req, reply) => {
    const result = await transaction(db, (tx) => writeIssue(tx, req.ownerId, req.body));
    changes.publish(req.ownerId);
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/issues/{id}', async (req) => {
    const result = await transaction(db, (tx) =>
      writeIssue(tx, req.ownerId, req.body, req.params.id),
    );
    changes.publish(req.ownerId);
    return result;
  });
  route(app, 'POST', '/api/events', async (req, reply) => {
    const result = await transaction(db, (tx) => writeEvent(tx, req.ownerId, req.body));
    changes.publish(req.ownerId);
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/events/{id}', async (req) => {
    const result = await transaction(db, (tx) =>
      writeEvent(tx, req.ownerId, req.body, req.params.id),
    );
    changes.publish(req.ownerId);
    return result;
  });
}
