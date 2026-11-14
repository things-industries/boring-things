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
  userId: string,
  input: Schema['TaskInput'] | Schema['TaskPatch'],
  id?: string,
) {
  const previous = id ? await tasksDb.getTaskForUserOrThrow(db, userId, id) : null;
  const thingId = previous?.thingId ?? ('thingId' in input ? input.thingId : undefined);
  ensure(thingId, 'Thing is required');
  await thingsDb.getThingForUserOrThrow(db, userId, thingId, { lock: true });
  const existing = id ? await tasksDb.getTaskForUserOrThrow(db, userId, id, true) : null;
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
  return saveTask(db, userId, task, !!id);
}

/** Validates and saves a Task after its Thing and existing occurrence have been locked. */
export async function saveTask(
  db: Database,
  userId: string,
  task: Schema['Task'] & { referenceDates?: tasksDb.TaskRow['referenceDates'] },
  update = false,
) {
  task = { ...task, title: task.title.trim() };
  ensure(task.title, 'Title cannot be blank');
  validateTaskSchedule(task, task.status === 'SUGGESTED' || task.status === 'CLOSED');
  await validateIssueLink(db, userId, task.thingId, task.issueId, task.status === 'CLOSED');
  const saved = await tasksDb.saveTask(
    db,
    userId,
    {
      ...task,
      referenceDates:
        task.scheduledOn || task.referenceDates
          ? {
              scheduledOn: task.referenceDates?.scheduledOn ?? task.scheduledOn,
            }
          : null,
    },
    update,
  );
  await thingsDb.bumpThing(db, userId, task.thingId);
  return saved;
}

/** Completes or closes a locked Task and generates at most one successor. */
export async function changeTask(
  db: Database,
  userId: string,
  id: string,
  action: 'complete' | 'close',
  timeZone: string,
): Promise<Schema['TaskChange']> {
  const initial = await tasksDb.getTaskForUserOrThrow(db, userId, id);
  await thingsDb.getThingForUserOrThrow(db, userId, initial.thingId, { lock: true });
  const task = await tasksDb.getTaskForUserOrThrow(db, userId, id, true);
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
    userId,
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
    const { referenceDates: _referenceDates, ...successor } = await tasksDb.saveTask(db, userId, {
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
  await thingsDb.bumpThing(db, userId, task.thingId);
  return { task: saved, nextTask };
}

/** Returns a completed Task with no actioned followup to active, removing its unedited successor. */
export async function reopenTask(
  db: Database,
  userId: string,
  id: string,
): Promise<Schema['TaskReopen']> {
  const initial = await tasksDb.getTaskForUserOrThrow(db, userId, id);
  await thingsDb.getThingForUserOrThrow(db, userId, initial.thingId, { lock: true });
  const task = await tasksDb.getTaskForUserOrThrow(db, userId, id, true);
  if (task.status === 'ACTIVE') return { task, removedTaskId: null };
  ensure(
    task.status === 'COMPLETED' && !task.completedFollowup,
    'Only completed tasks without an actioned followup can be reopened',
    'CONFLICT',
  );
  const removedTaskId = await tasksDb.deleteUneditedNextOccurrence(db, userId, task);
  const saved = await tasksDb.saveTask(
    db,
    userId,
    { ...task, status: 'ACTIVE', completedAt: null },
    true,
  );
  await thingsDb.bumpThing(db, userId, task.thingId);
  return { task: saved, removedTaskId };
}
