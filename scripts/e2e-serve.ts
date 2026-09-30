/**
 * Serves the built application for e2e tests and screenshots on a fixed port, backed by a temporary
 * database with sample data and fixture AI providers, and writes a signed-in browser storage state.
 */

import { e2ePort, storageStatePath } from '../e2e/state.js';
import { startTestApp } from '../server/test/support/test-app.js';

const env = await startTestApp({ samples: true, port: e2ePort, storageStatePath });
console.log(`E2E app ready at ${env.base}`);
console.log(`Signed-in storage state: ${storageStatePath}`);
await new Promise((resolve) => {
  process.once('SIGINT', resolve);
  process.once('SIGTERM', resolve);
});
await env.close();
