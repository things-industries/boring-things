/** Server startup and shutdown, configures application services and telemetry. */

import { getEnv } from './config.js';
import { buildApp } from './app.js';
import * as metrics from './metrics.js';

metrics.initializeMetrics();
const app = await buildApp({ logger: true }).catch(async (error: unknown) => {
  await metrics.shutdownMetrics();
  throw error;
});
metrics.setDiagnosticLogger(app.log);
try {
  await app.listen({ port: getEnv('PORT'), host: getEnv('HOST') });
} catch (error) {
  await app.close().catch(() => {});
  throw error;
}

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    void app.close().catch(() => {
      app.log.error({ code: 'shutdown_failed' }, 'Shutdown failed');
      process.exitCode = 1;
    });
  });
