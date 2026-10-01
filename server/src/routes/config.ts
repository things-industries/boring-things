import type { FastifyPluginAsync } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';

interface Options {
  config: Schema['Config'];
}

const configRoutes: FastifyPluginAsync<Options> = async (app, { config }) => {
  route(app, 'GET', '/api/config', async () => config);
};

export default configRoutes;
