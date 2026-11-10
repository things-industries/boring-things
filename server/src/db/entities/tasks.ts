/** Owner-scoped Task persistence and calendar-range selection. */

import type { Schema } from '../../../../shared/model.js';
import type { RouteTypes } from '../../contracts/routes.js';
import * as database from '../connection.js';
import type { Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import { page, pageResult } from '../../application/pagination.js';
import type { RecurrenceReference } from '../../application/task-recurrence.js';

export type TaskRow = Schema['Task'] & { referenceDates: RecurrenceReference | null };
export const columns =
  'id,thing_id,issue_id,title,description,status,importance,scheduled_on::text,deadline_on::text,recurrence,completed_at,closed_at,completed_followup,reference_task_id,reference_dates,source_refs,is_sample';

/** Loads a Task, optionally locking it for a lifecycle transition. */
export async function getOwnedTaskOrThrow(
  db: Database,
  owner: string,
  id: string,
  lock = false,
): Promise<TaskRow> {
  const [task] = await database.rows<TaskRow>(
    db,
    `select ${columns} from bt.tasks where owner_id=$1 and id=$2${lock ? ' for update' : ''}`,
    [owner, id],
  );
  ensure(task, 'Task not found', 'NOT_FOUND');
  return task;
}

/** Lists Tasks, including active carryover and completed followups in date ranges. */
export async function listTasks(
  db: Database,
  owner: string,
  query: RouteTypes<'/api/tasks', 'get'>['Querystring'],
) {
  const { limit, offset } = page(query);
  const filters = ['owner_id=$1'];
  const params: unknown[] = [owner];
  for (const [key, column] of [
    ['thingId', 'thing_id'],
    ['status', 'status'],
  ] as const) {
    if (query[key]) {
      params.push(query[key]);
      filters.push(`${column}=$${params.length}`);
    }
  }
  if (query.from) {
    params.push(query.from);
    filters.push(`(scheduled_on >= $${params.length}::date or status in ('ACTIVE','COMPLETED'))`);
  }
  if (query.to) {
    params.push(query.to);
    filters.push(
      `(scheduled_on <= $${params.length}::date or scheduled_on is null or status='COMPLETED')`,
    );
  }
  params.push(limit + 1, offset);
  return pageResult(
    await database.rows<Schema['Task']>(
      db,
      `select ${columns} from bt.tasks where ${filters.join(' and ')} order by scheduled_on asc nulls first,id limit $${params.length - 1} offset $${params.length}`,
      params,
    ),
    query,
  );
}

/** Inserts or updates an occurrence with its private recurrence reference. */
export async function saveTask(
  db: Database,
  owner: string,
  task: Schema['Task'] & { referenceDates?: RecurrenceReference | null },
  update = false,
): Promise<TaskRow> {
  const values = [
    task.thingId,
    task.issueId,
    task.title,
    task.description,
    task.status,
    task.importance,
    task.scheduledOn,
    task.deadlineOn,
    task.recurrence ? JSON.stringify(task.recurrence) : null,
    task.completedAt,
    task.closedAt,
    task.completedFollowup ? JSON.stringify(task.completedFollowup) : null,
    task.referenceTaskId,
    task.referenceDates ? JSON.stringify(task.referenceDates) : null,
    JSON.stringify(task.sourceRefs),
    task.isSample,
    task.id,
    owner,
  ];
  const names = [
    'thing_id',
    'issue_id',
    'title',
    'description',
    'status',
    'importance',
    'scheduled_on',
    'deadline_on',
    'recurrence',
    'completed_at',
    'closed_at',
    'completed_followup',
    'reference_task_id',
    'reference_dates',
    'source_refs',
    'is_sample',
  ];
  const [saved] = await database.rows<TaskRow>(
    db,
    update
      ? `update bt.tasks set ${names.map((n, i) => `${n}=$${i + 1}`).join(',')} where id=$17 and owner_id=$18 returning ${columns}`
      : `insert into bt.tasks(${names.join(',')},id,owner_id) values(${values.map((_, i) => '$' + (i + 1)).join(',')}) returning ${columns}`,
    values,
  );
  return saved;
}

/** Deletes an occurrence without changing its descendants. */
export async function deleteTask(db: Database, owner: string, id: string) {
  const task = await getOwnedTaskOrThrow(db, owner, id, true);
  await database.execute(db, 'delete from bt.tasks where id=$1 and owner_id=$2', [id, owner]);
  return task;
}

/** Deletes the unedited active occurrence after a Task, unless a later occurrence was completed. */
export async function deleteUneditedNextOccurrence(db: Database, owner: string, task: TaskRow) {
  const [removed] = await database.rows<{ id: string }>(
    db,
    `delete from bt.tasks next
     where next.owner_id=$1 and next.reference_task_id=$2 and next.id<>$3
       and next.status='ACTIVE' and next.updated_at=next.created_at
       and not exists(
         select 1 from bt.tasks later
         where later.owner_id=$1 and (later.id=$2 or later.reference_task_id=$2)
           and later.id<>$3 and later.completed_at>$4::timestamptz
       )
     returning next.id`,
    [owner, task.referenceTaskId ?? task.id, task.id, task.completedAt],
  );
  return removed?.id ?? null;
}
