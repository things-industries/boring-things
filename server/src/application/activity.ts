import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import { ownedActivity, saveEvent, saveIssue } from '../db/entities/activity.js';
import { bumpThing, ownedThing } from '../db/entities/things.js';
import { ensure } from './errors.js';

export async function writeIssue(
  db: Database,
  owner: string,
  input: Schema['IssueInput'] | Schema['IssuePatch'],
  id?: string,
): Promise<Schema['Issue']> {
  const existing = id ? await ownedActivity(db, owner, 'issues', id, true) : undefined;
  const thingId = existing?.thingId ?? ('thingId' in input ? input.thingId : undefined);
  ensure(thingId, 'Thing is required');
  await ownedThing(db, owner, thingId, true);
  const title = (input.title ?? existing?.title ?? '').trim();
  ensure(title, 'Title cannot be blank');
  const status = input.status ?? existing?.status ?? 'OPEN';
  const item = await saveIssue(
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
  await bumpThing(db, owner, thingId);
  return item;
}
export async function writeEvent(
  db: Database,
  owner: string,
  input: Schema['EventInput'] | Schema['EventPatch'],
  id?: string,
): Promise<Schema['Event']> {
  const existing = id ? await ownedActivity(db, owner, 'events', id, true) : undefined;
  const thingId = existing?.thingId ?? ('thingId' in input ? input.thingId : undefined);
  ensure(thingId, 'Thing is required');
  await ownedThing(db, owner, thingId, true);
  const title = (input.title ?? existing?.title ?? '').trim();
  ensure(title, 'Title cannot be blank');
  const status = input.status ?? existing?.status ?? 'SUGGESTED';
  const startsAt = input.startsAt === undefined ? (existing?.startsAt ?? null) : input.startsAt;
  const startsOn = input.startsOn === undefined ? (existing?.startsOn ?? null) : input.startsOn;
  ensure(!(startsAt && startsOn), 'Choose one schedule');
  const issueId = input.issueId === undefined ? (existing?.issueId ?? null) : input.issueId;
  ensure(status !== 'SCHEDULED' || startsAt || startsOn, 'Scheduled events need a date');
  if (issueId)
    ensure(
      (await ownedActivity(db, owner, 'issues', issueId)).thingId === thingId,
      'Issue must belong to this Thing',
    );
  const item = await saveEvent(
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
      completedAt:
        status === 'COMPLETED' ? (existing?.completedAt ?? new Date().toISOString()) : null,
    },
    id,
  );
  await bumpThing(db, owner, thingId);
  return item;
}
