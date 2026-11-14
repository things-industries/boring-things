// Manages private attachment uploads, metadata, links and deletion.
import type pg from 'pg';
import type { BlobStorage } from '../providers/blobs/index.js';
import { recordDependencyFailure } from '../metrics.js';
import * as database from '../db/connection.js';
import * as attachmentsDb from '../db/entities/attachments.js';
import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import { ensure } from './errors.js';
import { schemaValidator } from '../contracts/schemas.js';
import { pdfPageCount } from '../lib/pdf.js';
import * as thingsDb from '../db/entities/things.js';
import * as importsDb from '../db/entities/imports.js';

export const supportedMediaTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
];

export interface UploadedFile {
  filename: string;
  type: string;
  buffer: Buffer;
}
export async function uploadAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  userId: string,
  file: UploadedFile,
  thingId?: string,
) {
  const key = await blobs.put(file.buffer).catch((error: unknown) => {
    recordDependencyFailure('storage', 'upload', error, { userId, thingId });
    throw error;
  });
  try {
    return await database.transaction(pool, async (db) => {
      const attachment = await attachmentsDb.insertAttachment(db, userId, {
        filename: file.filename,
        mediaType: file.type,
        byteSize: file.buffer.length,
        storageKey: key,
        pageCount: await pdfPageCount(file.buffer, file.type),
      });
      if (thingId) {
        await thingsDb.getThingForUserOrThrow(db, userId, thingId, { lock: true });
        await importsDb.assertThingEditable(db, userId, thingId);
        await attachmentsDb.linkAttachment(db, userId, attachment.id, thingId, true);
        await thingsDb.bumpThing(db, userId, thingId);
      }
      return attachmentsDb.publicAttachment(
        await attachmentsDb.getAttachmentForUserOrThrow(db, userId, attachment.id),
      );
    });
  } catch (error) {
    await blobs.remove(key).catch((cleanupError: unknown) =>
      recordDependencyFailure('storage', 'upload_cleanup', cleanupError, {
        userId,
        thingId,
      }),
    );
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

// Merges metadata while preserving user edits and explicit clears during automated updates.
export async function updateAttachmentMetadata(
  db: Database,
  userId: string,
  id: string,
  patch: Schema['AttachmentPatch'],
  source: Schema['AttachmentMetadataSource'],
  pageCount?: number | null,
  options: { replaceAutomated?: boolean } = {},
): Promise<Schema['Attachment']> {
  const values = validateAttachmentMetadata(patch);
  const file = await attachmentsDb.getAttachmentForUserOrThrow(db, userId, id, { lock: true });
  ensure(
    file.userId !== null || source.origin !== 'USER',
    'Shared metadata is system-managed',
    'CONFLICT',
  );
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
  const saved = await attachmentsDb.saveAttachmentMetadata(db, userId, file);
  for (const thingId of file.thingIds) await thingsDb.bumpThing(db, userId, thingId);
  return saved;
}
export async function removeAttachment(
  pool: pg.Pool,
  blobs: BlobStorage,
  userId: string,
  id: string,
): Promise<void> {
  const key = await database.transaction(pool, async (db) => {
    const file = await attachmentsDb.getAttachmentForUserOrThrow(db, userId, id, { lock: true });
    await attachmentsDb.deleteAttachment(db, userId, file);
    return file.storageKey;
  });
  await blobs.remove(key).catch((error: unknown) => {
    recordDependencyFailure('storage', 'delete', error, { userId, attachmentId: id });
    throw error;
  });
}
export async function setAttachmentLink(
  pool: pg.Pool,
  userId: string,
  id: string,
  thingId: string,
  linked: boolean,
  importEnabled = true,
): Promise<Schema['ImportAccepted'] | undefined> {
  return database.transaction(pool, async (db) => {
    await attachmentsDb.getAttachmentForUserOrThrow(db, userId, id, { lock: true });
    const thing = await thingsDb.getThingForUserOrThrow(db, userId, thingId, { lock: true });
    if (linked) await importsDb.assertThingEditable(db, userId, thingId);
    const decisions = new Set(thing.data.userEdited ?? []);
    if (linked) decisions.delete('attachment:' + id);
    else decisions.add('attachment:' + id);
    thing.data.userEdited = [...decisions];
    await thingsDb.saveThingData(db, userId, thingId, thing.data);
    const existing = await database.execute(
      db,
      'select 1 from bt.thing_attachments where thing_id=$1 and attachment_id=$2 and user_id=$3',
      [thingId, id, userId],
    );
    await attachmentsDb.linkAttachment(db, userId, id, thingId, linked);
    if (linked && !existing.rowCount && importEnabled)
      return importsDb.createImportInTransaction(db, userId, [id], thingId);
    await thingsDb.bumpThing(db, userId, thingId);
  });
}
