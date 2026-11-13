/** Task lifecycle, recurrence, followup context and owner access through the API. */

import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from '../../../shared/model.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
let app: TestApp;
before(async () => {
  app = await createTestApp();
});
after(async () => {
  await app?.close();
});
async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
  authorization?: string,
) {
  return app.app.inject({
    method,
    url: '/api' + path,
    payload,
    headers: { authorization: authorization ?? app.authorization },
  });
}
async function createThing() {
  const response = await request('POST', '/things', { name: 'Task fixture', categoryId: 'other' });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<Schema['Thing']>();
}
async function createTask(thingId: string, patch: Partial<Schema['TaskInput']> = {}) {
  const response = await request('POST', '/tasks', {
    thingId,
    title: 'Check the filter',
    status: 'ACTIVE',
    ...patch,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<Schema['Task']>();
}

test('tasks accept missing dates, validate recurrence and reject lifecycle changes through edits', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id);
  assert.equal(task.scheduledOn, null);
  assert.equal(task.deadlineOn, null);
  for (const patch of [
    { scheduledOn: '2026-02-30' },
    { scheduledOn: '2026-10-02', deadlineOn: '2026-10-01' },
    { recurrence: { interval: 1, unit: 'MONTH', from: 'SCHEDULED' } },
    { scheduledOn: '2096-01-01', recurrence: { interval: 1, unit: 'MONTH', from: 'DEADLINE' } },
    { status: 'SUGGESTED' },
    { completedAt: '2026-01-01T00:00:00Z' },
  ]) {
    const response = await request('PATCH', `/tasks/${task.id}`, patch);
    assert.equal(response.statusCode, 422, response.body);
  }
  const changed = await request('PATCH', `/tasks/${task.id}`, { deadlineOn: '2027-01-01' });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.ok(
    (await request('GET', '/tasks?from=2026-01-01&to=2026-01-02'))
      .json<Schema['TaskList']>()
      .items.some((t) => t.id === task.id),
  );
  assert.equal(
    (await request('POST', `/tasks/${task.id}:complete`, { timeZone: 'Invalid/Zone' })).statusCode,
    422,
  );
});

test('acceptance calls the scheduling task once and failed scheduling leaves the suggestion unchanged', async (t) => {
  const thing = await createThing();
  const task = await createTask(thing.id, {
    status: 'SUGGESTED',
    recurrence: { interval: 1, unit: 'MONTH', from: 'SCHEDULED' },
  });
  const before = app.taskScheduler.calls;
  const response = await request('POST', `/tasks/${task.id}:accept`, { timeZone: 'Europe/London' });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json<Schema['TaskChange']>().task.status, 'ACTIVE');
  assert.equal(app.taskScheduler.calls, before + 1);
  await request('POST', `/tasks/${task.id}:accept`, {});
  assert.equal(app.taskScheduler.calls, before + 1);
  const failed = await createTask(thing.id, { status: 'SUGGESTED' });
  t.mock.method(app.taskScheduler, 'schedule', async () => {
    throw new Error('Fixture failure');
  });
  assert.equal((await request('POST', `/tasks/${failed.id}:accept`, {})).statusCode, 503);
  assert.equal(
    (await request('GET', `/tasks/${failed.id}`)).json<Schema['Task']>().status,
    'SUGGESTED',
  );
});

for (const change of ['edit', 'resolve'] as const) {
  test(`acceptance rechecks the suggestion after a concurrent ${change}`, async (t) => {
    const thing = await createThing();
    const issue = (
      await request('POST', '/issues', { thingId: thing.id, title: 'Filter leak' })
    ).json<Schema['Issue']>();
    const task = await createTask(thing.id, { status: 'SUGGESTED', issueId: issue.id });
    t.mock.method(app.taskScheduler, 'schedule', async () => {
      const response =
        change === 'edit'
          ? await request('PATCH', `/tasks/${task.id}`, { title: 'Updated work' })
          : await request('PATCH', `/issues/${issue.id}`, { status: 'RESOLVED' });
      assert.equal(response.statusCode, 200, response.body);
      return { scheduledOn: '2096-01-01', deadlineOn: null };
    });
    const response = await request('POST', `/tasks/${task.id}:accept`, {});
    assert.equal(response.statusCode, change === 'edit' ? 409 : 200, response.body);
    const saved = (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>();
    assert.equal(saved.status, change === 'edit' ? 'SUGGESTED' : 'CLOSED');
    assert.equal(saved.scheduledOn, null);
    if (change === 'edit') assert.equal(saved.title, 'Updated work');
  });
}

test('deadlines exclude recurrence on creation and occurrence edits', async () => {
  const thing = await createThing();
  const recurrence = { interval: 1, unit: 'MONTH', from: 'SCHEDULED' } as const;
  for (const status of ['SUGGESTED', 'ACTIVE']) {
    const response = await request('POST', '/tasks', {
      thingId: thing.id,
      title: 'Review the cover',
      status,
      deadlineOn: '2096-01-10',
      recurrence,
    });
    assert.equal(response.statusCode, 422, response.body);
  }
  const task = await createTask(thing.id, { scheduledOn: '2096-01-01', recurrence });
  assert.equal(
    (await request('PATCH', `/tasks/${task.id}`, { deadlineOn: '2096-01-10' })).statusCode,
    422,
  );
  const changed = await request('PATCH', `/tasks/${task.id}`, {
    deadlineOn: '2096-01-10',
    recurrence: null,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await request('PATCH', `/tasks/${task.id}`, { recurrence })).statusCode, 422);
  const completed = await request('POST', `/tasks/${task.id}:complete`, {});
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json<Schema['TaskChange']>().nextTask, null);
});

test('acceptance keeps an evidenced deadline and removes recurrence', async (t) => {
  const thing = await createThing();
  const task = await createTask(thing.id, {
    status: 'SUGGESTED',
    recurrence: { interval: 1, unit: 'YEAR', from: 'COMPLETION' },
  });
  t.mock.method(app.taskScheduler, 'schedule', async () => ({
    scheduledOn: null,
    deadlineOn: '2096-01-10',
  }));
  const accepted = await request('POST', `/tasks/${task.id}:accept`, {});
  assert.equal(accepted.statusCode, 200, accepted.body);
  const saved = accepted.json<Schema['TaskChange']>().task;
  assert.equal(saved.status, 'ACTIVE');
  assert.equal(saved.scheduledOn, null);
  assert.equal(saved.deadlineOn, '2096-01-10');
  assert.equal(saved.recurrence, null);
  const completed = await request('POST', `/tasks/${task.id}:complete`, {});
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json<Schema['TaskChange']>().nextTask, null);
});

test('concurrent completion creates one successor and later edits and deletion do not move it', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id, {
    scheduledOn: '2026-01-20',
    recurrence: { interval: 1, unit: 'MONTH', from: 'SCHEDULED' },
  });
  const responses = await Promise.all([
    request('POST', `/tasks/${task.id}:complete`, { timeZone: 'Europe/London' }),
    request('POST', `/tasks/${task.id}:complete`, { timeZone: 'Europe/London' }),
  ]);
  responses.forEach((r) => assert.equal(r.statusCode, 200, r.body));
  const changes = responses.map((r) => r.json<Schema['TaskChange']>());
  const next = changes.find((c) => c.nextTask)?.nextTask;
  assert.ok(next);
  assert.equal(changes.filter((c) => c.nextTask).length, 1);
  assert.equal(next.referenceTaskId, task.id);
  assert.ok(next.scheduledOn! > new Date().toISOString().slice(0, 10));
  assert.equal(next.deadlineOn, null);
  assert.equal(next.completedFollowup, null);
  const completed = changes[0].task;
  assert.ok(Date.now() - Date.parse(completed.completedAt!) < 10000);
  await request('PATCH', `/tasks/${task.id}`, { scheduledOn: '2026-12-01' });
  assert.deepEqual((await request('GET', `/tasks/${next.id}`)).json(), next);
  assert.equal((await request('DELETE', `/tasks/${task.id}`)).statusCode, 204);
  const nextCompletion = await request('POST', `/tasks/${next.id}:complete`, {});
  assert.equal(nextCompletion.statusCode, 200, nextCompletion.body);
  assert.equal(nextCompletion.json<Schema['TaskChange']>().nextTask?.referenceTaskId, task.id);
});

const repeating = {
  scheduledOn: '2026-01-20',
  recurrence: { interval: 1, unit: 'MONTH', from: 'COMPLETION' },
} satisfies Partial<Schema['TaskInput']>;
async function complete(id: string) {
  const response = await request('POST', `/tasks/${id}:complete`, { timeZone: 'Europe/London' });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<Schema['TaskChange']>();
}
async function reopen(id: string) {
  const response = await request('POST', `/tasks/${id}:reopen`);
  assert.equal(response.statusCode, 200, response.body);
  return response.json<Schema['TaskReopen']>();
}

test('reopening a completed Task removes its unedited successor once', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id, repeating);
  const { nextTask } = await complete(task.id);
  assert.ok(nextTask);
  const reopened = await reopen(task.id);
  assert.equal(reopened.task.status, 'ACTIVE');
  assert.equal(reopened.task.completedAt, null);
  assert.equal(reopened.removedTaskId, nextTask.id);
  assert.equal((await request('GET', `/tasks/${nextTask.id}`)).statusCode, 404);
  const retry = await reopen(task.id);
  assert.equal(retry.task.status, 'ACTIVE');
  assert.equal(retry.removedTaskId, null);
});

test('reopening keeps an edited successor and work after a later completion', async () => {
  const thing = await createThing();
  const edited = await createTask(thing.id, repeating);
  const { nextTask: changed } = await complete(edited.id);
  assert.ok(changed);
  await request('PATCH', `/tasks/${changed.id}`, { title: 'Edited occurrence' });
  assert.equal((await reopen(edited.id)).removedTaskId, null);
  assert.equal((await request('GET', `/tasks/${changed.id}`)).statusCode, 200);

  const first = await createTask(thing.id, repeating);
  const { nextTask: second } = await complete(first.id);
  assert.ok(second);
  const { nextTask: third } = await complete(second.id);
  assert.ok(third);
  assert.equal((await reopen(first.id)).removedTaskId, null);
  assert.equal((await request('GET', `/tasks/${third.id}`)).statusCode, 200);
  assert.equal((await reopen(second.id)).removedTaskId, third.id);
});

test('only completed Tasks without an actioned followup can be reopened', async () => {
  const thing = await createThing();
  const suggested = await createTask(thing.id, { status: 'SUGGESTED' });
  const dismissed = await createTask(thing.id, {});
  await complete(dismissed.id);
  await request('POST', `/tasks/${dismissed.id}:close`, {});
  const answered = await createTask(thing.id, {
    issueId: (await request('POST', '/issues', { thingId: thing.id, title: 'Leak' })).json<
      Schema['Issue']
    >().id,
  });
  await complete(answered.id);
  const conversation = (
    await request('POST', '/conversations', { taskId: answered.id, followup: true })
  ).json<Schema['Conversation']>();
  const followup = await request('POST', `/conversations/${conversation.id}/messages`, {
    text: 'It went well.',
    requestId: crypto.randomUUID(),
  });
  assert.equal(followup.statusCode, 202, followup.body);
  for (const id of [suggested.id, dismissed.id, answered.id]) {
    const response = await request('POST', `/tasks/${id}:reopen`);
    assert.equal(response.statusCode, 409, response.body);
  }
});

test('issue resolution closes linked suggestions, active tasks, completed tasks and Events', async () => {
  const thing = await createThing();
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'Broken filter' })
  ).json<Schema['Issue']>();
  const active = await createTask(thing.id, {
    issueId: issue.id,
  });
  const suggestion = await createTask(thing.id, { status: 'SUGGESTED', issueId: issue.id });
  const done = await createTask(thing.id, { issueId: issue.id });
  await request('POST', `/tasks/${done.id}:complete`, {});
  const event = (
    await request('POST', '/events', {
      thingId: thing.id,
      issueId: issue.id,
      title: 'Engineer visit',
      startsAt: '2026-01-01T12:00:00Z',
      endsAt: '2026-01-01T13:00:00Z',
    })
  ).json<Schema['Event']>();
  assert.ok(event.id);
  const response = await request('PATCH', `/issues/${issue.id}`, { status: 'RESOLVED' });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json<Schema['IssueChange']>();
  assert.deepEqual(
    new Set(result.tasks.map((t) => t.id)),
    new Set([active.id, suggestion.id, done.id]),
  );
  assert.equal(result.events[0].id, event.id);
  assert.ok(result.tasks.every((t) => t.status === 'CLOSED' && t.closedAt));
  assert.ok(result.events[0].closedAt);
  assert.equal(result.events[0].status, 'CLOSED');
  const repeated = (await request('PATCH', `/issues/${issue.id}`, { status: 'RESOLVED' })).json<
    Schema['IssueChange']
  >();
  assert.deepEqual(
    new Set(repeated.tasks.map((task) => task.id)),
    new Set(result.tasks.map((task) => task.id)),
  );
  assert.deepEqual(repeated.events, result.events);
  await request('PATCH', `/issues/${issue.id}`, { status: 'OPEN' });
  assert.equal(
    (await request('GET', `/tasks/${active.id}`)).json<Schema['Task']>().status,
    'CLOSED',
  );
  assert.equal(
    (await request('POST', '/conversations', { taskId: active.id, followup: true })).statusCode,
    409,
  );
});

test('chat followups reuse conversations and record the first owner message with item and issue context', async (t) => {
  const thing = await createThing();
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'Filter leak' })
  ).json<Schema['Issue']>();
  const task = await createTask(thing.id, { issueId: issue.id });
  assert.equal(
    (await request('POST', '/conversations', { taskId: task.id, followup: true })).statusCode,
    422,
  );
  await complete(task.id);
  let context: unknown;
  app.chatAi.probe = async (input) => {
    if (input.thingId === thing.id) context = input.activityContext;
  };
  t.after(() => {
    app.chatAi.probe = undefined;
  });
  const conversations = await Promise.all(
    [1, 2].map(() => request('POST', '/conversations', { taskId: task.id, followup: true })),
  );
  conversations.forEach((r) => assert.equal(r.statusCode, 201, r.body));
  const conversation = conversations[0].json<Schema['Conversation']>();
  assert.equal(conversations[1].json<Schema['Conversation']>().id, conversation.id);
  assert.deepEqual(conversation.messages, []);
  assert.equal(
    (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>().status,
    'COMPLETED',
  );
  const message = { text: 'The filter no longer leaks.', requestId: crypto.randomUUID() };
  const sent = await request('POST', `/conversations/${conversation.id}/messages`, message);
  assert.equal(sent.statusCode, 202, sent.body);
  const saved = (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>();
  assert.equal(saved.status, 'CLOSED');
  assert.deepEqual(saved.completedFollowup, {
    conversationId: conversation.id,
    completedAt: saved.closedAt,
  });
  assert.equal(
    (await request('POST', '/conversations', { taskId: task.id, followup: true })).json<
      Schema['Conversation']
    >().id,
    conversation.id,
  );
  const retry = await request('POST', `/conversations/${conversation.id}/messages`, message);
  assert.equal(retry.statusCode, 202, retry.body);
  for (let i = 0; i < 100 && !context; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    context &&
      typeof context === 'object' &&
      'item' in context &&
      'issue' in context &&
      'followup' in context,
  );
  assert.equal(context.followup, true);
  assert.ok(context.item && typeof context.item === 'object' && 'id' in context.item);
  assert.equal(context.item.id, task.id);
  assert.ok(context.issue && typeof context.issue === 'object' && 'id' in context.issue);
  assert.equal(context.issue.id, issue.id);
  assert.equal(
    (await request('GET', `/issues/${issue.id}`)).json<Schema['Issue']>().status,
    'OPEN',
  );
});

test('Thing dates include future registry and custom dates, and omit text and secrets', async () => {
  const thing = await createThing();
  const response = await request('PATCH', `/things/${thing.id}`, {
    values: [{ fieldSetId: null, fieldId: 'common.warrantyEnds', value: '2090-01-01' }],
    customFields: [
      { label: 'Next inspection', value: '2090-02-01', sensitive: false },
      { label: 'Date-shaped note', value: '2090-02-02', valueType: 'STRING', sensitive: false },
      { label: 'Private expiry', value: '2090-03-01', sensitive: true },
      { label: 'Past date', value: '2020-01-01', sensitive: false },
    ],
  });
  assert.equal(response.statusCode, 200, response.body);
  const dates = await request('GET', `/thing-dates?thingId=${thing.id}&timeZone=Europe%2FLondon`);
  assert.equal(dates.statusCode, 200, dates.body);
  const items = dates.json<Schema['ThingDateList']>().items;
  assert.deepEqual(
    items.map((i) => i.date),
    ['2090-01-01', '2090-02-01'],
  );
  assert.ok(items[1].customFieldId);

  const edit = { id: items[1].customFieldId!, label: 'Next inspection', sensitive: false };
  for (const value of ['2090-02-30', '1 February 2090', 0]) {
    const rejected = await request('PATCH', `/things/${thing.id}`, {
      customFields: [{ ...edit, value }],
    });
    assert.equal(rejected.statusCode, 422, rejected.body);
  }
  const cleared = await request('PATCH', `/things/${thing.id}`, {
    customFields: [{ ...edit, value: null }],
    pinnedFields: [{ customFieldId: edit.id }],
  });
  assert.equal(cleared.statusCode, 200, cleared.body);
  const saved = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  const field = saved.customFields.find(({ id }) => id === edit.id);
  assert.equal(field?.valueType, 'DATE');
  assert.equal(field?.value, null);
  assert.deepEqual(saved.pinnedFields, [{ customFieldId: edit.id }]);
  const upcoming = await request('GET', `/thing-dates?thingId=${thing.id}`);
  assert.deepEqual(
    upcoming.json<Schema['ThingDateList']>().items.map(({ date }) => date),
    ['2090-01-01'],
  );
});

test('all Task operations and linked context enforce owner scope', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id);
  const other = 'Bearer ' + (await app.signToken({ subject: 'task-other-owner' }));
  for (const [method, path, payload] of [
    ['GET', `/tasks/${task.id}`, undefined],
    ['PATCH', `/tasks/${task.id}`, { title: 'No' }],
    ['DELETE', `/tasks/${task.id}`, undefined],
    ...['accept', 'complete', 'close', 'reopen'].map(
      (action) => ['POST', `/tasks/${task.id}:${action}`, {}] as const,
    ),
    ['POST', '/conversations', { taskId: task.id }],
    ['POST', '/conversations', { taskId: task.id, followup: true }],
  ] as const) {
    const response = await request(method, path, payload, other);
    assert.equal(response.statusCode, 404, response.body);
  }
  assert.deepEqual(
    (await request('GET', `/tasks?thingId=${thing.id}`, undefined, other)).json<
      Schema['TaskList']
    >().items,
    [],
  );
  assert.deepEqual(
    (await request('GET', `/thing-dates?thingId=${thing.id}`, undefined, other)).json<
      Schema['ThingDateList']
    >().items,
    [],
  );
});

test('ended Events record chat followups while ordinary Ask leaves the Event open', async () => {
  const thing = await createThing();
  for (const schedule of [{ startsAt: '2000-01-01T10:00:00Z' }, { startsOn: '2000-01-01' }]) {
    const event = (
      await request('POST', '/events', { thingId: thing.id, title: 'Engineer visit', ...schedule })
    ).json<Schema['Event']>();
    const ask = (await request('POST', '/conversations', { eventId: event.id })).json<
      Schema['Conversation']
    >();
    await request('POST', `/conversations/${ask.id}/messages`, {
      text: 'What was this visit for?',
      requestId: crypto.randomUUID(),
    });
    assert.equal(
      (await request('GET', `/events/${event.id}`)).json<Schema['Event']>().status,
      'SCHEDULED',
    );
    const pending = (
      await request('GET', `/events?thingId=${thing.id}&status=SCHEDULED&from=2099-01-01T00:00:00Z`)
    ).json<Schema['EventList']>();
    assert.ok(pending.items.some((item) => item.id === event.id));
    const conversation = (
      await request('POST', '/conversations', {
        eventId: event.id,
        followup: true,
        timeZone: 'Europe/London',
      })
    ).json<Schema['Conversation']>();
    assert.equal(
      (await request('GET', `/events/${event.id}`)).json<Schema['Event']>().completedFollowup,
      null,
    );
    const sent = await request('POST', `/conversations/${conversation.id}/messages`, {
      text: 'The visit went well.',
      requestId: crypto.randomUUID(),
    });
    assert.equal(sent.statusCode, 202, sent.body);
    const saved = (await request('GET', `/events/${event.id}`)).json<Schema['Event']>();
    assert.equal(saved.status, 'CLOSED');
    assert.deepEqual(saved.completedFollowup, {
      conversationId: conversation.id,
      completedAt: saved.closedAt,
    });
    assert.equal(
      (await request('POST', '/conversations', { eventId: event.id, followup: true })).json<
        Schema['Conversation']
      >().id,
      conversation.id,
    );
  }
  const future = (
    await request('POST', '/events', {
      thingId: thing.id,
      title: 'Future visit',
      startsOn: '2099-01-01',
    })
  ).json<Schema['Event']>();
  assert.equal(
    (await request('POST', '/conversations', { eventId: future.id, followup: true })).statusCode,
    422,
  );
});

test('dismissed or reopened work rejects a pending followup message without recording it', async () => {
  const thing = await createThing();
  for (const action of ['close', 'reopen']) {
    const task = await createTask(thing.id);
    await complete(task.id);
    const conversation = (
      await request('POST', '/conversations', { taskId: task.id, followup: true })
    ).json<Schema['Conversation']>();
    await request('POST', `/tasks/${task.id}:${action}`, {});
    const sent = await request('POST', `/conversations/${conversation.id}/messages`, {
      text: 'Outcome.',
      requestId: crypto.randomUUID(),
    });
    assert.equal(sent.statusCode, 409, sent.body);
    assert.equal(
      (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>().completedFollowup,
      null,
    );
    assert.deepEqual(
      (await request('GET', `/conversations/${conversation.id}`)).json<Schema['Conversation']>()
        .messages,
      [],
    );
  }
});

test('rescheduling an ended Event rejects its pending followup and rolls back the message', async () => {
  const thing = await createThing();
  const event = (
    await request('POST', '/events', {
      thingId: thing.id,
      title: 'Engineer visit',
      startsOn: '2000-01-01',
    })
  ).json<Schema['Event']>();
  const conversation = (
    await request('POST', '/conversations', { eventId: event.id, followup: true })
  ).json<Schema['Conversation']>();
  const changed = await request('PATCH', `/events/${event.id}`, { startsOn: '2099-01-01' });
  assert.equal(changed.statusCode, 200, changed.body);
  const sent = await request('POST', `/conversations/${conversation.id}/messages`, {
    text: 'The visit was postponed.',
    requestId: crypto.randomUUID(),
  });
  assert.equal(sent.statusCode, 409, sent.body);
  assert.equal(
    (await request('GET', `/events/${event.id}`)).json<Schema['Event']>().completedFollowup,
    null,
  );
  assert.deepEqual(
    (await request('GET', `/conversations/${conversation.id}`)).json<Schema['Conversation']>()
      .messages,
    [],
  );
});

// a139bfe kept null references when a scheduled date was added, breaking later occurrences.
test('a newly added scheduled date gets a reference for every later occurrence', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id, {
    status: 'SUGGESTED',
    recurrence: { interval: 1, unit: 'MONTH', from: 'SCHEDULED' },
  });
  const edited = await request('PATCH', `/tasks/${task.id}`, { scheduledOn: '2096-01-01' });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal((await request('POST', `/tasks/${task.id}:accept`, {})).statusCode, 200);
  let current = task;
  for (const month of ['02', '03']) {
    const response = await request('POST', `/tasks/${current.id}:complete`, {});
    assert.equal(response.statusCode, 200, response.body);
    const next = response.json<Schema['TaskChange']>().nextTask;
    assert.ok(next);
    assert.equal(next.scheduledOn, `2096-${month}-01`);
    assert.equal(next.deadlineOn, null);
    current = next;
  }
});
