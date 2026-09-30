/**
 * Assembles Fastify dependencies, contracts, authentication, routes and background workers; serves
 * the built frontend when available.
 */

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type pg from 'pg';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db/connection.js';
import { readConfig, type Config } from './config.js';
import { installContracts, route } from './contracts/routes.js';
import { installAuth, logtoVerifier, type VerifyIdentity } from './plugins/auth.js';
import { loadRegistry } from './application/registry.js';
import { ensure, HttpError } from './application/errors.js';
import { profile, seedSamples } from './application/samples.js';
import { LocalBlobs, type BlobStorage } from './providers/blobs.js';
import { registryRoutes } from './routes/registry.js';
import { thingRoutes } from './routes/things.js';
import { tagRoutes } from './routes/tags.js';
import { attachmentRoutes } from './routes/attachments.js';
import { activityRoutes } from './routes/activity.js';
import { conversationRoutes } from './routes/conversations.js';
import { Assistant } from './application/conversations.js';
import { OpenAiChat } from './providers/chat.js';
import type { ChatAi } from './application/chat-types.js';
import { OpenAiImports } from './providers/ai.js';
import type { ImportAi } from './application/import-types.js';
import { ImportRunner } from './application/imports.js';
import { ThingChanges } from './application/streams.js';
import { importRoutes } from './routes/imports.js';

export async function buildApp(
  options: {
    config?: Config;
    pool?: pg.Pool;
    blobs?: BlobStorage;
    verifyIdentity?: VerifyIdentity;
    logger?: boolean;
    importAi?: ImportAi;
    chatAi?: ChatAi;
  } = {},
) {
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
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & {
      code?: string;
      statusCode?: number;
      validation?: unknown;
    };
    const status =
      e instanceof HttpError
        ? e.statusCode
        : e.validation
          ? 422
          : e.code === '23505'
            ? 409
            : e.code === '23503'
              ? 422
              : (e.statusCode ?? 500);

    const message =
      e instanceof HttpError
        ? e.message
        : e.validation
          ? 'Invalid request'
          : status === 409
            ? 'Record already exists'
            : status === 422
              ? 'Invalid reference'
              : status === 413
                ? 'File exceeds upload limit'
                : status === 415
                  ? 'Unsupported media type'
                  : status === 404
                    ? 'Not found'
                    : 'Request could not be completed';
    // Do not log database errors, request bodies or validation values: fields can contain secrets.
    if (status >= 500)
      req.log.error({ code: e.code ?? e.name, requestId: req.id }, 'Request failed');
    reply.code(status).send({ message, statusCode: status });
  });
  app.get('/health', async () => {
    await pool.query('select 1');
    return { status: 'ok' };
  });

  route(app, 'GET', '/api/config', async () => ({
    logtoEndpoint: config.logtoEndpoint,
    logtoAppId: config.logtoAppId,
    apiResource: config.apiResource,
    maxUploadBytes: config.maxUploadBytes,
    supportedMediaTypes: config.supportedMediaTypes,
    sampleDataEnabled: config.sampleDataEnabled,
    chatEnabled: !!(options.chatAi || (config.openaiApiKey && config.openaiModel)),
    importEnabled: !!(options.importAi || (config.openaiApiKey && config.openaiModel)),
  }));

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

  const changes = new ThingChanges();
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
  const runner = new ImportRunner(pool, registry, blobs, ai, config, changes, assistant);
  app.addHook('onReady', () => runner.start());
  app.addHook('preClose', () => runner.stop());
  // Authentication applies to this scope; health, client configuration and API documentation remain public.
  await app.register(async (api) => {
    installAuth(api, pool, options.verifyIdentity ?? logtoVerifier(config));
    await api.register(multipart, {
      limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0 },
    });

    route(api, 'GET', '/api/profile', (req) => profile(pool, req.ownerId));

    route(api, 'POST', '/api/profile:seed-samples', (req) => {
      ensure(config.sampleDataEnabled, 'Sample data is disabled', 404);
      return seedSamples(pool, req.ownerId, registry);
    });

    api.addHook('onResponse', async (req, reply) => {
      if (req.ownerId && req.method !== 'GET' && reply.statusCode < 400)
        changes.publish(req.ownerId);
    });
    importRoutes(api, pool, registry, runner, changes, !!ai);
    registryRoutes(api, pool, registry);
    thingRoutes(api, pool, registry);
    tagRoutes(api, pool);
    attachmentRoutes(api, pool, blobs, config);
    activityRoutes(api, pool);
    conversationRoutes(api, pool, runner, assistant, changes, !!chatAi);
  });
  const web = resolve('dist/web/browser');

  if (existsSync(web)) {
    await app.register(fastifyStatic, { root: web });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.method !== 'GET')
        return reply.code(404).send({ message: 'Not found', statusCode: 404 });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
