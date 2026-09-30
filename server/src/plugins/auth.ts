/**
 * Verifies Logto access tokens, maps authenticated subjects to local owners and disables caching
 * for authenticated responses.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { HttpError, ensure } from '../application/errors.js';
import { rows, type Database } from '../db/connection.js';

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
      throw new HttpError(503, 'Authentication is not configured');
    };

  const issuer = config.logtoEndpoint.replace(/\/$/, '') + '/oidc';
  const jwks = createRemoteJWKSet(new URL(issuer + '/jwks'));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: config.apiResource,
    });
    ensure(payload.sub, 'Invalid access token', 401);
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
    ensure(auth && auth.startsWith('Bearer '), 'Sign in required', 401);
    let identity: Identity;

    try {
      identity = await verify(auth.slice(7));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(401, 'Invalid or expired access token');
    }

    // Ownership comes only from the verified token subject; repeat sign-ins preserve the existing display name.
    const [user] = await rows<{ id: string }>(
      db,
      `insert into bt.users(auth_subject,display_name) values($1,$2) on conflict(auth_subject) do update set auth_subject=excluded.auth_subject returning id`,
      [identity.subject, identity.name ?? 'You'],
    );
    request.ownerId = user.id;
  });
}
