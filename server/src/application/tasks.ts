/** Task creation, occurrence edits and transactional completion and closure rules. */

import { randomUUID } from 'node:crypto';
import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import * as tasksDb from '../db/entities/tasks.js';
import * as thingsDb from '../db/entities/things.js';
import { ensure } from './errors.js';
import { validateIssueLink } from './activity-links.js';
import { getLocalDate, getNextTaskDates, validateTaskSchedule } from './task-recurrence.js';

/** Creates a task or updates selected properties on one occurrence. */
export async function writeTask(
  db: Database,
  owner: string,
  input: Schema['TaskInput'] | Schema['TaskPatch'],
  id?: string,
) {
  const previous = id ? await tasksDb.getOwnedTaskOrThrow(db, owner, id) : null;
  const thingId = previous?.thingId ?? ('thingId' in input ? input.thingId : undefined);
  ensure(thingId, 'Thing is required');
  await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
  const existing = id ? await tasksDb.getOwnedTaskOrThrow(db, owner, id, true) : null;
  const task = {
    id: existing?.id ?? ('id' in input ? input.id : undefined) ?? randomUUID(),
    thingId,
    issueId: null,
    title: '',
    description: '',
    status: 'SUGGESTED',
    importance: 'RECOMMENDED',
    scheduledOn: null,
    deadlineOn: null,
    recurrence: null,
    completedAt: null,
    completedFollowup: null,
    closedAt: null,
    referenceTaskId: null,
    sourceRefs: [],
    isSample: false,
    ...existing,
    ...input,
  } satisfies Schema['Task'];
  task.title = task.title.trim();
  ensure(task.title, 'Title cannot be blank');
  validateTaskSchedule(task, task.status === 'SUGGESTED' || task.status === 'CLOSED');
  await validateIssueLink(db, owner, thingId, task.issueId, task.status === 'CLOSED');
  const saved = await tasksDb.saveTask(
    db,
    owner,
    {
      ...task,
      referenceDates:
        task.scheduledOn || existing?.referenceDates
          ? {
              scheduledOn: existing?.referenceDates?.scheduledOn ?? task.scheduledOn,
            }
          : null,
    },
    !!id,
  );
  await thingsDb.bumpThing(db, owner, thingId);
  return saved;
}

/** Completes or closes a locked Task and generates at most one successor. */
export async function changeTask(
  db: Database,
  owner: string,
  id: string,
  action: 'complete' | 'close',
  timeZone: string,
): Promise<Schema['TaskChange']> {
  const initial = await tasksDb.getOwnedTaskOrThrow(db, owner, id);
  await thingsDb.getOwnedThingOrThrow(db, owner, initial.thingId, { lock: true });
  const task = await tasksDb.getOwnedTaskOrThrow(db, owner, id, true);
  const today = getLocalDate(new Date(), timeZone);
  if ((action === 'complete' && task.completedAt) || task.status === 'CLOSED')
    return { task, nextTask: null };
  ensure(
    action === 'close' || task.status === 'ACTIVE',
    'Only active tasks can be completed',
    'CONFLICT',
  );
  const now = new Date().toISOString();
  const saved = await tasksDb.saveTask(
    db,
    owner,
    {
      ...task,
      status: action === 'complete' ? 'COMPLETED' : 'CLOSED',
      completedAt: action === 'complete' ? now : task.completedAt,
      closedAt: action === 'close' ? now : null,
    },
    true,
  );
  let nextTask: Schema['Task'] | null = null;
  if (action === 'complete' && task.recurrence) {
    const referenceDates = task.referenceDates ?? {
      scheduledOn: task.scheduledOn,
    };
    const { referenceDates: _referenceDates, ...successor } = await tasksDb.saveTask(db, owner, {
      ...task,
      ...getNextTaskDates(task, referenceDates, today),
      id: randomUUID(),
      status: 'ACTIVE',
      completedAt: null,
      completedFollowup: null,
      closedAt: null,
      referenceTaskId: task.referenceTaskId ?? task.id,
      referenceDates,
    });
    nextTask = successor;
  }
  await thingsDb.bumpThing(db, owner, task.thingId);
  return { task: saved, nextTask };
}

/** Returns a completed Task with no actioned followup to active, removing its unedited successor. */
export async function reopenTask(
  db: Database,
  owner: string,
  id: string,
): Promise<Schema['TaskReopen']> {
  const initial = await tasksDb.getOwnedTaskOrThrow(db, owner, id);
  await thingsDb.getOwnedThingOrThrow(db, owner, initial.thingId, { lock: true });
  const task = await tasksDb.getOwnedTaskOrThrow(db, owner, id, true);
  if (task.status === 'ACTIVE') return { task, removedTaskId: null };
  ensure(
    task.status === 'COMPLETED' && !task.completedFollowup,
    'Only completed tasks without an actioned followup can be reopened',
    'CONFLICT',
  );
  const removedTaskId = await tasksDb.deleteUneditedNextOccurrence(db, owner, task);
  const saved = await tasksDb.saveTask(
    db,
    owner,
    { ...task, status: 'ACTIVE', completedAt: null },
    true,
  );
  await thingsDb.bumpThing(db, owner, task.thingId);
  return { task: saved, removedTaskId };
}
