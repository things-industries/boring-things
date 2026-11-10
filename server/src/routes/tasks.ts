/** Owner-scoped Task lifecycle and derived Thing date endpoints. */

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import * as database from '../db/connection.js';
import * as tasksDb from '../db/entities/tasks.js';
import * as thingsDb from '../db/entities/things.js';
import { completeTaskFollowup } from '../application/task-followups.js';
import { writeTask, changeTask } from '../application/tasks.js';
import { acceptTask, type TaskScheduler } from '../application/task-scheduling.js';
import { listThingDates } from '../application/thing-dates.js';
import type { Registry } from '../application/registry/registry.js';
import type { ApplicationEvents } from '../application/events.js';

interface Options {
  db: pg.Pool;
  registry: Registry;
  events: ApplicationEvents;
  taskScheduler?: TaskScheduler;
}
const taskRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, registry, events, taskScheduler },
) => {
  route(app, 'GET', '/api/tasks', (req) => tasksDb.listTasks(db, req.ownerId, req.query));
  route(app, 'GET', '/api/tasks/{id}', (req) =>
    tasksDb.getOwnedTaskOrThrow(db, req.ownerId, req.params.id),
  );
  route(app, 'GET', '/api/thing-dates', (req) =>
    listThingDates(db, req.ownerId, registry, req.query),
  );
  route(app, 'POST', '/api/tasks', async (req, reply) => {
    const task = await database.transaction(db, (tx) =>
      writeTask(tx, req.ownerId, req.body, registry),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(201).send(task);
  });
  route(app, 'PATCH', '/api/tasks/{id}', async (req) => {
    const task = await database.transaction(db, (tx) =>
      writeTask(tx, req.ownerId, req.body, registry, req.params.id),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return task;
  });
  route(app, 'DELETE', '/api/tasks/{id}', async (req, reply) => {
    await database.transaction(db, async (tx) => {
      const task = await tasksDb.getOwnedTaskOrThrow(tx, req.ownerId, req.params.id);
      await thingsDb.getOwnedThingOrThrow(tx, req.ownerId, task.thingId, { lock: true });
      await tasksDb.deleteTask(tx, req.ownerId, task.id);
      await thingsDb.bumpThing(tx, req.ownerId, task.thingId);
    });
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(204).send();
  });
  route(app, 'POST', '/api/tasks/{id}:accept', async (req) => {
    const change = await acceptTask(
      db,
      req.ownerId,
      req.params.id,
      req.body.timeZone ?? 'UTC',
      registry,
      taskScheduler,
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return change;
  });
  route(app, 'POST', '/api/tasks/{id}:complete', async (req) => {
    const change = await database.transaction(db, (tx) =>
      changeTask(tx, req.ownerId, req.params.id, 'complete', req.body.timeZone ?? 'UTC'),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return change;
  });
  route(app, 'POST', '/api/tasks/{id}:followup', async (req) => {
    const task = await database.transaction(db, (tx) =>
      completeTaskFollowup(tx, req.ownerId, req.params.id, req.body, registry),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return task;
  });
  route(app, 'POST', '/api/tasks/{id}:close', async (req) => {
    const change = await database.transaction(db, (tx) =>
      changeTask(tx, req.ownerId, req.params.id, 'close', req.body.timeZone ?? 'UTC'),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return change;
  });
};
export default taskRoutes;
