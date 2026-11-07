// Validates cited resources and saves shared public attachments and imported Thing names.
import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import { createHash } from 'node:crypto';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { DiscoveryItem } from './types.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import * as database from '../../db/connection.js';
import { publicUrl } from '../../providers/web/resources.js';
import { ensure } from '../errors.js';

export function resourceKey(item: DiscoveryItem) {
  return createHash('sha256').update(`${item.kind}:${item.url}`).digest('hex');
}

export function validateResource(item: DiscoveryItem, sources: string[]) {
  ensure(
    ['reference', 'image'].includes(item.kind) &&
      typeof item.title === 'string' &&
      item.title.length > 0 &&
      item.title.length <= 200 &&
      typeof item.description === 'string' &&
      item.description.length <= 4000,
    'Invalid research resource',
  );
  ensure(
    publicUrl(item.url) &&
      publicUrl(item.sourceUrl) &&
      sources.includes(item.url) &&
      sources.includes(item.sourceUrl),
    'Uncited research resource',
  );
}

export async function saveResourceAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  owner: string,
  thingId: string,
  key: string,
  item: DiscoveryItem,
  file: {
    content: Buffer;
    mediaType: string;
    pageCount?: number | null;
    metadataSources?: Schema['AttachmentMetadataSources'];
  },
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const storageKey = await blobs.put(file.content);
  let used = false;
  try {
    used = await database.transaction(pool, (db) => {
      signal.throwIfAborted();
      return attachmentsDb.saveDiscoveredAttachment(db, owner, thingId, key, item, {
        storageKey,
        byteSize: file.content.length,
        mediaType: file.mediaType,
        pageCount: file.pageCount,
        metadataSources: file.metadataSources,
      });
    });
    return await attachmentsDb.findDiscoveryAttachment(pool, owner, key);
  } finally {
    if (!used) await blobs.remove(storageKey);
  }
}
