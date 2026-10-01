import type { Schema } from '../../../../shared/model';
import type { RegistryIndex, ThingDetail, ThingRecord } from '../../interfaces/thing.interface';

export function thingRecord(thing: Schema['Thing']): ThingRecord {
  const {
    fieldSets,
    standaloneFields,
    undefinedFields,
    pinnedFields,
    import: importJob,
    attachmentIds: _attachmentIds,
    issueIds: _issueIds,
    eventIds: _eventIds,
    purchasableIds: _purchasableIds,
    conversationIds: _conversationIds,
    ...summary
  } = thing;

  return {
    ...summary,
    detail: { fieldSets, standaloneFields, undefinedFields, pinnedFields, import: importJob },
  };
}

/**
 * Predicts the server's result of a Thing patch. Field sets added here omit the sets they include;
 * the server response replaces the prediction.
 */
export function applyThingPatch(
  thing: ThingRecord,
  patch: Schema['ThingPatch'],
  registry: RegistryIndex,
): ThingRecord {
  const { name, description, categoryId, tagIds, imageAttachmentId } = patch;

  const next: ThingRecord = {
    ...thing,
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(categoryId !== undefined && { categoryId }),
    ...(tagIds !== undefined && { tagIds }),
    ...(imageAttachmentId !== undefined && { imageAttachmentId }),
  };

  return thing.detail ? { ...next, detail: patchDetail(thing.detail, patch, registry) } : next;
}

function patchDetail(
  detail: ThingDetail,
  patch: Schema['ThingPatch'],
  registry: RegistryIndex,
): ThingDetail {
  const removedSets = new Set(patch.removeFieldSetIds ?? []);
  let fieldSets = detail.fieldSets.filter((set) => !removedSets.has(set.id));

  for (const id of patch.addFieldSetIds ?? []) {
    const set = registry.fieldSets[id];

    if (set && !fieldSets.some((s) => s.id === id))
      fieldSets = [...fieldSets, { ...set, fields: set.fields.map((f) => emptyField(f)) }];
  }

  let standaloneFields = detail.standaloneFields;

  for (const { fieldSetId, fieldId, value } of patch.values ?? []) {
    if (fieldSetId === null) {
      const existing = standaloneFields.find((f) => f.id === fieldId);
      const definition = existing ?? registry.fields[fieldId];

      if (value === null) standaloneFields = standaloneFields.filter((f) => f.id !== fieldId);
      else if (existing)
        standaloneFields = standaloneFields.map((f) =>
          f.id === fieldId ? withValue(f, value) : f,
        );
      else if (definition)
        standaloneFields = [...standaloneFields, withValue(emptyField(definition), value)];
    } else
      fieldSets = fieldSets.map((set) =>
        set.id === fieldSetId
          ? {
              ...set,
              fields: set.fields.map((f) =>
                f.id === fieldId ? (value === null ? emptyField(f) : withValue(f, value)) : f,
              ),
            }
          : set,
      );
  }

  const removedLocal = new Set(patch.removeUndefinedFieldIds ?? []);
  let undefinedFields = detail.undefinedFields.filter((f) => !removedLocal.has(f.id));

  for (const input of patch.undefinedFields ?? []) {
    if (!input.id) continue;

    const field: Schema['UndefinedField'] = {
      id: input.id,
      label: input.label,
      sensitive: input.sensitive,
      value: input.sensitive ? null : input.value,
      masked: input.sensitive,
      origin: 'USER',
      sourceRefs: [],
      valueType: valueType(input.value),
    };

    undefinedFields = [...undefinedFields.filter((f) => f.id !== input.id), field];
  }

  return {
    ...detail,
    fieldSets,
    standaloneFields,
    undefinedFields,
    pinnedFields: patch.pinnedFields ?? detail.pinnedFields,
  };
}

function emptyField(definition: Schema['FieldDefinition']): Schema['Field'] {
  return { ...definition, value: null, masked: false, origin: null, sourceRefs: [] };
}

function withValue(field: Schema['Field'], value: Schema['Value']): Schema['Field'] {
  return {
    ...field,
    value: field.sensitive ? null : value,
    masked: field.sensitive,
    origin: 'USER',
    sourceRefs: [],
  };
}

function valueType(value: Schema['Value']): Schema['ValueTypeEnum'] {
  return typeof value === 'object'
    ? 'MONEY'
    : ((typeof value).toUpperCase() as Schema['ValueTypeEnum']);
}
