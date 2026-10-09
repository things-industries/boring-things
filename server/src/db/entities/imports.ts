import * as database from '../connection.js';

/**
 * Persists import state, allocates candidate targets, guards edits and exposes import summaries
 * without raw extracted content.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { emptyData, type Schema, type ThingData } from '../../../../shared/model.js';
import type {
  Discovery,
  Extraction,
  Usage,
  ImportResearchCheckpoint,
  ExtractedThing,
} from '../../application/import/types.js';
import { activeStatuses, blankUsage } from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';
import type { Database } from '../connection.js';
import * as thingsDb from './things.js';
import * as attachmentsDb from './attachments.js';
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
  attachmentIds?: string[];
  sources?: Schema['ImportSourceStatus'][];
  revision: number;
  candidatesAllocated: boolean;
  targetThingId: string | null;
  status: Schema['Import']['status'];
  extraction: Extraction | null;
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
const sourcesProjection = `(select array_agg(s.attachment_id order by s.position) from bt.import_sources s where s.import_id=i.id) as attachment_ids`;
const sourceStatusesProjection = `coalesce((select jsonb_agg(jsonb_build_object('attachmentId',s.attachment_id,'status',a.transcription_status) order by s.position) from bt.import_sources s join bt.attachments a on a.id=s.attachment_id where s.import_id=i.id),'[]'::jsonb) as sources`;

export async function getOwnedImportOrThrow(
  db: Database,
  owner: string,
  id: string,
  options: { lock?: boolean } = {},
) {
  const [job] = await database.rows<StoredImportRow>(
    db,
    `select i.*, ${warningsProjection}, ${sourcesProjection}, ${sourceStatusesProjection} from bt.imports i where i.id=$1 and i.owner_id=$2 ${options.lock ? 'for update' : ''}`,
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
    attachmentIds: job.attachmentIds ?? [job.attachmentId],
    sources: job.sources ?? [],
    revision: Number(job.revision),
    thingId: job.targetThingId ?? job.resultThingIds[0] ?? null,
    status: job.status,
    candidates:
      job.extraction?.extractedThings.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        categoryId: candidate.categoryId,
        reviewRequired: candidate.reviewRequired ?? false,
        possibleMatches: candidate.possibleMatches ?? [],
      })) ?? [],
    thingIds: job.resultThingIds,
    error: job.error,
    usage: job.usage ?? blankUsage(),
    warnings: job.warnings ?? [],
  };
}

// An Import cites uploaded Attachments without starting another transcription.
export async function createImport(
  pool: pg.Pool,
  owner: string,
  attachmentIds: string[],
  thingId?: string,
) {
  return database.transaction(pool, (db) =>
    createImportInTransaction(db, owner, attachmentIds, thingId),
  );
}

export async function createImportInTransaction(
  db: Database,
  owner: string,
  attachmentIds: string[],
  thingId?: string,
) {
  ensure(
    attachmentIds.length > 0 &&
      attachmentIds.length <= 10 &&
      new Set(attachmentIds).size === attachmentIds.length,
    'Choose between one and ten distinct Attachments',
  );
  for (const id of [...attachmentIds].sort())
    await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, id, { lock: true });
  if (thingId) {
    await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
    await assertThingEditable(db, owner, thingId);
  }
  const [job] = await database.rows<{ id: string }>(
    db,
    `insert into bt.imports(owner_id,attachment_id,target_thing_id,status)
       values($1,$2,$3,'WAITING_FOR_TRANSCRIPTION') returning id`,
    [owner, attachmentIds[0], thingId ?? null],
  );
  for (const [position, id] of attachmentIds.entries())
    await database.execute(
      db,
      'insert into bt.import_sources(import_id,attachment_id,owner_id,position) values($1,$2,$3,$4)',
      [job.id, id, owner, position],
    );
  if (thingId) await thingsDb.bumpThing(db, owner, thingId);
  return {
    importId: job.id,
    thingId: thingId ?? null,
    status: 'WAITING_FOR_TRANSCRIPTION' as const,
  };
}

export async function listImportSources(db: Database, job: ImportRow) {
  const refs = await database.rows<{ attachmentId: string }>(
    db,
    'select attachment_id from bt.import_sources where import_id=$1 and owner_id=$2 order by position',
    [job.id, job.ownerId],
  );
  return Promise.all(
    refs.map((ref) => attachmentsDb.getOwnedAttachmentOrThrow(db, job.ownerId, ref.attachmentId)),
  );
}

function storedIdentifiers(data: ThingData) {
  const values: { field: string; value: string }[] = [];
  for (const fields of Object.values(data.values))
    for (const [field, entry] of Object.entries(fields))
      if (typeof entry.value === 'string') values.push({ field, value: entry.value });
  for (const [field, entry] of Object.entries(data.standalone))
    if (typeof entry.value === 'string') values.push({ field, value: entry.value });
  for (const entry of data.customFields)
    if (typeof entry.value === 'string') values.push({ field: entry.label, value: entry.value });
  return values;
}

async function candidateMatches(db: Database, owner: string, candidate: ExtractedThing) {
  const things = await database.rows<{ id: string; data: ThingData }>(
    db,
    'select id,data from bt.things where owner_id=$1 and category_id=$2 order by id for update',
    [owner, candidate.categoryId],
  );
  const strong: string[] = [];
  const possible: string[] = [];
  for (const thing of things) {
    const values = storedIdentifiers(thing.data);
    const matches = (candidate.identifiers ?? []).filter((identifier) => {
      const kind = identifier.kind.toLowerCase();
      const fieldKind =
        /serial|registration|policy|account|meter|membership/.exec(kind)?.[0] ??
        (/model|product/.test(kind) ? 'model' : null);
      return (
        fieldKind &&
        values.some(
          ({ field, value }) =>
            field.toLowerCase().includes(fieldKind) &&
            value.trim().toLowerCase() === identifier.value.trim().toLowerCase(),
        )
      );
    });
    if (
      matches.some((identifier) =>
        /serial|registration|policy|account|meter|membership/i.test(identifier.kind),
      )
    )
      strong.push(thing.id);
    else if (matches.length) possible.push(thing.id);
  }
  return { strong, possible };
}

// Saves candidate decisions and Thing allocations in one transaction for retry stability.
export async function allocateCandidates(
  db: Database,
  job: ImportRow,
  candidates: ExtractedThing[],
) {
  const resolved: string[] = [];
  for (const candidate of candidates) {
    const matches = await candidateMatches(db, job.ownerId, candidate);
    if (matches.strong.length > 1 || (matches.strong.length === 0 && matches.possible.length)) {
      candidate.reviewRequired = true;
      candidate.possibleMatches = [...new Set([...matches.strong, ...matches.possible])];
      continue;
    }
    let thingId = matches.strong[0];
    const isNew = !thingId;
    if (!thingId) {
      const name = await findAvailableImportName(
        db,
        job.ownerId,
        null,
        candidate.name,
        extractedThingModel(candidate),
      );
      const [thing] = await database.rows<{ id: string }>(
        db,
        'insert into bt.things(owner_id,category_id,name,data) values($1,$2,$3,$4) returning id',
        [job.ownerId, candidate.categoryId, name, JSON.stringify(emptyData())],
      );
      thingId = thing.id;
    }
    await database.execute(
      db,
      'insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new) values($1,$2,$3,$4,$5)',
      [job.id, candidate.id, thingId, job.ownerId, isNew],
    );
    resolved.push(thingId);
    await thingsDb.bumpThing(db, job.ownerId, thingId);
  }
  await saveExtraction(db, job, {
    text: '',
    extractedThings: candidates,
  });
  await database.execute(
    db,
    'update bt.imports set result_thing_ids=$1,target_thing_id=coalesce(target_thing_id,$2),candidates_allocated=true where id=$3 and owner_id=$4',
    [resolved, resolved[0] ?? null, job.id, job.ownerId],
  );
}

export async function allocateTarget(db: Database, job: ImportRow) {
  ensure(job.targetThingId, 'Import has no Thing context');
  const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, job.targetThingId, {
    lock: true,
  });
  const candidate: ExtractedThing = {
    id: randomUUID(),
    name: thing.name,
    categoryId: thing.categoryId,
    terms: [],
    facts: [],
  };
  await database.execute(
    db,
    'insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new) values($1,$2,$3,$4,false)',
    [job.id, candidate.id, thing.id, job.ownerId],
  );
  await saveExtraction(db, job, { text: '', extractedThings: [candidate] });
  await database.execute(
    db,
    'update bt.imports set result_thing_ids=array[$1::uuid],candidates_allocated=true where id=$2 and owner_id=$3',
    [thing.id, job.id, job.ownerId],
  );
}

export async function findThingImport(db: Database, owner: string, id: string) {
  const [job] = await database.rows<StoredImportRow>(
    db,
    `select i.*, ${warningsProjection}, ${sourcesProjection}, ${sourceStatusesProjection} from bt.imports i where i.owner_id=$1 and (i.target_thing_id=$2 or exists(select 1 from bt.import_targets t where t.import_id=i.id and t.thing_id=$2)) order by (i.status=any($3::text[])) desc,i.created_at desc limit 1`,
    [owner, id, activeStatuses],
  );

  return job ? projectImport(decodeImport(job)) : null;
}

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

// Drops work that has not started when its target Thing is removed.
export async function removeQueuedThingImports(
  db: Database,
  owner: string,
  thingId: string,
): Promise<void> {
  await database.execute(
    db,
    `delete from bt.imports where owner_id=$1 and status in ('QUEUED','WAITING_FOR_TRANSCRIPTION') and started_at is null
      and target_thing_id=$2`,
    [owner, thingId],
  );
}

export async function touchImportThings(db: Database, job: ImportRow) {
  const ids = [
    ...new Set([job.targetThingId, ...job.resultThingIds].filter((id): id is string => !!id)),
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
      [
        status,
        error,
        ['REVIEW_REQUIRED', 'COMPLETE', 'INCOMPLETE', 'FAILED'].includes(status),
        id,
        owner,
      ],
    );
    await touchImportThings(db, job);
  });
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
  await database.execute(
    db,
    `update bt.imports i set status='QUEUED'
     where i.status='WAITING_FOR_TRANSCRIPTION'
       and not exists (
         select 1 from bt.import_sources s join bt.attachments a on a.id=s.attachment_id
         where s.import_id=i.id and a.transcription_status in ('PENDING','PROCESSING')
       )`,
  );
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
export async function markImportStarted(db: Database, job: ImportRow): Promise<boolean> {
  const result = await database.execute(
    db,
    "update bt.imports set status='EXTRACTING',started_at=now(),finished_at=null,error=null where id=$1 and owner_id=$2 and status='QUEUED'",
    [job.id, job.ownerId],
  );
  return !!result.rowCount;
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
