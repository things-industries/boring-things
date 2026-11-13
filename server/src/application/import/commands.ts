/** Requeues unfinished work for the same owner-scoped Thing using its saved workflow checkpoints. */
import type pg from 'pg';
import * as database from '../../db/connection.js';
import * as importsDb from '../../db/entities/imports.js';
import * as thingsDb from '../../db/entities/things.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import { ensure } from '../errors.js';
import { activeStatuses } from './types.js';

// Retries a failed or warning-bearing request without repeating committed stages.
export async function retryImport(pool: pg.Pool, owner: string, id: string) {
  await database.transaction(pool, async (db) => {
    const initial = await importsDb.getOwnedImportOrThrow(db, owner, id);
    ensure(
      !activeStatuses.includes(initial.status),
      'Import cannot be retried in this state',
      'CONFLICT',
    );
    for (const attachmentId of [...initial.attachmentIds].sort())
      await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, attachmentId, { lock: true });
    // A terminal job with a Thing shares its lock with category changes and new submissions.
    const thing = initial.targetThingId
      ? await thingsDb.getOwnedThingOrThrow(db, owner, initial.targetThingId, { lock: true })
      : null;
    if (thing) await importsDb.assertThingEditable(db, owner, thing.id);
    const job = await importsDb.getOwnedImportOrThrow(db, owner, id, { lock: true });
    ensure(
      ['FAILED', 'INCOMPLETE'].includes(job.status) ||
        (job.status === 'COMPLETE' && job.workflow.warnings.length > 0),
      'Import cannot be retried in this state',
      'CONFLICT',
    );
    ensure(
      job.targetThingId === initial.targetThingId &&
        (!thing || (job.workflow.categoryVersion ?? 0) === (thing.data.categoryVersion ?? 0)),
      'Import belongs to a previous category. Find more details to start a new import.',
      'CONFLICT',
    );
    await importsDb.requeueImport(db, job);
  });
  return importsDb.projectImport(await importsDb.getOwnedImportOrThrow(pool, owner, id));
}
