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

  await page.goto(`/things/${thingId}/tasks`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tasks kettle');

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
  // A Thing's tasks page shows every later day, with no Upcoming toggle.
  await expect(page.getByRole('button', { name: 'Upcoming' })).toHaveCount(0);

  const next = format(addMonths(new Date(), 12), 'd MMM');
  const upcoming = page.locator('section', { has: page.getByRole('heading', { name: next }) });

  await expect(upcoming).toBeVisible();
  await expect(upcoming.locator('bt-task-card', { hasText: 'Oil the hinges' })).toHaveCount(1);
  await check.click();
  await expect(check).toHaveAttribute('aria-checked', 'false');
  await expect(upcoming.locator('bt-task-card', { hasText: 'Oil the hinges' })).toHaveCount(0);

  // Editing the schedule moves the task and sets its interval.
  await page.getByRole('button', { name: 'Actions for Descale the kettle' }).click();
  await page.getByRole('menuitem', { name: 'Edit schedule' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit schedule' });

  await expect(dialog.getByRole('heading', { name: 'Descale the kettle' })).toBeVisible();
  await page.getByLabel('Next due date').fill(day(1));

  const repeat = page.getByRole('combobox', { name: 'Repeat' });

  await expect(repeat.locator('option:checked')).toHaveText('No');
  await expect(dialog.getByRole('group', { name: 'Schedule next task from' })).toHaveCount(0);
  await repeat.selectOption({ label: 'Yes' });

  // Clicking the number selects it, so typing replaces it.
  const number = page.getByLabel('Number');

  await number.click();
  await page.keyboard.type('2');
  await expect(number).toHaveValue('2');
  await expect(page.getByRole('radio', { name: 'When I complete this task' })).toBeChecked();
  await expect(dialog).toContainText(
    'The next task will be due 2 months after you complete this one.',
  );
  await page.getByRole('radio', { name: 'The scheduled due date' }).check();
  await expect(dialog).toContainText(
    'The next task will be due 2 months after its scheduled due date, even if you finish early or late.',
  );
  await page.getByLabel('Unit').selectOption({ label: 'Weeks' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(tomorrow.locator('bt-task-card', { hasText: 'Descale the kettle' })).toContainText(
    'Every 2 weeks',
  );

  // Reopening shows the saved schedule.
  await page.getByRole('button', { name: 'Actions for Descale the kettle' }).click();
  await page.getByRole('menuitem', { name: 'Edit schedule' }).click();
  await expect(repeat.locator('option:checked')).toHaveText('Yes');
  await expect(number).toHaveValue('2');
  await expect(page.getByRole('radio', { name: 'The scheduled due date' })).toBeChecked();

  // Cancelling drops edits; the next opening starts from the saved schedule.
  await number.fill('5');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Actions for Descale the kettle' }).click();
  await page.getByRole('menuitem', { name: 'Edit schedule' }).click();
  await expect(number).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Deleting returns the task to the Thing's suggestions.
  await page.getByRole('button', { name: 'Actions for Descale the kettle' }).click();
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await expect(card(page, 'Descale the kettle')).toHaveCount(0);
  await page.goto(`/things/${thingId}`);
  await expect(
    page.getByRole('button', { name: 'Add to tasks: Descale the kettle' }),
  ).toBeVisible();
});

test('Tasks always shows Today and Tomorrow, and Upcoming expands', async ({ page }) => {
  const thingId = await withEvents(page, () => []);

  await page.goto(`/things/${thingId}/tasks`);
  await expect(page.getByText('Nothing to do today.')).toBeVisible();
  await expect(page.getByText('Nothing planned for tomorrow.')).toBeVisible();
  await expect(page.getByText('Nothing else is scheduled.')).toBeVisible();

  await page.goto('/tasks');

  const upcoming = page.getByRole('button', { name: 'Upcoming' });

  await expect(upcoming).toHaveAttribute('aria-expanded', 'false');
  await upcoming.click();
  await expect(upcoming).toHaveAttribute('aria-expanded', 'true');
});

test('A Thing previews its next tasks and suggestions, and lists suggestions by priority', async ({
  page,
}) => {
  const thingId = await withEvents(page, (id) => [
    event(id, 'Descale the kettle', { startsOn: day(2) }),
    event(id, 'Polish the lid', { status: 'SUGGESTED' }),
    event(id, 'Check the smoke alarm', { status: 'SUGGESTED' }),
    event(id, 'Renew the service plan', { status: 'SUGGESTED' }),
    event(id, 'Wipe the base', { status: 'SUGGESTED' }),
  ]);

  await page.reload();

  // Upcoming tasks use the Tasks cards, with the day in place of a day heading.
  await expect(card(page, 'Descale the kettle')).toContainText(
    format(addDays(new Date(), 2), 'EEE d MMM'),
  );
  await expect(page.locator('bt-suggested-task')).toHaveText([
    /Check the smoke alarm\s*Critical/,
    /Renew the service plan\s*Important/,
    /Wipe the base\s*Recommended/,
  ]);
  await page.getByRole('link', { name: 'See all tasks' }).click();
  await expect(page).toHaveURL(new RegExp(`/things/${thingId}/tasks$`));
  await expect(card(page, 'Descale the kettle')).toBeVisible();

  await page.goto(`/things/${thingId}`);
  await page.getByRole('link', { name: 'See all suggested tasks' }).click();
  await expect(page).toHaveURL(new RegExp(`/things/${thingId}/suggestions$`));
  await expect(page.locator('bt-suggested-task')).toHaveText([
    /Check the smoke alarm\s*Critical/,
    /Renew the service plan\s*Important/,
    /Wipe the base\s*Recommended/,
    /Polish the lid\s*Nice to have/,
  ]);
  await page.getByRole('button', { name: 'Add to tasks: Wipe the base' }).click();
  await expect(page.locator('bt-suggested-task')).toHaveCount(3);
});

test('Home summarises today and opens Tasks', async ({ page }) => {
  await withEvents(page, (id) => [event(id, 'Descale the kettle', { startsOn: day(-1) })]);
  await page.goto('/');

  const summary = page.locator('a.home-today');

  await expect(summary).toContainText('Descale the kettle');
  await expect(summary).toContainText(/\d+ overdue/);
  await expect(summary.getByRole('checkbox')).toHaveCount(0);
  await summary.click();
  await expect(page).toHaveURL(/\/tasks$/);
});
