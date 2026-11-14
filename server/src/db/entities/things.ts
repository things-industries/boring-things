import * as database from '../connection.js';
import type { RouteTypes } from '../../contracts/routes.js';
import { page, pageResult } from '../../application/pagination.js';
import type { Schema, ThingData } from '../../../../shared/model.js';
import type { Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import * as thingFieldsDb from './thing-fields.js';

export type ThingRow = Omit<Schema['ThingSummary'], 'tagIds'> & {
  userId: string;
  data: ThingData;
};

export async function getThingForUserOrThrow(
  db: Database,
  userId: string,
  id: string,
  options: { lock?: boolean } = {},
): Promise<ThingRow> {
  const [thing] = await database.rows<ThingRow>(
    db,
    `select id,user_id,category_id,name,description,data,image_attachment_id,is_sample,created_at,updated_at,access_count,last_viewed_at,revision::integer from bt.things where id=$1 and user_id=$2 ${options.lock ? 'for update' : ''}`,
    [id, userId],
  );
  ensure(thing, 'Thing not found', 'NOT_FOUND');
  return { ...thing, data: await thingFieldsDb.load(db, userId, id, thing.data) };
}

export async function bumpThing(db: Database, userId: string, id: string) {
  await database.execute(
    db,
    'update bt.things set revision=revision+1 where id=$1 and user_id=$2',
    [id, userId],
  );
}

export async function getThingRelatedIds(db: Database, userId: string, id: string) {
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
      await database.rows<{ id: string }>(
        db,
        `select ${column} as id from bt.${table} where thing_id=$1 and user_id=$2 order by ${column}`,
        [id, userId],
      )
    ).map((r) => r.id);
  }

  return result as Pick<
    Schema['Thing'],
    'attachmentIds' | 'tagIds' | 'issueIds' | 'eventIds' | 'purchasableIds' | 'conversationIds'
  >;
}

export type ThingQuery = RouteTypes<'/api/things', 'get'>['Querystring'];
export async function listThings(
  db: Database,
  userId: string,
  query: ThingQuery,
): Promise<Schema['ThingSummaryList']> {
  const { limit, offset } = page(query);
  const order = {
    UPDATED: 'updated_at desc,id',
    RECENTLY_VIEWED: 'last_viewed_at desc nulls last,id',
    MOST_VIEWED: 'access_count desc,last_viewed_at desc nulls last,id',
  }[query.sort ?? 'UPDATED'];
  const result = await database.rows<Schema['ThingSummary']>(
    db,
    `select t.*,revision::integer, coalesce((select jsonb_agg(tag_id order by tag_id) from bt.thing_tags where thing_id=t.id),'[]') as tag_ids from bt.things t where user_id=$1 and ($2::text is null or category_id=$2) and ($3::uuid is null or exists(select 1 from bt.thing_tags where thing_id=t.id and tag_id=$3)) and ($4='' or strpos(lower(name || ' ' || description),lower($4))>0) order by ${order} limit $5 offset $6`,
    [userId, query.categoryId ?? null, query.tagId ?? null, query.q ?? '', limit + 1, offset],
  );

  // Explicitly omit stored data; sensitive values never enter list responses.
  return pageResult(
    result.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      categoryId: t.categoryId,
      revision: t.revision,
      imageAttachmentId: t.imageAttachmentId,
      tagIds: t.tagIds,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      accessCount: t.accessCount,
      lastViewedAt: t.lastViewedAt,
      isSample: t.isSample,
    })),
    query,
  );
}
export interface ThingWrite {
  name: string;
  description: string;
  categoryId: string;
  data: ThingData;
  imageAttachmentId?: string | null;
}
export async function insertThing(
  db: Database,
  userId: string,
  input: ThingWrite & Pick<Schema['ThingCreate'], 'id'>,
): Promise<ThingRow> {
  const [created] = await database.rows<{ id: string }>(
    db,
    'insert into bt.things(user_id,category_id,name,description,data,id) values($1,$2,$3,$4,$5,coalesce($6::uuid,gen_random_uuid())) returning id',
    [
      userId,
      input.categoryId,
      input.name,
      input.description,
      JSON.stringify(thingFieldsDb.metadata(input.data)),
      input.id,
    ],
  );
  await thingFieldsDb.save(db, userId, created.id, input.data);
  return getThingForUserOrThrow(db, userId, created.id);
}
export async function updateThing(
  db: Database,
  userId: string,
  id: string,
  input: ThingWrite,
): Promise<void> {
  await database.execute(
    db,
    'update bt.things set name=$1,description=$2,category_id=$3,data=$4,image_attachment_id=$5,revision=revision+1 where id=$6 and user_id=$7',
    [
      input.name,
      input.description,
      input.categoryId,
      JSON.stringify(thingFieldsDb.metadata(input.data)),
      input.imageAttachmentId,
      id,
      userId,
    ],
  );
  await thingFieldsDb.save(db, userId, id, input.data);
}
export async function deleteThing(db: Database, userId: string, id: string): Promise<void> {
  await database.execute(db, 'delete from bt.things where id=$1 and user_id=$2', [id, userId]);
}
export async function saveThingData(
  db: Database,
  userId: string,
  id: string,
  data: ThingData,
): Promise<void> {
  await database.execute(
    db,
    'update bt.things set data=$1,revision=revision+1 where id=$2 and user_id=$3',
    [JSON.stringify(thingFieldsDb.metadata(data)), id, userId],
  );
  await thingFieldsDb.save(db, userId, id, data);
}
export async function renameThing(
  db: Database,
  userId: string,
  id: string,
  name: string,
): Promise<void> {
  await database.execute(
    db,
    'update bt.things set name=$1,revision=revision+1 where id=$2 and user_id=$3',
    [name, id, userId],
  );
}

export async function recordThingView(
  db: Database,
  userId: string,
  id: string,
): Promise<Schema['ThingAccess']> {
  const [access] = await database.rows<Schema['ThingAccess']>(
    db,
    'update bt.things set access_count=access_count+1,last_viewed_at=clock_timestamp() where id=$1 and user_id=$2 returning access_count,last_viewed_at',
    [id, userId],
  );
  ensure(access, 'Thing not found', 'NOT_FOUND');
  return access;
}
