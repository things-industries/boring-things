/** Acceptance workflow and provider contract for choosing evidenced Task dates. */

import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import * as database from '../db/connection.js';
import * as thingsDb from '../db/entities/things.js';
import * as tasksDb from '../db/entities/tasks.js';
import type { Registry } from './registry/registry.js';
import { detail } from './things.js';
import { writeTask } from './tasks.js';
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
  owner: string,
  id: string,
  timeZone: string,
  registry: Registry,
  scheduler?: TaskScheduler,
): Promise<Schema['TaskChange']> {
  const today = getLocalDate(new Date(), timeZone);
  const task = await tasksDb.getOwnedTaskOrThrow(pool, owner, id);
  if (task.status !== 'SUGGESTED') return { task, nextTask: null };
  ensure(scheduler, 'Task scheduling is not configured', 'UNAVAILABLE');
  const thing = await detail(pool, owner, task.thingId, registry);
  const history = (await tasksDb.listTasks(pool, owner, { thingId: task.thingId, limit: 200 }))
    .items;
  let dates: TaskSchedule;
  try {
    dates = await scheduler.schedule(task, thing, history, today);
  } catch {
    ensure(false, 'Task scheduling failed', 'UNAVAILABLE');
  }
  return database.transaction(pool, async (db) => {
    // The Thing lock serialises acceptance with issue resolution and occurrence edits.
    const latestThing = await thingsDb.getOwnedThingOrThrow(db, owner, task.thingId, {
      lock: true,
    });
    const current = await tasksDb.getOwnedTaskOrThrow(db, owner, id, true);
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
    const saved = await writeTask(db, owner, { ...dates }, registry, id);
    const active = await tasksDb.saveTask(db, owner, { ...saved, status: 'ACTIVE' }, true);
    return { task: active, nextTask: null };
  });
}
