/** Issue and Event mutations, including closure of work linked to resolved issues. */

import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import * as activityDb from '../db/entities/activity.js';
import * as thingsDb from '../db/entities/things.js';
import * as database from '../db/connection.js';
import { validateIssueLink } from './activity-links.js';
import { ensure } from './errors.js';

export async function writeIssue(
  db: Database,
  owner: string,
  input: Schema['IssueInput'] | Schema['IssuePatch'],
  id?: string,
): Promise<Schema['Issue']> {
  let existing = id
    ? await activityDb.getOwnedActivityOrThrow(db, owner, 'issues', id, { lock: false })
    : undefined;
  const thingId = existing?.thingId ?? ('thingId' in input ? input.thingId : undefined);
  ensure(thingId, 'Thing is required');
  await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
  if (id)
    existing = await activityDb.getOwnedActivityOrThrow(db, owner, 'issues', id, { lock: true });
  const title = (input.title ?? existing?.title ?? '').trim();
  ensure(title, 'Title cannot be blank');
  const status = input.status ?? existing?.status ?? 'OPEN';
  const item = await activityDb.saveIssue(
    db,
    owner,
    {
      id: 'id' in input ? input.id : undefined,
      thingId,
      title,
      description: input.description ?? existing?.description ?? '',
      status,
      statusText:
        input.statusText === undefined ? (existing?.statusText ?? null) : input.statusText,
      dueDate: input.dueDate === undefined ? (existing?.dueDate ?? null) : input.dueDate,
      resolvedAt: status === 'RESOLVED' ? (existing?.resolvedAt ?? new Date().toISOString()) : null,
    },
    id,
  );
  if (status === 'RESOLVED') {
    await database.execute(
      db,
      "update bt.tasks set status='CLOSED',closed_at=coalesce(closed_at,now()) where owner_id=$1 and issue_id=$2 and status<>'CLOSED'",
      [owner, item.id],
    );
    await database.execute(
      db,
      "update bt.events set status='CLOSED',closed_at=coalesce(closed_at,now()) where owner_id=$1 and issue_id=$2 and status<>'CLOSED'",
      [owner, item.id],
    );
  }
  await thingsDb.bumpThing(db, owner, thingId);
  return item;
}
export async function writeEvent(
  db: Database,
  owner: string,
  input: Schema['EventInput'] | Schema['EventPatch'],
  id?: string,
): Promise<Schema['Event']> {
  let existing = id
    ? await activityDb.getOwnedActivityOrThrow(db, owner, 'events', id, { lock: false })
    : undefined;
  const thingId = existing?.thingId ?? ('thingId' in input ? input.thingId : undefined);
  ensure(thingId, 'Thing is required');
  await thingsDb.getOwnedThingOrThrow(db, owner, thingId, { lock: true });
  if (id)
    existing = await activityDb.getOwnedActivityOrThrow(db, owner, 'events', id, { lock: true });
  const title = (input.title ?? existing?.title ?? '').trim();
  ensure(title, 'Title cannot be blank');
  const status = existing?.status ?? ('status' in input ? input.status : undefined) ?? 'SCHEDULED';
  const startsAt = input.startsAt === undefined ? (existing?.startsAt ?? null) : input.startsAt;
  const startsOn = input.startsOn === undefined ? (existing?.startsOn ?? null) : input.startsOn;
  ensure(!(startsAt && startsOn), 'Choose one schedule');
  const issueId = input.issueId === undefined ? (existing?.issueId ?? null) : input.issueId;
  ensure(startsAt || startsOn, 'Events need a date');
  const endsAt = input.endsAt === undefined ? (existing?.endsAt ?? null) : input.endsAt;
  ensure(
    !endsAt || (startsAt && Date.parse(endsAt) >= Date.parse(startsAt)),
    'End time must follow the timed start',
  );
  await validateIssueLink(db, owner, thingId, issueId, status === 'CLOSED');
  const item = await activityDb.saveEvent(
    db,
    owner,
    {
      id: 'id' in input ? input.id : undefined,
      thingId,
      title,
      description: input.description ?? existing?.description ?? '',
      status,
      startsAt,
      startsOn,
      issueId,
      endsAt,
      completedFollowup: existing?.completedFollowup ?? null,
      closedAt: existing?.closedAt ?? (status === 'CLOSED' ? new Date().toISOString() : null),
    },
    id,
  );
  await thingsDb.bumpThing(db, owner, thingId);
  return item;
}
