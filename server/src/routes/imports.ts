import { retryImport } from '../application/import/commands.js';
import { getRequestContext } from '../http/logging.js';
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
    ensure(
      enabled || (!req.body.attachmentIds.length && !req.body.thingId),
      'Import is not configured',
      'UNAVAILABLE',
    );
    const accepted = await importsDb.createImport(
      pool,
      req.userId,
      req.body.attachmentIds,
      req.body.thingId,
    );
    req.log.info(
      {
        event: accepted.status === 'COMPLETE' ? 'import_completed' : 'job_queued',
        ...getRequestContext(req),
        jobKind: 'import',
        jobId: accepted.importId,
        importId: accepted.importId,
        thingId: accepted.thingId,
        status: accepted.status,
        sourceCount: req.body.attachmentIds.length,
      },
      'Import submitted',
    );
    events.publish({ type: 'data.changed', userId: req.userId });
    runner.wake();
    return reply.code(202).send(accepted);
  });

  route(app, 'POST', '/api/things/{thingId}:recommend', async (req, reply) => {
    ensure(enabled, 'Recommendation is not configured', 'UNAVAILABLE');
    const accepted = await importsDb.createImport(
      pool,
      req.userId,
      [],
      req.params.thingId,
      'RECOMMENDATION',
    );
    req.log.info(
      {
        event: 'job_queued',
        ...getRequestContext(req),
        jobKind: 'import',
        jobId: accepted.importId,
        importId: accepted.importId,
        thingId: req.params.thingId,
        status: accepted.status,
      },
      'Recommendation submitted',
    );
    events.publish({ type: 'data.changed', userId: req.userId });
    runner.wake();
    return reply.code(202).send(accepted);
  });

  route(app, 'GET', '/api/imports/{id}', async (req) =>
    importsDb.projectImport(
      await importsDb.getImportForUserOrThrow(pool, req.userId, req.params.id),
    ),
  );

  route(app, 'GET', '/api/imports/{id}/stream', async (req, reply) => {
    await importsDb.getImportForUserOrThrow(pool, req.userId, req.params.id);
    return reply
      .headers(sseHeaders)
      .code(200)
      .send(
        sse.stream(events.subscribe({ userId: req.userId }), {
          event: 'import.snapshot',
          diagnostics: { request: req, importId: req.params.id },
          snapshot: async () =>
            importsDb.projectImport(
              await importsDb.getImportForUserOrThrow(pool, req.userId, req.params.id),
            ),
          revision: (snapshot) => snapshot.revision,
        }),
      );
  });

  route(app, 'POST', '/api/imports/{id}:retry', async (req) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const result = await retryImport(pool, req.userId, req.params.id);
    req.log.info(
      {
        event: 'job_retried',
        ...getRequestContext(req),
        jobKind: 'import',
        jobId: req.params.id,
        importId: req.params.id,
        thingId: result.thingId,
        status: result.status,
      },
      'Import queued for retry',
    );
    events.publish({ type: 'data.changed', userId: req.userId });
    runner.wake();
    return result;
  });
  route(app, 'GET', '/api/things/{thingId}/stream', async (req, reply) => {
    await thingsDb.getThingForUserOrThrow(pool, req.userId, req.params.thingId);
    return reply
      .headers(sseHeaders)
      .code(200)
      .send(
        sse.stream(events.subscribe({ userId: req.userId }), {
          event: 'thing.snapshot',
          diagnostics: { request: req, thingId: req.params.thingId },
          snapshot: () =>
            database.transaction(
              pool,
              (db) => detail(db, req.userId, req.params.thingId, registry),
              'repeatable read',
            ),
          revision: (snapshot) => snapshot.revision,
        }),
      );
  });
};

export default importRoutes;
