/**
 * Verifies Logto access tokens, maps authenticated subjects to local owners and disables caching
 * for authenticated responses.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { ApplicationError, ensure } from '../application/errors.js';
import type { Database } from '../db/connection.js';
import { ownerForSubject } from '../db/users.js';

export interface Identity {
  subject: string;
  name?: string;
}

export type VerifyIdentity = (token: string) => Promise<Identity>;

declare module 'fastify' {
  interface FastifyRequest {
    ownerId: string;
  }
}

export function logtoVerifier(config: Config): VerifyIdentity {
  if (!config.logtoEndpoint || !config.logtoAppId)
    return async () => {
      throw new ApplicationError('UNAVAILABLE', 'Authentication is not configured');
    };

  const issuer = config.logtoEndpoint.replace(/\/$/, '') + '/oidc';
  const jwks = createRemoteJWKSet(new URL(issuer + '/jwks'));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: config.apiResource,
    });
    ensure(payload.sub, 'Invalid access token', 'UNAUTHENTICATED');
    return {
      subject: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  };
}

export function installAuth(app: FastifyInstance, db: Database, verify: VerifyIdentity) {
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

    request.ownerId = await ownerForSubject(db, identity.subject, identity.name);
  });
}
