import { categoryExists } from '../db/entities/registry.js';
import { linkedImage } from '../db/entities/attachments.js';
import { setThingTags } from '../db/entities/tags.js';
/**
 * Builds Thing detail responses and coordinates transactional creation and patching with category,
 * tag and image validation.
 */

import type pg from 'pg';
import { emptyData, type Schema, type ThingPatch } from '../../../shared/model.js';
import { transaction, type Database } from '../db/connection.js';
import { thingImport, assertEditable } from '../db/entities/imports.js';
import { ownedThing, relatedIds, insertThing, updateThing } from '../db/entities/things.js';
import { ensure } from './errors.js';
import { patchData, projectData } from './thing-data.js';
import type { Registry } from './registry/registry.js';

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
  input: Schema['ThingCreate'] | ThingPatch,
  registry: Registry,
  id?: string,
) {
  return transaction(pool, async (db) => {
    // Lock the stored Thing before merging a patch so concurrent writes cannot replace each other with stale data.
    let thing = id ? await ownedThing(db, owner, id, true) : undefined;
    if (thing) await assertEditable(db, owner, thing.id);
    const category = input.categoryId ?? thing?.categoryId;
    ensure(category && (await categoryExists(db, category)), 'Unknown category');
    ensure((input.name ?? thing?.name)?.trim(), 'Name cannot be blank');
    const data = patchData(thing?.data ?? emptyData(), input, category, registry);

    if (!thing)
      thing = await insertThing(db, owner, {
        id: 'id' in input ? input.id : undefined,
        categoryId: category,
        name: input.name!.trim(),
        description: input.description ?? '',
        data,
      });

    const image =
      input.imageAttachmentId === undefined ? thing.imageAttachmentId : input.imageAttachmentId;

    if (image)
      ensure(
        await linkedImage(db, owner, thing.id, image),
        'Image must be a linked image attachment',
      );
    await updateThing(db, owner, thing.id, {
      name: input.name?.trim() ?? thing.name,
      description: input.description ?? thing.description,
      categoryId: category,
      data,
      imageAttachmentId: image,
    });
    if (input.tagIds) await setThingTags(db, owner, thing.id, input.tagIds);

    return detail(db, owner, thing.id, registry);
  });
}
