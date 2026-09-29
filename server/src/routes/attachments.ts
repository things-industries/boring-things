import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { basename } from 'node:path';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';
import { rows, transaction, type Database } from '../db/connection.js';
import { ensure } from '../application/errors.js';
import { page, pageResult } from '../application/pagination.js';
import { ownedThing, bumpThing } from '../db/things.js';
import type { BlobStorage } from '../providers/blobs.js';
import type { Config } from '../config.js';
type AttachmentRow = Schema['Attachment'] & { storageKey: string };
async function attachment(db: Database, owner: string, id: string, lock = false) {
  const [file] = await rows<AttachmentRow>(
    db,
    `select a.*,coalesce((select jsonb_agg(thing_id order by thing_id) from bt.thing_attachments where attachment_id=a.id),'[]') as thing_ids from bt.attachments a where id=$1 and owner_id=$2 ${lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(file, 'Attachment not found', 404);
  return file;
}
export function matchesMedia(buffer: Buffer, type: string) {
  if (type === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (type === 'image/png')
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (type === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    );
  if (type === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return !buffer.includes(0);
    } catch {
      return false;
    }
  }
  return false;
}
export function attachmentRoutes(
  app: FastifyInstance,
  db: pg.Pool,
  blobs: BlobStorage,
  config: Config,
) {
  route(app, 'GET', '/api/attachments', async (req) => {
    if (req.query.thingId) await ownedThing(db, req.ownerId, req.query.thingId);
    const { limit, offset } = page(req.query);
    return pageResult(
      await rows(
        db,
        `select a.*,coalesce((select jsonb_agg(thing_id order by thing_id) from bt.thing_attachments where attachment_id=a.id),'[]') as thing_ids from bt.attachments a where owner_id=$1 and ($2::uuid is null or exists(select 1 from bt.thing_attachments where attachment_id=a.id and thing_id=$2)) order by created_at desc,id limit $3 offset $4`,
        [req.ownerId, req.query.thingId ?? null, limit + 1, offset],
      ),
      req.query,
    );
  });
  route(app, 'POST', '/api/attachments', async (req, reply) => {
    const parts = req.parts({
      limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0, parts: 1 },
    });
    let file: { filename: string; type: string; buffer: Buffer } | undefined;
    for await (const part of parts) {
      ensure(
        part.type === 'file' && part.fieldname === 'file',
        'Upload one file in the file field',
      );
      ensure(config.supportedMediaTypes.includes(part.mimetype), 'Unsupported media type', 415);
      const buffer = await part.toBuffer();
      ensure(!part.file.truncated, 'File exceeds upload limit', 413);
      ensure(
        buffer.length > 0 && matchesMedia(buffer, part.mimetype),
        'File content does not match its media type',
        415,
      );
      file = {
        filename:
          [...basename(part.filename)]
            .filter((char) => char.charCodeAt(0) >= 32)
            .join('')
            .slice(0, 255) || 'attachment',
        type: part.mimetype,
        buffer,
      };
    }
    ensure(file, 'Choose a file');
    const key = await blobs.put(file.buffer);
    let id: string;
    try {
      const [row] = await rows<{ id: string }>(
        db,
        'insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key) values($1,$2,$3,$4,$5) returning id',
        [req.ownerId, file.filename, file.type, file.buffer.length, key],
      );
      id = row.id;
    } catch (error) {
      await blobs.remove(key);
      throw error;
    }
    reply.code(201);
    return attachment(db, req.ownerId, id);
  });
  route(app, 'GET', '/api/attachments/{id}', (req) => attachment(db, req.ownerId, req.params.id));
  route(app, 'GET', '/api/attachments/{id}/content', async (req, reply) => {
    const file = await attachment(db, req.ownerId, req.params.id);
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .type(file.mediaType);
    return reply.send(blobs.read(file.storageKey));
  });
  route(app, 'DELETE', '/api/attachments/{id}', async (req, reply) => {
    const key = await transaction(db, async (tx) => {
      const file = await attachment(tx, req.ownerId, req.params.id, true);
      ensure(
        file.thingIds.length === 0 &&
          !(await tx.query('select 1 from bt.imports where attachment_id=$1', [file.id])).rowCount,
        'Attachment is still referenced',
        409,
      );
      await tx.query('delete from bt.attachments where id=$1 and owner_id=$2', [
        file.id,
        req.ownerId,
      ]);
      return file.storageKey;
    });
    // Metadata deletion commits first. A failed filesystem cleanup leaves an orphan, never a broken live record.
    await blobs.remove(key);
    reply.code(204).send();
  });
  for (const method of ['PUT', 'DELETE'] as const)
    route(app, method, '/api/attachments/{id}/things/{thingId}', async (req, reply) => {
      await transaction(db, async (tx) => {
        await attachment(tx, req.ownerId, req.params.id, true);
        await ownedThing(tx, req.ownerId, req.params.thingId, true);
        if (method === 'PUT')
          await tx.query(
            'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3) on conflict do nothing',
            [req.params.thingId, req.params.id, req.ownerId],
          );
        else {
          await tx.query(
            'update bt.things set image_attachment_id=null where id=$1 and owner_id=$2 and image_attachment_id=$3',
            [req.params.thingId, req.ownerId, req.params.id],
          );
          await tx.query(
            'delete from bt.thing_attachments where thing_id=$1 and attachment_id=$2 and owner_id=$3',
            [req.params.thingId, req.params.id, req.ownerId],
          );
        }
        await bumpThing(tx, req.ownerId, req.params.thingId);
      });
      reply.code(204).send();
    });
}
