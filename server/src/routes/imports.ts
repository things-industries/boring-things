import { confirmImport, retryImport } from '../application/import/commands.js';
import type { StreamSnapshots } from './stream.js';
/**
 * Registers import submission, confirmation and retry endpoints, plus revisioned Thing snapshot
 * streams.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Registry } from '../application/registry/registry.js';
import type { JobRunner } from '../application/jobs/runner.js';
import type { OwnerChanges } from '../application/streams.js';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import { transaction } from '../db/connection.js';
import { ownedImport, projectImport, startImport } from '../db/imports.js';
import { ownedThing } from '../db/things.js';
import { detail } from '../application/things.js';

export function importRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  registry: Registry,
  runner: JobRunner,
  changes: OwnerChanges,
  enabled: boolean,
  streams: StreamSnapshots,
) {
  route(app, 'POST', '/api/things:import', async (req, reply) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const accepted = await startImport(pool, req.ownerId, req.body.attachmentId, req.body.thingId);
    changes.publish(req.ownerId);
    reply.code(202);
    runner.wake();
    return accepted;
  });

  route(app, 'GET', '/api/imports/{id}', async (req) =>
    projectImport(await ownedImport(pool, req.ownerId, req.params.id)),
  );

  route(app, 'POST', '/api/imports/{id}:confirm', async (req) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const result = await confirmImport(pool, req.ownerId, req.params.id, req.body.selections);
    changes.publish(req.ownerId);
    runner.wake();
    return result;
  });
  route(app, 'POST', '/api/imports/{id}:retry', async (req) => {
    ensure(enabled, 'Import is not configured', 'UNAVAILABLE');
    const result = await retryImport(pool, req.ownerId, req.params.id);
    changes.publish(req.ownerId);
    runner.wake();
    return result;
  });
  route(app, 'GET', '/api/things/{thingId}/stream', async (req, reply) => {
    await ownedThing(pool, req.ownerId, req.params.thingId);
    await streams(reply, {
      event: 'thing.snapshot',
      snapshot: () =>
        transaction(
          pool,
          (db) => detail(db, req.ownerId, req.params.thingId, registry),
          'repeatable read',
        ),
      revision: (snapshot) => snapshot.revision,
      subscribe: (changed) => changes.subscribe(req.ownerId, changed),
    });
  });
}
