import { buildApp } from './app.js';
import { readConfig } from './config.js';
const config = readConfig();
const app = await buildApp({ config, logger: true });
await app.listen({ port: config.port, host: config.host });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close();
  });
