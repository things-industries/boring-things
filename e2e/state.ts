/**
 * Shared e2e settings: the test server address, the signed-in browser state it writes, viewports and
 * the Chromium executable.
 */

import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

export const e2ePort = Number(process.env.E2E_PORT ?? 4300);
export const e2eBaseUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
export const storageStatePath = 'test-results/e2e/storage-state.json';

export const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1100 },
};

// Cloud sessions ship a preinstalled Chromium that may not match the Playwright revision.
const preinstalledChromium = '/opt/pw-browsers/chromium';

export function chromiumExecutable() {
  return (
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
    (!existsSync(chromium.executablePath()) && existsSync(preinstalledChromium)
      ? preinstalledChromium
      : undefined)
  );
}
