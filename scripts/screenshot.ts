/**
 * Screenshots pages of the running e2e app (pnpm e2e:serve) in a signed-in headless browser and
 * reports page errors, failed requests and horizontal overflow.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import { e2eBaseUrl, storageStatePath, viewports } from '../e2e/state.js';
import { launchBrowser } from '../server/test/support/chromium.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'signed-out': { type: 'boolean', default: false },
    viewport: { type: 'string', default: 'both' },
    out: { type: 'string', default: 'test-results/screenshots' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: pnpm screenshot [options] [route ...]

Start the app first with pnpm e2e:serve. Routes are app paths such as / or /things/new.
Defaults to /, /things/new and /chat.

Options:
  --signed-out         Open the routes without a session (shows the sign-in page)
  --viewport <name>    mobile, desktop or both (default both)
  --out <directory>    Screenshot directory (default test-results/screenshots)`);
  process.exit(0);
}

const selected =
  values.viewport === 'both'
    ? (['mobile', 'desktop'] as const)
    : values.viewport === 'mobile' || values.viewport === 'desktop'
      ? ([values.viewport] as const)
      : null;
if (!selected) throw new Error('--viewport must be mobile, desktop or both');

const healthy = await fetch(e2eBaseUrl + '/health').then(
  (response) => response.ok,
  () => false,
);
if (!healthy) {
  console.error(
    `No app at ${e2eBaseUrl}. Start it with pnpm e2e:serve (run it in the background).`,
  );
  process.exit(1);
}
const storageState = JSON.parse(await readFile(storageStatePath, 'utf8'));
const routes = positionals.length ? positionals : ['/', '/things/new', '/chat'];

await mkdir(values.out, { recursive: true });
const browser = await launchBrowser();
let failed = false;
try {
  const context = await browser.newContext({
    storageState: values['signed-out'] ? undefined : storageState,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push('page error: ' + error.message));
  page.on('console', (message) => {
    // External resources such as web fonts may be unreachable in sandboxed sessions.
    const source = message.location().url;
    if (source && !source.startsWith(e2eBaseUrl)) return;
    if (message.type() === 'error') problems.push('console error: ' + message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      problems.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });

  for (const route of routes) {
    const url = new URL(route, e2eBaseUrl).toString();
    for (const name of selected) {
      problems.length = 0;
      await page.setViewportSize(viewports[name]);
      await page.goto(url);
      await settle(page);
      const path = new URL(page.url()).pathname;
      const slug = (
        new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
      ).slice(0, 60);
      const file = `${values.out}/${slug}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
        problems.push('horizontal overflow');
      failed ||= problems.length > 0;
      console.log(`${file}  ${await page.title()}  ${path}`);
      for (const problem of problems) console.log('  ! ' + problem);
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;

async function settle(page: Page) {
  await page.waitForLoadState('load');
  // Wait for loading skeletons and busy regions to clear; streamed pages never reach network idle.
  await page
    .waitForFunction(
      () =>
        !document.querySelector('[aria-busy="true"]') &&
        !Array.from(document.querySelectorAll('*')).some((el) => /skeleton/i.test(el.tagName)),
      undefined,
      { timeout: 10000 },
    )
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
