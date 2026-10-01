/**
 * Assembles Fastify dependencies, contracts, authentication, routes and background workers; serves
 * the built frontend when available.
 */

import * as routes from './routes/index.js';
import { installErrorHandler } from './routes/errors.js';
import { createStreams } from './routes/stream.js';
import web from './plugins/web.js';
import { ImportProcessor } from './application/import/processor.js';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type pg from 'pg';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db/connection.js';
import { readConfig, type Config } from './config.js';
import { installContracts } from './contracts/routes.js';
import auth from './plugins/auth.js';
import { logtoVerifier, type VerifyIdentity } from './providers/auth/logto.js';
import { loadRegistry } from './application/registry/index.js';
import { createBlobs, type BlobStorage } from './providers/blobs/index.js';
import { Assistant } from './application/conversations/assistant.js';
import { createAi } from './providers/ai/index.js';
import type { ChatAi } from './application/conversations/types.js';
import type { ImportAi } from './application/import/types.js';
import { JobRunner } from './application/jobs/runner.js';
import { OwnerChanges } from './application/streams.js';

export interface BuildAppOptions {
  config?: Config;
  pool?: pg.Pool;
  blobs?: BlobStorage;
  verifyIdentity?: VerifyIdentity;
  logger?: boolean;
  importAi?: ImportAi;
  chatAi?: ChatAi;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? readConfig();
  const pool = options.pool ?? createPool(config.databaseUrl);
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
    bodyLimit: 1048576,
  });

  // Only pools created here belong to the app; callers manage the lifetime of injected pools.
  if (!options.pool) app.addHook('onClose', () => pool.end());
  try {
    installContracts(app);
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
      await pool.query('select 1');
      return { status: 'ok' };
    });

    const { importAi: ai, chatAi } = createAi(config, options);
    await app.register(routes.configRoutes, {
      config: {
        logtoEndpoint: config.logtoEndpoint,
        logtoAppId: config.logtoAppId,
        apiResource: config.apiResource,
        maxUploadBytes: config.maxUploadBytes,
        supportedMediaTypes: config.supportedMediaTypes,
        sampleDataEnabled: config.sampleDataEnabled,
        chatEnabled: !!chatAi,
        importEnabled: !!ai,
      },
    });

    // Registry definitions are cached at startup; restart the server after changing seeded metadata.
    const registry = await loadRegistry(pool);
    const blobs = options.blobs ?? createBlobs(config.blobDirectory);
    const changes = new OwnerChanges();

    const assistant = new Assistant(pool, registry, blobs, chatAi, ai, config, changes);
    const runner = new JobRunner(
      [assistant, new ImportProcessor(pool, registry, blobs, ai, config, changes)],
      () => app.log.error({ code: 'job_runner_failed' }, 'Background work failed'),
    );
    const streams = createStreams(app);
    app.addHook('onReady', () => runner.start());
    app.addHook('preClose', () => runner.stop());
    // Authentication applies to this scope; health, client configuration and API documentation remain public.
    await app.register(async (api) => {
      await api.register(auth, {
        db: pool,
        verify: options.verifyIdentity ?? logtoVerifier(config),
      });
      await api.register(multipart, {
        limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0 },
      });

      await api.register(routes.profileRoutes, { db: pool });
      await api.register(routes.sampleRoutes, {
        pool,
        registry,
        enabled: config.sampleDataEnabled,
        changes,
      });
      await api.register(routes.importRoutes, {
        pool,
        registry,
        runner,
        changes,
        enabled: !!ai,
        streams,
      });
      await api.register(routes.registryRoutes, { db: pool, registry });
      await api.register(routes.thingRoutes, { db: pool, registry, changes });
      await api.register(routes.tagRoutes, { db: pool, changes });
      await api.register(routes.attachmentRoutes, { db: pool, blobs, config, changes });
      await api.register(routes.activityRoutes, { db: pool, changes });
      await api.register(routes.conversationRoutes, {
        db: pool,
        runner,
        assistant,
        changes,
        enabled: !!chatAi,
        streams,
      });
    });
    await app.register(web);

    return app;
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}
