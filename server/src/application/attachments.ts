// Manages private attachment uploads, metadata, links and deletion.
import type pg from 'pg';
import type { BlobStorage } from '../providers/blobs/index.js';
import * as database from '../db/connection.js';
import * as attachmentsDb from '../db/entities/attachments.js';
import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import { ensure } from './errors.js';
import { schemaValidator } from '../contracts/schemas.js';
import { pdfPageCount } from '../lib/pdf.js';
import * as thingsDb from '../db/entities/things.js';
import * as importsDb from '../db/entities/imports.js';

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
  thingId?: string,
) {
  const key = await blobs.put(file.buffer);
  try {
    return await database.transaction(pool, async (db) => {
      const attachment = await attachmentsDb.insertAttachment(db, owner, {
        filename: file.filename,
        mediaType: file.type,
        byteSize: file.buffer.length,
        storageKey: key,
        pageCount: await pdfPageCount(file.buffer, file.type),
      });
      const accepted = await importsDb.createImport(db, owner, attachment.id, thingId);
      return { ...attachmentsDb.publicAttachment(attachment), import: accepted };
    });
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

// Merges metadata while preserving owner edits and explicit clears during automated updates.
export async function updateAttachmentMetadata(
  db: Database,
  owner: string,
  id: string,
  patch: Schema['AttachmentPatch'],
  source: Schema['AttachmentMetadataSource'],
  pageCount?: number | null,
  options: { replaceAutomated?: boolean } = {},
): Promise<Schema['Attachment']> {
  const values = validateAttachmentMetadata(patch);
  const file = await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, id, { lock: true });
  for (const key of ['title', 'documentType', 'publisher', 'documentDate'] as const) {
    const value = values[key];
    if (value === undefined) continue;
    if (
      source.origin !== 'USER' &&
      (value === null ||
        (!options.replaceAutomated && file[key] !== null) ||
        file.metadataSources[key]?.origin === 'USER')
    )
      continue;
    Object.assign(file, { [key]: value });
    file.metadataSources[key] = source;
  }
  if (pageCount != null && file.mediaType === 'application/pdf') file.pageCount = pageCount;
  const saved = await attachmentsDb.saveAttachmentMetadata(db, owner, file);
  for (const thingId of file.thingIds) await thingsDb.bumpThing(db, owner, thingId);
  return saved;
}
export async function removeAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  owner: string,
  id: string,
): Promise<void> {
  const key = await database.transaction(pool, async (db) => {
    const file = await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, id, { lock: true });
    await attachmentsDb.deleteAttachment(db, owner, file);
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
  await database.transaction(pool, async (db) => {
    await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, id, { lock: true });
    await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
    await importsDb.assertThingEditable(db, owner, thingId);
    await attachmentsDb.linkAttachment(db, owner, id, thingId, linked);
    await thingsDb.bumpThing(db, owner, thingId);
  });
}
