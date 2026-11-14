// Registers user-scoped Issue and Event routes for managed activities.

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import * as database from '../db/connection.js';
import * as activityDb from '../db/entities/activity.js';
import { writeEvent, writeIssue } from '../application/activity.js';
import * as thingsDb from '../db/entities/things.js';
import { ensure } from '../application/errors.js';
import type { ApplicationEvents } from '../application/events.js';

interface Options {
  db: pg.Pool;
  events: ApplicationEvents;
}

const activityRoutes: FastifyPluginAsync<Options> = async (app, { db, events }) => {
  route(app, 'GET', '/api/issues', (req) =>
    activityDb.listActivity(db, req.userId, 'issues', req.query),
  );
  route(app, 'GET', '/api/events', (req) =>
    activityDb.listActivity(db, req.userId, 'events', req.query),
  );
  route(app, 'GET', '/api/issues/{id}', (req) =>
    activityDb.getActivityForUserOrThrow(db, req.userId, 'issues', req.params.id),
  );
  route(app, 'GET', '/api/events/{id}', (req) =>
    activityDb.getActivityForUserOrThrow(db, req.userId, 'events', req.params.id),
  );
  route(app, 'POST', '/api/issues', async (req, reply) => {
    const result = await database.transaction(db, (tx) => writeIssue(tx, req.userId, req.body));
    events.publish({ type: 'data.changed', userId: req.userId });
    return reply.code(201).send(result.issue);
  });
  route(app, 'PATCH', '/api/issues/{id}', async (req) => {
    const result = await database.transaction(db, (tx) =>
      writeIssue(tx, req.userId, req.body, req.params.id),
    );
    events.publish({ type: 'data.changed', userId: req.userId });
    return result;
  });
  route(app, 'POST', '/api/events', async (req, reply) => {
    const result = await database.transaction(db, (tx) => writeEvent(tx, req.userId, req.body));
    events.publish({ type: 'data.changed', userId: req.userId });
    return reply.code(201).send(result);
  });
  route(app, 'PATCH', '/api/events/{id}', async (req) => {
    const result = await database.transaction(db, (tx) =>
      writeEvent(tx, req.userId, req.body, req.params.id),
    );
    events.publish({ type: 'data.changed', userId: req.userId });
    return result;
  });
  route(app, 'POST', '/api/events/{id}:close', async (req) => {
    const result = await database.transaction(db, async (tx) => {
      const initial = await activityDb.getActivityForUserOrThrow(
        tx,
        req.userId,
        'events',
        req.params.id,
      );
      await thingsDb.getThingForUserOrThrow(tx, req.userId, initial.thingId, { lock: true });
      const event = await activityDb.getActivityForUserOrThrow(
        tx,
        req.userId,
        'events',
        req.params.id,
        { lock: true },
      );
      if (event.status === 'CLOSED') return event;
      ensure(event.startsAt || event.startsOn, 'Event needs a date');
      await database.execute(
        tx,
        "update bt.events set status='CLOSED',closed_at=now() where user_id=$1 and id=$2",
        [req.userId, event.id],
      );
      await thingsDb.bumpThing(tx, req.userId, event.thingId);
      return activityDb.getActivityForUserOrThrow(tx, req.userId, 'events', event.id);
    });
    events.publish({ type: 'data.changed', userId: req.userId });
    return result;
  });
};

export default activityRoutes;
