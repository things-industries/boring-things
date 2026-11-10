/** Observable timeline placement and followup behaviour. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Appointment, Task, ThingDate } from '../../src/app/interfaces/task.interface.js';
import { buildAgenda, byImportance, nextItems, timeLine } from '../../src/app/utils/agenda.util.js';
const now = new Date(2026, 9, 8, 9);
function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    thingId: 'thing',
    issueId: null,
    title: id,
    description: '',
    status: 'ACTIVE',
    importance: 'RECOMMENDED',
    scheduledOn: '2026-10-08',
    deadlineOn: null,
    recurrence: null,
    completedAt: null,
    completedFollowup: null,
    closedAt: null,
    referenceTaskId: null,
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
    startsAt: new Date(2026, 9, 8, 14).toISOString(),
    startsOn: null,
    endsAt: null,
    completedFollowup: null,
    closedAt: null,
    sourceRefs: [],
    isSample: false,
    ...overrides,
  };
}
const agenda = (tasks: Task[], events: Appointment[] = [], thingDates: ThingDate[] = []) =>
  buildAgenda({ tasks, events, thingDates, thingNames: { thing: 'Car' } }, now);
const ids = (items: { key: string }[]) => items.map((item) => item.key);
test('unscheduled and overdue tasks lead Today, followed by appointments and tasks by importance', () => {
  const result = agenda(
    [
      task('scheduled', { importance: 'CRITICAL' }),
      task('undated', { scheduledOn: null }),
      task('overdue', {
        deadlineOn: '2026-10-07',
        scheduledOn: '2026-10-01',
        importance: 'CRITICAL',
      }),
      task('past-schedule', { scheduledOn: '2026-10-01' }),
    ],
    [event('visit')],
  );
  assert.deepEqual(ids(result.today), [
    'task:overdue',
    'task:undated',
    'event:visit',
    'task:scheduled',
    'task:past-schedule',
  ]);
  assert.deepEqual(
    result.today.map((item) => item.overdue),
    [true, false, false, false, false],
  );
});
test('completed work and ended appointments keep followups across days until closed', () => {
  const result = agenda(
    [
      task('done', {
        status: 'COMPLETED',
        completedAt: '2026-10-01T12:00:00Z',
      }),
      task('closed', { status: 'CLOSED' }),
      task('done-today', { status: 'COMPLETED', completedAt: now.toISOString() }),
    ],
    [
      event('ended', { startsAt: new Date(2026, 9, 1, 10).toISOString() }),
      event('ongoing', {
        startsAt: new Date(2026, 9, 8, 8).toISOString(),
        endsAt: new Date(2026, 9, 8, 10).toISOString(),
      }),
    ],
  );
  assert.deepEqual(ids(result.followups), ['event:ended', 'task:done']);
  assert.deepEqual(ids(result.today), ['event:ongoing', 'task:done-today']);
  assert.equal(nextItems(result, 1)[0].key, 'event:ended');
});

const done = (item: Task, completedAt: Date): Task => ({
  ...item,
  status: 'COMPLETED',
  completedAt: completedAt.toISOString(),
});
const yesterday = new Date(2026, 9, 7, 12);

test('checking off a task keeps its position while its completion day lasts', () => {
  const open = [
    task('overdue', { scheduledOn: '2026-10-01', deadlineOn: '2026-10-07' }),
    task('undated', { scheduledOn: null }),
    task('critical', { importance: 'CRITICAL' }),
    task('plain'),
    task('later', { scheduledOn: '2026-10-09' }),
  ];
  const before = agenda(open);
  const after = agenda(open.map((item) => done(item, now)));
  assert.deepEqual(ids(after.today), ids(before.today));
  assert.deepEqual(ids(after.tomorrow), ['task:later']);
  assert.deepEqual(after.followups, []);
  const partlyDone = agenda(open.map((item) => (item.id === 'critical' ? done(item, now) : item)));
  assert.deepEqual(ids(partlyDone.today), ids(before.today));
});

test('a completed task offers followup once its completion day has passed', () => {
  const result = agenda([done(task('old'), yesterday)]);
  assert.deepEqual(result.today, []);
  assert.deepEqual(ids(result.followups), ['task:old']);
});

test('chat followups stay on the card that day, then become followups', () => {
  const completedTask = task('visit', {});
  const sameDay = agenda([done(completedTask, now)]);
  assert.deepEqual(ids(sameDay.today), ['task:visit']);
  assert.deepEqual(sameDay.followups, []);
  const nextDay = agenda([done(completedTask, yesterday)]);
  assert.deepEqual(nextDay.today, []);
  assert.deepEqual(ids(nextDay.followups), ['task:visit']);
});

test('a completed task with a passed deadline shows no time line', () => {
  const [item] = agenda([
    done(task('late', { scheduledOn: '2026-10-01', deadlineOn: '2026-10-07' }), now),
  ]).today;
  assert.equal(timeLine(item, now), null);
});

// PR #139 placed ongoing Events under their past start date, hiding them after midnight.
test('overnight appointments stay in Today and previews until they end', () => {
  const overnight = event('overnight', {
    startsAt: new Date(2026, 9, 7, 23).toISOString(),
    endsAt: new Date(2026, 9, 8, 10).toISOString(),
  });
  const result = agenda([], [overnight]);
  assert.deepEqual(ids(result.today), ['event:overnight']);
  assert.equal(result.today[0].day, '2026-10-08');
  assert.deepEqual(ids(nextItems(result, 1)), ['event:overnight']);
  assert.deepEqual(result.followups, []);

  const ended = buildAgenda(
    { tasks: [], events: [overnight], thingDates: [], thingNames: { thing: 'Car' } },
    new Date(2026, 9, 8, 10),
  );
  assert.deepEqual(ended.today, []);
  assert.deepEqual(ids(ended.followups), ['event:overnight']);
});

test('Thing previews leave out Thing dates', () => {
  const date: ThingDate = {
    thingId: 'thing',
    fieldId: 'date',
    fieldSetId: 'set',
    customFieldId: null,
    label: 'A date',
    date: '2026-10-08',
  };
  const result = agenda([task('wash')], [], [date]);
  assert.equal(result.today.length, 2);
  assert.deepEqual(ids(nextItems(result, 5)), ['task:wash']);
});

test('tasks and appointments carry their Thing name', () => {
  const result = agenda([task('wash')], [event('visit')]);
  assert.deepEqual(
    result.today.map((item) => item.thingName),
    ['Car', 'Car'],
  );
});

test('future tasks and all future date fields form day groups', () => {
  const dates: ThingDate[] = [
    {
      thingId: 'thing',
      fieldId: 'date',
      fieldSetId: 'set',
      customFieldId: null,
      label: 'A date',
      date: '2026-10-10',
    },
    {
      thingId: 'thing',
      fieldId: 'old',
      fieldSetId: null,
      customFieldId: null,
      label: 'Old',
      date: '2026-10-01',
    },
  ];
  const result = agenda(
    [
      task('tomorrow', { scheduledOn: '2026-10-09' }),
      task('later', { scheduledOn: '2026-10-10' }),
      task('suggested', { status: 'SUGGESTED' }),
    ],
    [],
    dates,
  );
  assert.deepEqual(ids(result.tomorrow), ['task:tomorrow']);
  assert.deepEqual(ids(result.upcoming[0].items), ['date:thing:set:date:null', 'task:later']);
  assert.deepEqual(
    byImportance([task('b'), task('c', { importance: 'CRITICAL' }), task('a')]).map((t) => t.id),
    ['c', 'a', 'b'],
  );
});
