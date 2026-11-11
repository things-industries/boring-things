/**
 * Shared e2e settings: the test server address, the signed-in browser state it writes and viewports.
 */

import { getEnv } from '../server/src/config.js';

export const e2ePort = getEnv('E2E_PORT');
export const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
export const storageStatePath = 'test-results/e2e/storage-state.json';

export const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1100 },
};
