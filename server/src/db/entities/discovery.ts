import * as database from '../connection.js';
import type { Database } from '../connection.js';
import * as thingsDb from './things.js';
import type { DiscoveryItem } from '../../application/import/types.js';
import { ensure } from '../../application/errors.js';
import type { Schema } from '../../../../shared/model.js';

interface DownloadedResource {
  storageKey: string;
  byteSize: number;
  pageCount?: number | null;
  mediaType: string;
}
export async function findDiscoveryAttachment(
  db: Database,
  owner: string,
  key: string,
): Promise<{ id: string } | undefined> {
  return (
    await database.rows<{ id: string }>(
      db,
      'select id from bt.attachments where import_key=$1 and owner_id=$2',
      [key, owner],
    )
  )[0];
}
export async function saveDiscoveredAttachment(
  db: Database,
  owner: string,
  thingId: string,
  key: string,
  item: DiscoveryItem,
  document: DownloadedResource,
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
      metadataSources[key] = { origin: 'DISCOVERY', sourceRefs: [{ url: item.sourceUrl }] };
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
      owner,
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
  await database.execute(
    db,
    'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
    [thingId, file.id, owner],
  );
  if (item.kind === 'image')
    await database.execute(
      db,
      'update bt.things set image_attachment_id=$1 where id=$2 and owner_id=$3',
      [file.id, thingId, owner],
    );
  await thingsDb.bumpThing(db, owner, thingId);
  return inserted.length > 0;
}
