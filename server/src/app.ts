/**
 * Assembles Fastify dependencies, contracts, authentication, routes and background workers; serves
 * the built frontend when available.
 */

import { getEnv } from './config.js';
import * as routes from './routes/index.js';
import { installErrorHandler } from './routes/errors.js';
import { ServerSentEvents } from './http/sse.js';
import { loggerOptions, RequestLogController } from './http/logging.js';
import web from './plugins/web.js';
import { ImportProcessor } from './application/import/processor.js';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type pg from 'pg';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as database from './db/connection.js';
import * as jobLeaseDb from './db/job-lease.js';
import { schemas, createValidatorCompiler } from './contracts/schemas.js';
import auth from './plugins/auth.js';
import { logtoVerifier, type VerifyIdentity } from './providers/auth/logto.js';
import { loadRegistry } from './application/registry/index.js';
import { createBlobs, type BlobStorage } from './providers/blobs/index.js';
import { Assistant } from './application/conversations/assistant.js';
import taskRoutes from './routes/tasks.js';
import type { TaskScheduler } from './application/task-scheduling.js';
import { createAi } from './providers/ai/index.js';
import type { ChatAi } from './application/conversations/types.js';
import type { ImportAi } from './application/import/types.js';
import { AttachmentTranscriptionProcessor } from './application/import/transcription.js';
import { JobRunner } from './application/jobs/runner.js';
import * as metrics from './metrics.js';
import { captureBackgroundFailure, flushSentry } from './sentry.js';
import { getFailureReason } from './application/errors.js';
import { ApplicationEvents } from './application/events.js';
import * as googleVision from './providers/google-vision/index.js';

// Allow overriding of dependencies for testing
export interface BuildAppOptions {
  dbPool?: pg.Pool;
  blobs?: BlobStorage;
  verifyIdentity?: VerifyIdentity;
  logger?: boolean;
  importAi?: ImportAi;
  chatAi?: ChatAi;
  taskScheduler?: TaskScheduler;
  importWorkflow?: import('./application/import/workflow.js').WorkflowOptions;
  readImageText?: typeof googleVision.readImageText;
}

export async function buildApp(options: BuildAppOptions = {}) {
  getEnv('NODE_ENV');

  const dbPool = options.dbPool ?? database.createPool();
  const app = Fastify({
    logger: options.logger ? loggerOptions() : false,
    logController: new RequestLogController(),
    bodyLimit: 1048576,
  });

  // Close hooks run in reverse order: stop jobs and database work before flushing telemetry.
  app.addHook('onClose', flushSentry);
  app.addHook('onClose', metrics.shutdownMetrics);

  // Close the database pool on shutdown only when buildApp created it.
  if (!options.dbPool) app.addHook('onClose', () => dbPool.end());
  try {
    for (const schema of schemas) app.addSchema(schema);
    app.setValidatorCompiler(createValidatorCompiler());

    // Expose API documentation at /api/documentation
    const specificationPath = fileURLToPath(new URL('../../openapi.json', import.meta.url));
    await app.register(swagger, {
      mode: 'static',
      specification: {
        path: specificationPath,
        baseDir: dirname(specificationPath),
      },
    });
    await app.register(swaggerUi, { routePrefix: '/api/documentation' });

    installErrorHandler(app);

    app.get('/health', async () => {
      await dbPool.query('select 1');
      return { status: 'ok' };
    });

    // Registry definitions are cached at startup; restart the server after changing seeded metadata.
    const registry = await loadRegistry(dbPool);
    const { importAi, chatAi, taskScheduler } = createAi(
      options,
      (turn) => app.log.info({ ...turn, ...metrics.getDiagnosticContext() }, 'AI turn completed'),
      { db: dbPool, registry },
    );
    await app.register(routes.configRoutes, {
      chatEnabled: !!chatAi,
      importEnabled: !!importAi,
    });

    const blobs = options.blobs ?? createBlobs();
    if (!options.blobs) app.addHook('onClose', async () => blobs.close?.());
    const events = new ApplicationEvents();

    const assistant = new Assistant(dbPool, registry, blobs, chatAi, events);
    const runner = new JobRunner(
      [
        assistant,
        new AttachmentTranscriptionProcessor(
          dbPool,
          blobs,
          importAi,
          events,
          options.readImageText ??
            (async (content, signal) => {
              const started = Date.now();
              const text = await googleVision.readImageText(content, signal);
              app.log.info(
                {
                  task: 'image_ocr',
                  metrics: {
                    elapsedMs: Date.now() - started,
                    imageCount: 1,
                    textCharacters: text.length,
                  },
                },
                'Google Vision OCR completed',
              );
              return text;
            }),
        ),
        new ImportProcessor(dbPool, registry, blobs, importAi, events, options.importWorkflow),
      ],
      (error, operation, processor) => {
        const reason = getFailureReason(error);
        app.log.error(
          { event: 'job_runner_failed', operation, processor, reason },
          'Background runner failed',
        );
        captureBackgroundFailure(error, operation, reason);
      },
      jobLeaseDb.jobLease(dbPool, () => {
        // Stop immediately: another instance may recover jobs after this session loses its lock.
        app.log.fatal(
          { event: 'job_runner_failed', operation: 'lease_lost' },
          'Background runner lost its database session',
        );
        process.exit(1);
      }),
    );
    const sse = new ServerSentEvents();
    app.addHook('preClose', async () => sse.close());
    app.addHook('onReady', () => runner.start());
    app.addHook('preClose', () => runner.stop());

    // This child scope applies authentication to its routes while public routes remain at the root.
    await app.register(async function authenticatedRoutes(authenticatedApi) {
      await authenticatedApi.register(auth, {
        db: dbPool,
        verify: options.verifyIdentity ?? logtoVerifier(),
      });
      await authenticatedApi.register(multipart, {
        limits: { fileSize: getEnv('MAX_UPLOAD_BYTES'), files: 1, fields: 0 },
      });

      await authenticatedApi.register(routes.profileRoutes, { db: dbPool });
      await authenticatedApi.register(routes.sampleRoutes, {
        pool: dbPool,
        registry,
        events,
      });
      await authenticatedApi.register(routes.importRoutes, {
        pool: dbPool,
        registry,
        runner,
        events,
        enabled: !!importAi,
        sse,
      });
      await authenticatedApi.register(routes.registryRoutes, { db: dbPool, registry });
      await authenticatedApi.register(routes.thingRoutes, { db: dbPool, registry, events });
      await authenticatedApi.register(routes.tagRoutes, { db: dbPool, events });
      await authenticatedApi.register(routes.attachmentRoutes, {
        db: dbPool,
        blobs,
        events,
        runner,
        importEnabled: !!importAi,
      });
      await authenticatedApi.register(routes.activityRoutes, { db: dbPool, events });
      await authenticatedApi.register(taskRoutes, { db: dbPool, events, registry, taskScheduler });
      await authenticatedApi.register(routes.purchasableRoutes, { db: dbPool });
      await authenticatedApi.register(routes.conversationRoutes, {
        db: dbPool,
        runner,
        assistant,
        events,
        enabled: !!chatAi,
        sse,
      });
    });
    await app.register(web);

    return app;
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}
