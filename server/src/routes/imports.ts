import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import type { Registry } from '../application/registry.js';
import type { ImportRunner } from '../application/imports.js';
import type { ThingChanges } from '../application/streams.js';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import { transaction } from '../db/connection.js';
import {
  allocateTargets,
  assertEditable,
  ownedImport,
  projectImport,
  startImport,
  targets,
  touchImportThings,
} from '../db/imports.js';
import { ownedThing } from '../db/things.js';
import { detail } from '../application/things.js';

export function importRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  registry: Registry,
  runner: ImportRunner,
  changes: ThingChanges,
  enabled: boolean,
) {
  route<Schema['ImportStart']>(app, 'POST', '/api/things:import', async (req, reply) => {
    ensure(enabled, 'Import is not configured', 503);
    const accepted = await startImport(pool, req.ownerId, req.body.attachmentId, req.body.thingId);
    reply.code(202);
    runner.wake();
    return accepted;
  });
  route(app, 'GET', '/api/imports/{id}', async (req) =>
    projectImport(await ownedImport(pool, req.ownerId, req.params.id)),
  );
  route<Schema['ImportConfirmation']>(app, 'POST', '/api/imports/{id}:confirm', async (req) => {
    ensure(enabled, 'Import is not configured', 503);
    await transaction(pool, async (db) => {
      const job = await ownedImport(db, req.ownerId, req.params.id, true);
      ensure(job.status === 'awaiting_selection', 'Import is not awaiting selection', 409);
      await allocateTargets(db, job, req.body.selections);
    });
    changes.publish(req.ownerId);
    runner.wake();
    return projectImport(await ownedImport(pool, req.ownerId, req.params.id));
  });
  route(app, 'POST', '/api/imports/{id}:retry', async (req) => {
    ensure(enabled, 'Import is not configured', 503);
    await transaction(pool, async (db) => {
      const job = await ownedImport(db, req.ownerId, req.params.id, true);
      ensure(
        ['failed', 'incomplete'].includes(job.status),
        'Import cannot be retried in this state',
        409,
      );
      const selected = await targets(db, job);
      ensure(
        job.targetThingId && (!job.selection || selected.length === job.selection.length),
        'Import target no longer exists',
        409,
      );
      for (const id of [
        ...new Set([job.targetThingId, ...selected.map((t) => t.thingId)]),
      ].sort()) {
        await ownedThing(db, req.ownerId, id, true);
        await assertEditable(db, req.ownerId, id);
      }
      await db.query(
        "update bt.imports set status='queued',error=null,finished_at=null where id=$1 and owner_id=$2",
        [job.id, req.ownerId],
      );
      await touchImportThings(db, job);
    });
    changes.publish(req.ownerId);
    runner.wake();
    return projectImport(await ownedImport(pool, req.ownerId, req.params.id));
  });
  route(app, 'GET', '/api/things/{thingId}/stream', async (req, reply) => {
    await ownedThing(pool, req.ownerId, req.params.thingId);
    let closed = false,
      running = false,
      dirty = true,
      revision = -1;
    const send = async () => {
      if (running || closed) return;
      running = true;
      try {
        do {
          dirty = false;
          const snapshot = await transaction(pool, async (db) => {
            await db.query('set transaction isolation level repeatable read');
            return detail(db, req.ownerId, req.params.thingId, registry);
          });
          if (!closed && snapshot.revision > revision) {
            revision = snapshot.revision;
            if (
              !reply.raw.write(
                `id: ${revision}\nevent: thing.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
              )
            ) {
              reply.raw.end();
              cleanup();
            }
          }
        } while (dirty && !closed);
      } catch {
        if (!closed) reply.raw.end();
        cleanup();
      } finally {
        running = false;
      }
    };
    // Subscribe before the first persisted snapshot; commits during reads cause another read.
    const unsubscribe = changes.subscribe(req.ownerId, () => {
      dirty = true;
      void send();
    });
    const keepalive = setInterval(() => {
      if (!closed) {
        reply.raw.write(': keep-alive\n\n');
        dirty = true;
        void send();
      }
    }, 10000);
    // A new authenticated request refreshes the bearer token at least once a minute.
    const renew = setTimeout(() => {
      reply.raw.end();
      cleanup();
    }, 55000);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(keepalive);
      clearTimeout(renew);
    };
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    reply.raw.on('close', cleanup);
    await send();
  });
}
