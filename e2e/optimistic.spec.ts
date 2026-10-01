import { test, expect } from './fixtures.js';

test.use({ expectedConsoleErrors: [/status of 422/] });

test('a failed issue resolve shows a toast and restores the issue', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));

  await page.route('**/api/issues/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await held;
    await route.fulfill({ status: 422, json: { message: 'Rejected by test' } });
  });

  await page.goto('/things');

  const issue = page.getByRole('heading', { name: 'One ring heats unevenly' });

  await expect(issue).toBeVisible();
  await page
    .locator('.activity-card', { has: issue })
    .getByRole('button', { name: 'Mark resolved' })
    .click();

  await expect(issue).toHaveCount(0);
  release();

  const toast = page.locator('.ngx-toastr');

  await expect(toast).toContainText("Couldn't resolve the issue");
  await expect(toast.getByRole('alert')).toContainText(
    'Check the values and selected records, then try again.',
  );

  await expect(issue).toBeVisible();
  await toast.getByRole('button', { name: 'Close' }).click();
  await expect(toast).toHaveCount(0);
});
