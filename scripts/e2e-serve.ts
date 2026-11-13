/**
 * Serves the built application for e2e tests and screenshots on a fixed port, backed by a temporary
 * database with sample data and fixture AI providers, and writes a signed-in browser storage state.
 */

import { e2ePort, storageStatePath } from '../e2e/state.js';
import { getEnv } from '../server/src/config.js';
import { createTestApp, testAppId } from '../server/test/support/test-app.js';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

if (!existsSync('dist/web/browser/index.html'))
  throw new Error('Build the frontend first: CI=true pnpm build');

const env = await createTestApp({ samples: true });
try {
  const origin = `http://127.0.0.1:${e2ePort}`;
  const accessToken = JSON.stringify({
    ['@' + getEnv('LOGTO_API_RESOURCE')]: {
      token: env.accessToken,
      scope: '',
      expiresAt: env.expiresAt,
    },
  });
  await mkdir(dirname(storageStatePath), { recursive: true });
  await writeFile(
    storageStatePath,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: `logto:${testAppId}:idToken`, value: 'test-session' },
            { name: `logto:${testAppId}:accessToken`, value: accessToken },
          ],
        },
      ],
    }),
  );
  const base = await env.app.listen({ host: '127.0.0.1', port: e2ePort });
  console.log(`E2E app ready at ${base}`);
  console.log(`Signed-in storage state: ${storageStatePath}`);
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await env.close();
}
