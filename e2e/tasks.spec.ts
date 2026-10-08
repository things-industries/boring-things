import type { Page } from '@playwright/test';
import { addDays, addMonths, format } from 'date-fns';
import { test, expect } from './fixtures.js';

type Event = Record<string, unknown> & { id: string; status: string };

const day = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

/** Creates a Thing and serves `events` for it alongside the stored ones, applying patches to them. */
async function withEvents(page: Page, build: (thingId: string) => Event[]) {
  await page.goto('/things/new/manual');
  await page.getByRole('textbox', { name: 'Name' }).fill(`Tasks kettle ${Date.now()}`);
  await page.getByRole('combobox', { name: 'Category' }).selectOption('appliances');
  await page.getByRole('button', { name: 'Create thing' }).click();
  await expect(page.locator('h1')).toContainText('Tasks kettle');

  const thingId = new URL(page.url()).pathname.split('/').pop()!;
  const events = new Map(build(thingId).map((event) => [event.id, event]));

  await page.route(/\/api\/events(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();

    const response = await route.fetch();
    const body = await response.json();

    await route.fulfill({
      response,
      json: { ...body, items: [...body.items, ...events.values()] },
    });
  });

  await page.route(/\/api\/events\/[^/?]+$/, async (route) => {
    const id = route.request().url().split('/').pop()!;
    const event = events.get(id);

    if (!event || route.request().method() !== 'PATCH') return route.fallback();

    const next = { ...event, ...route.request().postDataJSON() };

    next.completedAt = next.status === 'COMPLETED' ? new Date().toISOString() : null;
    events.set(id, next);
    await route.fulfill({ json: next });
  });

  return thingId;
}

function event(thingId: string, title: string, fields: Record<string, unknown>): Event {
  return {
    id: crypto.randomUUID(),
    thingId,
    issueId: null,
    title,
    description: '',
    status: 'SCHEDULED',
    startsAt: null,
    startsOn: null,
    completedAt: null,
    sourceRefs: [],
    isSample: false,
    ...fields,
  };
}

// Event reloads may still be in flight through the routes when a test ends.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

const card = (page: Page, title: string) => page.locator('bt-task-card', { hasText: title });

test('Tasks orders a day, completes and reopens a recurring task, reschedules and deletes', async ({
  page,
}) => {
  const tomorrowAt = addDays(new Date(), 1);

  tomorrowAt.setHours(14, 0, 0, 0);

  const thingId = await withEvents(page, (id) => [
    event(id, 'Descale the kettle', { startsOn: day(-1) }),
    event(id, 'Oil the hinges', { startsOn: day(0), description: 'Every 12 months.' }),
    event(id, 'Engineer visit', { startsAt: tomorrowAt.toISOString() }),
  ]);

  await page.goto(`/tasks?thingId=${thingId}`);
  await expect(page.getByText(/^Showing/)).toContainText('Tasks kettle');

  const today = page.locator('section', { has: page.getByRole('heading', { name: 'Today' }) });
  const tomorrow = page.locator('section', {
    has: page.getByRole('heading', { name: 'Tomorrow' }),
  });

  await expect(today.locator('bt-task-card')).toHaveText([/Oil the hinges/, /Descale the kettle/]);
  await expect(card(page, 'Oil the hinges')).toContainText('Every 12 months');
  await expect(card(page, 'Descale the kettle')).toContainText('Yesterday');
  await expect(tomorrow.locator('bt-task-card')).toHaveText([/Engineer visit\s*14:00/]);

  // Completing a recurring task schedules its next occurrence; reopening removes it.
  const check = today.getByRole('checkbox', { name: 'Oil the hinges' });

  await check.click();
  await expect(check).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Upcoming' }).click();

  const next = format(addMonths(new Date(), 12), 'd MMM');
  const upcoming = page.locator('#tasks-upcoming-days');

  await expect(upcoming.getByRole('heading', { name: next })).toBeVisible();
  await expect(upcoming.locator('bt-task-card', { hasText: 'Oil the hinges' })).toHaveCount(1);
  await check.click();
  await expect(check).toHaveAttribute('aria-checked', 'false');
  await expect(upcoming.locator('bt-task-card', { hasText: 'Oil the hinges' })).toHaveCount(0);

  // Rescheduling moves the task and sets its interval.
  await page.getByRole('button', { name: 'Actions for Descale the kettle' }).click();
  await page.getByRole('menuitem', { name: 'Reschedule' }).click();
  await page.getByLabel('Date').fill(day(1));
  await page.getByLabel('Unit').selectOption('WEEK');
  await page.getByLabel('Every').fill('2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(tomorrow.locator('bt-task-card', { hasText: 'Descale the kettle' })).toContainText(
    'Every 2 weeks',
  );

  // Deleting returns the task to the Thing's suggestions.
  await page.getByRole('button', { name: 'Actions for Descale the kettle' }).click();
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await expect(card(page, 'Descale the kettle')).toHaveCount(0);
  await page.goto(`/things/${thingId}`);
  await expect(page.getByRole('button', { name: 'Schedule: Descale the kettle' })).toBeVisible();
});

test('Tasks always shows Today and Tomorrow, and Upcoming expands', async ({ page }) => {
  const thingId = await withEvents(page, () => []);

  await page.goto(`/tasks?thingId=${thingId}`);
  await expect(page.getByText('Nothing to do today.')).toBeVisible();
  await expect(page.getByText('Nothing planned for tomorrow.')).toBeVisible();

  const upcoming = page.getByRole('button', { name: 'Upcoming' });

  await expect(upcoming).toHaveAttribute('aria-expanded', 'false');
  await upcoming.click();
  await expect(page.getByText('Nothing else is scheduled.')).toBeVisible();
  await page.getByRole('link', { name: 'Show all Things' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
});
