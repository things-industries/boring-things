import { retryImport } from '../application/import/commands.js';
import { sseHeaders, type ServerSentEvents } from '../http/sse.js';
/**
 * Registers Import submission and retry endpoints, plus revisioned Thing snapshot
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
  route(app, 'POST', '/api/imports', async (req, reply) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const accepted = await importsDb.createImport(
      pool,
      req.ownerId,
      req.body.attachmentIds,
      req.body.thingId,
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    runner.wake();
    return reply.code(202).send(accepted);
  });

  route(app, 'GET', '/api/imports/{id}', async (req) =>
    importsDb.projectImport(
      await importsDb.getOwnedImportOrThrow(pool, req.ownerId, req.params.id),
    ),
  );

  route(app, 'GET', '/api/imports/{id}/stream', async (req, reply) => {
    await importsDb.getOwnedImportOrThrow(pool, req.ownerId, req.params.id);
    return reply
      .headers(sseHeaders)
      .code(200)
      .send(
        sse.stream(events.subscribe({ ownerId: req.ownerId }), {
          event: 'import.snapshot',
          snapshot: async () =>
            importsDb.projectImport(
              await importsDb.getOwnedImportOrThrow(pool, req.ownerId, req.params.id),
            ),
          revision: (snapshot) => snapshot.revision,
        }),
      );
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
