import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { generateKeyPair } from 'jose';
import { expect } from '@playwright/test';
import { launchBrowser } from '../support/chromium.js';
import { startTestApp } from '../support/test-app.js';

test(
  'browser manual creation, AI import, attachment extraction and JWT verification',
  { timeout: 90000 },
  async () => {
    const env = await startTestApp();
    const { app, pool, importAi, chatAi, issuer, signToken, accessToken, base } = env;
    let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
    try {
      chatAi.creation = 'create_event';
      const other = await generateKeyPair('RS256');
      for (const invalid of [
        await signToken({ audience: 'wrong' }),
        await signToken({ expiresIn: '-1m' }),
        await signToken({ issuer: 'wrong' }),
        await signToken({ issuer: issuer + '/oidc', key: other.privateKey }),
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
      browser = await launchBrowser();
      // A Logto session exists only in this test browser; the API still validates the signed access
      // token through JWKS.
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        storageState: env.storageState,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await expect(page.locator('bt-home-skeleton')).toHaveCount(0);
      const sampleResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/profile:seed-samples'),
      );
      await page.getByRole('button', { name: 'Add sample data' }).click();
      const seeded = await sampleResponse;
      assert.equal(seeded.status(), 200, await seeded.text());
      await expect(page.locator('bt-thing-row')).toHaveCount(3);
      await page.getByRole('link', { name: 'All Things', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Kitchen hob', exact: true })).toBeVisible();
      const vehicleArt = page.locator('.thing-art[data-category="vehicles"]');
      const applianceArt = page.locator('.thing-art[data-category="appliances"]');
      assert.notEqual(
        await vehicleArt.evaluate((element) => getComputedStyle(element).backgroundColor),
        await applianceArt.evaluate((element) => getComputedStyle(element).backgroundColor),
      );
      await mkdir('test-results', { recursive: true });
      await page.screenshot({
        path: 'test-results/dashboard.png',
        fullPage: true,
      });
      await page.getByRole('heading', { name: 'Museum membership', exact: true }).click();
      await expect(page).toHaveURL(/\/things\/[0-9a-f-]+$/);
      const membershipId = new URL(page.url()).pathname.split('/').at(-1)!;
      const accessCount = async () =>
        (await pool.query('select access_count from bt.things where id=$1', [membershipId])).rows[0]
          .access_count;
      await expect.poll(accessCount).toBe(1);
      await page.getByRole('link', { name: 'See all details', exact: true }).click();
      const pin = page.locator('bt-field').filter({ hasText: 'Access PIN' });
      await expect(pin).toContainText('••••••••');
      await expect(pin).not.toContainText('0000');
      await pin.getByRole('button', { name: 'Reveal', exact: true }).click();
      await expect(pin).toContainText('0000');
      await pin.getByRole('button', { name: 'Hide', exact: true }).click();
      await expect(pin).not.toContainText('0000');
      await pin.getByRole('button', { name: 'Pin Access PIN', exact: true }).click();
      await expect(
        pin.getByRole('button', { name: 'Unpin Access PIN', exact: true }),
      ).toBeVisible();
      assert.equal(await accessCount(), 1);
      await page.getByRole('link', { name: 'Back to thing', exact: true }).click();
      const pinnedPin = page.locator('bt-key-value-row').filter({ hasText: 'Access PIN' });
      await expect(pinnedPin).toContainText('••••••••');
      await expect(pinnedPin).not.toContainText('0000');
      await expect.poll(accessCount).toBe(2);
      await page.screenshot({
        path: 'test-results/membership.png',
        fullPage: true,
      });
      await page.getByRole('link', { name: 'Ask about this thing' }).click();
      await expect(page.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible();
      await expect(page.getByLabel('Action', { exact: true })).toHaveCount(0);
      chatAi.failOnce = true;
      await page.getByLabel('Message', { exact: true }).fill('Create a filter check');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('button', { name: 'Retry response', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Check the filter', exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('.message-text').filter({ hasText: 'The saved details are ready.' }),
      ).toHaveCount(1);
      assert.equal(
        (
          await pool.query('select count(*)::int as count from bt.events where thing_id=$1', [
            membershipId,
          ])
        ).rows[0].count,
        1,
      );
      await page.getByLabel('Schedule for').fill('2026-10-01T09:00');
      await page.getByRole('button', { name: 'Schedule', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();
      await page.screenshot({
        path: 'test-results/chat-desktop.png',
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
      );
      await page.screenshot({
        path: 'test-results/chat-mobile.png',
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.getByRole('link', { name: 'Back to thing', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Museum membership', level: 1 }),
      ).toBeVisible();
      // Chat writes bypass the stores until stage 7, so the Thing shows them after a reload.
      await page.reload();
      const filterTask = page.locator('bt-event-card').filter({ hasText: 'Check the filter' });
      await expect(
        filterTask.getByRole('button', { name: 'Mark complete: Check the filter', exact: true }),
      ).toBeVisible();
      await expect.poll(accessCount).toBe(4);
      const dateTask = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: 'Bearer ' + accessToken },
        payload: { thingId: membershipId, title: 'Date-only maintenance' },
      });
      assert.equal(dateTask.statusCode, 201, dateTask.body);
      const issue = await app.inject({
        method: 'POST',
        url: '/api/issues',
        headers: { authorization: 'Bearer ' + accessToken },
        payload: {
          thingId: membershipId,
          title: 'Renewal attention',
          statusText: 'Renewal due',
          dueDate: '2026-10-12',
        },
      });
      assert.equal(issue.statusCode, 201, issue.body);
      await page.reload();
      await page
        .getByRole('button', { name: 'Schedule: Date-only maintenance', exact: true })
        .click();
      await page.getByLabel('Date', { exact: true }).fill('2026-10-18');
      await page.getByRole('button', { name: 'Schedule', exact: true }).click();
      const taskCard = page.locator('bt-event-card').filter({ hasText: 'Date-only maintenance' });
      await expect(taskCard).toContainText('Due 18 Oct 2026');
      await expect(
        taskCard.getByRole('button', { name: 'Mark complete: Date-only maintenance' }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await app.inject({
                url: '/api/events/' + dateTask.json().id,
                headers: { authorization: 'Bearer ' + accessToken },
              })
            ).json().startsOn,
        )
        .toBe('2026-10-18');
      const savedDate = (
        await app.inject({
          url: '/api/events/' + dateTask.json().id,
          headers: { authorization: 'Bearer ' + accessToken },
        })
      ).json();
      assert.equal(savedDate.startsAt, null);
      assert.equal(await accessCount(), 5);
      const issueRow = page.locator('bt-list-row').filter({ hasText: 'Renewal attention' });
      await expect(issueRow).toContainText('Renewal due');
      await expect(issueRow).toContainText('12 Oct 2026');
      await expect(issueRow).toContainText(/day/);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: 'test-results/date-only-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1100 });

      await page.goto(base);
      await page.getByRole('link', { name: 'Add a thing', exact: false }).click();
      await expect(page.getByRole('heading', { name: 'Add a thing', exact: true })).toBeVisible();
      for (const label of ['Camera', 'Photos', 'Files']) {
        const button = page.getByRole('button', { name: label, exact: true });
        await expect(button).toBeVisible();
        await button.focus();
        const chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
        await chooser;
      }
      await expect(page.getByRole('link', { name: 'Text', exact: true })).toBeVisible();
      await page.screenshot({
        path: 'test-results/add-thing-desktop.png',
        fullPage: true,
      });
      await page.getByRole('link', { name: 'Enter details manually', exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser test policy');
      await page.getByLabel('Category', { exact: true }).selectOption('insurance');
      await page.getByLabel('Details to include').selectOption('insurance.combined');
      await page.getByRole('button', { name: 'Create thing', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Browser test policy', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'See all details', exact: true }).click();
      const buildings = page.locator('section').filter({
        has: page.getByRole('heading', {
          name: 'Buildings cover',
          exact: true,
        }),
      });
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
      const contents = page.locator('section').filter({
        has: page.getByRole('heading', {
          name: 'Contents cover',
          exact: true,
        }),
      });
      const contentsSum = contents.locator('bt-field').filter({ hasText: 'Sum insured' });
      await expect(contentsSum).toContainText('Add a value');
      await page.reload();
      await expect(sum).toContainText('£500,000.00');
      await page.getByRole('link', { name: 'Back to thing', exact: true }).click();
      await page.getByRole('button', { name: 'Add an attachment', exact: true }).click();
      await page.getByLabel('Upload a file', { exact: false }).setInputFiles({
        name: 'policy.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('policy'),
      });
      const download = page.getByRole('button', { name: 'Download policy.txt', exact: true });
      await expect(download).toBeVisible();
      const downloadReady = page.waitForEvent('download');
      await download.click();
      const downloaded = await downloadReady;
      assert.equal(downloaded.suggestedFilename(), 'policy.txt');
      assert.equal(await readFile((await downloaded.path())!, 'utf8'), 'policy');
      let releaseImport!: () => void;
      importAi.pause = new Promise((resolve) => {
        releaseImport = resolve;
      });
      await page.getByRole('button', { name: 'Actions for policy.txt', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Extract details', exact: true }).click();
      const progress = page.locator('bt-import-progress bt-notice');
      await expect(progress).toBeVisible();
      await expect(progress).toContainText(/Step \d of 3/);
      await expect(progress).toContainText('You can leave this screen');
      const currentStep = progress.locator('.import-step.current');
      assert.match(
        await currentStep.evaluate((el) => getComputedStyle(el).animationName),
        /import-step-pulse$/,
      );
      await page.screenshot({
        path: 'test-results/import-progress-desktop.png',
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: 'test-results/import-progress-mobile.png',
        fullPage: true,
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await currentStep.evaluate((el) => getComputedStyle(el).animationName), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setViewportSize({ width: 1440, height: 1100 });
      releaseImport();
      importAi.pause = undefined;
      await expect(progress).toHaveCount(0);
      await page.getByRole('link', { name: 'See all details', exact: true }).click();
      await expect(sum).toContainText('£500,000.00');
      await expect(contentsSum).toContainText('£50,000.00');
      await page.getByRole('link', { name: 'Back to thing', exact: true }).click();
      await page.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Tags', exact: true }).click();
      await page.getByLabel('New tag', { exact: true }).fill('Paperwork');
      await page.getByRole('button', { name: 'Add tag', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Paperwork', exact: true, pressed: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: 'test-results/thing-mobile.png',
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.goto(base);
      await page.getByRole('link', { name: 'Add a thing', exact: false }).click();
      await page.screenshot({
        path: 'test-results/add-thing-mobile.png',
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.getByRole('link', { name: 'Text', exact: true }).click();
      await page.getByLabel('Text to import', { exact: true }).fill('two');
      await page.getByRole('button', { name: 'Import text', exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name: 'Which Things would you like to keep?',
        }),
      ).toBeVisible();
      await expect(progress).toHaveCount(0);
      await page.screenshot({
        path: 'test-results/import-selection-mobile.png',
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Keep selected Things', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Open Thing 2', exact: true })).toBeVisible();
      await expect(progress).toHaveCount(0);
      await page.getByRole('link', { name: 'See all details', exact: true }).click();
      await expect(page.locator('bt-field').filter({ hasText: 'Z-number (Z-Nr)' })).toContainText(
        '0015',
      );
      await expect(
        page.locator('bt-field').filter({ hasText: 'Installer reference' }),
      ).toContainText('ABC-12');
      await page.getByRole('combobox', { name: /^Section/ }).selectOption('appliances.ownership');
      await page.getByRole('button', { name: 'Add section', exact: true }).click();
      const acquiredOn = page.locator('bt-field').filter({ hasText: 'Acquired on' });
      await acquiredOn.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(acquiredOn.getByLabel('Acquired on')).toHaveAttribute('type', 'date');
      await acquiredOn.getByLabel('Acquired on').fill('2022-03-12');
      await acquiredOn.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(acquiredOn).toContainText('2022-03-12');
      await acquiredOn.getByRole('button', { name: 'Pin Acquired on', exact: true }).click();
      await expect(
        acquiredOn.getByRole('button', { name: 'Unpin Acquired on', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Back to thing', exact: true }).click();
      const pinnedDate = page.locator('bt-key-value-row').filter({ hasText: 'Acquired on' });
      await expect(pinnedDate).toContainText('12 Mar 2022');
      await page.reload();
      await expect(pinnedDate).toContainText('12 Mar 2022');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({
        path: 'test-results/import-complete-mobile.png',
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.screenshot({
        path: 'test-results/import-complete-desktop.png',
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      const fresh = await browser.newContext();
      const signedOut = await fresh.newPage();
      await signedOut.goto(base);
      await expect(
        signedOut.getByRole('button', {
          name: 'Continue with email',
          exact: false,
        }),
      ).toBeVisible();
      await signedOut.screenshot({
        path: 'test-results/login.png',
        fullPage: true,
      });
      await fresh.close();
    } finally {
      await browser?.close();
      await env.close();
    }
  },
);
