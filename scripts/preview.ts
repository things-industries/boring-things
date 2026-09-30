/**
 * Screenshots application pages in a signed-in headless browser against an isolated temporary
 * database, so changes can be previewed without Logto, AI credentials or existing local data.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import { startBrowserApp, viewports } from '../server/test/support/browser-app.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'boolean', default: false },
    'signed-out': { type: 'boolean', default: false },
    viewport: { type: 'string', default: 'both' },
    out: { type: 'string', default: 'test-results/preview' },
    hold: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: pnpm preview [options] [route ...]

Routes are app paths such as / or /things/new. thing:<name> opens the Thing with that name
(case-insensitive prefix), for example thing:kitchen with --samples. Defaults to /, /things/new
and /chat, plus thing:<first sample> with --samples.

Options:
  --samples            Add the labelled sample Things and activity first
  --signed-out         Open the routes without a session (shows the sign-in page)
  --viewport <name>    mobile, desktop or both (default both)
  --out <directory>    Screenshot directory (default test-results/preview)
  --hold               Keep the app running and save a signed-in storage state for ad-hoc scripts`);
  process.exit(0);
}

const selected =
  values.viewport === 'both'
    ? (['mobile', 'desktop'] as const)
    : values.viewport === 'mobile' || values.viewport === 'desktop'
      ? ([values.viewport] as const)
      : null;
if (!selected) throw new Error('--viewport must be mobile, desktop or both');

const env = await startBrowserApp({ samples: values.samples });
let failed = false;
try {
  const things = (
    await env.pool.query<{ id: string; name: string }>(
      'select id,name from bt.things order by created_at, name',
    )
  ).rows;
  if (things.length) {
    console.log('Things:');
    for (const thing of things) console.log(`  /things/${thing.id}  ${thing.name}`);
  }
  const routes = positionals.length
    ? positionals
    : ['/', '/things/new', '/chat', ...(things[0] ? ['/things/' + things[0].id] : [])];
  const resolve = (route: string) => {
    if (!route.startsWith('thing:')) return route.startsWith('/') ? route : '/' + route;
    const name = route.slice('thing:'.length).toLowerCase();
    const thing = things.find((t) => t.name.toLowerCase().startsWith(name));
    if (!thing) throw new Error(`No Thing named ${name}; add --samples or check the list above`);
    return '/things/' + thing.id;
  };

  await mkdir(values.out, { recursive: true });
  const context = await env.newContext(!values['signed-out']);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push('page error: ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push('console error: ' + message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      problems.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });

  for (const route of routes) {
    const path = resolve(route);
    for (const name of selected) {
      problems.length = 0;
      await page.setViewportSize(viewports[name]);
      await page.goto(env.base + path);
      await settle(page);
      const slug = (path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').slice(0, 60);
      const file = `${values.out}/${slug}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow) problems.push('horizontal overflow');
      failed ||= problems.length > 0;
      console.log(`${file}  ${await page.title()}  ${new URL(page.url()).pathname}`);
      for (const problem of problems) console.log('  ! ' + problem);
    }
  }

  if (values.hold) {
    await page.goto(env.base);
    const state = `${values.out}/storage-state.json`;
    await writeFile(state, JSON.stringify(await context.storageState(), null, 2));
    console.log(`
App running at ${env.base}
Signed-in storage state: ${state}
Use it from a script with browser.newContext({ storageState: '${state}' }).
Stop with Ctrl+C.`);
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  }
} finally {
  await env.close();
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
