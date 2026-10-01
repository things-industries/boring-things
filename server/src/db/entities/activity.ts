import type { Schema } from '../../../../shared/model.js';
import type { RouteTypes } from '../../contracts/routes.js';
import { rows, type Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import { ownedThing } from './things.js';
import { page, pageResult } from '../../application/pagination.js';

type Activity = {
  issues: Schema['Issue'];
  events: Schema['Event'];
  purchasables: Schema['Purchasable'];
};
type ActivityKind = keyof Activity;
export type IssueQuery = RouteTypes<'/api/issues', 'get'>['Querystring'];
export type EventQuery = RouteTypes<'/api/events', 'get'>['Querystring'];
export type PurchasableQuery = RouteTypes<'/api/purchasables', 'get'>['Querystring'];
type ActivityQuery = Omit<EventQuery, 'status'> &
  PurchasableQuery & { status?: IssueQuery['status'] | EventQuery['status'] };
type ActivityPage<K extends ActivityKind> = { items: Activity[K][]; nextCursor: string | null };
const columns = {
  issues:
    'id,thing_id,title,description,status,status_text,due_date::text,resolved_at,is_sample,created_at,updated_at',
  events:
    'id,thing_id,issue_id,title,description,status,starts_at,starts_on::text,completed_at,source_refs,is_sample,created_at,updated_at',
  purchasables:
    "id,thing_id,kind,name,description,merchant_url,image_url,source_refs,checked_at,is_sample,created_at,updated_at,case when price_amount is null then null else jsonb_build_object('amountMinor',price_amount,'currency',currency) end as price",
} as const;
export async function listActivity<K extends ActivityKind>(
  db: Database,
  owner: string,
  kind: K,
  query: IssueQuery | EventQuery | PurchasableQuery,
): Promise<ActivityPage<K>> {
  if (query.thingId) await ownedThing(db, owner, query.thingId);
  const { limit, offset } = page(query);
  const filters = ['owner_id=$1'];
  const params: unknown[] = [owner];
  const q = query as Partial<Record<keyof ActivityQuery, string | number>>;
  for (const [key, column, op] of [
    ['thingId', 'thing_id', '='],
    [kind === 'purchasables' ? 'kind' : 'status', kind === 'purchasables' ? 'kind' : 'status', '='],
  ]) {
    const value = q[key as keyof ActivityQuery];
    if (value) {
      params.push(value);
      filters.push(`${column}${op}$${params.length}`);
    }
  }
  let order = 'created_at desc';
  if (kind === 'events') {
    const timeZone = (query as EventQuery).timeZone ?? 'UTC';
    const zones = await rows(db, 'select 1 from pg_timezone_names where name=$1', [timeZone]);
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
    await rows<Activity[K]>(
      db,
      `select ${columns[kind]} from bt.${kind} where ${filters.join(' and ')} order by ${order},id limit $${params.length - 1} offset $${params.length}`,
      params,
    ),
    query,
  );
}
export async function ownedActivity<K extends ActivityKind>(
  db: Database,
  owner: string,
  kind: K,
  id: string,
  lock = false,
): Promise<Activity[K]> {
  const [item] = await rows<Activity[K]>(
    db,
    `select ${columns[kind]} from bt.${kind} where id=$1 and owner_id=$2${lock ? ' for update' : ''}`,
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
  value: IssueWrite,
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
  const [item] = await rows<Schema['Issue']>(
    db,
    id
      ? `update bt.issues set title=$1,description=$2,status=$3,resolved_at=$4,status_text=$5,due_date=$6 where id=$7 and owner_id=$8 returning ${columns.issues}`
      : `insert into bt.issues(title,description,status,resolved_at,status_text,due_date,thing_id,owner_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning ${columns.issues}`,
    params,
  );
  return item;
}
export async function saveEvent(
  db: Database,
  owner: string,
  value: EventWrite,
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
  const [item] = await rows<Schema['Event']>(
    db,
    id
      ? `update bt.events set title=$1,description=$2,status=$3,starts_at=$4,completed_at=$5,issue_id=$6,starts_on=$7 where id=$8 and owner_id=$9 returning ${columns.events}`
      : `insert into bt.events(title,description,status,starts_at,completed_at,issue_id,starts_on,thing_id,owner_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${columns.events}`,
    params,
  );
  return item;
}
