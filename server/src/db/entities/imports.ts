/** Persists one Thing's Import or Recommendation, its source references and resumable workflow checkpoints. */
import type pg from 'pg';
import * as database from '../connection.js';
import type { Database } from '../connection.js';
import type { Schema } from '../../../../shared/model.js';
import type { Discovery, ThingCandidate, Usage } from '../../application/import/types.js';
import { blankUsage, activeStatuses } from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';
import * as thingsDb from './things.js';
import * as attachmentsDb from './attachments.js';
import { importedName } from '../../application/import/naming.js';

export interface WorkflowCheckpoint {
  done: string[];
  failure?: { stage: string | undefined; reason: string };
  selected?: ThingCandidate;
  isNew?: boolean;
  stage?: string;
  discovery?: Discovery;
  resourceIds: string[];
  excludedIds: string[];
  warnings: { stage: string; warning: Schema['ImportWarning']; reason?: string }[];
}
export interface ImportRow {
  id: string;
  ownerId: string;
  attachmentId: string | null;
  attachmentIds: string[];
  sources: Schema['ImportSourceStatus'][];
  revision: number;
  targetThingId: string | null;
  status: Schema['ImportStatusEnum'];
  operation: 'IMPORT' | 'RECOMMENDATION';
  resultThingIds: string[];
  error: string | null;
  usage: Usage | null;
  sourceUsage?: Usage[];
  workflow: WorkflowCheckpoint;
}
const projection = `i.*,coalesce((select jsonb_agg(a.transcription_usage) from bt.import_sources s join bt.attachments a on a.id=s.attachment_id where s.import_id=i.id and a.transcription_usage is not null),'[]') as source_usage,coalesce((select array_agg(attachment_id order by position) from bt.import_sources where import_id=i.id),'{}') as attachment_ids,
  coalesce((select jsonb_agg(jsonb_build_object('attachmentId',a.id,'status',a.transcription_status) order by s.position)
  from bt.import_sources s join bt.attachments a on a.id=s.attachment_id where s.import_id=i.id),'[]') as sources`;

// Supplies defaults for an empty checkpoint stored by a newly queued request.
function decode(job: ImportRow): ImportRow {
  return {
    ...job,
    workflow: {
      ...job.workflow,
      done: job.workflow.done ?? [],
      resourceIds: job.workflow.resourceIds ?? [],
      excludedIds: job.workflow.excludedIds ?? [],
      warnings: job.workflow.warnings ?? [],
    },
  };
}

// Reads only a request belonging to the authenticated owner.
export async function getOwnedImportOrThrow(
  db: Database,
  owner: string,
  id: string,
  options: { lock?: boolean } = {},
) {
  const [job] = await database.rows<ImportRow>(
    db,
    `select ${projection} from bt.imports i where i.id=$1 and i.owner_id=$2 ${options.lock ? 'for update of i' : ''}`,
    [id, owner],
  );
  ensure(job, 'Import not found', 'NOT_FOUND');
  return decode(job);
}

// Omits raw source content and identity evidence from ordinary responses.
export function projectImport(job: ImportRow): Schema['Import'] {
  const candidate = job.workflow.selected;
  const usage = structuredClone(job.usage ?? blankUsage());
  for (const source of job.sourceUsage ?? []) {
    usage.inputTokens += source.inputTokens;
    usage.outputTokens += source.outputTokens;
    usage.cachedTokens += source.cachedTokens;
    usage.toolCalls.push(...source.toolCalls);
    if (source.entries?.length) (usage.entries ??= []).push(...source.entries);
  }
  return {
    id: job.id,
    attachmentId: job.attachmentId,
    attachmentIds: job.attachmentIds,
    sources: job.sources,
    revision: Number(job.revision),
    thingId: job.targetThingId,
    thingIds: job.resultThingIds,
    status: job.status,
    operation: job.operation,
    stage: job.workflow.stage ?? null,
    candidates: candidate
      ? [
          {
            id: candidate.id,
            name: candidate.name,
            categoryId: candidate.categoryId,
          },
        ]
      : [],
    error: job.error,
    usage,
    warnings: job.workflow.warnings.map((entry) => entry.warning),
  };
}

// Creates one persisted request after validating every cited source and optional Thing.
export async function createImportInTransaction(
  db: Database,
  owner: string,
  attachmentIds: string[],
  thingId?: string,
  operation: 'IMPORT' | 'RECOMMENDATION' = 'IMPORT',
): Promise<Schema['ImportAccepted']> {
  ensure(
    attachmentIds.length <= 10 && new Set(attachmentIds).size === attachmentIds.length,
    'Choose up to ten distinct Attachments',
  );
  for (const id of [...attachmentIds].sort())
    await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, id, { lock: true });
  if (thingId) {
    await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
    await assertThingEditable(db, owner, thingId);
  }
  ensure(operation !== 'RECOMMENDATION' || !!thingId, 'Recommendation requires a Thing');
  const status =
    !attachmentIds.length && !thingId
      ? 'COMPLETE'
      : attachmentIds.length
        ? 'WAITING_FOR_TRANSCRIPTION'
        : 'QUEUED';
  const [job] = await database.rows<{ id: string }>(
    db,
    'insert into bt.imports(owner_id,attachment_id,target_thing_id,status,operation) values($1,$2,$3,$4,$5) returning id',
    [owner, attachmentIds[0] ?? null, thingId ?? null, status, operation],
  );
  for (const [position, id] of attachmentIds.entries())
    await database.execute(
      db,
      'insert into bt.import_sources(import_id,attachment_id,owner_id,position) values($1,$2,$3,$4)',
      [job.id, id, owner, position],
    );
  if (thingId) await thingsDb.bumpThing(db, owner, thingId);
  return { importId: job.id, thingId: thingId ?? null, status };
}

// Starts a request and all its owner checks in one transaction.
export async function createImport(
  pool: pg.Pool,
  owner: string,
  ids: string[],
  thingId?: string,
  operation: 'IMPORT' | 'RECOMMENDATION' = 'IMPORT',
) {
  return database.transaction(pool, (db) =>
    createImportInTransaction(db, owner, ids, thingId, operation),
  );
}

// Lists the authorised sources for this request, including linked shared resources.
export async function listImportSources(db: Database, job: ImportRow) {
  const sources = await database.rows<{ attachmentId: string }>(
    db,
    'select attachment_id from bt.import_sources where import_id=$1 and owner_id=$2 order by position',
    [job.id, job.ownerId],
  );
  return Promise.all(
    sources.map((source) =>
      attachmentsDb.getOwnedAttachmentOrThrow(db, job.ownerId, source.attachmentId),
    ),
  );
}

// Adds research evidence to the same request after its Thing link has been authorised.
export async function addSource(db: Database, job: ImportRow, id: string) {
  await attachmentsDb.getOwnedAttachmentOrThrow(db, job.ownerId, id);
  await database.execute(
    db,
    'insert into bt.import_sources(import_id,attachment_id,owner_id,position) select $1,$2,$3,coalesce(max(position)+1,0) from bt.import_sources where import_id=$1 on conflict(import_id,attachment_id) do nothing',
    [job.id, id, job.ownerId],
  );
}

// Saves the selected Thing and checkpoint together with application changes in the caller transaction.
export async function saveWorkflow(
  db: Database,
  job: ImportRow,
  workflow: WorkflowCheckpoint,
  thingId = job.targetThingId,
) {
  await database.execute(
    db,
    'update bt.imports set workflow=$1,target_thing_id=$2,result_thing_ids=$3 where id=$4 and owner_id=$5',
    [JSON.stringify(workflow), thingId, thingId ? [thingId] : [], job.id, job.ownerId],
  );
  if (thingId) await thingsDb.bumpThing(db, job.ownerId, thingId);
}

// Finds an available display name without changing an owner's existing name.
export async function findAvailableImportName(
  db: Database,
  owner: string,
  id: string | null,
  name: string,
  model?: string,
) {
  const names = await database.rows<{ name: string }>(
    db,
    'select name from bt.things where owner_id=$1 and ($2::uuid is null or id<>$2)',
    [owner, id],
  );
  return importedName(
    name,
    model,
    names.map((entry) => entry.name),
  );
}

// Projects the latest associated request, preferring active work.
export async function findThingImport(db: Database, owner: string, id: string) {
  const [job] = await database.rows<ImportRow>(
    db,
    `select ${projection} from bt.imports i where i.owner_id=$1 and i.target_thing_id=$2 order by (i.status=any($3::text[])) desc,i.created_at desc limit 1`,
    [owner, id, activeStatuses],
  );
  return job ? projectImport(decode(job)) : null;
}

// Protects a target from competing requests while allowing queued manual edits.
export async function assertThingEditable(
  db: Database,
  owner: string,
  id: string,
  options: { allowQueued?: boolean } = {},
) {
  const job = await findThingImport(db, owner, id);
  ensure(
    !job ||
      !activeStatuses.includes(job.status) ||
      (options.allowQueued && job.status === 'QUEUED'),
    'Thing is processing an import',
    'CONFLICT',
  );
}

// Removes work that has not started when the owner deletes its target.
export async function removeQueuedThingImports(db: Database, owner: string, id: string) {
  await database.execute(
    db,
    "delete from bt.imports where owner_id=$1 and target_thing_id=$2 and started_at is null and status in ('QUEUED','WAITING_FOR_TRANSCRIPTION')",
    [owner, id],
  );
}

// Restores interrupted requests to the queue while preserving committed checkpoints.
export async function recoverImports(pool: pg.Pool) {
  await database.execute(
    pool,
    "update bt.imports set status='QUEUED',error=null where status in ('EXTRACTING','MAPPING','DISCOVERING','RECOMMENDING')",
  );
}

// Selects ready work after submitted sources have reached terminal outcomes.
export async function getNextQueuedImport(db: Database) {
  await database.execute(
    db,
    `update bt.imports i set status='QUEUED' where status='WAITING_FOR_TRANSCRIPTION'
    and not exists(select 1 from bt.import_sources s join bt.attachments a on a.id=s.attachment_id
      where s.import_id=i.id and a.transcription_status in ('PENDING','PROCESSING'))`,
  );
  const [job] = await database.rows<ImportRow>(
    db,
    `select ${projection} from bt.imports i where status='QUEUED' order by created_at,id limit 1`,
  );
  return job ? decode(job) : undefined;
}

// Claims the queued request before issuing external calls.
export async function markImportStarted(db: Database, job: ImportRow) {
  return !!(
    await database.execute(
      db,
      "update bt.imports set status='EXTRACTING',started_at=coalesce(started_at,now()),finished_at=null,error=null where id=$1 and owner_id=$2 and status='QUEUED'",
      [job.id, job.ownerId],
    )
  ).rowCount;
}

// Records status transitions without marking failed saves as completed work.
export async function setImportStatus(
  pool: pg.Pool,
  owner: string,
  id: string,
  status: ImportRow['status'],
  error: string | null = null,
) {
  await database.transaction(pool, async (db) => {
    const job = await getOwnedImportOrThrow(db, owner, id, { lock: true });
    await database.execute(
      db,
      'update bt.imports set status=$1,error=$2,finished_at=case when $3 then now() else null end where id=$4 and owner_id=$5',
      [status, error, ['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(status), id, owner],
    );
    if (job.targetThingId) await thingsDb.bumpThing(db, owner, job.targetThingId);
  });
}

// Persists model and tool usage independently of a batch's application outcome.
export async function recordImportUsage(db: Database, job: ImportRow, usage: Usage) {
  await database.execute(db, 'update bt.imports set usage=$1 where id=$2 and owner_id=$3', [
    JSON.stringify(usage),
    job.id,
    job.ownerId,
  ]);
}

// Requeues only unfinished stages and clears warnings for another attempt.
export async function requeueImport(db: Database, job: ImportRow) {
  const failed = await database.rows<{ attachmentId: string }>(
    db,
    `select s.attachment_id from bt.import_sources s join bt.attachments a on a.id=s.attachment_id where s.import_id=$1 and a.transcription_status='FAILED'`,
    [job.id],
  );
  for (const file of failed)
    await database.execute(
      db,
      "update bt.attachments set transcription_status='PENDING' where id=$1",
      [file.attachmentId],
    );
  const sourceFailures = failed.length > 0;
  await saveWorkflow(db, job, {
    ...job.workflow,
    failure: undefined,
    done: job.workflow.done.filter(
      (key) =>
        !sourceFailures ||
        (!['identity', 'research', 'specialists'].includes(key) && !key.startsWith('fieldsets:')),
    ),
  });
  await database.execute(
    db,
    "update bt.imports set status='WAITING_FOR_TRANSCRIPTION',error=null,finished_at=null where id=$1 and owner_id=$2",
    [job.id, job.ownerId],
  );
}
