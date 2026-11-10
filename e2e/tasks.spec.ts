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
const chat = [
  { type: 'CHAT', label: 'Discuss the result', prompt: 'The filter still needs work.' },
];

test('complete recurring work, use followups, dismiss, edit dates and delete', async ({ page }) => {
  const thing = await setup(page);
  const task = (await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Inspect the filter',
    status: 'ACTIVE',
    scheduledOn: day(-2),
    importance: 'CRITICAL',
    recurrence: { interval: 1, unit: 'MONTH', from: 'SCHEDULED' },
    completionActions: chat,
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
  await expect(completed.getByRole('button', { name: 'Discuss the result' })).toBeVisible();
  await expect(completed.getByRole('checkbox')).toBeEnabled();
  await page.reload();
  await expect(completed.getByRole('button', { name: 'Discuss the result' })).toBeVisible();
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
  await expect(checked.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0);
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
    completionActions: chat,
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

test('accept an unscheduled suggestion and open a new contextual followup conversation', async ({
  page,
}) => {
  const thing = await setup(page);
  const task = (await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Check the handle',
    importance: 'IMPORTANT',
    completionActions: chat,
  })) as Schema['Task'];
  await page.goto(`/things/${thing.id}/suggestions`);
  await page.getByRole('button', { name: 'Add to tasks: Check the handle' }).click();
  await expect(page.locator('bt-suggested-task', { hasText: 'Check the handle' })).toHaveCount(0);
  await page.goto(`/things/${thing.id}/tasks`);
  await card(page, 'Check the handle').getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Discuss the result' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/things/${thing.id}/chat\\?taskId=${task.id}&actionIndex=0`),
  );
  await expect(page.getByText('The filter still needs work.', { exact: true })).toBeVisible();
  await expect(page.getByText('The saved details are ready.', { exact: true })).toBeVisible();
  const closed = (await api(page, 'GET', `/tasks/${task.id}`)) as Schema['Task'];
  expect(closed.status).toBe('CLOSED');
  expect(closed.completedFollowup?.action.type).toBe('CHAT');
  await page.goto(`/things/${thing.id}/tasks`);
  await expect(card(page, 'Check the handle')).toHaveCount(0);
});

// Splitting Tasks from Events removed implicit Event loading on Thing task pages.
test('ended Events offer several followups, and issue resolution closes all linked work', async ({
  page,
}) => {
  const thing = await setup(page);
  const issue = (await api(page, 'POST', '/issues', {
    thingId: thing.id,
    title: 'Broken handle',
  })) as Schema['Issue'];
  const event = (await api(page, 'POST', '/events', {
    thingId: thing.id,
    issueId: issue.id,
    title: 'Engineer visit',
    startsAt: '2026-01-01T10:00:00Z',
    endsAt: '2026-01-01T11:00:00Z',
    completionActions: [
      { type: 'ADD_ATTACHMENT', label: 'Add the invoice', documentType: 'OTHER' },
      ...chat,
      { type: 'RESOLVE_ISSUE', label: 'Is it fixed?' },
    ],
  })) as Schema['Event'];
  await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    issueId: issue.id,
    title: 'Call the engineer',
    status: 'ACTIVE',
  });
  await page.goto(`/things/${thing.id}/tasks`);
  const visit = card(page, 'Engineer visit');
  await expect(visit.getByRole('checkbox')).toHaveCount(0);
  await visit.getByRole('button', { name: 'Add the invoice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add the invoice' });
  await dialog.getByLabel('Choose an attachment').setInputFiles({
    name: 'invoice.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic invoice'),
  });
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(visit.getByRole('button', { name: 'Discuss the result' })).toBeVisible();
  await visit.getByRole('button', { name: 'Is it fixed?' }).click();
  await expect(visit).toHaveCount(0);
  await expect(card(page, 'Call the engineer')).toHaveCount(0);
  expect(((await api(page, 'GET', `/events/${event.id}`)) as Schema['Event']).status).toBe(
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

// PR #139 saved every custom-field followup answer as text, changing its stored type.
test('custom-field followups save typed answers and keep money currencies', async ({ page }) => {
  const thing = await setup(page);
  const cases = [
    { label: 'Mileage', value: 1200, answer: '0', expected: 0, type: 'NUMBER', input: 'number' },
    { label: 'Checked', value: true, answer: 'false', expected: false, type: 'BOOLEAN' },
    {
      label: 'Cost',
      value: { amountMinor: 1250, currency: 'EUR' },
      answer: '15.25',
      expected: { amountMinor: 1525, currency: 'EUR' },
      type: 'MONEY',
      input: 'number',
    },
    {
      label: 'Private cost',
      value: { amountMinor: 2500, currency: 'USD' },
      sensitive: true,
      answer: '0',
      expected: { amountMinor: 0, currency: 'USD' },
      type: 'MONEY',
      input: 'number',
    },
    {
      label: 'Date',
      value: '2026-01-01',
      answer: '2026-02-02',
      expected: '2026-02-02',
      type: 'DATE',
      input: 'date',
    },
    { label: 'Code', value: '001', answer: '007', expected: '007', type: 'STRING', input: 'text' },
  ];
  const updated = (await api(page, 'PATCH', `/things/${thing.id}`, {
    customFields: cases.map(({ label, value, sensitive }) => ({
      label,
      value,
      sensitive: !!sensitive,
    })),
  })) as Schema['Thing'];
  const fields = updated.customFields;
  await page.goto(`/things/${thing.id}/tasks`);
  for (const entry of cases) {
    const targetField = fields.find((field) => field.label === entry.label)!;
    const task = (await api(page, 'POST', '/tasks', {
      thingId: thing.id,
      title: 'Record ' + entry.label,
      status: 'ACTIVE',
      completionActions: [
        {
          type: 'UPDATE_FIELD',
          label: targetField.label,
          fieldSetId: null,
          fieldId: null,
          customFieldId: targetField.id,
        },
        ...chat,
      ],
    })) as Schema['Task'];
    await api(page, 'POST', `/tasks/${task.id}:complete`, {});
    await page.reload();
    await page.getByRole('button', { name: entry.label, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: entry.label, exact: true });
    const input = dialog.getByLabel(entry.label, { exact: true });
    if (entry.type === 'BOOLEAN') await input.selectOption(entry.answer);
    else {
      await expect(input).toHaveAttribute('type', entry.input!);
      await input.fill(entry.answer);
    }
    await page.screenshot({
      path: test.info().outputPath(`followup-${entry.type}-${entry.label}.png`),
    });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const saved = (await api(page, 'GET', `/things/${thing.id}`)) as Schema['Thing'];
    const field = saved.customFields.find((field) => field.label === entry.label)!;
    expect(field.valueType).toBe(entry.type);
    const value = entry.sensitive
      ? (
          (await api(page, 'POST', `/things/${thing.id}:reveal-field`, {
            customFieldId: field.id,
          })) as Schema['RevealResult']
        ).value
      : field.value;
    expect(value).toEqual(entry.expected);
    await expect(card(page, task.title)).toHaveCount(0);
    const closed = (await api(page, 'GET', `/tasks/${task.id}`)) as Schema['Task'];
    expect(closed.status).toBe('CLOSED');
    expect(closed.completedFollowup?.action.type).toBe('UPDATE_FIELD');
  }
});

// PR #139 supplied GBP for registry money answers, including masked EUR and USD values.
for (const scenario of [
  { currency: 'EUR', masked: false, kind: 'tasks' },
  { currency: 'USD', masked: true, kind: 'events' },
] as const) {
  test(`registry money followups keep ${scenario.currency} with masked=${scenario.masked}`, async ({
    page,
  }) => {
    const thing = await setup(page);
    await api(page, 'PATCH', `/things/${thing.id}`, {
      values: [
        {
          fieldSetId: null,
          fieldId: 'common.pricePaid',
          value: { amountMinor: 1250, currency: scenario.currency },
        },
      ],
    });
    if (scenario.masked) {
      await page.route(`**/api/things/${thing.id}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        const body: Schema['Thing'] = await response.json();
        const field = body.standaloneFields.find((field) => field.id === 'common.pricePaid')!;
        field.masked = true;
        field.value = null;
        await route.fulfill({ response, json: body });
      });
    }
    const reveals: unknown[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith(`/things/${thing.id}:reveal-field`))
        reveals.push(request.postDataJSON());
    });
    const record = await api(page, 'POST', `/${scenario.kind}`, {
      thingId: thing.id,
      title: 'Review purchase price',
      ...(scenario.kind === 'tasks' ? { status: 'ACTIVE' } : { startsAt: '2026-01-01T10:00:00Z' }),
      completionActions: [
        {
          type: 'UPDATE_FIELD',
          label: 'Confirm price',
          fieldSetId: null,
          fieldId: 'common.pricePaid',
          customFieldId: null,
        },
      ],
    });
    if (scenario.kind === 'tasks') await api(page, 'POST', `/tasks/${record.id}:complete`, {});
    await page.goto(`/things/${thing.id}/tasks`);
    await page.getByRole('button', { name: 'Confirm price', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm price' });
    await dialog.getByLabel('Price paid', { exact: true }).fill('15.25');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
    const saved = (await api(page, 'GET', `/things/${thing.id}`)) as Schema['Thing'];
    expect(saved.standaloneFields.find((field) => field.id === 'common.pricePaid')?.value).toEqual({
      amountMinor: 1525,
      currency: scenario.currency,
    });
    if (scenario.masked)
      expect(reveals).toContainEqual({ fieldSetId: null, fieldId: 'common.pricePaid' });
  });
}

// PR #139 rendered registry booleans as text and converted an owner's Yes answer to false.
test('registry boolean followups require Yes or No choices', async ({ page }) => {
  const thing = await setup(page);
  await api(page, 'PATCH', `/things/${thing.id}`, {
    values: [{ fieldSetId: null, fieldId: 'membership.autoRenew', value: false }],
  });
  const task = await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title: 'Check renewal',
    status: 'ACTIVE',
    completionActions: [
      {
        type: 'UPDATE_FIELD',
        label: 'Confirm renewal',
        fieldSetId: null,
        fieldId: 'membership.autoRenew',
        customFieldId: null,
      },
    ],
  });
  await api(page, 'POST', `/tasks/${task.id}:complete`, {});
  await page.goto(`/things/${thing.id}/tasks`);
  await page.getByRole('button', { name: 'Confirm renewal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm renewal' });
  const choice = dialog.getByRole('combobox', { name: 'Automatically renew', exact: true });
  await expect(choice).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await choice.selectOption({ label: 'Yes' });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await api(page, 'GET', `/things/${thing.id}`)) as Schema['Thing'];
  expect(saved.standaloneFields.find((field) => field.id === 'membership.autoRenew')?.value).toBe(
    true,
  );
});

// PR #139 fell back to a standalone value when the named followup field set was removed.
test('missing field-set followups leave standalone values unchanged', async ({ page }) => {
  const thing = await setup(page);
  await api(page, 'PATCH', `/things/${thing.id}`, {
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.warranty'],
    values: [
      { fieldSetId: 'appliances.warranty', fieldId: 'common.warrantyEnds', value: '2096-01-01' },
      { fieldSetId: null, fieldId: 'common.warrantyEnds', value: '2097-02-02' },
    ],
  });
  await api(page, 'POST', '/events', {
    thingId: thing.id,
    title: 'Warranty visit',
    startsAt: '2026-01-01T10:00:00Z',
    completionActions: [
      {
        type: 'UPDATE_FIELD',
        label: 'Confirm warranty',
        fieldSetId: 'appliances.warranty',
        fieldId: 'common.warrantyEnds',
        customFieldId: null,
      },
    ],
  });
  await api(page, 'PATCH', `/things/${thing.id}`, { removeFieldSetIds: ['appliances.warranty'] });
  await page.goto(`/things/${thing.id}/tasks`);
  await page.getByRole('button', { name: 'Confirm warranty', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm warranty' });
  await expect(dialog.getByText('This detail is no longer on the Thing.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  const saved = (await api(page, 'GET', `/things/${thing.id}`)) as Schema['Thing'];
  expect(saved.standaloneFields.find((field) => field.id === 'common.warrantyEnds')?.value).toBe(
    '2097-02-02',
  );
});

// a139bfe closed CHAT followups on the server while the global Tasks collection stayed cached.
test('global Task followup chat refreshes the closed Task before returning', async ({ page }) => {
  const thing = await setup(page);
  const title = 'Inspect global handle ' + thing.id.slice(0, 8);
  const task = await api(page, 'POST', '/tasks', {
    thingId: thing.id,
    title,
    status: 'ACTIVE',
    completionActions: chat,
  });
  await api(page, 'POST', `/tasks/${task.id}:complete`, {});
  await page.goto('/tasks');
  await card(page, title).getByRole('button', { name: 'Discuss the result', exact: true }).click();
  await expect(page.getByText('The saved details are ready.', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/tasks');
  await expect(card(page, title)).toHaveCount(0);
});
