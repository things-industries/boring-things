/** Task journeys against persisted API records and fixture AI scheduling. */

import type { Page } from '@playwright/test';
import { addDays, format } from 'date-fns';
import { test, expect } from './fixtures.js';
import type { Schema } from '../shared/model.js';

const day = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

/** Uses the signed browser session for API setup, without intercepting application requests. */
async function api(page: Page, method: string, path: string, body?: object) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const stored = localStorage.getItem('logto:browser-test:accessToken');
      const entries = JSON.parse(stored ?? '{}');
      const session = Object.values(entries)[0] as { token: string };
      const response = await fetch('/api' + path, {
        method,
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok)
        throw new Error(
          method + ' ' + path + ': ' + response.status + ' ' + (await response.text()),
        );
      return response.status === 204 ? null : response.json();
    },
    { method, path, body },
  );
}
async function setup(page: Page) {
  await page.goto('/tasks');
  return api(page, 'POST', '/things', {
    name: 'Tasks kettle ' + Date.now(),
    categoryId: 'other',
  }) as Promise<Schema['Thing']>;
}
const card = (page: Page, title: string) => page.locator('bt-task-card', { hasText: title });

test('complete recurring work, use followups, dismiss, edit dates and delete', async ({ page }) => {
  const thing = await setup(page);
  const task = (await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Inspect the filter',
    status: 'ACTIVE',
    scheduledOn: day(-2),
    importance: 'CRITICAL',
    recurrence: { interval: 1, unit: 'MONTH', from: 'SCHEDULED' },
  })) as Schema['Task'];
  await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Read the manual',
    status: 'ACTIVE',
    deadlineOn: day(-1),
  });
  await page.goto(`/things/${thing.id}/tasks`);
  await expect(card(page, 'Inspect the filter')).toBeVisible();
  await expect(card(page, 'Read the manual')).toContainText('Yesterday');
  await expect(card(page, 'Inspect the filter')).toContainText('Every month');
  await card(page, 'Inspect the filter').getByRole('checkbox').click();
  const completed = page.locator('bt-task-card.done', { hasText: 'Inspect the filter' });
  await expect(completed.getByRole('button', { name: 'How did it go?' })).toBeVisible();
  await expect(completed.getByRole('checkbox')).toBeEnabled();
  await page.reload();
  await expect(completed.getByRole('button', { name: 'How did it go?' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'How did it go?' })).toHaveCount(0);
  const tasks = (await api(page, 'GET', `/tasks?thingId=${thing.id}`)) as Schema['TaskList'];
  expect(
    tasks.items.filter((item) => item.title === task.title && item.status === 'ACTIVE'),
  ).toHaveLength(1);
  await completed.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(completed).toHaveCount(0);
  const dismissed = (await api(page, 'GET', `/tasks/${task.id}`)) as Schema['Task'];
  expect(dismissed.status).toBe('CLOSED');
  expect(dismissed.closedAt).toBeTruthy();
  await card(page, 'Read the manual')
    .getByRole('button', { name: 'Actions for Read the manual' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit schedule' });
  await dialog.getByLabel('Deadline on').fill(day(3));
  await dialog.getByLabel('Scheduled on').fill(day(1));
  const repeat = dialog.getByRole('checkbox', { name: 'Repeat', exact: true });
  await expect(repeat).not.toBeChecked();
  await repeat.focus();
  await page.keyboard.press('Space');
  await expect(repeat).toBeChecked();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Tasks with a deadline cannot repeat. Remove the deadline or uncheck Repeat.',
  );
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('task-recurrence-conflict.png') });
  await repeat.uncheck();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await expect(dialog.getByLabel('Deadline on')).toHaveValue(day(3));
  await repeat.check();
  await dialog.getByLabel('Deadline on').fill('');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await dialog.getByRole('radio', { name: "The task's scheduled date", exact: true }).check();
  await page.screenshot({ path: test.info().outputPath('task-recurrence.png') });
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  const edited = (await api(page, 'GET', `/tasks?thingId=${thing.id}`)) as Schema['TaskList'];
  const scheduled = edited.items.find((item) => item.title === 'Read the manual');
  expect(scheduled?.recurrence?.from).toBe('SCHEDULED');
  expect(scheduled?.deadlineOn).toBeNull();
  const tomorrow = page.locator('section', {
    has: page.getByRole('heading', { name: 'Tomorrow', exact: true }),
  });
  await expect(tomorrow.locator('bt-task-card', { hasText: 'Read the manual' })).toBeVisible();
  const openSchedule = async () => {
    await card(page, 'Read the manual')
      .getByRole('button', { name: 'Actions for Read the manual' })
      .click();
    await page.getByRole('menuitem', { name: 'Edit schedule' }).click();
  };
  await openSchedule();
  await expect(repeat).toBeChecked();
  await repeat.uncheck();
  await expect(dialog.getByRole('radio', { name: "The task's scheduled date" })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  await openSchedule();
  await expect(repeat).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await card(page, 'Read the manual')
    .getByRole('button', { name: 'Actions for Read the manual' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await expect(card(page, 'Read the manual')).toHaveCount(0);
  await page.goto(`/things/${thing.id}/suggestions`);
  await expect(page.getByText('Read the manual', { exact: true })).toHaveCount(0);
});

test('the Tasks tab names each task’s Thing above its title', async ({ page }) => {
  const thing = await setup(page);
  const title = 'Descale ' + thing.id.slice(0, 8);
  await api(page, 'POST', '/tasks', { thingId: thing.id, title, status: 'ACTIVE' });
  await page.goto('/tasks');
  const tab = card(page, title);
  await expect(tab.locator('.task-card-eyebrow')).toHaveText(thing.name);
  await expect(tab.locator('.task-card-title')).toHaveText(title);
  await expect(tab.getByRole('checkbox', { name: `${thing.name}: ${title}` })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('task-eyebrow.png') });
  await page.goto(`/things/${thing.id}/tasks`);
  await expect(card(page, title)).toBeVisible();
  await expect(card(page, title).locator('.task-card-eyebrow')).toHaveCount(0);
  await page.goto(`/things/${thing.id}`);
  await expect(card(page, title)).toBeVisible();
  await expect(card(page, title).locator('.task-card-eyebrow')).toHaveCount(0);
});

test('a checked-off task keeps its place in the list', async ({ page }) => {
  const thing = await setup(page);
  const titles = ['Alpha chore', 'Beta chore', 'Gamma chore'];
  for (const title of titles)
    await api(page, 'POST', '/tasks', { thingId: thing.id, title, status: 'ACTIVE' });
  await page.goto(`/things/${thing.id}/tasks`);
  const shown = page.locator('bt-task-card .task-card-title');
  await expect(shown).toHaveText(titles);
  await card(page, 'Beta chore').getByRole('checkbox').click();
  const checked = page.locator('bt-task-card.done', { hasText: 'Beta chore' });
  await expect(checked.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await expect(checked.getByRole('button', { name: 'Dismiss', exact: true })).toBeVisible();
  await expect(shown).toHaveText(titles);
  await page.screenshot({ path: test.info().outputPath('task-checked.png') });
  await page.reload();
  await expect(shown).toHaveText(titles);
  await checked.getByRole('checkbox').click();
  await expect(checked).toHaveCount(0);
  await expect(card(page, 'Beta chore').getByRole('checkbox')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(shown).toHaveText(titles);
  await page.reload();
  await expect(checked).toHaveCount(0);
  await expect(shown).toHaveText(titles);
});

test('unchecking a recurring task removes its next occurrence', async ({ page }) => {
  const thing = await setup(page);
  const title = 'Repeat chore ' + thing.id.slice(0, 8);
  await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title,
    status: 'ACTIVE',
    scheduledOn: day(0),
    recurrence: { interval: 1, unit: 'WEEK', from: 'COMPLETION' },
  });
  await page.goto(`/things/${thing.id}/tasks`);
  await expect(card(page, title)).toHaveCount(1);
  await card(page, title).getByRole('checkbox').click();
  await expect(card(page, title)).toHaveCount(2);
  await page.locator('bt-task-card.done', { hasText: title }).getByRole('checkbox').click();
  await expect(card(page, title)).toHaveCount(1);
  await expect(page.locator('bt-task-card.done', { hasText: title })).toHaveCount(0);
  await page.reload();
  await expect(card(page, title)).toHaveCount(1);
});

test('suggested tasks show descriptions, add with a spinner and can be dismissed', async ({
  page,
}) => {
  const thing = await setup(page);
  const add = (await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Check the seal',
    description: 'Look for cracks along the rim.',
  })) as Schema['Task'];
  const dismiss = (await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Clean the base',
  })) as Schema['Task'];
  const row = (title: string) => page.locator('bt-suggested-task', { hasText: title });
  await page.goto(`/things/${thing.id}`);
  await expect(row('Check the seal')).toBeVisible();
  await expect(row('Check the seal')).not.toContainText('Look for cracks');
  await page.getByRole('link', { name: 'See all suggested tasks' }).click();
  await expect(row('Check the seal')).toContainText('Look for cracks along the rim.');

  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/tasks/${add.id}:accept`, async (route) => {
    await held;
    await route.continue();
  });
  const addButton = page.getByRole('button', { name: 'Add to tasks: Check the seal' });
  await addButton.click();
  await expect(addButton).toHaveCount(0);
  await expect(row('Check the seal').getByRole('status')).toContainText('Adding Check the seal');
  await page.screenshot({ path: test.info().outputPath('suggestion-adding.png') });
  release();
  await expect(row('Check the seal')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'wait' });

  await page.getByRole('button', { name: 'Dismiss: Clean the base' }).click();
  await expect(row('Clean the base')).toHaveCount(0);
  expect(((await api(page, 'GET', `/tasks/${dismiss.id}`)) as Schema['Task']).status).toBe(
    'CLOSED',
  );
});

test('Today and Tomorrow always appear and Upcoming expands', async ({ page }) => {
  const thing = await setup(page);
  await page.goto(`/things/${thing.id}/tasks`);
  await expect(page.getByText('Nothing to do today.')).toBeVisible();
  await expect(page.getByText('Nothing planned for tomorrow.')).toBeVisible();
  await page.goto('/tasks');
  const upcoming = page.getByRole('button', { name: 'Upcoming', exact: true });
  await expect(upcoming).toHaveAttribute('aria-expanded', 'false');
  await upcoming.click();
  await expect(upcoming).toHaveAttribute('aria-expanded', 'true');
});

for (const kind of ['tasks', 'events'] as const) {
  test(`${kind} offer chat followup, reuse an empty chat and disappear after the first message`, async ({
    page,
  }) => {
    const thing = await setup(page);
    const title = 'Inspect handle ' + thing.id.slice(0, 8);
    const item = await api(page, 'POST', `/${kind}`, {
      thingId: thing.id,
      title,
      ...(kind === 'tasks' ? { status: 'SUGGESTED' } : { startsAt: '2000-01-01T10:00:00Z' }),
    });
    if (kind === 'tasks') {
      await page.goto(`/things/${thing.id}/suggestions`);
      await page.getByRole('button', { name: `Add to tasks: ${title}` }).click();
      await expect(page.locator('bt-suggested-task', { hasText: title })).toHaveCount(0);
      await page.goto(`/things/${thing.id}/tasks`);
      await card(page, title).getByRole('checkbox').click();
    } else await page.goto('/tasks');
    await card(page, title).getByRole('button', { name: 'How did it go?', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`followup=true`));
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute(
      'placeholder',
      'How did it go?',
    );
    const context = kind === 'tasks' ? { taskId: item.id } : { eventId: item.id };
    const conversation = await api(page, 'POST', '/conversations', { ...context, followup: true });
    expect((await api(page, 'GET', `/${kind}/${item.id}`)).completedFollowup).toBeNull();
    await page.goBack();
    await expect(card(page, title)).toBeVisible();
    await card(page, title).getByRole('button', { name: 'How did it go?', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeEnabled();
    expect((await api(page, 'POST', '/conversations', { ...context, followup: true })).id).toBe(
      conversation.id,
    );
    await page.getByRole('textbox', { name: 'Message' }).fill('The handle works again.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('The saved details are ready.', { exact: true })).toBeVisible();
    const closed = await api(page, 'GET', `/${kind}/${item.id}`);
    expect(closed.status).toBe('CLOSED');
    expect(closed.completedFollowup.conversationId).toBe(conversation.id);
    expect(closed.completedFollowup.completedAt).toBe(closed.closedAt);
    await page.screenshot({ path: test.info().outputPath(`${kind}-followup-chat.png`) });
    await page.goBack();
    await expect(card(page, title)).toHaveCount(0);
    await page.reload();
    await expect(card(page, title)).toHaveCount(0);
  });
}
