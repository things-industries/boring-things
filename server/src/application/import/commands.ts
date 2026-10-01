import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import { transaction } from '../../db/connection.js';
import {
  allocateTargets,
  assertEditable,
  ownedImport,
  projectImport,
  targets,
  requeueImport,
} from '../../db/entities/imports.js';
import { ownedThing } from '../../db/entities/things.js';
import { ensure } from '../errors.js';
export async function confirmImport(
  pool: pg.Pool,
  owner: string,
  id: string,
  selections: Schema['ImportConfirmation']['selections'],
) {
  await transaction(pool, async (db) => {
    const job = await ownedImport(db, owner, id, true);
    ensure(job.status === 'AWAITING_SELECTION', 'Import is not awaiting selection', 'CONFLICT');
    await allocateTargets(db, job, selections);
  });
  return projectImport(await ownedImport(pool, owner, id));
}
export async function retryImport(pool: pg.Pool, owner: string, id: string) {
  await transaction(pool, async (db) => {
    const job = await ownedImport(db, owner, id, true);
    ensure(
      ['FAILED', 'INCOMPLETE'].includes(job.status),
      'Import cannot be retried in this state',
      'CONFLICT',
    );
    const selected = await targets(db, job);
    ensure(
      job.targetThingId && (!job.selection || selected.length === job.selection.length),
      'Import target no longer exists',
      'CONFLICT',
    );

    for (const id of [...new Set([job.targetThingId, ...selected.map((t) => t.thingId)])].sort()) {
      await ownedThing(db, owner, id, true);
      await assertEditable(db, owner, id);
    }

    await requeueImport(db, job);
  });
  return projectImport(await ownedImport(pool, owner, id));
}
