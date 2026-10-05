/** Projects retrieved Thing data into the context needed for chat answers and tool references. */
import type { Schema } from '../../../../shared/model.js';
import type * as conversationsDb from '../../db/entities/conversations.js';

// Retain populated fields and their evidence while omitting editing and display metadata.
export function chatThingContext(
  thing: Schema['Thing'],
  resources: Awaited<ReturnType<typeof conversationsDb.getOwnedChatResources>>,
) {
  const fields = (items: Schema['Field'][]) =>
    items
      .filter((field) => field.value !== null || field.masked)
      .map(({ id, name, value, masked, sourceRefs }) => ({ id, name, value, masked, sourceRefs }));
  return {
    thing: {
      id: thing.id,
      name: thing.name,
      categoryId: thing.categoryId,
      fieldSets: thing.fieldSets
        .map(({ id, name, fields: items }) => ({ id, name, fields: fields(items) }))
        .filter((set) => set.fields.length),
      standaloneFields: fields(thing.standaloneFields),
      undefinedFields: thing.undefinedFields
        .filter((field) => field.value !== null || field.masked)
        .map(({ id, label, value, masked, sourceRefs }) => ({
          id,
          label,
          value,
          masked,
          sourceRefs,
        })),
    },
    attachments: resources.attachments.map(
      ({ id, filename, title, mediaType, documentType, pageCount }) => ({
        id,
        filename,
        title,
        mediaType,
        documentType,
        pageCount,
      }),
    ),
    ...resources.activity,
    truncated: resources.truncated,
  };
}
