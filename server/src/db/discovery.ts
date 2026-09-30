import { execute } from './connection.js';
import { rows, type Database } from './connection.js';
import { ownedThing, bumpThing } from './things.js';
import type { DiscoveryItem } from '../application/import/types.js';
import { ensure } from '../application/errors.js';

interface DownloadedDocument {
  storageKey: string;
  byteSize: number;
}
export async function discoveryAttachment(
  db: Database,
  owner: string,
  key: string,
): Promise<{ id: string } | undefined> {
  return (
    await rows<{ id: string }>(
      db,
      'select id from bt.attachments where import_key=$1 and owner_id=$2',
      [key, owner],
    )
  )[0];
}
export async function saveDiscoveryItem(
  db: Database,
  owner: string,
  thingId: string,
  key: string,
  item: DiscoveryItem,
  document?: DownloadedDocument,
): Promise<boolean> {
  await ownedThing(db, owner, thingId, true);
  let used = false;
  const refs = JSON.stringify([{ url: item.sourceUrl }]);
  if (item.kind === 'reference') {
    const filename =
      (item.title
        .replace(/[^\p{L}\p{N} ._-]/gu, '')
        .replace(/\.pdf$/i, '')
        .trim()
        .slice(0, 150) || 'Document') + '.pdf';
    const inserted = document
      ? await rows<{ id: string }>(
          db,
          "insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key,source_url,import_key) values($1,$2,'application/pdf',$3,$4,$5,$6) on conflict(import_key) do nothing returning id",
          [owner, filename, document.byteSize, document.storageKey, item.url, key],
        )
      : [];
    used = inserted.length > 0;
    const file = inserted[0] ?? (await discoveryAttachment(db, owner, key));
    ensure(file, 'Discovery attachment unavailable');
    await execute(
      db,
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
      [thingId, file.id, owner],
    );
  } else if (item.kind === 'maintenance') {
    await execute(
      db,
      "insert into bt.events(owner_id,thing_id,title,description,status,source_refs,import_key) values($1,$2,$3,$4,'SUGGESTED',$5,$6) on conflict(import_key) do nothing",
      [owner, thingId, item.title, item.description, refs, key],
    );
  } else {
    await execute(
      db,
      'insert into bt.purchasables(owner_id,thing_id,kind,name,description,merchant_url,source_refs,checked_at,import_key) values($1,$2,$3,$4,$5,$6,$7,now(),$8) on conflict(import_key) do nothing',
      [owner, thingId, item.kind.toUpperCase(), item.title, item.description, item.url, refs, key],
    );
  }
  await bumpThing(db, owner, thingId);
  return used;
}
