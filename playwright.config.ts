import { defineConfig } from '@playwright/test';
import { e2eBaseUrl, storageStatePath, viewports } from './e2e/state.js';
import { chromiumExecutable } from './server/test/support/chromium.js';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e/results',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: e2eBaseUrl,
    storageState: storageStatePath,
    screenshot: { mode: 'on', fullPage: true },
    trace: 'retain-on-failure',
    // Cloud sessions intercept external requests such as web fonts with their own certificate.
    ignoreHTTPSErrors: true,
    launchOptions: { executablePath: chromiumExecutable() },
  },
  projects: [
    { name: 'mobile', use: { viewport: viewports.mobile } },
    { name: 'desktop', use: { viewport: viewports.desktop } },
  ],
  webServer: {
    command: 'node --import tsx scripts/e2e-serve.ts',
    url: e2eBaseUrl + '/health',
    reuseExistingServer: true,
    timeout: 120000,
    stdout: 'pipe',
  },
});
