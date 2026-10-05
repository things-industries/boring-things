import type { ThingData, Value } from '../../../shared/model.js';
import type { Registry } from './registry/registry.js';

export interface PublicField {
  fieldSetId: string | null;
  fieldId: string;
  label: string;
  description: string;
  customFieldId?: string;
  value: Value;
}

export function publicFields(data: ThingData, registry: Registry): PublicField[] {
  const fields: PublicField[] = [];
  const add = (fieldSetId: string | null, fieldId: string) => {
    const definition = registry.fields.get(fieldId);
    const stored = fieldSetId ? data.values[fieldSetId]?.[fieldId] : data.standalone[fieldId];
    if (definition?.instanceSpecific === false && stored?.value != null)
      fields.push({
        fieldSetId,
        fieldId,
        label: definition.name,
        description: definition.description,
        value: stored.value,
      });
  };
  for (const setId of data.setIds)
    for (const field of registry.sets.get(setId)?.fields ?? []) add(setId, field.id);
  for (const id of Object.keys(data.standalone)) add(null, id);
  for (const field of data.customFields)
    if (field.instanceSpecific === false && field.value != null)
      fields.push({
        fieldSetId: null,
        fieldId: field.id,
        customFieldId: field.id,
        label: field.label,
        description: field.label,
        value: field.value,
      });
  return fields;
}
