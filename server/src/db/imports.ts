/**
 * Persists import state, allocates candidate targets, guards edits and exposes import summaries
 * without raw extracted content.
 */

import { isDeepStrictEqual } from 'node:util';
import type pg from 'pg';
import { emptyData, type Schema } from '../../../shared/model.js';
import type { Discovery, Extraction, Usage } from '../application/import-types.js';
import { activeStatuses, blankUsage } from '../application/import-types.js';
import { ensure } from '../application/errors.js';
import { rows, transaction, type Database } from './connection.js';
import { ownedThing, bumpThing } from './things.js';
import { candidateModel, importedName } from '../application/import-naming.js';

export async function availableImportName(
  db: Database,
  owner: string,
  id: string | null,
  name: string,
  model?: string,
) {
  const existing = await rows<{ name: string }>(
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
}

export interface Target {
  candidateId: string;
  thingId: string;
  isNew: boolean;
  selected: boolean;
  mapped: boolean;
  discovered: boolean;
  discovery: Discovery | null;
}

export async function ownedImport(db: Database, owner: string, id: string, lock = false) {
  const [job] = await rows<ImportRow>(
    db,
    `select * from bt.imports where id=$1 and owner_id=$2 ${lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(job, 'Import not found', 404);
  return job;
}

// Extraction includes raw source text and secrets; ordinary HTTP and SSE responses expose only this projection.
export function projectImport(job: ImportRow): Schema['Import'] {
  return {
    id: job.id,
    attachmentId: job.attachmentId,
    thingId: job.targetThingId ?? job.resultThingIds[0] ?? null,
    status: job.status,
    candidates:
      job.status === 'awaiting_selection'
        ? (job.extraction?.candidates.map((c) => ({
            id: c.id,
            name: c.name,
            categoryId: c.categoryId,
          })) ?? [])
        : [],
    thingIds: job.resultThingIds,
    error: job.error,
    usage: job.usage ?? blankUsage(),
  };
}

export async function thingImport(db: Database, owner: string, id: string) {
  const [job] = await rows<ImportRow>(
    db,
    `select i.* from bt.imports i where i.owner_id=$1 and (i.target_thing_id=$2 or i.skeleton_id=$2 or exists(select 1 from bt.import_targets t where t.import_id=i.id and t.thing_id=$2)) order by (i.status=any($3::text[])) desc,i.created_at desc limit 1`,
    [owner, id, activeStatuses],
  );

  return job ? projectImport(job) : null;
}

export async function assertEditable(db: Database, owner: string, id: string) {
  const job = await thingImport(db, owner, id);
  ensure(!job || !activeStatuses.includes(job.status), 'Thing is processing an import', 409);
}

export async function touchImportThings(db: Database, job: ImportRow) {
  const ids = [
    ...new Set(
      [job.targetThingId, job.skeletonId, ...job.resultThingIds].filter((id): id is string => !!id),
    ),
  ];
  for (const id of ids) await bumpThing(db, job.ownerId, id);
}

export async function setImportStatus(
  pool: pg.Pool,
  owner: string,
  id: string,
  status: ImportRow['status'],
  error: string | null = null,
) {
  return transaction(pool, async (db) => {
    const job = await ownedImport(db, owner, id, true);
    await db.query(
      'update bt.imports set status=$1,error=$2,finished_at=case when $3 then now() else null end where id=$4 and owner_id=$5',
      [status, error, ['complete', 'incomplete', 'failed'].includes(status), id, owner],
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
  return transaction(pool, async (db) => {
    ensure(
      (
        await db.query('select id from bt.attachments where id=$1 and owner_id=$2 for update', [
          attachment,
          owner,
        ])
      ).rowCount,
      'Attachment not found',
      404,
    );
    let thingId = target;

    if (thingId) {
      await ownedThing(db, owner, thingId, true);
      await assertEditable(db, owner, thingId);
    } else {
      const [thing] = await rows<{ id: string }>(
        db,
        "insert into bt.things(owner_id,category_id,name,data) values($1,'other','Importing…',$2) returning id",
        [owner, JSON.stringify(emptyData())],
      );
      thingId = thing.id;
    }

    await db.query(
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [thingId, attachment, owner],
    );
    const [job] = await rows<ImportRow>(
      db,
      "insert into bt.imports(owner_id,attachment_id,target_thing_id,skeleton_id,status) values($1,$2,$3,$4,'queued') returning *",
      [owner, attachment, thingId, target ? null : thingId],
    );
    await bumpThing(db, owner, thingId);
    return { importId: job.id, thingId, status: 'queued' as const };
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
    await ownedThing(db, job.ownerId, id, true);
    const current = await thingImport(db, job.ownerId, id);
    ensure(
      !current || current.id === job.id || !activeStatuses.includes(current.status),
      'Target is processing an import',
      409,
    );
  }

  // Reuse the placeholder for the first new candidate so its ID stays stable when extraction finishes.
  let skeletonAvailable = !!job.skeletonId;
  const ids: string[] = [];

  for (const selection of selections) {
    const candidate = job.extraction.candidates.find((c) => c.id === selection.candidateId);
    ensure(candidate, 'Unknown candidate');
    let id = selection.targetThingId;
    const isNew = id === null;

    if (!id && skeletonAvailable) {
      id = job.skeletonId;
      skeletonAvailable = false;
    }

    const name = isNew
      ? await availableImportName(db, job.ownerId, id, candidate.name, candidateModel(candidate))
      : candidate.name;

    if (!id) {
      const [thing] = await rows<{ id: string }>(
        db,
        'insert into bt.things(owner_id,category_id,name,data) values($1,$2,$3,$4) returning id',
        [job.ownerId, candidate.categoryId, name, JSON.stringify(emptyData())],
      );
      id = thing.id;
    }

    if (isNew) {
      const current = await ownedThing(db, job.ownerId, id, true);
      await db.query('update bt.things set name=$1,category_id=$2 where id=$3 and owner_id=$4', [
        current.data.userEdited?.includes('name') ? current.name : name,
        current.data.userEdited?.includes('categoryId') ? current.categoryId : candidate.categoryId,
        id,
        job.ownerId,
      ]);
    }

    await db.query(
      'insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new) values($1,$2,$3,$4,$5)',
      [job.id, candidate.id, id, job.ownerId, isNew],
    );
    await db.query(
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [id, job.attachmentId, job.ownerId],
    );
    ids.push(id);
    await bumpThing(db, job.ownerId, id);
  }

  // The processing lock prevents edits. Still verify that this is the untouched skeleton.
  if (skeletonAvailable && job.skeletonId && !ids.includes(job.skeletonId)) {
    const skeleton = await ownedThing(db, job.ownerId, job.skeletonId, true);
    const links = await db.query(
      'select 1 from bt.thing_attachments where thing_id=$1 and attachment_id<>$2',
      [job.skeletonId, job.attachmentId],
    );

    const activity = await db.query(
      'select 1 from bt.issues where thing_id=$1 union all select 1 from bt.events where thing_id=$1 union all select 1 from bt.purchasables where thing_id=$1 union all select 1 from bt.conversations where thing_id=$1 limit 1',
      [job.skeletonId],
    );

    if (
      !activity.rowCount &&
      skeleton.description === '' &&
      !skeleton.imageAttachmentId &&
      skeleton.name === 'Importing…' &&
      isDeepStrictEqual(skeleton.data, emptyData()) &&
      !links.rowCount &&
      !(await db.query('select 1 from bt.thing_tags where thing_id=$1', [job.skeletonId])).rowCount
    ) {
      await db.query('delete from bt.things where id=$1 and owner_id=$2', [
        job.skeletonId,
        job.ownerId,
      ]);
    }
  }

  await db.query(
    "update bt.imports set selection=$1,result_thing_ids=$2,target_thing_id=$3,status='queued' where id=$4 and owner_id=$5",
    [JSON.stringify(selections), [...new Set(ids)], ids[0], job.id, job.ownerId],
  );
}

export async function targets(db: Database, job: ImportRow) {
  return rows<Target>(
    db,
    'select * from bt.import_targets where import_id=$1 and owner_id=$2 order by candidate_id',
    [job.id, job.ownerId],
  );
}
