import { confirmImport, retryImport } from '../application/import/commands.js';
import { sseHeaders, type ServerSentEvents } from '../http/sse.js';
/**
 * Registers import submission, confirmation and retry endpoints, plus revisioned Thing snapshot
 * streams.
 */

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import type { Registry } from '../application/registry/registry.js';
import type { JobRunner } from '../application/jobs/runner.js';
import type { ApplicationEvents } from '../application/events.js';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import * as database from '../db/connection.js';
import * as importsDb from '../db/entities/imports.js';
import * as thingsDb from '../db/entities/things.js';
import { detail } from '../application/things.js';

interface Options {
  pool: pg.Pool;
  registry: Registry;
  runner: JobRunner;
  events: ApplicationEvents;
  enabled: boolean;
  sse: ServerSentEvents;
}

const importRoutes: FastifyPluginAsync<Options> = async (
  app,
  { pool, registry, runner, events, enabled, sse },
) => {
  route(app, 'POST', '/api/things:import', async (req, reply) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const accepted = await importsDb.startImport(
      pool,
      req.ownerId,
      req.body.attachmentId,
      req.body.thingId,
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    reply.code(202);
    runner.wake();
    return accepted;
  });

  route(app, 'GET', '/api/imports/{id}', async (req) =>
    importsDb.projectImport(
      await importsDb.getOwnedImportOrThrow(pool, req.ownerId, req.params.id),
    ),
  );

  route(app, 'POST', '/api/imports/{id}:confirm', async (req) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const result = await confirmImport(pool, req.ownerId, req.params.id, req.body.selections);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    runner.wake();
    return result;
  });
  route(app, 'POST', '/api/imports/{id}:retry', async (req) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const result = await retryImport(pool, req.ownerId, req.params.id);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    runner.wake();
    return result;
  });
  route(app, 'GET', '/api/things/{thingId}/stream', async (req, reply) => {
    await thingsDb.getOwnedThingOrThrow(pool, req.ownerId, req.params.thingId);
    return reply
      .headers(sseHeaders)
      .code(200)
      .send(
        sse.stream(events.subscribe({ ownerId: req.ownerId }), {
          event: 'thing.snapshot',
          snapshot: () =>
            database.transaction(
              pool,
              (db) => detail(db, req.ownerId, req.params.thingId, registry),
              'repeatable read',
            ),
          revision: (snapshot) => snapshot.revision,
        }),
      );
  });
};

export default importRoutes;
