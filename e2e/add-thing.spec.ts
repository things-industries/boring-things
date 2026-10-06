import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

const tiles = ['Camera', 'Photos', 'Files'];

/** Serves the runtime configuration with `changes` applied. */
const configure = (page: Page, changes: Record<string, unknown>) =>
  page.route('**/api/config', async (route) => {
    const response = await route.fetch();

    await route.fulfill({ response, json: { ...(await response.json()), ...changes } });
  });

test('Add a Thing offers file, photo and text imports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Add a Thing', exact: true }).click();
  await expect(page).toHaveURL(/\/things\/new$/);
  await expect(page.getByRole('heading', { name: 'Add a Thing', level: 1 })).toBeVisible();

  for (const name of tiles) {
    const chooser = page.waitForEvent('filechooser');

    await page.getByRole('button', { name, exact: true }).click();
    await chooser;
  }

  await expect(page.getByText('Your uploads are private.')).toBeVisible();
  await page.getByRole('link', { name: 'Text', exact: true }).click();
  await expect(page).toHaveURL(/\/things\/new\/text$/);
  await expect(page.getByRole('button', { name: 'Import text' })).toBeDisabled();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/things\/new$/);
});

test('a manually created Thing shows in the Things list without a reload', async ({ page }) => {
  const name = `Manual hob ${Date.now()}`;

  await page.goto('/things');
  await expect(page.locator('bt-all-things-skeleton')).toHaveCount(0);
  await page.goto('/things/new/manual');
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('combobox', { name: 'Category' }).selectOption('appliances');
  await page.getByRole('button', { name: 'Create thing' }).click();
  await expect(page).toHaveURL(/\/things\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Things', exact: true }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
});

test.describe('with a small upload limit', () => {
  test('a file over the limit shows a toast', async ({ page }) => {
    await configure(page, { maxUploadBytes: 4 });
    await page.goto('/things/new');

    const chooser = page.waitForEvent('filechooser');

    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await (
      await chooser
    ).setFiles({ name: 'manual.txt', mimeType: 'text/plain', buffer: Buffer.from('manual') });

    const toast = page.locator('.ngx-toastr');

    await expect(toast).toContainText("Couldn't start the import");
    await expect(toast).toContainText('File exceeds the upload limit.');
    await expect(page).toHaveURL(/\/things\/new$/);
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toBeEnabled();
  });
});

test.describe('with AI imports unconfigured', () => {
  test('import tiles are disabled', async ({ page }) => {
    await configure(page, { importEnabled: false });
    await page.goto('/things/new');
    await expect(page.getByText('AI import is unavailable right now.')).toBeVisible();

    for (const name of [...tiles, 'Text'])
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();

    await page.goto('/things/new/text');
    await expect(page).toHaveURL(/\/things\/new$/);
  });
});

test('an empty library is asked to add its first thing', async ({ page }) => {
  await page.route(/\/api\/things(\?|$)/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { items: [], nextCursor: null } })
      : route.continue(),
  );

  await page.goto('/things/new');
  await expect(page.getByRole('heading', { name: 'Add your first Thing', level: 1 })).toBeVisible();
});
