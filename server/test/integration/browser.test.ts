import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readdir, readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { FixtureChat } from '../fixtures/chat.js';
import { FixtureAi } from '../fixtures/imports.js';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { createPool, transaction } from '../../src/db/connection.js';
import { seedRegistry } from '../../src/db/registry-seed.js';

test(
  'browser manual creation, AI import, attachment extraction and JWT verification',
  { timeout: 90000 },
  async () => {
    const url = new URL(
      process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    );
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    const dbName = 'bt_browser_' + randomUUID().replaceAll('-', '');
    const admin = createPool(url.toString());
    await admin.query(`create database ${dbName}`);
    url.pathname = '/' + dbName;
    const pool = createPool(url.toString());
    const directory = await mkdtemp(tmpdir() + '/boring-browser-');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key' };
    const jwks = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/oidc/jwks') res.end(JSON.stringify({ keys: [jwk] }));
      else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    jwks.listen(0, '127.0.0.1');
    await once(jwks, 'listening');
    const issuer = 'http://127.0.0.1:' + (jwks.address() as { port: number }).port;
    const config = {
      ...readConfig(),
      logtoEndpoint: issuer,
      logtoAppId: 'browser-test',
      blobDirectory: directory,
      sampleDataEnabled: true,
    };
    const token = (
      aud = config.apiResource,
      exp = '5m',
      iss = issuer + '/oidc',
      key = privateKey,
    ) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject('browser-alice')
        .setAudience(aud)
        .setIssuer(iss)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(key);
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      const migrations = new URL('../../../supabase/migrations/', import.meta.url);
      for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
        await pool.query(await readFile(new URL(file, migrations), 'utf8'));
      }
      await transaction(pool, seedRegistry);
      const importAi = new FixtureAi();
      app = await buildApp({ pool, config, importAi, chatAi: new FixtureChat() });
      const base = await app.listen({ host: '127.0.0.1', port: 0 });
      const accessToken = await token();
      assert.equal(
        (
          await app.inject({
            url: '/api/profile',
            headers: { authorization: 'Bearer ' + accessToken },
          })
        ).statusCode,
        200,
      );
      const other = await generateKeyPair('RS256');
      for (const invalid of [
        await token('wrong'),
        await token(config.apiResource, '-1m'),
        await token(config.apiResource, '5m', 'wrong'),
        await token(config.apiResource, '5m', issuer + '/oidc', other.privateKey),
      ])
        assert.equal(
          (
            await app.inject({
              url: '/api/profile',
              headers: { authorization: 'Bearer ' + invalid },
            })
          ).statusCode,
          401,
        );
      browser = await chromium.launch();
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      // Seed a session only in this test browser; the API still validates the signed access token through JWKS.
      await context.addInitScript(
        ({ accessToken, resource }) => {
          localStorage.setItem('logto:browser-test:idToken', 'test-session');
          localStorage.setItem(
            'logto:browser-test:accessToken',
            JSON.stringify({
              ['@' + resource]: {
                token: accessToken,
                scope: '',
                expiresAt: Date.now() / 1000 + 300,
              },
            }),
          );
        },
        { accessToken, resource: config.apiResource },
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await expect(page.getByRole('heading', { name: 'Your things', exact: true })).toBeVisible();
      await expect(page.locator('bt-dashboard-skeleton')).toHaveCount(0);
      const sampleResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/profile:seed-samples'),
      );
      await page.getByRole('button', { name: 'Add sample data' }).click();
      const seeded = await sampleResponse;
      assert.equal(seeded.status(), 200, await seeded.text());
      await expect(page.getByRole('heading', { name: 'Kitchen hob', exact: true })).toBeVisible();
      const vehicleArt = page.locator('.thing-art[data-category="vehicles"]');
      const applianceArt = page.locator('.thing-art[data-category="appliances"]');
      assert.notEqual(
        await vehicleArt.evaluate((element) => getComputedStyle(element).backgroundColor),
        await applianceArt.evaluate((element) => getComputedStyle(element).backgroundColor),
      );
      await mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
      await page.getByRole('heading', { name: 'Museum membership', exact: true }).click();
      const pin = page.locator('bt-field').filter({ hasText: 'Access PIN' });
      await expect(pin).toContainText('••••••••');
      await expect(pin).not.toContainText('0000');
      await pin.getByRole('button', { name: 'Reveal', exact: true }).click();
      await expect(pin).toContainText('0000');
      await pin.getByRole('button', { name: 'Hide', exact: true }).click();
      await expect(pin).not.toContainText('0000');
      await pin.getByRole('button', { name: 'Pin Access PIN', exact: true }).click();
      await expect(page.locator('.pinned-summary')).toContainText('Access PIN');
      await expect(page.locator('.pinned-summary')).not.toContainText('0000');
      await page.screenshot({ path: 'test-results/membership.png', fullPage: true });
      await page.getByRole('link', { name: 'Ask about this thing' }).click();
      await expect(page.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible();
      await page.getByLabel('Message', { exact: true }).fill('Create a filter check');
      await page.getByLabel('Action', { exact: true }).selectOption('create_event');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Check the filter', exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('.message-text').filter({ hasText: 'The saved details are ready.' }),
      ).toHaveCount(1);
      await page.getByLabel('Schedule for').fill('2026-10-01T09:00');
      await page.getByRole('button', { name: 'Schedule', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();
      await page.screenshot({ path: 'test-results/chat-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
      );
      await page.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.getByRole('link', { name: 'Back to thing', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Check the filter', exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();

      await page.getByRole('link', { name: 'Your things', exact: true }).first().click();
      await page.getByRole('link', { name: 'Add a thing', exact: false }).click();
      await expect(
        page.getByRole('heading', { name: 'Import with AI', exact: true }),
      ).toBeVisible();
      for (const label of ['Take photo', 'Choose photo', 'Upload file']) {
        const button = page.getByRole('button', { name: label, exact: true });
        await expect(button).toBeVisible();
        await button.focus();
        const chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
        await chooser;
      }
      await expect(page.getByLabel('Paste text', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Enter details manually' })).toBeVisible();
      await page.screenshot({ path: 'test-results/add-thing-desktop.png', fullPage: true });
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser test policy');
      await page.getByLabel('Category', { exact: true }).selectOption('insurance');
      await page.getByLabel('Details to include').selectOption('insurance.combined');
      await page.getByRole('button', { name: 'Create thing', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Browser test policy', exact: true }),
      ).toBeVisible();
      const buildings = page
        .locator('section.panel')
        .filter({ has: page.getByRole('heading', { name: 'Buildings cover', exact: true }) });
      const sum = buildings.locator('bt-field').filter({ hasText: 'Sum insured' });
      await sum.getByRole('button', { name: 'Add', exact: true }).click();
      await sum.getByRole('textbox', { name: 'Sum insured', exact: true }).fill('1.234');
      await sum.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(sum.getByRole('alert')).toHaveText(
        'Use an amount with up to two decimal places.',
      );
      await sum.getByRole('textbox', { name: 'Sum insured', exact: true }).fill('500000');
      await sum.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(sum).toContainText('£500,000.00');
      const contents = page
        .locator('section.panel')
        .filter({ has: page.getByRole('heading', { name: 'Contents cover', exact: true }) });
      await expect(contents.locator('bt-field').filter({ hasText: 'Sum insured' })).toContainText(
        'Add a value',
      );
      await page.reload();
      await expect(sum).toContainText('£500,000.00');
      await page.getByLabel('Upload a file', { exact: false }).setInputFiles({
        name: 'policy.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('policy'),
      });
      await expect(page.getByRole('button', { name: 'policy.txt', exact: false })).toBeVisible();
      const downloadReady = page.waitForEvent('download');
      await page.getByRole('button', { name: 'policy.txt', exact: false }).click();
      const download = await downloadReady;
      assert.equal(download.suggestedFilename(), 'policy.txt');
      assert.equal(await readFile((await download.path())!, 'utf8'), 'policy');
      await expect(contents.locator('bt-field').filter({ hasText: 'Sum insured' })).toContainText(
        'Add a value',
      );
      let releaseImport!: () => void;
      importAi.pause = new Promise((resolve) => {
        releaseImport = resolve;
      });
      await page.getByRole('button', { name: 'Extract details', exact: true }).click();
      const progress = page.getByRole('progressbar', { name: 'AI import in progress' });
      await expect(progress).toBeVisible();
      assert.equal(await progress.getAttribute('aria-valuenow'), null);
      await expect(
        page.getByText('Adding details… Fields appear as they are ready.'),
      ).toBeVisible();
      assert.ok(
        (await progress.boundingBox())!.y <
          (await page
            .getByRole('heading', { name: 'Browser test policy', exact: true })
            .boundingBox())!.y,
      );
      assert.match(
        await progress.evaluate((el) => getComputedStyle(el, '::after').animationName),
        /import-progress$/,
      );
      await page.screenshot({ path: 'test-results/import-progress-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'test-results/import-progress-mobile.png', fullPage: true });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(
        await progress.evaluate((el) => getComputedStyle(el, '::after').animationName),
        'none',
      );
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setViewportSize({ width: 1440, height: 1100 });
      releaseImport();
      importAi.pause = undefined;
      await expect(
        page.getByText('Import complete. Review the details below.', { exact: true }),
      ).toBeVisible();
      await expect(progress).toHaveCount(0);
      await expect(sum).toContainText('£500,000.00');
      await expect(contents.locator('bt-field').filter({ hasText: 'Sum insured' })).toContainText(
        '£50,000.00',
      );
      await page.getByLabel('New tag', { exact: true }).fill('Paperwork');
      await page.locator('form.inline-form').getByRole('button').click();
      await expect(page.getByRole('button', { name: 'Paperwork', exact: true })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'test-results/thing-mobile.png', fullPage: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.getByRole('link', { name: 'Your things', exact: true }).first().click();
      await page.getByRole('link', { name: 'Add a thing', exact: false }).click();
      await page.screenshot({ path: 'test-results/add-thing-mobile.png', fullPage: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.getByLabel('Paste text', { exact: true }).fill('two');
      await page.getByRole('button', { name: 'Import text', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Which Things would you like to keep?' }),
      ).toBeVisible();
      await expect(progress).toHaveCount(0);
      await page.screenshot({ path: 'test-results/import-selection-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Keep selected Things', exact: true }).click();
      await expect(
        page.getByText('Import complete. Review the details below.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('bt-field').filter({ hasText: 'Serial number (Z-Nr)' }),
      ).toContainText('0015');
      await expect(
        page.locator('bt-field').filter({ hasText: 'Installer reference' }),
      ).toContainText('ABC-12');
      await expect(page.getByRole('link', { name: 'Open Thing 2', exact: true })).toBeVisible();
      await page.reload();
      await expect(
        page.locator('bt-field').filter({ hasText: 'Serial number (Z-Nr)' }),
      ).toContainText('0015');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: 'test-results/import-complete-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.screenshot({ path: 'test-results/import-complete-desktop.png', fullPage: true });
      assert.deepEqual(errors, []);
      const fresh = await browser.newContext();
      const signedOut = await fresh.newPage();
      await signedOut.goto(base);
      await expect(
        signedOut.getByRole('button', { name: 'Sign in or create an account', exact: false }),
      ).toBeVisible();
      await signedOut.screenshot({ path: 'test-results/login.png', fullPage: true });
      await fresh.close();
    } finally {
      await browser?.close();
      await app?.close();
      jwks.close();
      await pool.end();
      await admin.query(`drop database ${dbName}`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
