import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { BlobStorage } from '../providers/blobs.js';
import type { Discovery } from './import-types.js';
import type { ImportRow, Target } from '../db/imports.js';
import { ensure } from './errors.js';
import { rows, transaction } from '../db/connection.js';
import { ownedThing, bumpThing } from '../db/things.js';
export function publicUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      ['https:', 'http:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
export async function persistDiscovery(
  pool: pg.Pool,
  blobs: BlobStorage,
  job: ImportRow,
  target: Target,
  discovery: Discovery,
) {
  ensure(
    Array.isArray(discovery.items) &&
      discovery.items.length <= 8 &&
      Array.isArray(discovery.sources),
    'Invalid discovery',
  );
  for (const item of discovery.items) {
    ensure(
      ['reference', 'maintenance', 'consumable', 'accessory', 'upgrade'].includes(item.kind) &&
        typeof item.title === 'string' &&
        item.title.length > 0 &&
        item.title.length <= 200 &&
        typeof item.description === 'string' &&
        item.description.length <= 4000,
      'Invalid discovery item',
    );
    ensure(
      publicUrl(item.url) &&
        publicUrl(item.sourceUrl) &&
        discovery.sources.includes(item.url) &&
        discovery.sources.includes(item.sourceUrl),
      'Uncited discovery',
    );
    if (!['reference', 'maintenance'].includes(item.kind))
      ensure(
        !new URL(item.url).pathname.toLowerCase().endsWith('.pdf'),
        'Product requires a merchant page',
      );
    const key = createHash('sha256')
      .update(`${job.id}:${target.candidateId}:${item.kind}:${item.url}:${item.title}`)
      .digest('hex');
    const refs = JSON.stringify([{ url: item.sourceUrl }]);
    let blob: string | undefined;
    let used = false;
    try {
      const content = Buffer.from(
        `${item.title}\n${item.description}\n\nSource: ${item.sourceUrl}\nReference: ${item.url}\n`,
      );
      if (item.kind === 'reference') blob = await blobs.put(content);
      await transaction(pool, async (db) => {
        await ownedThing(db, job.ownerId, target.thingId, true);
        if (item.kind === 'reference') {
          const inserted = await rows<{ id: string }>(
            db,
            "insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key,source_url,import_key) values($1,$2,'text/plain',$3,$4,$5,$6) on conflict(import_key) do nothing returning id",
            [
              job.ownerId,
              `${item.title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 150)}.txt`,
              content.length,
              blob,
              item.url,
              key,
            ],
          );
          used = inserted.length > 0;
          const [file] = inserted.length
            ? inserted
            : await rows<{ id: string }>(
                db,
                'select id from bt.attachments where import_key=$1 and owner_id=$2',
                [key, job.ownerId],
              );
          await db.query(
            'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
            [target.thingId, file.id, job.ownerId],
          );
        } else if (item.kind === 'maintenance') {
          await db.query(
            "insert into bt.events(owner_id,thing_id,title,description,status,source_refs,import_key) values($1,$2,$3,$4,'suggested',$5,$6) on conflict(import_key) do nothing",
            [job.ownerId, target.thingId, item.title, item.description, refs, key],
          );
        } else {
          await db.query(
            'insert into bt.purchasables(owner_id,thing_id,kind,name,description,merchant_url,source_refs,checked_at,import_key) values($1,$2,$3,$4,$5,$6,$7,now(),$8) on conflict(import_key) do nothing',
            [
              job.ownerId,
              target.thingId,
              item.kind,
              item.title,
              item.description,
              item.url,
              refs,
              key,
            ],
          );
        }
        await bumpThing(db, job.ownerId, target.thingId);
      });
    } catch (e) {
      if (blob) await blobs.remove(blob);
      throw e;
    }
    if (blob && !used) await blobs.remove(blob);
  }
}
