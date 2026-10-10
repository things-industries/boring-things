import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Appointment,
  CompletionAction,
  Task,
  ThingDate,
} from '../../src/app/interfaces/task.interface.js';
import { buildAgenda, byPriority, nextItems } from '../../src/app/utils/agenda.util.js';
import { addRecurrence, nextDueOn } from '../../src/app/utils/date.util.js';

const now = new Date(2026, 9, 8, 9, 0);

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    thingId: 'thing',
    issueId: null,
    title: id,
    description: '',
    status: 'SCHEDULED',
    priority: 'RECOMMENDED',
    kind: 'OTHER',
    scheduledOn: '2026-10-08',
    deadlineOn: null,
    recurrence: null,
    completionActions: [],
    completedAt: null,
    sourceRefs: [],
    isSample: false,
    ...overrides,
  };
}

function event(id: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id,
    thingId: 'thing',
    issueId: null,
    title: id,
    description: '',
    status: 'SCHEDULED',
    startsAt: new Date(2026, 9, 8, 14, 0).toISOString(),
    startsOn: null,
    completedAt: null,
    sourceRefs: [],
    isSample: false,
    endsAt: null,
    completionActions: [],
    ...overrides,
  };
}

const chat: CompletionAction[] = [{ type: 'CHAT', label: 'How did it go?', prompt: '' }];

const agenda = (tasks: Task[], events: Appointment[] = [], thingDates: ThingDate[] = []) =>
  buildAgenda({ tasks, events, thingDates, thingNames: { thing: 'Car' } }, now);

const keys = (items: { key: string }[]) => items.map((item) => item.key);

test('Today lists events first, then tasks by priority, then overdue tasks by priority and age', () => {
  const { today } = agenda(
    [
      task('nice', { priority: 'NICE_TO_HAVE' }),
      task('critical', { priority: 'CRITICAL' }),
      task('late-critical', { priority: 'CRITICAL', scheduledOn: '2026-10-06' }),
      task('late-nice', { priority: 'NICE_TO_HAVE', scheduledOn: '2026-10-01' }),
      task('later-nice', { priority: 'NICE_TO_HAVE', scheduledOn: '2026-10-07' }),
      task('important', { priority: 'IMPORTANT' }),
    ],
    [event('visit'), event('all-day', { startsAt: null, startsOn: '2026-10-08' })],
  );

  assert.deepEqual(keys(today), [
    'event:all-day',
    'event:visit',
    'task:critical',
    'task:important',
    'task:nice',
    'task:late-critical',
    'task:late-nice',
    'task:later-nice',
  ]);
});

test('A task past its day but before its deadline sits with today’s tasks, not overdue', () => {
  const { today } = agenda([
    task('renew', { scheduledOn: '2026-10-01', deadlineOn: '2026-10-18' }),
    task('late', { scheduledOn: '2026-10-05', deadlineOn: '2026-10-07' }),
  ]);

  assert.deepEqual(
    today.map((item) => [item.key, item.overdue]),
    [
      ['task:renew', false],
      ['task:late', true],
    ],
  );
});

test('Completed items stay on their day; past ones only on the day they were completed', () => {
  const { today, upcoming } = agenda([
    task('done-today', { status: 'COMPLETED', completedAt: now.toISOString() }),
    task('late-done-today', {
      status: 'COMPLETED',
      scheduledOn: '2026-10-01',
      completedAt: now.toISOString(),
    }),
    task('late-done-before', {
      status: 'COMPLETED',
      scheduledOn: '2026-10-01',
      completedAt: new Date(2026, 9, 7, 12).toISOString(),
    }),
    task('early', {
      status: 'COMPLETED',
      scheduledOn: '2026-10-20',
      completedAt: new Date(2026, 9, 7, 12).toISOString(),
    }),
    task('suggested', { status: 'SUGGESTED', scheduledOn: null }),
  ]);

  assert.deepEqual(keys(today), ['task:done-today', 'task:late-done-today']);
  assert.deepEqual(
    upcoming.map((day) => [day.date, keys(day.items)]),
    [['2026-10-20', ['task:early']]],
  );
});

test('Past events with completion actions show today while open or completed today', () => {
  const yesterday = new Date(2026, 9, 7, 10).toISOString();
  const { today } = agenda(
    [],
    [
      event('past', { startsAt: yesterday }),
      event('open', { startsAt: yesterday, completionActions: chat }),
      event('answered-today', {
        startsAt: yesterday,
        completionActions: chat,
        status: 'COMPLETED',
        completedAt: now.toISOString(),
      }),
      event('answered-before', {
        startsAt: yesterday,
        completionActions: chat,
        status: 'COMPLETED',
        completedAt: yesterday,
      }),
    ],
  );

  assert.deepEqual(keys(today), ['event:answered-today', 'event:open']);
  assert.ok(today.every((item) => item.overdue));
});

test('Tomorrow and upcoming days group by date, with Thing dates and no past dates', () => {
  const { tomorrow, upcoming } = agenda(
    [task('tomorrow', { scheduledOn: '2026-10-09' }), task('later', { scheduledOn: '2026-11-03' })],
    [],
    [
      { thingId: 'thing', fieldId: 'ends', label: 'Warranty ends', date: '2026-11-03' },
      { thingId: 'thing', fieldId: 'old', label: 'Expired', date: '2026-10-01' },
      { thingId: 'missing', fieldId: 'ends', label: 'Warranty ends', date: '2026-11-03' },
    ],
  );

  assert.deepEqual(keys(tomorrow), ['task:tomorrow']);
  assert.deepEqual(
    upcoming.map((day) => [day.date, keys(day.items)]),
    [['2026-11-03', ['date:thing:ends', 'task:later']]],
  );
});

test('Recurrence adds whole calendar units', () => {
  assert.equal(addRecurrence('2026-01-31', { interval: 1, unit: 'MONTH' }), '2026-02-28');
  assert.equal(addRecurrence('2026-10-08', { interval: 2, unit: 'WEEK' }), '2026-10-22');
  assert.equal(addRecurrence('2026-10-08', { interval: 12, unit: 'MONTH' }), '2027-10-08');
  assert.equal(addRecurrence('2026-10-08', { interval: 3, unit: 'DAY' }), '2026-10-11');
});

test('The next task counts from completion or from the due date', () => {
  const monthly = { interval: 1, unit: 'MONTH' } as const;

  // Finished late and early.
  for (const completedOn of ['2026-10-20', '2026-10-01']) {
    assert.equal(
      nextDueOn('2026-10-08', completedOn, { ...monthly, from: 'COMPLETION' }),
      addRecurrence(completedOn, monthly),
    );
    assert.equal(
      nextDueOn('2026-10-08', completedOn, { ...monthly, from: 'DUE_DATE' }),
      '2026-11-08',
    );
  }
});

test('Items sit on their day, overdue ones on today, and previews take the next ones', () => {
  const result = agenda([
    task('late', { scheduledOn: '2026-10-01' }),
    task('tomorrow', { scheduledOn: '2026-10-09' }),
    task('later', { scheduledOn: '2026-11-03' }),
  ]);

  assert.deepEqual(
    nextItems(result, 2).map((item) => [item.key, item.day]),
    [
      ['task:late', '2026-10-08'],
      ['task:tomorrow', '2026-10-09'],
    ],
  );
});

test('Suggestions list by priority, then title', () => {
  const sorted = byPriority([
    task('b', { priority: 'NICE_TO_HAVE' }),
    task('c', { priority: 'CRITICAL' }),
    task('a', { priority: 'NICE_TO_HAVE' }),
    task('d', { priority: 'IMPORTANT' }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['c', 'd', 'a', 'b'],
  );
});
