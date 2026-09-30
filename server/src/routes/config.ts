import type { FastifyInstance } from 'fastify';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';

export function configRoutes(app: FastifyInstance, config: Schema['Config']) {
  route(app, 'GET', '/api/config', async () => config);
}
