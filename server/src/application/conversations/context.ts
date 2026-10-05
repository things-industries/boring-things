/** Projects retrieved Thing data into the context needed for chat answers and tool references. */
import type { Schema } from '../../../../shared/model.js';
import type * as conversationsDb from '../../db/entities/conversations.js';

// Keep populated values and addresses; the application retains provenance for citations.
export function chatThingContext(
  thing: Schema['Thing'],
  resources: Awaited<ReturnType<typeof conversationsDb.getOwnedChatResources>>,
) {
  const fields = (items: Schema['Field'][]) =>
    items
      .filter((field) => field.value !== null || field.masked)
      .map(({ id, name, value, masked }) => ({ id, name, value, masked }));
  return {
    thing: {
      id: thing.id,
      name: thing.name,
      categoryId: thing.categoryId,
      fieldSets: thing.fieldSets
        .map(({ id, name, fields: items }) => ({ id, name, fields: fields(items) }))
        .filter((set) => set.fields.length),
      standaloneFields: fields(thing.standaloneFields),
      customFields: thing.customFields
        .filter((field) => field.value !== null || field.masked)
        .map(({ id, label, value, masked }) => ({
          id,
          label,
          value,
          masked,
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
