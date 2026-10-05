/**
 * Assembles Fastify dependencies, contracts, authentication, routes and background workers; serves
 * the built frontend when available.
 */

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
import { readConfig, type EnvConfig } from './config.js';
import { schemas, createValidatorCompiler } from './contracts/schemas.js';
import auth from './plugins/auth.js';
import { logtoVerifier, type VerifyIdentity } from './providers/auth/logto.js';
import { loadRegistry } from './application/registry/index.js';
import { createBlobs, type BlobStorage } from './providers/blobs/index.js';
import { Assistant } from './application/conversations/assistant.js';
import { createAi } from './providers/ai/index.js';
import type { ChatAi } from './application/conversations/types.js';
import type { ImportAi } from './application/import/types.js';
import { JobRunner } from './application/jobs/runner.js';
import { ApplicationEvents } from './application/events.js';

// Allow overriding of dependencies for testing
export interface BuildAppOptions {
  config?: EnvConfig;
  dbPool?: pg.Pool;
  blobs?: BlobStorage;
  verifyIdentity?: VerifyIdentity;
  logger?: boolean;
  importAi?: ImportAi;
  chatAi?: ChatAi;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? readConfig();

  const dbPool = options.dbPool ?? database.createPool(config.databaseUrl);
  const app = Fastify({
    logger: options.logger ? loggerOptions(config) : false,
    logController: new RequestLogController(),
    bodyLimit: 1048576,
  });

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

    const { importAi, chatAi } = createAi(config, options, (usage) =>
      app.log.info(
        { ...usage, totalTokens: usage.inputTokens + usage.outputTokens },
        'AI turn completed',
      ),
    );
    await app.register(routes.configRoutes, {
      config: {
        logtoEndpoint: config.logtoEndpoint,
        logtoAppId: config.logtoAppId,
        apiResource: config.apiResource,
        maxUploadBytes: config.maxUploadBytes,
        supportedMediaTypes: config.supportedMediaTypes,
        sampleDataEnabled: config.sampleDataEnabled,
        chatEnabled: !!chatAi,
        importEnabled: !!importAi,
      },
    });

    // Registry definitions are cached at startup; restart the server after changing seeded metadata.
    const registry = await loadRegistry(dbPool);
    const blobs = options.blobs ?? createBlobs(config);
    if (!options.blobs) app.addHook('onClose', async () => blobs.close?.());
    const events = new ApplicationEvents();

    const assistant = new Assistant(dbPool, registry, blobs, chatAi, config, events, (failure) =>
      app.log.error(failure, 'Assistant response failed'),
    );
    const runner = new JobRunner(
      [assistant, new ImportProcessor(dbPool, registry, blobs, importAi, config, events)],
      () => app.log.error({ code: 'job_runner_failed' }, 'Background work failed'),
      jobLeaseDb.jobLease(dbPool, () => {
        // Stop immediately: another instance may recover jobs after this session loses its lock.
        app.log.fatal({ code: 'job_lock_lost' }, 'Background runner lost its database session');
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
        verify: options.verifyIdentity ?? logtoVerifier(config),
      });
      await authenticatedApi.register(multipart, {
        limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0 },
      });

      await authenticatedApi.register(routes.profileRoutes, { db: dbPool });
      await authenticatedApi.register(routes.sampleRoutes, {
        pool: dbPool,
        registry,
        enabled: config.sampleDataEnabled,
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
        config,
        events,
      });
      await authenticatedApi.register(routes.activityRoutes, { db: dbPool, events });
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
