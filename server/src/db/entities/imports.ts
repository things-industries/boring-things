import * as database from '../connection.js';

/**
 * Persists import state, allocates candidate targets, guards edits and exposes import summaries
 * without raw extracted content.
 */

import { isDeepStrictEqual } from 'node:util';
import type pg from 'pg';
import { emptyData, type Schema } from '../../../../shared/model.js';
import type {
  Discovery,
  Extraction,
  Usage,
  ImportResearchCheckpoint,
} from '../../application/import/types.js';
import { activeStatuses, blankUsage } from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';
import type { Database } from '../connection.js';
import * as thingsDb from './things.js';
import { extractedThingModel, importedName } from '../../application/import/naming.js';

export async function findAvailableImportName(
  db: Database,
  owner: string,
  id: string | null,
  name: string,
  model?: string,
) {
  const existing = await database.rows<{ name: string }>(
    db,
    'select name from bt.things where owner_id=$1 and ($2::uuid is null or id<>$2) and starts_with(lower(name),lower($3))',
    [owner, id, name.trim().slice(0, 140)],
  );

  return importedName(
    name,
    model,
    existing.map((thing) => thing.name),
  );
}

export interface ImportRow {
  id: string;
  ownerId: string;
  attachmentId: string;
  targetThingId: string | null;
  skeletonId: string | null;
  status: Schema['Import']['status'];
  extraction: Extraction | null;
  selection: Schema['ImportConfirmation']['selections'] | null;
  resultThingIds: string[];
  error: string | null;
  usage: Usage | null;
  warnings?: Schema['Import']['warnings'];
}

type StoredImportRow = Omit<ImportRow, 'extraction'> & {
  extraction:
    (Omit<Extraction, 'extractedThings'> & { candidates: Extraction['extractedThings'] }) | null;
};

function decodeImport(job: StoredImportRow): ImportRow {
  const extraction = job.extraction;
  return {
    ...job,
    extraction: extraction
      ? {
          text: extraction.text,
          metadata: extraction.metadata,
          extractedThings: extraction.candidates,
        }
      : null,
  };
}

export interface ImportDestination {
  candidateId: string;
  thingId: string;
  isNew: boolean;
  mapped: boolean;
  discovered: boolean;
  discovery: Discovery | null;
  taskSuggestions: ImportResearchCheckpoint | null;
  purchasableSuggestions: ImportResearchCheckpoint | null;
}

const warningsProjection = `coalesce((select jsonb_agg(w || jsonb_build_object('thingId',t.thing_id)) from bt.import_targets t cross join lateral jsonb_array_elements(coalesce(t.discovery->'warnings','[]'::jsonb) || coalesce(t.task_suggestions->'warnings','[]'::jsonb) || coalesce(t.purchasable_suggestions->'warnings','[]'::jsonb)) w where t.import_id=i.id),'[]'::jsonb) as warnings`;

export async function getOwnedImportOrThrow(
  db: Database,
  owner: string,
  id: string,
  options: { lock?: boolean } = {},
) {
  const [job] = await database.rows<StoredImportRow>(
    db,
    `select i.*, ${warningsProjection} from bt.imports i where i.id=$1 and i.owner_id=$2 ${options.lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(job, 'Import not found', 'NOT_FOUND');
  return decodeImport(job);
}

// Extraction includes raw source text and secrets; ordinary HTTP and SSE responses expose only this projection.
export function projectImport(job: ImportRow): Schema['Import'] {
  return {
    id: job.id,
    attachmentId: job.attachmentId,
    thingId: job.targetThingId ?? job.resultThingIds[0] ?? null,
    status: job.status,
    candidates:
      job.status === 'AWAITING_SELECTION'
        ? (job.extraction?.extractedThings.map((c) => ({
            id: c.id,
            name: c.name,
            categoryId: c.categoryId,
          })) ?? [])
        : [],
    thingIds: job.resultThingIds,
    error: job.error,
    usage: job.usage ?? blankUsage(),
    warnings: job.warnings ?? [],
  };
}

export async function findThingImport(db: Database, owner: string, id: string) {
  const [job] = await database.rows<StoredImportRow>(
    db,
    `select i.*, ${warningsProjection} from bt.imports i where i.owner_id=$1 and (i.target_thing_id=$2 or i.skeleton_id=$2 or exists(select 1 from bt.import_targets t where t.import_id=i.id and t.thing_id=$2)) order by (i.status=any($3::text[])) desc,i.created_at desc limit 1`,
    [owner, id, activeStatuses],
  );

  return job ? projectImport(decodeImport(job)) : null;
}

export async function assertThingEditable(db: Database, owner: string, id: string) {
  const job = await findThingImport(db, owner, id);
  ensure(!job || !activeStatuses.includes(job.status), 'Thing is processing an import', 'CONFLICT');
}

export async function touchImportThings(db: Database, job: ImportRow) {
  const ids = [
    ...new Set(
      [job.targetThingId, job.skeletonId, ...job.resultThingIds].filter((id): id is string => !!id),
    ),
  ];
  for (const id of ids) await thingsDb.bumpThing(db, job.ownerId, id);
}

export async function setImportStatus(
  pool: pg.Pool,
  owner: string,
  id: string,
  status: ImportRow['status'],
  error: string | null = null,
) {
  return database.transaction(pool, async (db) => {
    const job = await getOwnedImportOrThrow(db, owner, id, { lock: true });
    await database.execute(
      db,
      'update bt.imports set status=$1,error=$2,finished_at=case when $3 then now() else null end where id=$4 and owner_id=$5',
      [status, error, ['COMPLETE', 'INCOMPLETE', 'FAILED'].includes(status), id, owner],
    );
    await touchImportThings(db, job);
  });
}

export async function startImport(
  pool: pg.Pool,
  owner: string,
  attachment: string,
  target?: string,
) {
  return database.transaction(pool, async (db) => {
    ensure(
      (
        await database.execute(
          db,
          'select id from bt.attachments where id=$1 and owner_id=$2 for update',
          [attachment, owner],
        )
      ).rowCount,
      'Attachment not found',
      'NOT_FOUND',
    );
    let thingId = target;

    if (thingId) {
      await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
      await assertThingEditable(db, owner, thingId);
    } else {
      const [thing] = await database.rows<{ id: string }>(
        db,
        "insert into bt.things(owner_id,category_id,name,data) values($1,'other','Importing…',$2) returning id",
        [owner, JSON.stringify(emptyData())],
      );
      thingId = thing.id;
    }

    await database.execute(
      db,
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [thingId, attachment, owner],
    );
    const [job] = await database.rows<StoredImportRow>(
      db,
      "insert into bt.imports(owner_id,attachment_id,target_thing_id,skeleton_id,status) values($1,$2,$3,$4,'QUEUED') returning *",
      [owner, attachment, thingId, target ? null : thingId],
    );
    await thingsDb.bumpThing(db, owner, thingId);
    return { importId: job.id, thingId, status: 'QUEUED' as const };
  });
}

export async function allocateTargets(
  db: Database,
  job: ImportRow,
  selections: Schema['ImportConfirmation']['selections'],
) {
  ensure(
    job.extraction &&
      selections.length > 0 &&
      new Set(selections.map((s) => s.candidateId)).size === selections.length,
    'Invalid candidates',
  );

  // Lock all existing targets in stable order, then validate before creating anything.
  for (const id of [
    ...new Set(selections.flatMap((s) => (s.targetThingId ? [s.targetThingId] : []))),
  ].sort()) {
    await thingsDb.getOwnedThingOrThrow(db, job.ownerId, id, { lock: true });
    const current = await findThingImport(db, job.ownerId, id);
    ensure(
      !current || current.id === job.id || !activeStatuses.includes(current.status),
      'Thing is processing an import',
      'CONFLICT',
    );
  }

  // Reuse the placeholder for the first new candidate so its ID stays stable when extraction finishes.
  let skeletonAvailable = !!job.skeletonId;
  const ids: string[] = [];

  for (const selection of selections) {
    const candidate = job.extraction.extractedThings.find((c) => c.id === selection.candidateId);
    ensure(candidate, 'Unknown candidate');
    let id = selection.targetThingId;
    const isNew = id === null;

    if (!id && skeletonAvailable) {
      id = job.skeletonId;
      skeletonAvailable = false;
    }

    const name = isNew
      ? await findAvailableImportName(
          db,
          job.ownerId,
          id,
          candidate.name,
          extractedThingModel(candidate),
        )
      : candidate.name;

    if (!id) {
      const [thing] = await database.rows<{ id: string }>(
        db,
        'insert into bt.things(owner_id,category_id,name,data) values($1,$2,$3,$4) returning id',
        [job.ownerId, candidate.categoryId, name, JSON.stringify(emptyData())],
      );
      id = thing.id;
    }

    if (isNew) {
      const current = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, id, { lock: true });
      await database.execute(
        db,
        'update bt.things set name=$1,category_id=$2 where id=$3 and owner_id=$4',
        [
          current.data.userEdited?.includes('name') ? current.name : name,
          current.data.userEdited?.includes('categoryId')
            ? current.categoryId
            : candidate.categoryId,
          id,
          job.ownerId,
        ],
      );
    }

    await database.execute(
      db,
      'insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new) values($1,$2,$3,$4,$5)',
      [job.id, candidate.id, id, job.ownerId, isNew],
    );
    await database.execute(
      db,
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [id, job.attachmentId, job.ownerId],
    );
    ids.push(id);
    await thingsDb.bumpThing(db, job.ownerId, id);
  }

  // The processing lock prevents edits. Still verify that this is the untouched skeleton.
  if (skeletonAvailable && job.skeletonId && !ids.includes(job.skeletonId)) {
    const skeleton = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, job.skeletonId, {
      lock: true,
    });
    const links = await database.execute(
      db,
      'select 1 from bt.thing_attachments where thing_id=$1 and attachment_id<>$2',
      [job.skeletonId, job.attachmentId],
    );

    const relatedRecords = await database.execute(
      db,
      'select 1 from bt.issues where thing_id=$1 union all select 1 from bt.events where thing_id=$1 union all select 1 from bt.purchasables where thing_id=$1 union all select 1 from bt.conversations where thing_id=$1 limit 1',
      [job.skeletonId],
    );

    if (
      !relatedRecords.rowCount &&
      skeleton.description === '' &&
      !skeleton.imageAttachmentId &&
      skeleton.name === 'Importing…' &&
      isDeepStrictEqual(skeleton.data, emptyData()) &&
      !links.rowCount &&
      !(
        await database.execute(db, 'select 1 from bt.thing_tags where thing_id=$1', [
          job.skeletonId,
        ])
      ).rowCount
    ) {
      await database.execute(db, 'delete from bt.things where id=$1 and owner_id=$2', [
        job.skeletonId,
        job.ownerId,
      ]);
    }
  }

  await database.execute(
    db,
    "update bt.imports set selection=$1,result_thing_ids=$2,target_thing_id=$3,status='QUEUED' where id=$4 and owner_id=$5",
    [JSON.stringify(selections), [...new Set(ids)], ids[0], job.id, job.ownerId],
  );
}

export async function listImportTargets(db: Database, job: ImportRow) {
  return database.rows<ImportDestination>(
    db,
    'select * from bt.import_targets where import_id=$1 and owner_id=$2 order by candidate_id',
    [job.id, job.ownerId],
  );
}

export async function recoverImports(pool: pg.Pool): Promise<void> {
  await database.transaction(pool, async (db) => {
    const interrupted = await database.rows<StoredImportRow>(
      db,
      "select * from bt.imports where status in ('EXTRACTING','MAPPING','DISCOVERING') for update",
    );
    await database.execute(
      db,
      "update bt.imports set status='FAILED',error='interrupted',finished_at=now() where status in ('EXTRACTING','MAPPING','DISCOVERING')",
    );
    for (const job of interrupted) await touchImportThings(db, decodeImport(job));
  });
}
export async function getNextQueuedImport(db: Database): Promise<ImportRow | undefined> {
  const [job] = await database.rows<StoredImportRow>(
    db,
    "select * from bt.imports where status='QUEUED' order by created_at,id limit 1",
  );
  return job ? decodeImport(job) : undefined;
}
export async function recordImportUsage(db: Database, job: ImportRow, usage: Usage): Promise<void> {
  await database.execute(db, 'update bt.imports set usage=$1 where id=$2 and owner_id=$3', [
    JSON.stringify(usage),
    job.id,
    job.ownerId,
  ]);
}
export async function markImportStarted(db: Database, job: ImportRow): Promise<void> {
  await database.execute(
    db,
    'update bt.imports set started_at=now(),finished_at=null,error=null where id=$1 and owner_id=$2',
    [job.id, job.ownerId],
  );
}
export async function saveExtraction(
  db: Database,
  job: ImportRow,
  extraction: Extraction,
): Promise<void> {
  await database.execute(db, 'update bt.imports set extraction=$1 where id=$2 and owner_id=$3', [
    JSON.stringify({
      text: extraction.text,
      metadata: extraction.metadata,
      candidates: extraction.extractedThings,
    }),
    job.id,
    job.ownerId,
  ]);
}
export async function saveTargetDiscovery(
  db: Database,
  job: ImportRow,
  candidateId: string,
  discovery: Discovery,
): Promise<void> {
  await database.execute(
    db,
    'update bt.import_targets set discovery=$1 where import_id=$2 and candidate_id=$3 and exists(select 1 from bt.imports where id=$2 and owner_id=$4)',
    [JSON.stringify(discovery), job.id, candidateId, job.ownerId],
  );
}
export async function saveSuggestionCheckpoint(
  db: Database,
  job: ImportRow,
  candidateId: string,
  operation: 'taskSuggestions' | 'purchasableSuggestions',
  checkpoint: ImportResearchCheckpoint,
) {
  const column = operation === 'taskSuggestions' ? 'task_suggestions' : 'purchasable_suggestions';
  await database.execute(
    db,
    `update bt.import_targets set ${column}=$1 where import_id=$2 and candidate_id=$3 and owner_id=$4`,
    [JSON.stringify(checkpoint), job.id, candidateId, job.ownerId],
  );
}

export async function markTargetStage(
  db: Database,
  job: ImportRow,
  candidateId: string,
  stage: 'mapped' | 'discovered',
): Promise<void> {
  await database.execute(
    db,
    `update bt.import_targets set ${stage}=true where import_id=$1 and candidate_id=$2 and exists(select 1 from bt.imports where id=$1 and owner_id=$3)`,
    [job.id, candidateId, job.ownerId],
  );
}
export async function requeueImport(db: Database, job: ImportRow): Promise<void> {
  await database.execute(
    db,
    "update bt.imports set status='QUEUED',error=null,finished_at=null where id=$1 and owner_id=$2",
    [job.id, job.ownerId],
  );
  await touchImportThings(db, job);
}
