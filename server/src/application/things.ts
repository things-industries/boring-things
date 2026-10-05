import * as registryDb from '../db/entities/registry.js';
import * as attachmentsDb from '../db/entities/attachments.js';
import * as tagsDb from '../db/entities/tags.js';

/**
 * Builds Thing detail responses and coordinates transactional creation and patching with category,
 * tag and image validation.
 */

import type pg from 'pg';
import { emptyData, type Schema, type ThingPatch } from '../../../shared/model.js';
import * as database from '../db/connection.js';
import type { Database } from '../db/connection.js';
import * as importsDb from '../db/entities/imports.js';
import * as thingsDb from '../db/entities/things.js';
import { ensure } from './errors.js';
import { patchData, projectData } from './thing-data.js';
import type { Registry } from './registry/registry.js';

export async function detail(
  db: Database,
  owner: string,
  id: string,
  registry: Registry,
): Promise<Schema['Thing']> {
  const thing = await thingsDb.getOwnedThingOrThrow(db, owner, id);
  const { data, ownerId: _ownerId, ...summary } = thing;
  return {
    ...summary,
    import: await importsDb.findThingImport(db, owner, id),
    ...projectData(data, registry),
    ...(await thingsDb.getThingRelatedIds(db, owner, id)),
  };
}

export async function writeThing(
  pool: pg.Pool,
  owner: string,
  input: Schema['ThingCreate'] | ThingPatch,
  registry: Registry,
  id?: string,
) {
  return database.transaction(pool, async (db) => {
    // Lock the stored Thing before merging a patch so concurrent writes cannot replace each other with stale data.
    let thing = id ? await thingsDb.getOwnedThingOrThrow(db, owner, id, { lock: true }) : undefined;
    if (thing) await importsDb.assertThingEditable(db, owner, thing.id);
    const category = input.categoryId ?? thing?.categoryId;
    ensure(category && (await registryDb.categoryExists(db, category)), 'Unknown category');
    ensure((input.name ?? thing?.name)?.trim(), 'Name cannot be blank');
    const data = patchData(thing?.data ?? emptyData(), input, category, registry);

    if (!thing)
      thing = await thingsDb.insertThing(db, owner, {
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
        await attachmentsDb.isLinkedImage(db, owner, thing.id, image),
        'Image must be a linked image attachment',
      );
    await thingsDb.updateThing(db, owner, thing.id, {
      name: input.name?.trim() ?? thing.name,
      description: input.description ?? thing.description,
      categoryId: category,
      data,
      imageAttachmentId: image,
    });
    if (input.tagIds) await tagsDb.setThingTags(db, owner, thing.id, input.tagIds);

    return detail(db, owner, thing.id, registry);
  });
}
