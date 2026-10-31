/** Requeues unfinished work for the same owner-scoped Thing using its saved workflow checkpoints. */
import type pg from 'pg';
import * as database from '../../db/connection.js';
import * as importsDb from '../../db/entities/imports.js';
import { ensure } from '../errors.js';

// Retries a failed or warning-bearing request without repeating committed stages.
export async function retryImport(pool: pg.Pool, owner: string, id: string) {
  await database.transaction(pool, async (db) => {
    const job = await importsDb.getOwnedImportOrThrow(db, owner, id, { lock: true });
    ensure(
      ['FAILED', 'INCOMPLETE'].includes(job.status) ||
        (job.status === 'COMPLETE' && job.workflow.warnings.length > 0),
      'Import cannot be retried in this state',
      'CONFLICT',
    );
    if (job.targetThingId) await importsDb.assertThingEditable(db, owner, job.targetThingId);
    await importsDb.requeueImport(db, job);
  });
  return importsDb.projectImport(await importsDb.getOwnedImportOrThrow(pool, owner, id));
}
