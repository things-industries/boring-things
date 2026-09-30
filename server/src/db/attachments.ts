import { execute } from './connection.js';
import type { Schema } from '../../../shared/model.js';
import type { RouteTypes } from '../contracts/routes.js';
import { rows, type Database } from './connection.js';
import { ensure } from '../application/errors.js';
import { ownedThing } from './things.js';
import { page, pageResult } from '../application/pagination.js';

export type AttachmentRow = Schema['Attachment'] & { storageKey: string };
export type AttachmentQuery = RouteTypes<'/api/attachments', 'get'>['Querystring'];
export interface AttachmentInput {
  filename: string;
  mediaType: string;
  byteSize: number;
  storageKey: string;
}
const columns =
  "a.id,a.filename,a.media_type,a.byte_size,a.source_url,a.created_at,coalesce((select jsonb_agg(thing_id order by thing_id) from bt.thing_attachments where attachment_id=a.id),'[]') as thing_ids";
export async function attachment(
  db: Database,
  owner: string,
  id: string,
  lock = false,
): Promise<AttachmentRow> {
  const [file] = await rows<AttachmentRow>(
    db,
    `select ${columns},a.storage_key from bt.attachments a where id=$1 and owner_id=$2 ${lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(file, 'Attachment not found', 'NOT_FOUND');
  return file;
}
export function publicAttachment(file: AttachmentRow): Schema['Attachment'] {
  const { storageKey: _key, ...metadata } = file;
  return metadata;
}
export async function listAttachments(
  db: Database,
  owner: string,
  query: AttachmentQuery,
): Promise<Schema['AttachmentList']> {
  if (query.thingId) await ownedThing(db, owner, query.thingId);
  const { limit, offset } = page(query);
  return pageResult(
    await rows<Schema['Attachment']>(
      db,
      `select ${columns} from bt.attachments a where owner_id=$1 and ($2::uuid is null or exists(select 1 from bt.thing_attachments where attachment_id=a.id and thing_id=$2)) order by created_at desc,id limit $3 offset $4`,
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
  const [row] = await rows<{ id: string }>(
    db,
    'insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key) values($1,$2,$3,$4,$5) returning id',
    [owner, file.filename, file.mediaType, file.byteSize, file.storageKey],
  );
  return attachment(db, owner, row.id);
}
export async function deleteAttachment(
  db: Database,
  owner: string,
  file: AttachmentRow,
): Promise<void> {
  ensure(
    file.thingIds.length === 0 &&
      !(await execute(db, 'select 1 from bt.imports where attachment_id=$1', [file.id])).rowCount,
    'Attachment is still referenced',
    'CONFLICT',
  );
  await execute(db, 'delete from bt.attachments where id=$1 and owner_id=$2', [file.id, owner]);
}
export async function linkAttachment(
  db: Database,
  owner: string,
  id: string,
  thingId: string,
  linked: boolean,
): Promise<void> {
  if (linked)
    await execute(
      db,
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [thingId, id, owner],
    );
  else {
    await execute(
      db,
      'update bt.things set image_attachment_id=null where id=$1 and owner_id=$2 and image_attachment_id=$3',
      [thingId, owner, id],
    );
    await execute(
      db,
      'delete from bt.thing_attachments where thing_id=$1 and attachment_id=$2 and owner_id=$3',
      [thingId, id, owner],
    );
  }
}
export async function linkedImage(
  db: Database,
  owner: string,
  thingId: string,
  id: string,
): Promise<boolean> {
  return !!(
    await execute(
      db,
      "select 1 from bt.thing_attachments l join bt.attachments a on a.id=l.attachment_id where l.thing_id=$1 and l.attachment_id=$2 and l.owner_id=$3 and a.media_type like 'image/%'",
      [thingId, id, owner],
    )
  ).rowCount;
}
