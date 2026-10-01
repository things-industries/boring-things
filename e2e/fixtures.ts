/**
 * Test fixture that fails a test when the app reports page or console errors, or the API returns a
 * server error.
 */

import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ pageProblems: string[] }>({
  pageProblems: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push('page error: ' + error.message));
      page.on('console', (message) => {
        // External resources such as web fonts may be unreachable in sandboxed sessions.
        const source = message.location().url;
        if (source && baseURL && !source.startsWith(baseURL)) return;
        if (message.type() === 'error') problems.push('console error: ' + message.text());
      });
      page.on('response', (response) => {
        if (response.status() >= 500)
          problems.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
      });
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
