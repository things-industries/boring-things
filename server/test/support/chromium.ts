/**
 * Chromium for Playwright: the bundled browser when installed, otherwise the preinstalled one in
 * cloud sessions, whose revision may not match Playwright's. PLAYWRIGHT_CHROMIUM_EXECUTABLE overrides
 * both.
 */

import { getEnv } from '../../src/config.js';
import { existsSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';

const preinstalledChromium = '/opt/pw-browsers/chromium';

export function chromiumExecutable() {
  return (
    getEnv('PLAYWRIGHT_CHROMIUM_EXECUTABLE', { optional: true }) ??
    (!existsSync(chromium.executablePath()) && existsSync(preinstalledChromium)
      ? preinstalledChromium
      : undefined)
  );
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumExecutable() });
}
