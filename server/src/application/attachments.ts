import type pg from 'pg';
import type { BlobStorage } from '../providers/blobs.js';
import { transaction } from '../db/connection.js';
import {
  attachment,
  insertAttachment,
  deleteAttachment,
  linkAttachment,
  publicAttachment,
} from '../db/attachments.js';
import { ownedThing, bumpThing } from '../db/things.js';
import { assertEditable } from '../db/imports.js';

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
      }),
    );
  } catch (error) {
    await blobs.remove(key).catch(() => {});
    throw error;
  }
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
