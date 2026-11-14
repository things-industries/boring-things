/** Projects retrieved Thing data into the context needed for chat answers and tool references. */
import type { Schema } from '../../../../shared/model.js';
import type * as conversationsDb from '../../db/entities/conversations.js';

// Include empty field addresses and definitions so requested edits can use the registry.
export function chatThingContext(
  thing: Schema['Thing'],
  resources: Awaited<ReturnType<typeof conversationsDb.getChatResourcesForUser>>,
) {
  const fields = (items: Schema['Field'][]) =>
    items.map(({ id, name, description, value, masked, schema, scope, sensitive }) => ({
      id,
      name,
      description,
      value,
      masked,
      schema,
      scope,
      sensitive,
    }));
  return {
    thing: {
      id: thing.id,
      name: thing.name,
      categoryId: thing.categoryId,
      fieldSets: thing.fieldSets.map(({ id, name, fields: items }) => ({
        id,
        name,
        fields: fields(items),
      })),
      standaloneFields: fields(thing.standaloneFields),
      customFields: thing.customFields.map(
        ({ id, label, value, masked, sensitive, scope, valueType }) => ({
          id,
          label,
          value,
          masked,
          sensitive,
          scope,
          valueType,
        }),
      ),
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
    events: resources.events,
    tasks: resources.tasks,
    issues: resources.issues,
    purchasables: resources.purchasables,
    truncated: resources.truncated,
  };
}
