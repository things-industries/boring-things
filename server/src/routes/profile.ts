import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import { profile } from '../db/users.js';
import { route } from '../contracts/routes.js';

export function profileRoutes(app: FastifyInstance, db: Database) {
  route(app, 'GET', '/api/profile', (req) => profile(db, req.ownerId));
}
