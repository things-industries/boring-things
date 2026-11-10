/** Observable timeline placement and followup behaviour. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Appointment, Task, ThingDate } from '../../src/app/interfaces/task.interface.js';
import { buildAgenda, byImportance, nextItems } from '../../src/app/utils/agenda.util.js';
const now = new Date(2026, 9, 8, 9);
const chat = [
  { type: 'CHAT', label: 'How did it go?', prompt: null },
] satisfies Task['completionActions'];
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
    completionActions: [],
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
    closedAt: null,
    completionActions: [],
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
        completionActions: chat,
      }),
      task('closed', { status: 'CLOSED', completionActions: chat }),
      task('no-actions', { status: 'COMPLETED', completedAt: now.toISOString() }),
    ],
    [
      event('ended', { startsAt: new Date(2026, 9, 1, 10).toISOString(), completionActions: chat }),
      event('ongoing', {
        startsAt: new Date(2026, 9, 8, 8).toISOString(),
        endsAt: new Date(2026, 9, 8, 10).toISOString(),
        completionActions: chat,
      }),
    ],
  );
  assert.deepEqual(ids(result.followups), ['event:ended', 'task:done']);
  assert.deepEqual(ids(result.today), ['event:ongoing']);
  assert.equal(nextItems(result, 1)[0].key, 'event:ended');
});

// PR #139 placed ongoing Events under their past start date, hiding them after midnight.
test('overnight appointments stay in Today and previews until they end', () => {
  const overnight = event('overnight', {
    startsAt: new Date(2026, 9, 7, 23).toISOString(),
    endsAt: new Date(2026, 9, 8, 10).toISOString(),
    completionActions: chat,
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
