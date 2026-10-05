import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import * as database from '../../db/connection.js';
import * as importsDb from '../../db/entities/imports.js';
import * as thingsDb from '../../db/entities/things.js';
import { ensure } from '../errors.js';
export async function confirmImport(
  pool: pg.Pool,
  owner: string,
  id: string,
  selections: Schema['ImportConfirmation']['selections'],
) {
  await database.transaction(pool, async (db) => {
    const job = await importsDb.getOwnedImportOrThrow(db, owner, id, { lock: true });
    ensure(job.status === 'AWAITING_SELECTION', 'Import is not awaiting selection', 'CONFLICT');
    await importsDb.allocateTargets(db, job, selections);
  });
  return importsDb.projectImport(await importsDb.getOwnedImportOrThrow(pool, owner, id));
}
export async function retryImport(pool: pg.Pool, owner: string, id: string) {
  await database.transaction(pool, async (db) => {
    const job = await importsDb.getOwnedImportOrThrow(db, owner, id, { lock: true });
    ensure(
      ['FAILED', 'INCOMPLETE'].includes(job.status) ||
        (job.status === 'COMPLETE' && !!job.warnings?.length),
      'Import cannot be retried in this state',
      'CONFLICT',
    );
    const selected = await importsDb.listImportTargets(db, job);
    ensure(
      job.targetThingId && (!job.selection || selected.length === job.selection.length),
      'Import target no longer exists',
      'CONFLICT',
    );

    for (const id of [...new Set([job.targetThingId, ...selected.map((t) => t.thingId)])].sort()) {
      await thingsDb.getOwnedThingOrThrow(db, owner, id, { lock: true });
      await importsDb.assertThingEditable(db, owner, id);
    }

    await database.execute(
      db,
      "update bt.import_targets set discovered=false where import_id=$1 and owner_id=$2 and jsonb_array_length(coalesce(discovery->'warnings','[]'::jsonb))>0",
      [job.id, job.ownerId],
    );
    await importsDb.requeueImport(db, job);
  });
  return importsDb.projectImport(await importsDb.getOwnedImportOrThrow(pool, owner, id));
}
