// Persists owner-scoped Issues and Events, including suggested tasks.

import { createHash } from 'node:crypto';
import type { Schema } from '../../../../shared/model.js';
import type { RouteTypes } from '../../contracts/routes.js';
import * as database from '../connection.js';
import type { Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import { page, pageResult } from '../../application/pagination.js';

type Activity = {
  issues: Schema['Issue'];
  events: Schema['Event'];
};
type ActivityKind = keyof Activity;
export type IssueQuery = RouteTypes<'/api/issues', 'get'>['Querystring'];
export type EventQuery = RouteTypes<'/api/events', 'get'>['Querystring'];
type ActivityQuery = Omit<EventQuery, 'status'> & {
  status?: IssueQuery['status'] | EventQuery['status'];
};
type ActivityPage<K extends ActivityKind> = { items: Activity[K][]; nextCursor: string | null };
const columns = {
  issues:
    'id,thing_id,title,description,status,status_text,due_date::text,resolved_at,is_sample,created_at,updated_at',
  events:
    'id,thing_id,issue_id,title,description,status,starts_at,starts_on::text,completed_at,source_refs,is_sample,created_at,updated_at',
} as const;
export async function listActivity<K extends ActivityKind>(
  db: Database,
  owner: string,
  kind: K,
  query: IssueQuery | EventQuery,
): Promise<ActivityPage<K>> {
  const { limit, offset } = page(query);
  const filters = ['owner_id=$1'];
  const params: unknown[] = [owner];
  const q = query as Partial<Record<keyof ActivityQuery, string | number>>;
  for (const [key, column, op] of [
    ['thingId', 'thing_id', '='],
    ['status', 'status', '='],
  ]) {
    const value = q[key as keyof ActivityQuery];
    if (value) {
      params.push(value);
      filters.push(`${column}${op}$${params.length}`);
    }
  }
  let order = 'created_at desc';
  if (kind === 'issues' && q.status === 'OPEN') {
    order = 'due_date asc nulls last,created_at desc';
  }
  if (kind === 'events') {
    const timeZone = (query as EventQuery).timeZone ?? 'UTC';
    const zones = await database.rows(db, 'select 1 from pg_timezone_names where name=$1', [
      timeZone,
    ]);
    ensure(zones.length, 'Unknown timezone');
    params.push(timeZone);
    const zone = `$${params.length}`;
    order = `coalesce(starts_at, starts_on::timestamp at time zone ${zone}) asc nulls last`;
    for (const [key, op] of [
      ['from', '>='],
      ['to', '<='],
    ] as const) {
      const value = (query as EventQuery)[key];
      if (value) {
        params.push(value);
        const bound = `$${params.length}::timestamptz`;
        filters.push(
          `(starts_at ${op} ${bound} or starts_on ${op} (${bound} at time zone ${zone})::date)`,
        );
      }
    }
  }
  params.push(limit + 1, offset);
  return pageResult(
    await database.rows<Activity[K]>(
      db,
      `select ${columns[kind]} from bt.${kind} where ${filters.join(' and ')} order by ${order},id limit $${params.length - 1} offset $${params.length}`,
      params,
    ),
    query,
  );
}
export async function getOwnedActivityOrThrow<K extends ActivityKind>(
  db: Database,
  owner: string,
  kind: K,
  id: string,
  options: { lock?: boolean } = {},
): Promise<Activity[K]> {
  const [item] = await database.rows<Activity[K]>(
    db,
    `select ${columns[kind]} from bt.${kind} where id=$1 and owner_id=$2${options.lock ? ' for update' : ''}`,
    [id, owner],
  );
  ensure(item, 'Record not found', 'NOT_FOUND');
  return item;
}
export type IssueWrite = Pick<
  Schema['Issue'],
  'thingId' | 'title' | 'description' | 'status' | 'statusText' | 'dueDate' | 'resolvedAt'
>;
export type EventWrite = Pick<
  Schema['Event'],
  | 'thingId'
  | 'title'
  | 'description'
  | 'status'
  | 'startsAt'
  | 'startsOn'
  | 'completedAt'
  | 'issueId'
>;
export async function saveIssue(
  db: Database,
  owner: string,
  value: IssueWrite & Pick<Schema['IssueInput'], 'id'>,
  id?: string,
): Promise<Schema['Issue']> {
  const params = [
    value.title,
    value.description,
    value.status,
    value.resolvedAt,
    value.statusText,
    value.dueDate,
    id ?? value.thingId,
    owner,
  ];
  const [item] = await database.rows<Schema['Issue']>(
    db,
    id
      ? `update bt.issues set title=$1,description=$2,status=$3,resolved_at=$4,status_text=$5,due_date=$6 where id=$7 and owner_id=$8 returning ${columns.issues}`
      : `insert into bt.issues(title,description,status,resolved_at,status_text,due_date,thing_id,owner_id,id) values($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::uuid,gen_random_uuid())) returning ${columns.issues}`,
    id ? params : [...params, value.id],
  );
  return item;
}
export async function saveEvent(
  db: Database,
  owner: string,
  value: EventWrite & Pick<Schema['EventInput'], 'id'>,
  id?: string,
): Promise<Schema['Event']> {
  const params = [
    value.title,
    value.description,
    value.status,
    value.startsAt,
    value.completedAt,
    value.issueId,
    value.startsOn,
    id ?? value.thingId,
    owner,
  ];
  const [item] = await database.rows<Schema['Event']>(
    db,
    id
      ? `update bt.events set title=$1,description=$2,status=$3,starts_at=$4,completed_at=$5,issue_id=$6,starts_on=$7 where id=$8 and owner_id=$9 returning ${columns.events}`
      : `insert into bt.events(title,description,status,starts_at,completed_at,issue_id,starts_on,thing_id,owner_id,id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::uuid,gen_random_uuid())) returning ${columns.events}`,
    id ? params : [...params, value.id],
  );
  return item;
}

const activityKey = (thingId: string, kind: string, identity: string) =>
  createHash('sha256')
    .update(`${thingId}:${kind}:${identity.trim().toLowerCase().replace(/\s+/g, ' ')}`)
    .digest('hex');

export async function existingTasks(db: Database, owner: string, thingId: string) {
  return database.rows<Pick<Schema['Event'], 'title' | 'status'>>(
    db,
    'select title,status from bt.events where thing_id=$1 and owner_id=$2 order by created_at desc,id limit 200',
    [thingId, owner],
  );
}

// Inserts an imported Event once, preserving existing edits, completion and dismissal.
export async function saveSuggestedTask(
  db: Database,
  owner: string,
  thingId: string,
  task: Pick<Schema['Event'], 'title' | 'description' | 'sourceRefs'>,
) {
  await database.execute(
    db,
    `insert into bt.events(owner_id,thing_id,title,description,status,source_refs,import_key)
     select $1,$2,$3,$4,'SUGGESTED',$5,$6
     where not exists(select 1 from bt.events where owner_id=$1 and thing_id=$2 and lower(trim(title))=lower(trim($3)))
     on conflict(import_key) do nothing`,
    [
      owner,
      thingId,
      task.title,
      task.description,
      JSON.stringify(task.sourceRefs),
      activityKey(thingId, 'task', task.title),
    ],
  );
}
