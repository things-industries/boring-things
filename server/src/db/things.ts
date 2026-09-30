/**
 * Provides owner-scoped Thing reads, optional row locks, revision updates and related resource IDs.
 */

import type { Schema, ThingData } from '../../../shared/model.js';
import { rows, type Database } from './connection.js';
import { ensure } from '../application/errors.js';

export type ThingRow = Omit<Schema['ThingSummary'], 'tagIds'> & {
  ownerId: string;
  data: ThingData;
};

export async function ownedThing(
  db: Database,
  owner: string,
  id: string,
  lock = false,
): Promise<ThingRow> {
  const [thing] = await rows<ThingRow>(
    db,
    `select *, revision::integer from bt.things where id=$1 and owner_id=$2 ${lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(thing, 'Thing not found', 404);
  return thing;
}

export async function bumpThing(db: Database, owner: string, id: string) {
  await db.query('update bt.things set revision=revision+1 where id=$1 and owner_id=$2', [
    id,
    owner,
  ]);
}

export async function relatedIds(db: Database, owner: string, id: string) {
  const result: Record<string, string[]> = {};

  for (const [key, table, column] of [
    ['attachmentIds', 'thing_attachments', 'attachment_id'],
    ['tagIds', 'thing_tags', 'tag_id'],
    ['issueIds', 'issues', 'id'],
    ['eventIds', 'events', 'id'],
    ['purchasableIds', 'purchasables', 'id'],
    ['conversationIds', 'conversations', 'id'],
  ]) {
    result[key] = (
      await rows<{ id: string }>(
        db,
        `select ${column} as id from bt.${table} where thing_id=$1 and owner_id=$2 order by ${column}`,
        [id, owner],
      )
    ).map((r) => r.id);
  }

  return result as Pick<
    Schema['Thing'],
    'attachmentIds' | 'tagIds' | 'issueIds' | 'eventIds' | 'purchasableIds' | 'conversationIds'
  >;
}
