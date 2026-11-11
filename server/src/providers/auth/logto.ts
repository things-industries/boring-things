/**
 * Verifies Logto access tokens against the configured issuer, audience and remote signing keys.
 */

import { getEnv } from '../../config.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApplicationError, ensure } from '../../application/errors.js';

export interface Identity {
  subject: string;
  name?: string;
}

export type VerifyIdentity = (token: string) => Promise<Identity>;

export function logtoVerifier(): VerifyIdentity {
  if (!getEnv('LOGTO_ENDPOINT') || !getEnv('LOGTO_APP_ID'))
    return async () => {
      throw new ApplicationError('UNAVAILABLE', 'Authentication is not configured');
    };

  const issuer = getEnv('LOGTO_ENDPOINT').replace(/\/$/, '') + '/oidc';
  const jwks = createRemoteJWKSet(new URL(issuer + '/jwks'));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: getEnv('LOGTO_API_RESOURCE'),
    });
    ensure(payload.sub, 'Invalid access token', 'UNAUTHENTICATED');
    return {
      subject: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  };
}
