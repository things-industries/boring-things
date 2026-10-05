import * as discoveryDb from '../../db/entities/discovery.js';

/**
 * Validates cited discovery results and saves names, PDF attachments, maintenance suggestions and
 * products with retry deduplication.
 */

import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Discovery } from '../import/types.js';
import type { ImportRow, Target } from '../../db/entities/imports.js';
import * as importsDb from '../../db/entities/imports.js';
import {
  downloadPdf,
  type DocumentDownload,
  type DocumentOptions,
} from '../../providers/web/pdf.js';
import { ensure } from '../errors.js';
import * as database from '../../db/connection.js';
import * as thingsDb from '../../db/entities/things.js';
import { validateAttachmentMetadata } from '../attachments.js';
import { pdfPageCount } from '../../lib/pdf.js';

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

export function discoveryItemKey(
  jobId: string,
  candidateId: string,
  item: Discovery['items'][number],
) {
  return createHash('sha256')
    .update(
      `${jobId}:${candidateId}:${item.kind}:${item.url}:${item.kind === 'reference' ? '' : item.title}`,
    )
    .digest('hex');
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
    await database.transaction(pool, async (db) => {
      options.signal.throwIfAborted();
      const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, target.thingId, {
        lock: true,
      });
      if (!target.isNew || thing.data.userEdited?.includes('name')) return;
      const values = [
        ...Object.entries(thing.data.standalone),
        ...Object.values(thing.data.values).flatMap(Object.entries),
      ];

      const model = values.find(
        ([id, value]) =>
          ['appliances.eNumber', 'common.model'].includes(id) && typeof value.value === 'string',
      )?.[1].value as string | undefined;

      const chosen = await importsDb.findAvailableImportName(
        db,
        job.ownerId,
        thing.id,
        name,
        model,
      );
      await thingsDb.renameThing(db, job.ownerId, thing.id, chosen);
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
    const key = discoveryItemKey(job.id, target.candidateId, item);

    let blob: string | undefined;
    let used = false;
    let downloading = false;

    try {
      options.signal.throwIfAborted();
      let content: Buffer | null = null;
      let pageCount: number | null = null;

      if (item.kind === 'reference') {
        if (++references > 3) continue;
        const existing = await discoveryDb.findDiscoveryAttachment(pool, job.ownerId, key);

        if (!existing) {
          downloading = true;
          content = await download(item.url, options);
          downloading = false;
          // HTML support pages remain citations; they are never manufactured into text files.
          if (!content) continue;
          pageCount = await pdfPageCount(content, 'application/pdf', options.signal);
          options.signal.throwIfAborted();
          blob = await blobs.put(content);
        }
      }

      used = await database.transaction(pool, async (db) => {
        options.signal.throwIfAborted();
        return discoveryDb.saveDiscoveryItem(
          db,
          job.ownerId,
          target.thingId,
          key,
          item.kind === 'reference'
            ? {
                ...item,
                metadata: validateAttachmentMetadata({ title: item.title, ...item.metadata }),
              }
            : item,
          blob ? { storageKey: blob, byteSize: content!.length, pageCount } : undefined,
        );
      });
    } catch (error) {
      if (blob) await blobs.remove(blob).catch(() => {});
      options.signal.throwIfAborted();
      if (!downloading) throw error;
      failed = true;
      continue;
    }

    // A concurrent insert may win after the download; remove the unused blob after the metadata transaction commits.
    if (blob && !used) await blobs.remove(blob);
  }

  ensure(!failed, 'Discovery download failed');
}
