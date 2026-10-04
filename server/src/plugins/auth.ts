/**
 * Applies authentication, owner mapping and private response caching to the registering Fastify scope.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ApplicationError, ensure } from '../application/errors.js';
import type { Database } from '../db/connection.js';
import * as usersDb from '../db/entities/users.js';
import type { Identity, VerifyIdentity } from '../providers/auth/logto.js';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId: string;
  }
}

interface Options {
  db: Database;
  verify: VerifyIdentity;
}

const auth: FastifyPluginAsync<Options> = async (app, { db, verify }) => {
  app.decorateRequest('ownerId', '');
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const auth = request.headers.authorization;
    ensure(auth && auth.startsWith('Bearer '), 'Sign in required', 'UNAUTHENTICATED');
    let identity: Identity;

    try {
      identity = await verify(auth.slice(7));
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('UNAUTHENTICATED', 'Invalid or expired access token');
    }

    request.ownerId = await usersDb.getOrCreateOwnerForSubject(db, identity.subject, identity.name);
  });
};

// Share these hooks with sibling route plugins inside the authenticated API scope.
export default fp(auth, { name: 'auth' });
