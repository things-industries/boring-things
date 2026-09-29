import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
export async function buildApp(
  options: {
    config?: Config;
    pool?: pg.Pool;
    blobs?: BlobStorage;
    verifyIdentity?: VerifyIdentity;
    logger?: boolean;
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
  if (!options.pool) app.addHook('onClose', () => pool.end());
  installContracts(app);
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { code?: string; statusCode?: number; validation?: unknown };
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
  }));
  const registry = await loadRegistry(pool);
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
    registryRoutes(api, pool, registry);
    thingRoutes(api, pool, registry);
    tagRoutes(api, pool);
    attachmentRoutes(api, pool, options.blobs ?? new LocalBlobs(config.blobDirectory), config);
    activityRoutes(api, pool);
    conversationRoutes(api, pool);
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
