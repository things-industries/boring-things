// Persists private attachments, metadata and Thing links, including discovered resources.

import type { DiscoveryItem } from '../../application/import/types.js';
import * as thingsDb from './things.js';
import * as database from '../connection.js';
import type { IdentifierObservation } from '../../application/import/types.js';
import type { Schema } from '../../../../shared/model.js';
import type { RouteTypes } from '../../contracts/routes.js';
import type { Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import { page, pageResult } from '../../application/pagination.js';

export type AttachmentRow = Omit<Schema['Attachment'], 'pageCount'> & {
  ownerId: string | null;
  transcriptionUsage: import('../../application/import/types.js').Usage | null;
  identifierObservations: IdentifierObservation[];
  identifierCoverage: { fieldId: string; value: string }[];
  storageKey: string;
  pageCount: number | null;
  transcription: string | null;
  transcriptionSummary: string | null;
  transcriptionTerms: string[];
  transcriptionStatus: string;
  transcriptionCompletedAt: string | null;
};
export type AttachmentQuery = RouteTypes<'/api/attachments', 'get'>['Querystring'];
export interface AttachmentInput {
  filename: string;
  mediaType: string;
  byteSize: number;
  storageKey: string;
  pageCount?: number | null;
}
const columns = (ownerParameter = '$2') =>
  `a.id,a.filename,a.media_type,a.byte_size,a.source_url,a.created_at,a.title,a.document_type,a.publisher,a.document_date::text,a.page_count,a.metadata_sources,coalesce((select jsonb_agg(thing_id order by thing_id) from bt.thing_attachments where attachment_id=a.id and owner_id=${ownerParameter}),'[]') as thing_ids`;
export async function getOwnedAttachmentOrThrow(
  db: Database,
  owner: string,
  id: string,
  options: { lock?: boolean } = {},
): Promise<AttachmentRow> {
  const [file] = await database.rows<AttachmentRow>(
    db,
    `select ${columns()},a.owner_id,a.transcription_usage,a.identifier_observations,a.identifier_coverage,a.storage_key,a.transcription,a.transcription_summary,a.transcription_terms,a.transcription_status,a.transcription_completed_at from bt.attachments a where a.id=$1 and (a.owner_id=$2 or (a.owner_id is null and (exists(select 1 from bt.thing_attachments l where l.attachment_id=a.id and l.owner_id=$2) or exists(select 1 from bt.import_sources s where s.attachment_id=a.id and s.owner_id=$2) or exists(select 1 from bt.thing_fields f where f.owner_id=$2 and f.source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',a.id))) or exists(select 1 from bt.events e where e.owner_id=$2 and e.source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',a.id))) or exists(select 1 from bt.messages m join bt.conversations c on c.id=m.conversation_id where c.owner_id=$2 and m.source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',a.id))) or exists(select 1 from bt.purchasables p where p.owner_id=$2 and p.source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',a.id)))))) ${options.lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(file, 'Attachment not found', 'NOT_FOUND');
  return file;
}
export function publicAttachment(file: AttachmentRow): Schema['Attachment'] {
  const {
    ownerId: _owner,
    transcriptionUsage: _usage,
    identifierObservations: _identifiers,
    identifierCoverage: _coverage,
    storageKey: _key,
    transcription: _transcription,
    transcriptionSummary: _summary,
    transcriptionTerms: _terms,
    transcriptionStatus: _status,
    transcriptionCompletedAt: _completedAt,
    ...metadata
  } = file;
  return metadata;
}
export async function listAttachments(
  db: Database,
  owner: string,
  query: AttachmentQuery,
): Promise<Schema['AttachmentList']> {
  const { limit, offset } = page(query);
  return pageResult(
    await database.rows<Schema['Attachment']>(
      db,
      `select ${columns('$1')} from bt.attachments a where (a.owner_id=$1 or (a.owner_id is null and exists(select 1 from bt.thing_attachments l where l.attachment_id=a.id and l.owner_id=$1))) and ($2::uuid is null or exists(select 1 from bt.thing_attachments where attachment_id=a.id and thing_id=$2)) order by created_at desc,id limit $3 offset $4`,
      [owner, query.thingId ?? null, limit + 1, offset],
    ),
    query,
  );
}
export async function insertAttachment(
  db: Database,
  owner: string,
  file: AttachmentInput,
): Promise<AttachmentRow> {
  const [row] = await database.rows<{ id: string }>(
    db,
    'insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key,page_count) values($1,$2,$3,$4,$5,$6) returning id',
    [owner, file.filename, file.mediaType, file.byteSize, file.storageKey, file.pageCount ?? null],
  );
  return getOwnedAttachmentOrThrow(db, owner, row.id);
}

// Saves source-wide readable content for the immutable uploaded Attachment.
export async function saveTranscription(
  db: Database,
  owner: string | null,
  id: string,
  input: {
    text: string;
    summary: string | null;
    terms: string[];
    status: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'INSUFFICIENT_LANGUAGE';
    identifiers?: IdentifierObservation[];
  },
): Promise<void> {
  await database.execute(
    db,
    `update bt.attachments set transcription=$1,transcription_summary=$2,transcription_terms=$3,
      transcription_status=$4,transcription_completed_at=now(),identifier_observations=$7 where id=$5 and owner_id is not distinct from $6`,
    [
      input.text,
      input.summary,
      JSON.stringify(input.terms),
      input.status,
      id,
      owner,
      JSON.stringify(input.identifiers ?? []),
    ],
  );
}

// Claims one persisted upload for the shared runner.
export async function claimPendingTranscription(
  db: Database,
): Promise<{ file: AttachmentRow; ownerId: string | null } | undefined> {
  const [row] = await database.rows<{ id: string; ownerId: string | null }>(
    db,
    `select a.id,a.owner_id from bt.attachments a where a.transcription_status='PENDING'
     order by a.created_at,a.id limit 1 for update of a skip locked`,
  );
  if (!row) return undefined;
  await database.execute(
    db,
    "update bt.attachments set transcription_status='PROCESSING' where id=$1 and owner_id is not distinct from $2",
    [row.id, row.ownerId],
  );
  return { file: await getProcessingAttachment(db, row.ownerId, row.id), ownerId: row.ownerId };
}

export async function recoverTranscriptions(db: Database): Promise<void> {
  await database.execute(
    db,
    "update bt.attachments set transcription_status='PENDING' where transcription_status='PROCESSING' and transcription_completed_at is null",
  );
}

// Records failures only when the current source has no completed transcription.
export async function setTranscriptionStatus(
  db: Database,
  owner: string | null,
  id: string,
  status: 'PROCESSING' | 'FAILED',
): Promise<void> {
  await database.execute(
    db,
    `update bt.attachments set transcription_status=$1
     where id=$2 and owner_id is not distinct from $3 and transcription_completed_at is null
       and transcription_status in ('PENDING','PROCESSING','FAILED')`,
    [status, id, owner],
  );
}
export async function saveAttachmentMetadata(
  db: Database,
  owner: string | null,
  file: AttachmentRow,
): Promise<Schema['Attachment']> {
  await database.execute(
    db,
    'update bt.attachments set title=$1,document_type=$2,publisher=$3,document_date=$4,metadata_sources=$5,page_count=$6 where id=$7 and owner_id is not distinct from $8',
    [
      file.title,
      file.documentType,
      file.publisher,
      file.documentDate,
      JSON.stringify(file.metadataSources),
      file.pageCount,
      file.id,
      owner,
    ],
  );
  return publicAttachment(file);
}
export async function deleteAttachment(
  db: Database,
  owner: string,
  file: AttachmentRow,
): Promise<void> {
  ensure(
    file.ownerId === owner &&
      file.thingIds.length === 0 &&
      !(
        await database.execute(db, 'select 1 from bt.import_sources where attachment_id=$1', [
          file.id,
        ])
      ).rowCount &&
      !(
        await database.execute(
          db,
          `select 1 from bt.imports where attachment_id=$1 union all select 1 from bt.thing_fields where source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',$1::text)) union all select 1 from bt.events where source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',$1::text)) union all select 1 from bt.purchasables where source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',$1::text)) union all select 1 from bt.messages where source_refs @> jsonb_build_array(jsonb_build_object('attachmentId',$1::text))`,
          [file.id],
        )
      ).rowCount,
    'Attachment is still referenced',
    'CONFLICT',
  );
  await database.execute(db, 'delete from bt.attachments where id=$1 and owner_id=$2', [
    file.id,
    owner,
  ]);
}
export async function linkAttachment(
  db: Database,
  owner: string,
  id: string,
  thingId: string,
  linked: boolean,
): Promise<void> {
  if (linked)
    await database.execute(
      db,
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [thingId, id, owner],
    );
  else {
    const thing = await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
    if (thing.imageAttachmentId === id) {
      thing.data.userEdited = [...new Set([...(thing.data.userEdited ?? []), 'imageAttachmentId'])];
      await thingsDb.saveThingData(db, owner, thingId, thing.data);
    }
    await database.execute(
      db,
      'update bt.things set image_attachment_id=null where id=$1 and owner_id=$2 and image_attachment_id=$3',
      [thingId, owner, id],
    );
    await database.execute(
      db,
      'delete from bt.thing_attachments where thing_id=$1 and attachment_id=$2 and owner_id=$3',
      [thingId, id, owner],
    );
  }
}
export async function isLinkedImage(
  db: Database,
  owner: string,
  thingId: string,
  id: string,
): Promise<boolean> {
  return !!(
    await database.execute(
      db,
      "select 1 from bt.thing_attachments l join bt.attachments a on a.id=l.attachment_id where l.thing_id=$1 and l.attachment_id=$2 and l.owner_id=$3 and a.media_type like 'image/%'",
      [thingId, id, owner],
    )
  ).rowCount;
}

export async function findDiscoveryAttachment(
  db: Database,
  owner: string,
  key: string,
): Promise<{ id: string } | undefined> {
  return (
    await database.rows<{ id: string }>(
      db,
      'select id from bt.attachments where import_key=$1 and (owner_id=$2 or owner_id is null)',
      [key, owner],
    )
  )[0];
}
// Links a discovered resource and selects an image only while the owner has left it unset.
export async function saveDiscoveredAttachment(
  db: Database,
  owner: string,
  thingId: string,
  key: string,
  item: DiscoveryItem,
  document: Omit<AttachmentInput, 'filename'> & {
    metadataSources?: Schema['AttachmentMetadataSources'];
  },
): Promise<boolean> {
  ensure(['reference', 'image'].includes(item.kind), 'Invalid attachment resource');
  const thing = await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
  if (
    item.kind === 'image' &&
    (thing.imageAttachmentId || thing.data.userEdited?.includes('imageAttachmentId'))
  )
    return false;
  const metadata = item.metadata ?? { title: item.title };
  const metadataSources: Schema['AttachmentMetadataSources'] = {};
  for (const key of ['title', 'documentType', 'publisher', 'documentDate'] as const)
    if (metadata[key] != null)
      metadataSources[key] = document.metadataSources?.[key] ?? {
        origin: 'DISCOVERY',
        sourceRefs: [{ url: item.sourceUrl }],
      };
  const filename =
    (item.title
      .replace(/[^\p{L}\p{N} ._-]/gu, '')
      .replace(/\.(pdf|png|(?:jpg|jpeg)|webp)$/i, '')
      .trim()
      .slice(0, 150) || 'Resource') +
    (item.kind === 'reference' ? '.pdf' : '.' + document.mediaType.split('/')[1]);
  const inserted = await database.rows<{ id: string }>(
    db,
    'insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key,source_url,import_key,title,document_type,publisher,document_date,page_count,metadata_sources) values($1,$2,$13,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(import_key) do nothing returning id',
    [
      null,
      filename,
      document.byteSize,
      document.storageKey,
      item.url,
      key,
      metadata.title ?? null,
      metadata.documentType ?? null,
      metadata.publisher ?? null,
      metadata.documentDate ?? null,
      document.pageCount ?? null,
      JSON.stringify(metadataSources),
      document.mediaType,
    ],
  );
  const file = inserted[0] ?? (await findDiscoveryAttachment(db, owner, key));
  ensure(file, 'Discovery attachment unavailable');
  if (thing.data.userEdited?.includes('attachment:' + file.id)) return inserted.length > 0;
  await database.execute(
    db,
    'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
    [thingId, file.id, owner],
  );
  if (item.kind === 'image')
    await database.execute(
      db,
      'update bt.things set image_attachment_id=$1 where id=$2 and owner_id is not distinct from $3',
      [file.id, thingId, owner],
    );
  await thingsDb.bumpThing(db, owner, thingId);
  return inserted.length > 0;
}

// Reads a claimed source using its persisted ownership rather than a browser access grant.
export async function getProcessingAttachment(db: Database, owner: string | null, id: string) {
  const [file] = await database.rows<AttachmentRow>(
    db,
    `select ${columns()},a.owner_id,a.transcription_usage,a.identifier_observations,a.identifier_coverage,a.storage_key,
      a.transcription,a.transcription_summary,a.transcription_terms,a.transcription_status,a.transcription_completed_at
     from bt.attachments a where a.id=$1 and a.owner_id is not distinct from $2`,
    [id, owner],
  );
  ensure(file, 'Attachment not found', 'NOT_FOUND');
  return file;
}

// Finds reusable public evidence for an already identified product class.
export async function findShared(db: Database, identifiers: { fieldId: string; value: string }[]) {
  if (!identifiers.length) return [];
  return database.rows<{ id: string }>(
    db,
    `select id from bt.attachments where owner_id is null and transcription_status in ('COMPLETE','PARTIAL')
     and exists(select 1 from jsonb_array_elements($1::jsonb) candidate
       where identifier_coverage @> jsonb_build_array(candidate)) order by created_at limit 3`,
    [JSON.stringify(identifiers)],
  );
}

// Records source-evidenced public identifier coverage for future resource reuse.
export async function saveCoverage(
  db: Database,
  id: string,
  identifiers: { fieldId: string; value: string }[],
) {
  await database.execute(
    db,
    'update bt.attachments set identifier_coverage=$1 where id=$2 and owner_id is null',
    [JSON.stringify(identifiers), id],
  );
}

// Returns recipients without exposing other owners' relationships to browsers.
export async function affectedOwners(db: Database, file: AttachmentRow) {
  if (file.ownerId) return [file.ownerId];
  return (
    await database.rows<{ ownerId: string }>(
      db,
      'select distinct owner_id from bt.thing_attachments where attachment_id=$1',
      [file.id],
    )
  ).map((row) => row.ownerId);
}
