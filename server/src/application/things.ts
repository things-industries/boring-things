import type pg from 'pg';
import { emptyData, type Schema, type ThingPatch } from '../../../shared/model.js';
import { rows, transaction, type Database } from '../db/connection.js';
import { thingImport, assertEditable } from '../db/imports.js';
import { ownedThing, relatedIds } from '../db/things.js';
import { ensure } from './errors.js';
import { patchData, projectData } from './thing-data.js';
import type { Registry } from './registry.js';

export async function detail(
  db: Database,
  owner: string,
  id: string,
  registry: Registry,
): Promise<Schema['Thing']> {
  const thing = await ownedThing(db, owner, id);
  const { data, ownerId: _ownerId, ...summary } = thing;
  return {
    ...summary,
    import: await thingImport(db, owner, id),
    ...projectData(data, registry),
    ...(await relatedIds(db, owner, id)),
  };
}
export async function writeThing(
  pool: pg.Pool,
  owner: string,
  input: ThingPatch,
  registry: Registry,
  id?: string,
) {
  return transaction(pool, async (db) => {
    let thing = id ? await ownedThing(db, owner, id, true) : undefined;
    if (thing) await assertEditable(db, owner, thing.id);
    const category = input.categoryId ?? thing?.categoryId;
    ensure(
      category && (await db.query('select id from bt.categories where id=$1', [category])).rowCount,
      'Unknown category',
    );
    ensure((input.name ?? thing?.name)?.trim(), 'Name cannot be blank');
    const data = patchData(thing?.data ?? emptyData(), input, category, registry);
    if (!thing) {
      const [created] = await rows<{ id: string }>(
        db,
        'insert into bt.things(owner_id,category_id,name,description,data) values($1,$2,$3,$4,$5) returning id',
        [owner, category, input.name!.trim(), input.description ?? '', JSON.stringify(data)],
      );
      thing = await ownedThing(db, owner, created.id);
    }
    const image =
      input.imageAttachmentId === undefined ? thing.imageAttachmentId : input.imageAttachmentId;
    if (image)
      ensure(
        (
          await db.query(
            "select 1 from bt.thing_attachments l join bt.attachments a on a.id=l.attachment_id where l.thing_id=$1 and l.attachment_id=$2 and l.owner_id=$3 and a.media_type like 'image/%'",
            [thing.id, image, owner],
          )
        ).rowCount,
        'Image must be a linked image attachment',
      );
    await db.query(
      'update bt.things set name=$1,description=$2,category_id=$3,data=$4,image_attachment_id=$5,revision=revision+1 where id=$6 and owner_id=$7',
      [
        input.name?.trim() ?? thing.name,
        input.description ?? thing.description,
        category,
        JSON.stringify(data),
        image,
        thing.id,
        owner,
      ],
    );
    if (input.tagIds) {
      const ids = [...new Set(input.tagIds)];
      ensure(
        (
          await db.query('select id from bt.tags where owner_id=$1 and id=any($2::uuid[])', [
            owner,
            ids,
          ])
        ).rowCount === ids.length,
        'Unknown tag',
      );
      await db.query('delete from bt.thing_tags where thing_id=$1 and owner_id=$2', [
        thing.id,
        owner,
      ]);
      for (const tag of ids)
        await db.query('insert into bt.thing_tags(thing_id,tag_id,owner_id) values($1,$2,$3)', [
          thing.id,
          tag,
          owner,
        ]);
    }
    return detail(db, owner, thing.id, registry);
  });
}
