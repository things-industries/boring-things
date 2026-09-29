import { randomUUID } from 'node:crypto';
import type {
  FieldDefinition,
  Pin,
  Schema,
  StoredValue,
  ThingData,
  ThingPatch,
} from '../../../shared/model.js';
import { ensure } from './errors.js';
import type { Registry } from './registry.js';

export const pinKey = (pin: Pin) =>
  pin.undefinedFieldId ? `local:${pin.undefinedFieldId}` : `${pin.fieldSetId ?? ''}:${pin.fieldId}`;
export function patchData(
  original: ThingData,
  patch: ThingPatch,
  categoryId: string,
  registry: Registry,
): ThingData {
  const data = structuredClone(original);
  const edited = new Set(data.userEdited ?? []);
  for (const key of ['name', 'categoryId', 'description'] as const)
    if (patch[key] !== undefined) edited.add(key);
  for (const v of patch.values ?? []) edited.add(`${v.fieldSetId ?? ''}:${v.fieldId}`);
  for (const id of patch.removeUndefinedFieldIds ?? []) edited.add(`local:${id}`);
  for (const f of patch.undefinedFields ?? []) if (f.id) edited.add(`local:${f.id}`);
  for (const id of patch.removeFieldSetIds ?? []) edited.add(`set:${id}`);
  if (patch.pinnedFields) edited.add('pins');
  if (edited.size) data.userEdited = [...edited];
  const removed = new Set(patch.removeFieldSetIds ?? []);
  for (const id of removed) ensure(data.setIds.includes(id), 'Cannot remove an unselected set');
  const roots = data.setIds.filter(
    (id) => !removed.has(id) && registry.sets.get(id)?.categoryId === categoryId,
  );
  const selected = registry.expand([...roots, ...(patch.addFieldSetIds ?? [])], categoryId);
  ensure(
    [...removed].every((id) => !selected.includes(id)),
    'An included set is still required',
  );
  for (const oldId of data.setIds.filter((id) => !selected.includes(id))) {
    for (const [fieldId, stored] of Object.entries(data.values[oldId] ?? {})) {
      const definition = registry.fields.get(fieldId)!;
      const id = randomUUID();
      data.undefinedFields.push({
        ...stored,
        id,
        label: `${registry.sets.get(oldId)!.name}: ${definition.name}`,
        sensitive: definition.sensitive,
      });
      data.pins = data.pins.map((pin) =>
        pin.fieldSetId === oldId && pin.fieldId === fieldId ? { undefinedFieldId: id } : pin,
      );
    }
    delete data.values[oldId];
  }
  data.setIds = selected;
  for (const entry of patch.values ?? []) {
    if (entry.fieldSetId !== null) {
      ensure(selected.includes(entry.fieldSetId), 'Field set is not selected');
      ensure(
        registry.sets.get(entry.fieldSetId)!.fields.some((f) => f.id === entry.fieldId),
        'Field is not a member of the selected set',
      );
    } else ensure(registry.fields.has(entry.fieldId), 'Unknown standalone field');
    const target =
      entry.fieldSetId === null ? data.standalone : (data.values[entry.fieldSetId] ??= {});
    if (entry.value === null) delete target[entry.fieldId];
    else {
      registry.validate(entry.fieldId, entry.value);
      target[entry.fieldId] = { value: entry.value, origin: 'user', sourceRefs: [] };
    }
  }
  const removeLocal = new Set(patch.removeUndefinedFieldIds ?? []);
  ensure(
    [...removeLocal].every((id) => data.undefinedFields.some((f) => f.id === id)),
    'Unknown local field',
  );
  data.undefinedFields = data.undefinedFields.filter((f) => !removeLocal.has(f.id));
  for (const input of patch.undefinedFields ?? []) {
    ensure(!input.id || data.undefinedFields.some((f) => f.id === input.id), 'Unknown local field');
    const field = {
      ...input,
      id: input.id ?? randomUUID(),
      origin: 'user' as const,
      sourceRefs: [],
    };
    data.undefinedFields = [...data.undefinedFields.filter((f) => f.id !== field.id), field];
  }
  const validPin = (p: Pin) => {
    if (p.undefinedFieldId)
      return (
        p.fieldId === undefined &&
        p.fieldSetId === undefined &&
        data.undefinedFields.some((f) => f.id === p.undefinedFieldId)
      );
    if (!p.fieldId || p.fieldSetId === undefined) return false;
    return p.fieldSetId === null
      ? Object.hasOwn(data.standalone, p.fieldId)
      : selected.includes(p.fieldSetId) &&
          !!registry.sets.get(p.fieldSetId)?.fields.some((f) => f.id === p.fieldId);
  };
  if (patch.pinnedFields) {
    ensure(patch.pinnedFields.every(validPin), 'Invalid pinned field');
    data.pins = [...new Map(patch.pinnedFields.map((p) => [pinKey(p), p])).values()];
  } else data.pins = data.pins.filter(validPin);
  return data;
}
function projectField(definition: FieldDefinition, stored?: StoredValue): Schema['Field'] {
  return {
    ...definition,
    value: definition.sensitive ? null : (stored?.value ?? null),
    masked: definition.sensitive && !!stored,
    origin: stored?.origin ?? null,
    sourceRefs: definition.sensitive ? [] : (stored?.sourceRefs ?? []),
  };
}
export function projectData(
  data: ThingData,
  registry: Registry,
): Pick<Schema['Thing'], 'fieldSets' | 'standaloneFields' | 'undefinedFields' | 'pinnedFields'> {
  return {
    fieldSets: data.setIds.map((id) => {
      const set = registry.sets.get(id)!;
      return { ...set, fields: set.fields.map((f) => projectField(f, data.values[id]?.[f.id])) };
    }),
    standaloneFields: Object.entries(data.standalone).map(([id, stored]) =>
      projectField(registry.fields.get(id)!, stored),
    ),
    undefinedFields: data.undefinedFields.map((f) => ({
      ...f,
      valueType: (typeof f.value === 'object' ? 'money' : typeof f.value) as
        'money' | 'string' | 'number' | 'boolean',
      value: f.sensitive ? null : f.value,
      masked: f.sensitive,
      sourceRefs: f.sensitive ? [] : f.sourceRefs,
    })),
    pinnedFields: data.pins,
  };
}
export function revealValue(data: ThingData, pin: Pin, registry: Registry) {
  if (pin.undefinedFieldId) {
    ensure(!pin.fieldId && pin.fieldSetId === undefined, 'Invalid field reference');
    const field = data.undefinedFields.find((f) => f.id === pin.undefinedFieldId);
    ensure(field, 'Field not found', 404);
    return field.value;
  }
  ensure(
    pin.fieldId && pin.fieldSetId !== undefined && registry.fields.has(pin.fieldId),
    'Invalid field reference',
  );
  if (pin.fieldSetId === null) return data.standalone[pin.fieldId]?.value ?? null;
  ensure(
    data.setIds.includes(pin.fieldSetId) &&
      registry.sets.get(pin.fieldSetId)!.fields.some((f) => f.id === pin.fieldId),
    'Field not found',
    404,
  );
  return data.values[pin.fieldSetId]?.[pin.fieldId]?.value ?? null;
}
