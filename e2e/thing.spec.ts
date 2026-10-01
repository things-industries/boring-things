import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

/** Creates an appliance with a warranty section through the manual form and opens it. */
async function createThing(page: Page, name: string) {
  await page.goto('/things/new/manual');
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('combobox', { name: 'Category' }).selectOption('appliances');
  await page
    .getByRole('combobox', { name: 'Details to include' })
    .selectOption('appliances.warranty');
  await page.getByRole('button', { name: 'Create thing' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url();
}

test('Thing detail shows issues, tasks, products and attachments', async ({ page }) => {
  await page.goto('/things');
  await page.getByRole('heading', { name: 'Kitchen hob', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kitchen hob', level: 1 })).toBeVisible();
  await expect(page.locator('bt-thing-skeleton')).toHaveCount(0);

  for (const name of [
    'Needs attention',
    'Key details',
    'Upcoming tasks',
    'Suggested tasks',
    'Compatible products',
    'Attachments',
  ])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Resolve: One ring heats unevenly' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy Hob cleaner (sample)' })).toBeDisabled();
  await expect(page.getByText('No documents yet.')).toBeVisible();
});

test('a pinned detail shows in Key details on the Thing', async ({ page }) => {
  const url = await createThing(page, `Warranty oven ${Date.now()}`);

  await expect(page.getByText('Pin details to see them here.')).toBeVisible();
  await page.getByRole('link', { name: 'See all details' }).click();
  await expect(page.getByRole('heading', { name: 'All details', level: 1 })).toBeVisible();

  const ends = page.locator('bt-field').filter({ hasText: 'Warranty ends' });

  await ends.getByRole('button', { name: 'Add', exact: true }).click();
  await ends.getByLabel('Warranty ends', { exact: true }).fill('2099-01-01');
  await ends.getByRole('button', { name: 'Save', exact: true }).click();
  await ends.getByRole('button', { name: 'Pin Warranty ends' }).click();
  await expect(ends.getByRole('button', { name: 'Unpin Warranty ends' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to thing' }).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator('bt-key-value-row', { hasText: 'Warranty ends' })).toContainText(
    '1 Jan 2099',
  );
});

test('the overflow menu changes the category and tags, then deletes the Thing', async ({
  page,
}) => {
  const name = `Menu kettle ${Date.now()}`;
  const tag = `Kitchen ${Date.now()}`;

  await createThing(page, name);

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Change category' }).click();
  await page.getByRole('combobox', { name: 'Category' }).selectOption('devices');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.thing-category')).toHaveText('Devices');

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Tags' }).click();
  await page.getByRole('textbox', { name: 'New tag' }).fill(tag);
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByRole('button', { name: tag, pressed: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const deleted = page.waitForResponse(
    (response) => response.request().method() === 'DELETE' && response.ok(),
  );

  await page.getByRole('button', { name: 'Delete thing' }).click();
  await expect(page).toHaveURL(/\/$/);
  // A full reload before the delete lands would abort it.
  await deleted;
  await page.goto('/things');
  await expect(page.locator('bt-dashboard-skeleton')).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
});

test('a suggested task is scheduled and completed', async ({ page }) => {
  const url = await createThing(page, `Task dryer ${Date.now()}`);
  const thingId = url.split('/').pop()!;
  const eventId = crypto.randomUUID();

  let event = {
    id: eventId,
    thingId,
    issueId: null,
    title: 'Clean the lint filter',
    description: 'Every 2 weeks.',
    status: 'SUGGESTED',
    startsAt: null,
    startsOn: null,
    completedAt: null as string | null,
    sourceRefs: [],
    isSample: false,
  };

  await page.route(/\/api\/events(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();

    await route.fulfill({ response, json: { ...body, items: [...body.items, event] } });
  });

  await page.route(`**/api/events/${eventId}`, async (route) => {
    event = { ...event, ...route.request().postDataJSON() };
    if (event.status === 'COMPLETED') event.completedAt = new Date().toISOString();
    await route.fulfill({ json: event });
  });

  await page.reload();
  await expect(page.locator('bt-list-row', { hasText: 'Clean the lint filter' })).toContainText(
    'Once every 2 weeks',
  );
  await page.getByRole('button', { name: 'Schedule: Clean the lint filter' }).click();
  await page.getByLabel('Date').fill('2099-03-04');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();

  const card = page.locator('bt-event-card', { hasText: 'Clean the lint filter' });

  await expect(card).toContainText('Due 4 Mar 2099');
  await card.getByRole('button', { name: 'Mark complete: Clean the lint filter' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Nothing scheduled.')).toBeVisible();
});

test('import steps show while discovering, then the sheet slides up once', async ({ page }) => {
  const job = (thingId: string, status: string) => ({
    id: crypto.randomUUID(),
    attachmentId: crypto.randomUUID(),
    thingId,
    status,
    candidates: [],
    thingIds: [thingId],
    error: null,
    usage: {},
  });
  let loaded!: (thing: { id: string; revision: number }) => void;
  const original = new Promise<{ id: string; revision: number }>((resolve) => (loaded = resolve));
  let streams = 0;

  // The Thing loads as a fresh import, then one snapshot delivers its first details.
  await page.route(/\/api\/things\/[0-9a-f-]+$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();

    const response = await route.fetch();

    const thing = (await response.json()) as Record<string, unknown> & {
      id: string;
      revision: number;
      fieldSets: { fields: { value: unknown }[] }[];
    };

    loaded(structuredClone(thing));

    for (const set of thing.fieldSets) for (const field of set.fields) field.value = null;
    await route.fulfill({
      response,
      json: {
        ...thing,
        imageAttachmentId: null,
        standaloneFields: [],
        undefinedFields: [],
        import: job(thing.id, 'EXTRACTING'),
      },
    });
  });
  await page.route('**/api/things/*/stream', async (route) => {
    if (streams++ > 0) return new Promise(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const thing = await original;
    const snapshot = { ...thing, revision: thing.revision + 1 };

    await route.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: `event: thing.snapshot\ndata: ${JSON.stringify({ ...snapshot, import: job(snapshot.id, 'MAPPING') })}\n\n`,
    });
  });

  await page.goto('/things');
  await page.getByRole('heading', { name: 'Kitchen hob', exact: true }).click();
  await expect(page.locator('.thing-discovering')).toContainText(
    'Step 1 of 3: Reading your source',
  );
  await expect(page.locator('bt-sheet')).toHaveClass(/\barrive\b/);
  await expect(page.locator('bt-import-progress')).toContainText('Step 2 of 3: Adding details');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kitchen hob', level: 1 })).toBeVisible();
  await expect(page.locator('bt-sheet')).not.toHaveClass(/\barrive\b/);
});

test.describe('with a failing save', () => {
  test.use({ expectedConsoleErrors: [/status of 422/] });

  test('a failed rename shows a toast and restores the name', async ({ page }) => {
    const name = `Rename fridge ${Date.now()}`;

    await createThing(page, name);
    await page.route('**/api/things/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 422, json: { message: 'Rejected by test' } })
        : route.continue(),
    );

    await page.getByRole('link', { name: 'See all details' }).click();

    const input = page.getByRole('textbox', { name: 'Name' });

    await input.fill('Renamed fridge');
    await page.getByRole('button', { name: 'Save basics' }).click();

    const toast = page.locator('.ngx-toastr');

    await expect(toast).toContainText("Couldn't save changes");
    await expect(input).toHaveValue(name);
    await page.getByRole('link', { name: 'Back to thing' }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  });
});
