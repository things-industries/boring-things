import { buildApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const app = await buildApp({ config, logger: true });
try {
  await app.listen({ port: config.port, host: config.host });
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
