/**
 * Verifies Logto access tokens against the configured issuer, audience and remote signing keys.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Config } from '../../config.js';
import { ApplicationError, ensure } from '../../application/errors.js';

export interface Identity {
  subject: string;
  name?: string;
}

export type VerifyIdentity = (token: string) => Promise<Identity>;

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
