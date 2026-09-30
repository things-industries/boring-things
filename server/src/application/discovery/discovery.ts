import { discoveryAttachment, saveDiscoveryItem } from '../../db/discovery.js';
/**
 * Validates cited discovery results and saves names, PDF attachments, maintenance suggestions and
 * products with retry deduplication.
 */

import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { BlobStorage } from '../../providers/blobs.js';
import type { Discovery } from '../import/types.js';
import type { ImportRow, Target } from '../../db/imports.js';
import { availableImportName } from '../../db/imports.js';
import {
  downloadPdf,
  type DocumentDownload,
  type DocumentOptions,
} from '../../providers/documents.js';
import { ensure } from '../errors.js';
import { transaction } from '../../db/connection.js';
import { ownedThing, renameThing } from '../../db/things.js';

// This validates citation links only; PDF downloads also enforce DNS and address restrictions in the document provider.
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
  job: Pick<ImportRow, 'id' | 'ownerId'>,
  target: Pick<Target, 'thingId' | 'candidateId' | 'isNew'>,
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
      await renameThing(db, job.ownerId, thing.id, chosen);
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

    // A stable import key deduplicates repeated discovery results when a job resumes after partial success.
    const key = createHash('sha256')
      .update(
        `${job.id}:${target.candidateId}:${item.kind}:${item.url}:${item.kind === 'reference' ? '' : item.title}`,
      )
      .digest('hex');

    let blob: string | undefined;
    let used = false;

    try {
      options.signal.throwIfAborted();
      let content: Buffer | null = null;

      if (item.kind === 'reference') {
        if (++references > 3) continue;
        const existing = await discoveryAttachment(pool, job.ownerId, key);

        if (!existing) {
          content = await download(item.url, options);
          // HTML support pages remain citations; they are never manufactured into text files.
          if (!content) continue;
          options.signal.throwIfAborted();
          blob = await blobs.put(content);
        }
      }

      used = await transaction(pool, async (db) => {
        options.signal.throwIfAborted();
        return saveDiscoveryItem(
          db,
          job.ownerId,
          target.thingId,
          key,
          item,
          blob ? { storageKey: blob, byteSize: content!.length } : undefined,
        );
      });
    } catch {
      if (blob) await blobs.remove(blob).catch(() => {});
      failed = true;
      continue;
    }

    // A concurrent insert may win after the download; remove the unused blob after the metadata transaction commits.
    if (blob && !used) await blobs.remove(blob);
  }

  ensure(!failed, 'Discovery download failed');
}
