/** Task lifecycle, recurrence, followup context and owner access through the API. */

import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from '../../../shared/model.js';
import { startTestApp, type TestApp } from '../support/test-app.js';
let app: TestApp;
before(async () => {
  app = await startTestApp();
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
const chat = [
  { type: 'CHAT', label: 'Discuss it', prompt: 'The filter still needs work.' },
] satisfies Schema['CompletionAction'][];

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
    completionActions: chat,
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
  assert.equal(next.completionActions[0].type, 'CHAT');
  const completed = changes[0].task;
  assert.ok(Date.now() - Date.parse(completed.completedAt!) < 10000);
  await request('PATCH', `/tasks/${task.id}`, { scheduledOn: '2026-12-01' });
  assert.deepEqual((await request('GET', `/tasks/${next.id}`)).json(), next);
  assert.equal((await request('DELETE', `/tasks/${task.id}`)).statusCode, 204);
  const nextCompletion = await request('POST', `/tasks/${next.id}:complete`, {});
  assert.equal(nextCompletion.statusCode, 200, nextCompletion.body);
  assert.equal(nextCompletion.json<Schema['TaskChange']>().nextTask?.referenceTaskId, task.id);
});

test('issue resolution closes linked suggestions, active tasks, completed tasks and Events', async () => {
  const thing = await createThing();
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'Broken filter' })
  ).json<Schema['Issue']>();
  const active = await createTask(thing.id, {
    issueId: issue.id,
    completionActions: [{ type: 'RESOLVE_ISSUE', label: 'Fixed' }],
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
      completionActions: chat,
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
  await request('PATCH', `/issues/${issue.id}`, { status: 'OPEN' });
  assert.equal(
    (await request('GET', `/tasks/${active.id}`)).json<Schema['Task']>().status,
    'CLOSED',
  );
  assert.equal(
    (await request('POST', '/conversations', { taskId: active.id, actionIndex: 0 })).statusCode,
    422,
  );
});

test('chat followups send their saved prompt and include item and issue context', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id, { completionActions: chat });
  assert.equal(
    (await request('POST', '/conversations', { taskId: task.id, actionIndex: 0 })).statusCode,
    422,
  );
  await request('POST', `/tasks/${task.id}:complete`, {});
  let context: unknown;
  app.chatAi.probe = async (input) => {
    context = input.activityContext;
  };
  const response = await request('POST', '/conversations', { taskId: task.id, actionIndex: 0 });
  assert.equal(response.statusCode, 201, response.body);
  const conversation = response.json<Schema['Conversation']>();
  assert.equal(conversation.messages[0].text, chat[0].prompt);
  assert.equal(conversation.thingId, thing.id);
  for (let i = 0; i < 100 && !context; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((context as { item: { id: string } }).item.id, task.id);
  app.chatAi.probe = undefined;
  const saved = (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>();
  assert.equal(saved.status, 'CLOSED');
  assert.equal(saved.completedFollowup?.action.type, 'CHAT');
  assert.equal(saved.completedFollowup?.completedAt, saved.closedAt);
  assert.equal(
    (await request('POST', '/conversations', { taskId: task.id, actionIndex: 0 })).statusCode,
    422,
  );
});

test('Thing dates include future registry and custom dates, separate set addresses and omit secrets', async () => {
  const thing = await createThing();
  const response = await request('PATCH', `/things/${thing.id}`, {
    values: [{ fieldSetId: null, fieldId: 'common.warrantyEnds', value: '2090-01-01' }],
    customFields: [
      { label: 'Next inspection', value: '2090-02-01', sensitive: false },
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
});

test('all Task operations and linked context enforce owner scope', async () => {
  const thing = await createThing();
  const task = await createTask(thing.id);
  const other = 'Bearer ' + (await app.signToken({ subject: 'task-other-owner' }));
  for (const [method, path, payload] of [
    ['GET', `/tasks/${task.id}`, undefined],
    ['PATCH', `/tasks/${task.id}`, { title: 'No' }],
    ['DELETE', `/tasks/${task.id}`, undefined],
    ...['accept', 'complete', 'close'].map(
      (action) => ['POST', `/tasks/${task.id}:${action}`, {}] as const,
    ),
    ['POST', `/tasks/${task.id}:followup`, { actionIndex: 0, value: 'no' }],
    ['POST', '/conversations', { taskId: task.id }],
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

// PR #139 offered independent Task followups; the first successful choice must now close it.
test('one field followup closes the Task and competing answers make no further changes', async () => {
  const thing = await createThing();
  const updated = (
    await request('PATCH', `/things/${thing.id}`, {
      customFields: [{ label: 'Inspection count', value: 1, sensitive: true }],
    })
  ).json<Schema['Thing']>();
  const field = updated.customFields[0];
  const task = await createTask(thing.id, {
    completionActions: [
      {
        type: 'UPDATE_FIELD',
        label: 'Record inspection',
        customFieldId: field.id,
        fieldSetId: null,
        fieldId: null,
      },
      ...chat,
    ],
  });
  assert.equal(
    (await request('POST', `/tasks/${task.id}:followup`, { actionIndex: 0, value: 5 })).statusCode,
    409,
  );
  await request('POST', `/tasks/${task.id}:complete`, {});
  assert.equal(
    (await request('POST', `/tasks/${task.id}:followup`, { actionIndex: 0 })).statusCode,
    422,
  );
  assert.equal(
    (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>().status,
    'COMPLETED',
  );
  const replies = await Promise.all(
    [5, 6].map((value) => request('POST', `/tasks/${task.id}:followup`, { actionIndex: 0, value })),
  );
  assert.deepEqual(replies.map((r) => r.statusCode).sort(), [200, 409]);
  const saved = (await request('GET', `/tasks/${task.id}`)).json<Schema['Task']>();
  assert.equal(saved.status, 'CLOSED');
  assert.equal(saved.completedFollowup?.action.type, 'UPDATE_FIELD');
  assert.equal(saved.completedFollowup?.completedAt, saved.closedAt);
  assert.ok(!JSON.stringify(saved.completedFollowup).includes('value'));
  const winner = replies.findIndex((r) => r.statusCode === 200);
  const answer = (
    await request('POST', `/things/${thing.id}:reveal-field`, { customFieldId: field.id })
  ).json<Schema['RevealResult']>();
  assert.equal(answer.value, winner === 0 ? 5 : 6);
  assert.equal(
    (await request('POST', '/conversations', { taskId: task.id, actionIndex: 1 })).statusCode,
    422,
  );
});

test('attachment and issue followups save their result and close Tasks', async () => {
  const thing = await createThing();
  const file = 'followup-fixture';
  const { rows } = await app.pool.query<{ id: string }>(
    `insert into bt.attachments(owner_id,filename,media_type,storage_key,byte_size) select owner_id,'receipt.txt','text/plain',$2,18 from bt.things where id=$1 returning id`,
    [thing.id, file],
  );
  const attachment = await createTask(thing.id, {
    completionActions: [{ type: 'ADD_ATTACHMENT', label: 'Add receipt', documentType: 'RECEIPT' }],
  });
  await request('POST', `/tasks/${attachment.id}:complete`, {});
  const linked = await request('POST', `/tasks/${attachment.id}:followup`, {
    actionIndex: 0,
    attachmentId: rows[0].id,
  });
  assert.equal(linked.statusCode, 200, linked.body);
  assert.equal(linked.json<Schema['Task']>().completedFollowup?.action.type, 'ADD_ATTACHMENT');
  const savedFile = (await request('GET', `/attachments/${rows[0].id}`)).json<
    Schema['Attachment']
  >();
  assert.equal(savedFile.documentType, 'RECEIPT');
  assert.ok(savedFile.thingIds.includes(thing.id));
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'Filter problem' })
  ).json<Schema['Issue']>();
  const task = await createTask(thing.id, {
    issueId: issue.id,
    completionActions: [{ type: 'RESOLVE_ISSUE', label: 'Fixed' }],
  });
  await request('POST', `/tasks/${task.id}:complete`, {});
  const resolved = await request('POST', `/tasks/${task.id}:followup`, { actionIndex: 0 });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(resolved.json<Schema['Task']>().completedFollowup?.action.type, 'RESOLVE_ISSUE');
  assert.equal(
    (await request('GET', `/issues/${issue.id}`)).json<Schema['Issue']>().status,
    'RESOLVED',
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
