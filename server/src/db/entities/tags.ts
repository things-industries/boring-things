import * as database from '../connection.js';
import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import type { Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import { page, pageResult, type PageQuery } from '../../application/pagination.js';

export async function listTags(
  db: Database,
  userId: string,
  query: PageQuery,
): Promise<Schema['TagList']> {
  const { limit, offset } = page(query);
  return pageResult(
    await database.rows<Schema['Tag']>(
      db,
      'select id,name from bt.tags where user_id=$1 order by name,id limit $2 offset $3',
      [userId, limit + 1, offset],
    ),
    query,
  );
}
export async function saveTag(
  db: Database,
  userId: string,
  input: Schema['TagInput'],
  id?: string,
): Promise<Schema['Tag']> {
  ensure(input.name.trim(), 'Name cannot be blank');
  const [tag] = id
    ? await database.rows<Schema['Tag']>(
        db,
        'update bt.tags set name=$1 where id=$2 and user_id=$3 returning id,name',
        [input.name.trim(), id, userId],
      )
    : await database.rows<Schema['Tag']>(
        db,
        'insert into bt.tags(user_id,name,id) values($1,$2,coalesce($3::uuid,gen_random_uuid())) returning id,name',
        [userId, input.name.trim(), input.id],
      );
  ensure(tag, 'Tag not found', 'NOT_FOUND');
  return tag;
}
export async function deleteTag(pool: pg.Pool, userId: string, id: string): Promise<void> {
  await database.transaction(pool, async (db) => {
    ensure(
      (
        await database.execute(db, 'select id from bt.tags where id=$1 and user_id=$2 for update', [
          id,
          userId,
        ])
      ).rowCount,
      'Tag not found',
      'NOT_FOUND',
    );
    await database.execute(
      db,
      'update bt.things set revision=revision+1 where user_id=$1 and id in(select thing_id from bt.thing_tags where tag_id=$2)',
      [userId, id],
    );
    await database.execute(db, 'delete from bt.tags where id=$1 and user_id=$2', [id, userId]);
  });
}
export async function setThingTags(
  db: Database,
  userId: string,
  thingId: string,
  tagIds: string[],
): Promise<void> {
  const ids = [...new Set(tagIds)];
  ensure(
    (
      await database.execute(db, 'select id from bt.tags where user_id=$1 and id=any($2::uuid[])', [
        userId,
        ids,
      ])
    ).rowCount === ids.length,
    'Unknown tag',
  );
  await database.execute(db, 'delete from bt.thing_tags where thing_id=$1 and user_id=$2', [
    thingId,
    userId,
  ]);
  for (const tag of ids)
    await database.execute(
      db,
      'insert into bt.thing_tags(thing_id,tag_id,user_id) values($1,$2,$3)',
      [thingId, tag, userId],
    );
}
