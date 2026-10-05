import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Discovery, DiscoveryItem } from './types.js';
import type { ImportRow, ImportDestination } from '../../db/entities/imports.js';
import * as importsDb from '../../db/entities/imports.js';
import * as thingsDb from '../../db/entities/things.js';
import * as discoveryDb from '../../db/entities/discovery.js';
import * as database from '../../db/connection.js';
import { publicUrl } from '../../providers/web/resources.js';
import { ensure } from '../errors.js';

export function resourceKey(jobId: string, subjectId: string, item: DiscoveryItem) {
  return createHash('sha256')
    .update(`${jobId}:${subjectId}:${item.kind}:${item.url}:`)
    .digest('hex');
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

export async function refineImportedName(
  pool: pg.Pool,
  job: Pick<ImportRow, 'ownerId'>,
  target: Pick<ImportDestination, 'thingId' | 'isNew'>,
  discovery: Discovery,
  signal: AbortSignal,
) {
  if (!discovery.identity || !target.isNew) return;
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
    signal.throwIfAborted();
    const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, target.thingId, {
      lock: true,
    });
    if (thing.data.userEdited?.includes('name')) return;
    const values = [
      ...Object.entries(thing.data.standalone),
      ...Object.values(thing.data.values).flatMap(Object.entries),
    ];

    const model = values.find(
      ([id, value]) =>
        ['appliances.eNumber', 'common.model'].includes(id) && typeof value.value === 'string',
    )?.[1].value as string | undefined;

    const chosen = await importsDb.findAvailableImportName(db, job.ownerId, thing.id, name, model);
    await thingsDb.renameThing(db, job.ownerId, thing.id, chosen);
  });
}

export async function saveResourceAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  owner: string,
  thingId: string,
  key: string,
  item: DiscoveryItem,
  file: { content: Buffer; mediaType: string; pageCount?: number | null },
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const storageKey = await blobs.put(file.content);
  let used = false;
  try {
    used = await database.transaction(pool, (db) => {
      signal.throwIfAborted();
      return discoveryDb.saveDiscoveredAttachment(db, owner, thingId, key, item, {
        storageKey,
        byteSize: file.content.length,
        mediaType: file.mediaType,
        pageCount: file.pageCount,
      });
    });
    return await discoveryDb.findDiscoveryAttachment(pool, owner, key);
  } finally {
    if (!used) await blobs.remove(storageKey);
  }
}
