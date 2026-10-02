import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('Home shows attention, upcoming, recent Things and categories', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(page.locator('bt-home-skeleton')).toHaveCount(0);
  for (const name of ['Needs attention', 'Upcoming', 'Frequent & recent', 'Categories'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'One ring heats unevenly' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review home cover' })).toBeVisible();
  await expect(page.locator('bt-thing-row')).toHaveCount(3);
  await page.getByRole('link', { name: /^Vehicles · \d+$/ }).click();
  await expect(page).toHaveURL(/\/things\?categoryId=vehicles$/);
  await expect(page.getByRole('heading', { name: 'Weekend van', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kitchen hob', exact: true })).toHaveCount(0);
});

test('Things list shows sample Things', async ({ page }) => {
  await page.goto('/things');
  await expect(page.getByRole('heading', { name: 'Your things', exact: true })).toBeVisible();
  await expect(page.locator('bt-dashboard-skeleton')).toHaveCount(0);
  for (const name of ['Home insurance', 'Kitchen hob', 'Museum membership', 'Weekend van'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
});

test('All details masks sensitive fields until revealed', async ({ page }) => {
  await page.goto('/things');
  await page.getByRole('heading', { name: 'Museum membership', exact: true }).click();
  await expect(page).toHaveURL(/\/things\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'All details' }).click();
  await expect(page).toHaveURL(/\/things\/[0-9a-f-]+\/details$/);
  const pin = page.locator('bt-key-value-row').filter({ hasText: 'Access PIN' });
  await expect(pin).toContainText('••••••••');
  await pin.getByRole('button', { name: 'Actions for Access PIN' }).click();
  await page.getByRole('menuitem', { name: 'Reveal' }).click();
  await expect(pin).toContainText('0000');
  await pin.getByRole('button', { name: 'Actions for Access PIN' }).click();
  await page.getByRole('menuitem', { name: 'Hide' }).click();
  await expect(pin).not.toContainText('0000');
});

test('assistant opens a new conversation', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('shows the sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Continue with email' })).toBeVisible();
  });
});

for (const path of ['/', '/things/new', '/chat']) {
  test(`${path} fits the viewport width`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    // Measure the loaded page, not its skeleton.
    await expect(
      page.locator('[class*="skeleton"], bt-dashboard-skeleton, bt-home-skeleton'),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}

test.describe('Home with a failed collection', () => {
  test.use({ expectedConsoleErrors: [/status of 422/] });

  test('a failed section says it could not load instead of looking empty', async ({ page }) => {
    await page.route(/\/api\/issues(\?|$)/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 422, json: { message: 'Rejected by test' } })
        : route.continue(),
    );

    await page.goto('/');
    await expect(page.locator('bt-home-skeleton')).toHaveCount(0);
    await expect(page.getByText("Couldn't load what needs attention.")).toBeVisible();
    await expect(page.getByText('Nothing needs attention.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.locator('bt-thing-row')).toHaveCount(3);
  });
});
