/** Covers adding a source to an existing Thing through the browser. */

import { test, expect } from './fixtures.js';

test('a policy keeps its edited cover amount when importing additional details', async ({
  page,
}) => {
  await page.goto('/things/new/manual');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser test policy');
  await page.getByLabel('Category', { exact: true }).selectOption('insurance');
  await page.getByLabel('Details to include').selectOption('insurance.combined');
  await page.getByRole('button', { name: 'Create thing', exact: true }).click();
  await expect(page).toHaveURL(/\/things\/[0-9a-f-]+$/);
  await page.getByRole('link', { name: 'See all details', exact: true }).click();
  const buildings = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Buildings cover', exact: true }),
  });
  const contents = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Contents cover', exact: true }),
  });
  await page.getByRole('button', { name: 'Edit details' }).click();
  await buildings.getByRole('spinbutton', { name: 'Sum insured' }).fill('500000');
  await page.getByRole('button', { name: 'Save details' }).click();
  const buildingsSum = buildings.locator('bt-key-value-row').filter({ hasText: 'Sum insured' });
  const contentsSum = contents.locator('bt-key-value-row').filter({ hasText: 'Sum insured' });
  await expect(buildingsSum).toContainText('£500,000.00');
  await expect(contentsSum).toContainText('Not recorded');
  await page.getByRole('link', { name: 'Back to thing', exact: true }).click();

  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add details from a source', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByLabel('Text to import', { exact: true }).fill('policy');
  await page.getByRole('button', { name: 'Import text', exact: true }).click();
  await page.getByRole('link', { name: 'See all details', exact: true }).click();
  await expect(contentsSum).toContainText('£50,000.00');
  await expect(buildingsSum).toContainText('£500,000.00');
});
