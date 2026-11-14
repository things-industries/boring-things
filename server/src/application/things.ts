/**
 * Builds Thing detail responses and coordinates transactional creation and patching with category,
 * tag and image validation.
 */

import * as registryDb from '../db/entities/registry.js';
import * as attachmentsDb from '../db/entities/attachments.js';
import * as tagsDb from '../db/entities/tags.js';

import type pg from 'pg';
import { emptyData, type Schema, type ThingPatch } from '../../../shared/model.js';
import * as database from '../db/connection.js';
import type { Database } from '../db/connection.js';
import * as importsDb from '../db/entities/imports.js';
import * as thingsDb from '../db/entities/things.js';
import * as tasksDb from '../db/entities/tasks.js';
import * as purchasablesDb from '../db/entities/purchasables.js';
import { ensure } from './errors.js';
import { patchData, projectData, type FieldProvenance } from './thing-data.js';
import type { Registry } from './registry/registry.js';

/** Projects the stored Thing into a user-visible detail response. */
export async function detail(
  db: Database,
  userId: string,
  id: string,
  registry: Registry,
  { redactSensitive = false } = {},
): Promise<Schema['Thing']> {
  const thing = await thingsDb.getThingForUserOrThrow(db, userId, id);
  const { data, userId: _userId, ...summary } = thing;
  return {
    ...summary,
    import: await importsDb.findThingImport(db, userId, id, data.categoryVersion ?? 0),
    ...projectData(data, registry, redactSensitive),
    ...(await thingsDb.getThingRelatedIds(db, userId, id)),
  };
}

/** Opens a transaction for manual Thing creation or editing. */
export async function writeThing(
  pool: pg.Pool,
  userId: string,
  input: Schema['ThingCreate'] | ThingPatch,
  registry: Registry,
  id?: string,
) {
  return database.transaction(pool, (db) => saveThing(db, userId, input, registry, id));
}

/** Changes category and optionally queues research in the same transaction. */
export async function changeThingCategory(
  pool: pg.Pool,
  userId: string,
  id: string,
  input: Schema['ThingCategoryChange'],
  registry: Registry,
) {
  return database.transaction(pool, async (db) => {
    const thing = await thingsDb.getThingForUserOrThrow(db, userId, id, { lock: true });
    if (thing.categoryId === input.categoryId) return detail(db, userId, id, registry);
    const saved = await saveThing(db, userId, { categoryId: input.categoryId }, registry, id);
    if (!input.findDetails) return saved;
    await importsDb.createImportInTransaction(db, userId, [], id);
    return detail(db, userId, id, registry);
  });
}

/** Applies a Thing write within the caller's transaction. */
export async function saveThing(
  db: Database,
  userId: string,
  input: Schema['ThingCreate'] | ThingPatch,
  registry: Registry,
  id?: string,
  provenance?: FieldProvenance,
) {
  // Lock the stored Thing before merging a patch so concurrent writes cannot replace each other with stale data.
  let thing = id
    ? await thingsDb.getThingForUserOrThrow(db, userId, id, { lock: true })
    : undefined;
  const category = ('categoryId' in input ? input.categoryId : undefined) ?? thing?.categoryId;
  const categoryChanged = !!thing && category !== thing.categoryId;
  if (thing)
    await importsDb.assertThingEditable(db, userId, thing.id, { allowQueued: !categoryChanged });
  ensure(category && (await registryDb.categoryExists(db, category)), 'Unknown category');
  ensure((input.name ?? thing?.name)?.trim(), 'Name cannot be blank');
  const data = patchData(
    thing?.data ?? emptyData(),
    input,
    category,
    registry,
    provenance,
    categoryChanged,
  );

  if (!thing)
    thing = await thingsDb.insertThing(db, userId, {
      id: 'id' in input ? input.id : undefined,
      categoryId: category,
      name: input.name!.trim(),
      description: input.description ?? '',
      data,
    });

  let image =
    input.imageAttachmentId === undefined ? thing.imageAttachmentId : input.imageAttachmentId;

  if (categoryChanged) {
    await tasksDb.removeUneditedSuggestions(db, userId, thing.id);
    await purchasablesDb.removeSuggestions(db, userId, thing.id);
    if (
      image &&
      input.imageAttachmentId === undefined &&
      !data.userEdited?.includes('imageAttachmentId')
    ) {
      const attachment = await attachmentsDb.getAttachmentForUserOrThrow(db, userId, image);
      if (attachment.userId === null) image = null;
    }
  }

  if (image)
    ensure(
      await attachmentsDb.isLinkedImage(db, userId, thing.id, image),
      'Image must be a linked image attachment',
    );
  await thingsDb.updateThing(db, userId, thing.id, {
    name: input.name?.trim() ?? thing.name,
    description: input.description ?? thing.description,
    categoryId: category,
    data,
    imageAttachmentId: image,
  });
  if (input.tagIds) await tagsDb.setThingTags(db, userId, thing.id, input.tagIds);

  return detail(db, userId, thing.id, registry);
}
