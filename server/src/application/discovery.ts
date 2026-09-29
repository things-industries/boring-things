import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { BlobStorage } from '../providers/blobs.js';
import type { Discovery } from './import-types.js';
import type { ImportRow, Target } from '../db/imports.js';
import { availableImportName } from '../db/imports.js';
import {
  downloadPdf,
  type DocumentDownload,
  type DocumentOptions,
} from '../providers/documents.js';
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
  options: DocumentOptions,
  download: DocumentDownload = downloadPdf,
) {
  ensure(
    Array.isArray(discovery.items) &&
      discovery.items.length <= 8 &&
      Array.isArray(discovery.sources),
    'Invalid discovery',
  );
  if (discovery.identity) {
    const { name, sourceUrl } = discovery.identity;
    ensure(
      typeof name === 'string' &&
        name.trim().length > 0 &&
        name.length <= 200 &&
        publicUrl(sourceUrl) &&
        discovery.sources.includes(sourceUrl),
      'Uncited identity',
    );
    await transaction(pool, async (db) => {
      options.signal.throwIfAborted();
      const thing = await ownedThing(db, job.ownerId, target.thingId, true);
      if (!target.isNew || thing.data.userEdited?.includes('name')) return;
      const values = [
        ...Object.entries(thing.data.standalone),
        ...Object.values(thing.data.values).flatMap(Object.entries),
      ];
      const model = values.find(
        ([id, value]) =>
          ['appliances.eNumber', 'common.model'].includes(id) && typeof value.value === 'string',
      )?.[1].value as string | undefined;
      const chosen = await availableImportName(db, job.ownerId, thing.id, name, model);
      await db.query(
        'update bt.things set name=$1,revision=revision+1 where id=$2 and owner_id=$3',
        [chosen, thing.id, job.ownerId],
      );
    });
  }
  let failed = false;
  let references = 0;
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
      .update(
        `${job.id}:${target.candidateId}:${item.kind}:${item.url}:${item.kind === 'reference' ? '' : item.title}`,
      )
      .digest('hex');
    const refs = JSON.stringify([{ url: item.sourceUrl }]);
    let blob: string | undefined;
    let used = false;
    try {
      options.signal.throwIfAborted();
      let content: Buffer | null = null;
      if (item.kind === 'reference') {
        if (++references > 3) continue;
        const [existing] = await rows<{ id: string }>(
          pool,
          'select id from bt.attachments where import_key=$1 and owner_id=$2',
          [key, job.ownerId],
        );
        if (!existing) {
          content = await download(item.url, options);
          // HTML support pages remain citations; they are never manufactured into text files.
          if (!content) continue;
          options.signal.throwIfAborted();
          blob = await blobs.put(content);
        }
      }
      await transaction(pool, async (db) => {
        options.signal.throwIfAborted();
        await ownedThing(db, job.ownerId, target.thingId, true);
        if (item.kind === 'reference') {
          const inserted = blob
            ? await rows<{ id: string }>(
                db,
                "insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key,source_url,import_key) values($1,$2,'application/pdf',$3,$4,$5,$6) on conflict(import_key) do nothing returning id",
                [
                  job.ownerId,
                  `${
                    item.title
                      .replace(/[^\p{L}\p{N} ._-]/gu, '')
                      .replace(/\.pdf$/i, '')
                      .trim()
                      .slice(0, 150) || 'Document'
                  }.pdf`,
                  content!.length,
                  blob,
                  item.url,
                  key,
                ],
              )
            : [];
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
    } catch {
      if (blob) await blobs.remove(blob);
      failed = true;
      continue;
    }
    if (blob && !used) await blobs.remove(blob);
  }
  ensure(!failed, 'Discovery download failed');
}
