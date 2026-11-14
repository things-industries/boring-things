/** Acceptance workflow and provider contract for choosing evidenced Task dates. */

import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import * as database from '../db/connection.js';
import * as thingsDb from '../db/entities/things.js';
import * as tasksDb from '../db/entities/tasks.js';
import type { Registry } from './registry/registry.js';
import { detail } from './things.js';
import { saveTask } from './tasks.js';
import { getLocalDate } from './task-recurrence.js';
import { ensure } from './errors.js';

export interface TaskSchedule {
  scheduledOn: string | null;
  deadlineOn: string | null;
}

export interface TaskScheduler {
  schedule(
    task: Schema['Task'],
    thing: Schema['Thing'],
    history: Schema['Task'][],
    today: string,
  ): Promise<TaskSchedule>;
}

/** Chooses dates outside the transaction, then rechecks the suggestion before acceptance. */
export async function acceptTask(
  pool: pg.Pool,
  userId: string,
  id: string,
  timeZone: string,
  registry: Registry,
  scheduler?: TaskScheduler,
): Promise<Schema['TaskChange']> {
  const today = getLocalDate(new Date(), timeZone);
  const task = await tasksDb.getTaskForUserOrThrow(pool, userId, id);
  if (task.status !== 'SUGGESTED') return { task, nextTask: null };
  ensure(scheduler, 'Task scheduling is not configured', 'UNAVAILABLE');
  const thing = await detail(pool, userId, task.thingId, registry, { redactSensitive: true });
  const history = (await tasksDb.listTasks(pool, userId, { thingId: task.thingId, limit: 200 }))
    .items;
  let dates: TaskSchedule;
  try {
    dates = await scheduler.schedule(task, thing, history, today);
  } catch {
    ensure(false, 'Task scheduling failed', 'UNAVAILABLE');
  }
  return database.transaction(pool, async (db) => {
    // The Thing lock serialises acceptance with issue resolution and occurrence edits.
    const latestThing = await thingsDb.getThingForUserOrThrow(db, userId, task.thingId, {
      lock: true,
    });
    const current = await tasksDb.getTaskForUserOrThrow(db, userId, id, true);
    if (current.status !== 'SUGGESTED') return { task: current, nextTask: null };
    ensure(
      latestThing.revision === thing.revision,
      'Thing changed while choosing dates; try again',
      'CONFLICT',
    );
    ensure(
      JSON.stringify(current) === JSON.stringify(task),
      'Task changed while choosing dates; try again',
      'CONFLICT',
    );
    const active = await saveTask(
      db,
      userId,
      {
        ...current,
        ...dates,
        status: 'ACTIVE',
        recurrence: dates.deadlineOn ? null : current.recurrence,
      },
      true,
    );
    return { task: active, nextTask: null };
  });
}
