/**
 * Applies Thing field patches, preserves values when sets change, maintains pins and projects
 * user-visible or redacted values.
 */

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
import type { Registry } from './registry/registry.js';
import { getDisplacedValueType, inferCustomValueType, isCustomValue } from './custom-fields.js';

export const pinKey = (pin: Pin) =>
  pin.customFieldId ? `local:${pin.customFieldId}` : `${pin.fieldSetId ?? ''}:${pin.fieldId}`;

/** Uses pin keys for existing addresses and local:new:index for new custom fields. */
export type FieldProvenance = ReadonlyMap<string, Pick<StoredValue, 'origin' | 'sourceRefs'>>;

/** Applies user-requested changes with optional application-validated field provenance. */
export function patchData(
  original: ThingData,
  patch: ThingPatch,
  categoryId: string,
  registry: Registry,
  provenance?: FieldProvenance,
  categoryChanged = false,
): ThingData {
  const data = structuredClone(original);
  // Track explicit clears and removals too, so later import retries cannot restore values the user discarded.
  const edited = new Set(data.userEdited ?? []);
  for (const key of ['name', 'categoryId', 'description', 'imageAttachmentId'] as const)
    if (patch[key] !== undefined) edited.add(key);
  for (const id of patch.removeCustomFieldIds ?? []) edited.add(`local:${id}`);
  for (const f of patch.customFields ?? []) if (f.id) edited.add(`local:${f.id}`);
  for (const id of patch.removeFieldSetIds ?? []) edited.add(`set:${id}`);
  if (patch.pinnedFields) edited.add('pins');
  if (edited.size) data.userEdited = [...edited];
  const removed = new Set(patch.removeFieldSetIds ?? []);
  for (const id of removed) ensure(data.setIds.includes(id), 'Cannot remove an unselected set');
  const roots = data.setIds.filter(
    (id) => !removed.has(id) && registry.sets.get(id)?.categoryId === categoryId,
  );
  if (categoryChanged) {
    // Carry over shared sections such as Warranty when their definitions match.
    for (const id of data.setIds) {
      if (removed.has(id)) continue;
      const old = registry.sets.get(id)!;
      const matches = [...registry.sets.values()].filter(
        (set) =>
          set.categoryId === categoryId &&
          set.name === old.name &&
          set.fields.length === old.fields.length &&
          set.fields.every((field) => old.fields.some((previous) => previous.id === field.id)),
      );
      if (matches.length === 1 && !edited.has(`set:${matches[0].id}`)) roots.push(matches[0].id);
    }
  }
  const selected = registry.expand([...roots, ...(patch.addFieldSetIds ?? [])], categoryId);
  ensure(
    [...removed].every((id) => !selected.includes(id)),
    'An included set is still required',
  );

  const oldSets = data.setIds.filter((id) => !selected.includes(id));
  const destinations = new Map<string, string[]>();
  const oldOccurrences = new Map<string, number>();
  if (categoryChanged) {
    for (const id of oldSets)
      for (const field of registry.sets.get(id)!.fields)
        oldOccurrences.set(field.id, (oldOccurrences.get(field.id) ?? 0) + 1);
    for (const id of selected)
      for (const field of registry.sets.get(id)!.fields)
        destinations.set(field.id, [...(destinations.get(field.id) ?? []), id]);
    data.categoryVersion = (data.categoryVersion ?? 0) + 1;
  }

  // Move fields with one old and one new occurrence. Keep other populated fields for review.
  for (const oldId of oldSets) {
    for (const [fieldId, stored] of Object.entries(data.values[oldId] ?? {})) {
      const matches = destinations.get(fieldId);
      if (!removed.has(oldId) && oldOccurrences.get(fieldId) === 1 && matches?.length === 1) {
        const [newId] = matches;
        (data.values[newId] ??= {})[fieldId] = stored;
        data.pins = data.pins.map((pin) =>
          pin.fieldSetId === oldId && pin.fieldId === fieldId
            ? { fieldSetId: newId, fieldId }
            : pin,
        );
        continue;
      }
      if (stored.value === null) continue;
      const definition = registry.fields.get(fieldId)!;
      const id = randomUUID();
      data.customFields.push({
        ...stored,
        id,
        label: `${registry.sets.get(oldId)!.name}: ${definition.name}`,
        sensitive: definition.sensitive,
        scope: definition.scope,
        valueType: getDisplacedValueType(definition.schema, stored.value),
        ...(categoryChanged && { fromPreviousCategory: true, autoPopulate: false }),
      });
      data.pins = data.pins.map((pin) =>
        pin.fieldSetId === oldId && pin.fieldId === fieldId ? { customFieldId: id } : pin,
      );
    }

    delete data.values[oldId];
  }

  data.setIds = selected;
  for (const setId of selected)
    for (const field of registry.sets.get(setId)!.fields)
      (data.values[setId] ??= {})[field.id] ??= {
        value: null,
        origin: 'IMPORT',
        sourceRefs: [],
        autoPopulate: true,
      };

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

    if (entry.value !== undefined) {
      if (entry.value !== null) registry.validate(entry.fieldId, entry.value);
      target[entry.fieldId] = {
        value: entry.value,
        origin: 'USER',
        sourceRefs: [],
        ...provenance?.get(pinKey(entry)),
        autoPopulate: entry.autoPopulate ?? false,
      };
    } else {
      ensure(target[entry.fieldId], 'Unknown field occurrence');
      if (entry.autoPopulate !== undefined) target[entry.fieldId].autoPopulate = entry.autoPopulate;
    }
  }

  const removeLocal = new Set(patch.removeCustomFieldIds ?? []);
  ensure(
    [...removeLocal].every((id) => data.customFields.some((f) => f.id === id)),
    'Unknown local field',
  );
  data.customFields = data.customFields.filter((f) => !removeLocal.has(f.id));

  for (const [index, input] of (patch.customFields ?? []).entries()) {
    const existing = data.customFields.find((f) => f.id === input.id);
    ensure(!input.id || existing, 'Unknown local field');
    const valueType = input.valueType ?? existing?.valueType ?? inferCustomValueType(input.value);
    ensure(
      isCustomValue(input.value, valueType),
      `Invalid value for custom field type ${valueType}`,
    );
    const field = {
      ...input,
      scope: input.scope ?? existing?.scope ?? 'INSTANCE',
      valueType,
      id: input.id ?? randomUUID(),
      ...(existing?.fromPreviousCategory && { fromPreviousCategory: true as const }),
      origin: 'USER' as const,
      autoPopulate: false,
      sourceRefs: [],
      ...provenance?.get(input.id ? `local:${input.id}` : `local:new:${index}`),
    };
    data.customFields = [...data.customFields.filter((f) => f.id !== field.id), field];
  }

  const validPin = (p: Pin) => {
    if (p.customFieldId)
      return (
        p.fieldId === undefined &&
        p.fieldSetId === undefined &&
        data.customFields.some((f) => f.id === p.customFieldId)
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

// Mask source quotes alongside sensitive values; provenance can contain the same secret.
function projectField(
  definition: FieldDefinition,
  stored: StoredValue | undefined,
  redactSensitive: boolean,
): Schema['Field'] {
  return {
    ...definition,
    autoPopulate: stored?.autoPopulate ?? stored?.origin !== 'USER',
    value: redactSensitive && definition.sensitive ? null : (stored?.value ?? null),
    masked: definition.sensitive && stored?.value != null,
    origin: stored?.origin ?? null,
    sourceRefs: definition.sensitive ? [] : (stored?.sourceRefs ?? []),
  };
}

export function projectData(
  data: ThingData,
  registry: Registry,
  redactSensitive = false,
): Pick<Schema['Thing'], 'fieldSets' | 'standaloneFields' | 'customFields' | 'pinnedFields'> {
  return {
    fieldSets: data.setIds.map((id) => {
      const set = registry.sets.get(id)!;
      return {
        ...set,
        fields: set.fields.map((f) => projectField(f, data.values[id]?.[f.id], redactSensitive)),
      };
    }),
    standaloneFields: Object.entries(data.standalone).map(([id, stored]) =>
      projectField(registry.fields.get(id)!, stored, redactSensitive),
    ),
    customFields: data.customFields.map(
      ({ fromPreviousCategory: _fromPreviousCategory, ...f }) => ({
        ...f,
        scope: f.scope ?? 'INSTANCE',
        value: redactSensitive && f.sensitive ? null : f.value,
        masked: f.sensitive && f.value !== null,
        sourceRefs: f.sensitive ? [] : f.sourceRefs,
      }),
    ),
    pinnedFields: data.pins,
  };
}
