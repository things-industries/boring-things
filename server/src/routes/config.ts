/** Returns public runtime settings and available application capabilities. */

import type { FastifyPluginAsync } from 'fastify';
import { getEnv } from '../config.js';
import { supportedMediaTypes } from '../application/attachments.js';
import { route } from '../contracts/routes.js';

interface Options {
  chatEnabled: boolean;
  importEnabled: boolean;
}

const configRoutes: FastifyPluginAsync<Options> = async (app, { chatEnabled, importEnabled }) => {
  const dsn = getEnv('SENTRY_FRONTEND_DSN', { optional: true });
  route(app, 'GET', '/api/config', async () => ({
    logtoEndpoint: getEnv('LOGTO_ENDPOINT'),
    logtoAppId: getEnv('LOGTO_APP_ID'),
    apiResource: getEnv('LOGTO_API_RESOURCE'),
    maxUploadBytes: getEnv('MAX_UPLOAD_BYTES'),
    supportedMediaTypes,
    sampleDataEnabled: getEnv('ENABLE_SAMPLE_DATA'),
    chatEnabled,
    importEnabled,
    ...(dsn && {
      sentry: {
        dsn,
        environment: getEnv('NODE_ENV'),
        release: getEnv('RENDER_GIT_COMMIT', { optional: true }),
      },
    }),
  }));
};

export default configRoutes;
