import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { basename } from 'node:path';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import { matchesMedia } from '../lib/media.js';
import { attachment, publicAttachment, listAttachments } from '../db/entities/attachments.js';
import {
  uploadAttachment,
  removeAttachment,
  setAttachmentLink,
  updateAttachmentMetadata,
  type UploadedFile,
} from '../application/attachments.js';
import type { BlobStorage } from '../providers/blobs/index.js';
import type { EnvConfig } from '../config.js';
import type { ApplicationEvents } from '../application/events.js';
import { transaction } from '../db/connection.js';

interface Options {
  db: pg.Pool;
  blobs: BlobStorage;
  config: EnvConfig;
  events: ApplicationEvents;
}

const attachmentRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, blobs, config, events },
) => {
  route(app, 'GET', '/api/attachments', (req) => listAttachments(db, req.ownerId, req.query));
  route(app, 'POST', '/api/attachments', async (req, reply) => {
    const parts = req.parts({
      limits: {
        fileSize: config.maxUploadBytes,
        files: 1,
        fields: 0,
        parts: 1,
      },
    });
    let file: UploadedFile | undefined;

    for await (const part of parts) {
      ensure(
        part.type === 'file' && part.fieldname === 'file',
        'Upload one file in the file field',
      );
      ensure(
        config.supportedMediaTypes.includes(part.mimetype),
        'Unsupported media type',
        'UNSUPPORTED_MEDIA',
      );
      const buffer = await part.toBuffer();
      ensure(!part.file.truncated, 'File exceeds upload limit', 'TOO_LARGE');
      ensure(
        buffer.length > 0 && matchesMedia(buffer, part.mimetype),
        'File content does not match its media type',
        'UNSUPPORTED_MEDIA',
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
    const result = await uploadAttachment(db, blobs, req.ownerId, file);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(201).send(result);
  });
  route(app, 'GET', '/api/attachments/{id}', async (req) =>
    publicAttachment(await attachment(db, req.ownerId, req.params.id)),
  );
  route(app, 'PATCH', '/api/attachments/{id}', async (req) => {
    const result = await transaction(db, (tx) =>
      updateAttachmentMetadata(tx, req.ownerId, req.params.id, req.body, {
        origin: 'USER',
        sourceRefs: [],
      }),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return result;
  });
  route(app, 'GET', '/api/attachments/{id}/content', async (req, reply) => {
    const file = await attachment(db, req.ownerId, req.params.id);
    return reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .type(file.mediaType)
      .code(200)
      .send(await blobs.read(file.storageKey));
  });
  route(app, 'DELETE', '/api/attachments/{id}', async (req, reply) => {
    await removeAttachment(db, blobs, req.ownerId, req.params.id);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(204).send();
  });
  for (const method of ['PUT', 'DELETE'] as const)
    route(app, method, '/api/attachments/{id}/things/{thingId}', async (req, reply) => {
      await setAttachmentLink(db, req.ownerId, req.params.id, req.params.thingId, method === 'PUT');
      events.publish({ type: 'data.changed', ownerId: req.ownerId });
      return reply.code(204).send();
    });
};

export default attachmentRoutes;
