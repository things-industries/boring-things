/** Checks signed test tokens through the production Logto verifier. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair } from 'jose';
import { createTestApp } from '../support/test-app.js';

test('API authentication verifies token claims and the issuer signing key', async (t) => {
  const env = await createTestApp();
  t.after(env.close);
  const { privateKey } = await generateKeyPair('RS256');
  for (const [claim, token] of [
    ['audience', await env.signToken({ audience: 'wrong' })],
    ['expiry', await env.signToken({ expiresIn: '-1m' })],
    ['issuer', await env.signToken({ issuer: 'wrong' })],
    ['signature', await env.signToken({ key: privateKey })],
  ]) {
    const response = await env.app.inject({
      url: '/api/profile',
      headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(response.statusCode, 401, claim);
  }
  const valid = await env.app.inject({
    url: '/api/profile',
    headers: { authorization: env.authorization },
  });
  assert.equal(valid.statusCode, 200, valid.body);
});
