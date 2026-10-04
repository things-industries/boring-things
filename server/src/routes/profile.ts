import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../db/connection.js';
import * as usersDb from '../db/entities/users.js';
import { route } from '../contracts/routes.js';

interface Options {
  db: Database;
}

const profileRoutes: FastifyPluginAsync<Options> = async (app, { db }) => {
  route(app, 'GET', '/api/profile', (req) => usersDb.getOwnerProfile(db, req.ownerId));
};

export default profileRoutes;
