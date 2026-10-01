import type pg from 'pg';
import type { BlobStorage } from '../providers/blobs/index.js';
import { transaction } from '../db/connection.js';
import {
  attachment,
  insertAttachment,
  deleteAttachment,
  linkAttachment,
  publicAttachment,
  saveAttachmentMetadata,
} from '../db/entities/attachments.js';
import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import { ensure } from './errors.js';
import { schemaValidator } from '../contracts/schemas.js';
import { pdfPageCount } from '../lib/pdf.js';
import { ownedThing, bumpThing } from '../db/entities/things.js';
import { assertEditable } from '../db/entities/imports.js';

export interface UploadedFile {
  filename: string;
  type: string;
  buffer: Buffer;
}
export async function uploadAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  owner: string,
  file: UploadedFile,
) {
  const key = await blobs.put(file.buffer);
  try {
    return publicAttachment(
      await insertAttachment(pool, owner, {
        filename: file.filename,
        mediaType: file.type,
        byteSize: file.buffer.length,
        storageKey: key,
        pageCount: await pdfPageCount(file.buffer, file.type),
      }),
    );
  } catch (error) {
    await blobs.remove(key).catch(() => {});
    throw error;
  }
}

const metadataValidator = schemaValidator('AttachmentPatch');
export function validateAttachmentMetadata(input: unknown): Schema['AttachmentPatch'] {
  ensure(metadataValidator(input), 'Invalid attachment metadata');
  const metadata = { ...(input as Schema['AttachmentPatch']) };
  for (const key of ['title', 'publisher'] as const) {
    if (typeof metadata[key] === 'string') {
      metadata[key] = metadata[key].trim();
      ensure(metadata[key], 'Metadata cannot be blank');
    }
  }
  return metadata;
}

export async function updateAttachmentMetadata(
  db: Database,
  owner: string,
  id: string,
  patch: Schema['AttachmentPatch'],
  source: Schema['AttachmentMetadataSource'],
  pageCount?: number | null,
): Promise<Schema['Attachment']> {
  const values = validateAttachmentMetadata(patch);
  const file = await attachment(db, owner, id, true);
  for (const key of ['title', 'documentType', 'publisher', 'documentDate'] as const) {
    const value = values[key];
    if (value === undefined) continue;
    if (
      source.origin !== 'USER' &&
      (value === null || file[key] !== null || file.metadataSources[key]?.origin === 'USER')
    )
      continue;
    Object.assign(file, { [key]: value });
    file.metadataSources[key] = source;
  }
  if (pageCount != null && file.mediaType === 'application/pdf') file.pageCount = pageCount;
  const saved = await saveAttachmentMetadata(db, owner, file);
  for (const thingId of file.thingIds) await bumpThing(db, owner, thingId);
  return saved;
}
export async function removeAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  owner: string,
  id: string,
): Promise<void> {
  const key = await transaction(pool, async (db) => {
    const file = await attachment(db, owner, id, true);
    await deleteAttachment(db, owner, file);
    return file.storageKey;
  });
  await blobs.remove(key);
}
export async function setAttachmentLink(
  pool: pg.Pool,
  owner: string,
  id: string,
  thingId: string,
  linked: boolean,
): Promise<void> {
  await transaction(pool, async (db) => {
    await attachment(db, owner, id, true);
    await ownedThing(db, owner, thingId, true);
    await assertEditable(db, owner, thingId);
    await linkAttachment(db, owner, id, thingId, linked);
    await bumpThing(db, owner, thingId);
  });
}
