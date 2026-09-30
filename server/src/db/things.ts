import { execute } from './connection.js';
import type { RouteTypes } from '../contracts/routes.js';
import { page, pageResult } from '../application/pagination.js';
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
    `select id,owner_id,category_id,name,description,data,image_attachment_id,is_sample,created_at,updated_at,revision::integer from bt.things where id=$1 and owner_id=$2 ${lock ? 'for update' : ''}`,
    [id, owner],
  );
  ensure(thing, 'Thing not found', 'NOT_FOUND');
  return thing;
}

export async function bumpThing(db: Database, owner: string, id: string) {
  await execute(db, 'update bt.things set revision=revision+1 where id=$1 and owner_id=$2', [
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

export type ThingQuery = RouteTypes<'/api/things', 'get'>['Querystring'];
export async function listThings(
  db: Database,
  owner: string,
  query: ThingQuery,
): Promise<Schema['ThingSummaryList']> {
  const { limit, offset } = page(query);
  const result = await rows<Schema['ThingSummary']>(
    db,
    `select t.*,revision::integer, coalesce((select jsonb_agg(tag_id order by tag_id) from bt.thing_tags where thing_id=t.id),'[]') as tag_ids from bt.things t where owner_id=$1 and ($2::text is null or category_id=$2) and ($3::uuid is null or exists(select 1 from bt.thing_tags where thing_id=t.id and tag_id=$3)) and ($4='' or strpos(lower(name || ' ' || description),lower($4))>0) order by updated_at desc,id limit $5 offset $6`,
    [owner, query.categoryId ?? null, query.tagId ?? null, query.q ?? '', limit + 1, offset],
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
  owner: string,
  input: ThingWrite,
): Promise<ThingRow> {
  const [created] = await rows<{ id: string }>(
    db,
    'insert into bt.things(owner_id,category_id,name,description,data) values($1,$2,$3,$4,$5) returning id',
    [owner, input.categoryId, input.name, input.description, JSON.stringify(input.data)],
  );
  return ownedThing(db, owner, created.id);
}
export async function updateThing(
  db: Database,
  owner: string,
  id: string,
  input: ThingWrite,
): Promise<void> {
  await execute(
    db,
    'update bt.things set name=$1,description=$2,category_id=$3,data=$4,image_attachment_id=$5,revision=revision+1 where id=$6 and owner_id=$7',
    [
      input.name,
      input.description,
      input.categoryId,
      JSON.stringify(input.data),
      input.imageAttachmentId,
      id,
      owner,
    ],
  );
}
export async function deleteThing(db: Database, owner: string, id: string): Promise<void> {
  await execute(db, 'delete from bt.things where id=$1 and owner_id=$2', [id, owner]);
}
export async function saveThingData(
  db: Database,
  owner: string,
  id: string,
  data: ThingData,
): Promise<void> {
  await execute(
    db,
    'update bt.things set data=$1,revision=revision+1 where id=$2 and owner_id=$3',
    [JSON.stringify(data), id, owner],
  );
}
export async function renameThing(
  db: Database,
  owner: string,
  id: string,
  name: string,
): Promise<void> {
  await execute(
    db,
    'update bt.things set name=$1,revision=revision+1 where id=$2 and owner_id=$3',
    [name, id, owner],
  );
}
