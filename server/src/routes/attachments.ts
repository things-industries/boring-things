import type { FastifyPluginAsync } from 'fastify';
import { getEnv } from '../config.js';
import type pg from 'pg';
import { basename } from 'node:path';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import { matchesMedia } from '../lib/media.js';
import * as attachmentsDb from '../db/entities/attachments.js';
import {
  supportedMediaTypes,
  uploadAttachment,
  removeAttachment,
  setAttachmentLink,
  updateAttachmentMetadata,
  type UploadedFile,
} from '../application/attachments.js';
import type { BlobStorage } from '../providers/blobs/index.js';
import type { ApplicationEvents } from '../application/events.js';
import * as database from '../db/connection.js';
import type { JobRunner } from '../application/jobs/runner.js';
import { getRequestContext } from '../http/logging.js';
import { recordDependencyFailure } from '../metrics.js';
import { applicationMetrics } from '../sentry.js';

interface Options {
  db: pg.Pool;
  blobs: BlobStorage;
  events: ApplicationEvents;
  runner: JobRunner;
  importEnabled: boolean;
}

const attachmentRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, blobs, events, runner, importEnabled },
) => {
  route(app, 'GET', '/api/attachments', (req) =>
    attachmentsDb.listAttachments(db, req.ownerId, req.query),
  );
  route(app, 'POST', '/api/attachments', async (req, reply) => {
    const parts = req.parts({
      limits: {
        fileSize: getEnv('MAX_UPLOAD_BYTES'),
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
        supportedMediaTypes.includes(part.mimetype),
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
    const result = await uploadAttachment(db, blobs, req.ownerId, file, req.query.thingId);
    req.log.info(
      {
        event: 'job_queued',
        ...getRequestContext(req),
        jobKind: 'attachment',
        jobId: result.id,
        attachmentId: result.id,
        thingId: req.query.thingId,
        mediaType: file.type,
        byteSize: file.buffer.length,
      },
      'Attachment uploaded',
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    runner.wake();
    return reply.code(201).send(result);
  });
  route(app, 'GET', '/api/attachments/{id}', async (req) =>
    attachmentsDb.publicAttachment(
      await attachmentsDb.getOwnedAttachmentOrThrow(db, req.ownerId, req.params.id),
    ),
  );
  route(app, 'PATCH', '/api/attachments/{id}', async (req) => {
    const result = await database.transaction(db, (tx) =>
      updateAttachmentMetadata(tx, req.ownerId, req.params.id, req.body, {
        origin: 'USER',
        sourceRefs: [],
      }),
    );
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return result;
  });
  route(app, 'GET', '/api/attachments/{id}/content', async (req, reply) => {
    const file = await attachmentsDb.getOwnedAttachmentOrThrow(db, req.ownerId, req.params.id);
    const started = performance.now();
    const content = await blobs.read(file.storageKey).catch((error: unknown) => {
      recordDependencyFailure('storage', 'read', error, {
        ownerId: req.ownerId,
        attachmentId: file.id,
      });
      throw error;
    });
    content.once('error', (error: unknown) => {
      recordDependencyFailure('storage', 'read_body', error, {
        ownerId: req.ownerId,
        attachmentId: file.id,
      });
    });
    content.once('end', () =>
      applicationMetrics.distribution('storage.download.duration', performance.now() - started, {
        unit: 'millisecond',
      }),
    );
    return reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .type(file.mediaType)
      .code(200)
      .send(content);
  });
  route(app, 'DELETE', '/api/attachments/{id}', async (req, reply) => {
    await removeAttachment(db, blobs, req.ownerId, req.params.id);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(204).send();
  });
  for (const method of ['PUT', 'DELETE'] as const)
    route(app, method, '/api/attachments/{id}/things/{thingId}', async (req, reply) => {
      const queued = await setAttachmentLink(
        db,
        req.ownerId,
        req.params.id,
        req.params.thingId,
        method === 'PUT',
        importEnabled,
      );
      if (queued)
        req.log.info(
          {
            event: 'job_queued',
            ...getRequestContext(req),
            jobKind: 'import',
            jobId: queued.importId,
            importId: queued.importId,
            attachmentId: req.params.id,
            thingId: queued.thingId,
            status: queued.status,
          },
          'Linked attachment import submitted',
        );
      events.publish({ type: 'data.changed', ownerId: req.ownerId });
      if (method === 'PUT' && importEnabled) runner.wake();
      return reply.code(204).send();
    });
};

export default attachmentRoutes;
