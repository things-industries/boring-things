/**
 * Assembles Fastify dependencies, contracts, authentication, routes and background workers; serves
 * the built frontend when available.
 */

import {
  registryRoutes,
  thingRoutes,
  tagRoutes,
  attachmentRoutes,
  activityRoutes,
  conversationRoutes,
  importRoutes,
  profileRoutes,
  configRoutes,
  sampleRoutes,
  installErrorHandler,
  createStreams,
} from './routes/index.js';
import { installWeb } from './plugins/web.js';
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
import { installAuth, logtoVerifier, type VerifyIdentity } from './plugins/auth.js';
import { loadRegistry } from './application/registry/index.js';
import { LocalBlobs, type BlobStorage } from './providers/blobs.js';
import { Assistant } from './application/conversations/assistant.js';
import { OpenAiChat } from './providers/chat.js';
import type { ChatAi } from './application/conversations/types.js';
import { OpenAiImports } from './providers/ai.js';
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

    configRoutes(app, {
      logtoEndpoint: config.logtoEndpoint,
      logtoAppId: config.logtoAppId,
      apiResource: config.apiResource,
      maxUploadBytes: config.maxUploadBytes,
      supportedMediaTypes: config.supportedMediaTypes,
      sampleDataEnabled: config.sampleDataEnabled,
      chatEnabled: !!(options.chatAi || (config.openaiApiKey && config.openaiModel)),
      importEnabled: !!(options.importAi || (config.openaiApiKey && config.openaiModel)),
    });

    // Registry definitions are cached at startup; restart the server after changing seeded metadata.
    const registry = await loadRegistry(pool);
    const blobs = options.blobs ?? new LocalBlobs(config.blobDirectory);
    const ai =
      options.importAi ??
      (config.openaiApiKey && config.openaiModel
        ? new OpenAiImports(
            config.openaiApiKey,
            config.openaiModel,
            config.aiMaxOutputTokens,
            config.discoverySearchCalls,
          )
        : undefined);

    const changes = new OwnerChanges();
    const chatAi =
      options.chatAi ??
      (config.openaiApiKey && config.openaiModel
        ? new OpenAiChat(
            config.openaiApiKey,
            config.openaiModel,
            config.aiMaxOutputTokens,
            config.chatToolCalls,
          )
        : undefined);

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
      installAuth(api, pool, options.verifyIdentity ?? logtoVerifier(config));
      await api.register(multipart, {
        limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0 },
      });

      profileRoutes(api, pool);
      sampleRoutes(api, pool, registry, config.sampleDataEnabled, changes);
      importRoutes(api, pool, registry, runner, changes, !!ai, streams);
      registryRoutes(api, pool, registry);
      thingRoutes(api, pool, registry, changes);
      tagRoutes(api, pool, changes);
      attachmentRoutes(api, pool, blobs, config, changes);
      activityRoutes(api, pool, changes);
      conversationRoutes(api, pool, runner, assistant, changes, !!chatAi, streams);
    });
    await installWeb(app);

    return app;
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}
