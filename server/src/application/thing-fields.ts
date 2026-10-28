/** Creates field occurrences and validates automatic field writes against current owner permissions. */
import type { FieldSet, SourceRef, ThingData, Value } from '../../../shared/model.js';
import type { Registry } from './registry/registry.js';
import { ensure } from './errors.js';

export interface FieldProposal {
  fieldSetId: string | null;
  fieldId: string;
  value: Value;
  sourceRefs: SourceRef[];
  origin?: 'IMPORT' | 'DISCOVERY';
}

// Materialises selected and mandatory fields without changing existing values or permissions.
export function addFieldSets(
  original: ThingData,
  category: string,
  registry: Registry,
  selected: string[] = [],
) {
  const data = structuredClone(original);
  data.setIds = registry.expand(
    [...data.setIds, ...selected.filter((id) => !data.userEdited?.includes(`set:${id}`))],
    category,
  );
  for (const setId of data.setIds)
    for (const field of registry.sets.get(setId)!.fields)
      (data.values[setId] ??= {})[field.id] ??= {
        value: null,
        origin: 'IMPORT',
        sourceRefs: [],
        autoPopulate: true,
      };
  return data;
}

// Applies validated proposals to enabled fields from a snapshot read under the Thing lock.
export function populateFields(
  original: ThingData,
  proposals: FieldProposal[],
  registry: Registry,
  origin: 'IMPORT' | 'DISCOVERY' = 'IMPORT',
) {
  const data = structuredClone(original);
  const written = new Set<string>();
  for (const proposal of proposals) {
    ensure(registry.fields.has(proposal.fieldId), 'Unknown field');
    if (proposal.fieldSetId !== null)
      ensure(
        data.setIds.includes(proposal.fieldSetId) &&
          registry.sets
            .get(proposal.fieldSetId)
            ?.fields.some((field) => field.id === proposal.fieldId),
        'Invalid field membership',
      );
    const key = `${proposal.fieldSetId ?? ''}:${proposal.fieldId}`;
    ensure(!written.has(key), 'Duplicate field proposal');
    written.add(key);
    registry.validate(proposal.fieldId, proposal.value);
    const fields = proposal.fieldSetId
      ? (data.values[proposal.fieldSetId] ??= {})
      : data.standalone;
    const current = fields[proposal.fieldId];
    if ((current?.autoPopulate ?? current?.origin !== 'USER') === false) continue;
    fields[proposal.fieldId] = {
      value: proposal.value,
      sourceRefs: proposal.sourceRefs,
      origin: proposal.origin ?? origin,
      autoPopulate: true,
    };
  }
  return data;
}

// Returns enabled registry field occurrences for bounded population batches.
export function fieldTargets(data: ThingData, registry: Registry) {
  const result: {
    fieldSetId: string | null;
    field: FieldSet['fields'][number];
    value: Value | null;
  }[] = [];
  const add = (fieldSetId: string | null, fieldId: string) => {
    const field = registry.fields.get(fieldId);
    const stored = fieldSetId ? data.values[fieldSetId]?.[fieldId] : data.standalone[fieldId];
    if (field && (stored?.autoPopulate ?? stored?.origin !== 'USER'))
      result.push({ fieldSetId, field, value: stored?.value ?? null });
  };
  for (const setId of data.setIds)
    for (const field of registry.sets.get(setId)?.fields ?? []) add(setId, field.id);
  for (const id of Object.keys(data.standalone)) add(null, id);
  return result;
}

// Supplies saved identifiers as context for source applicability in local model tasks.
export function identifierValues(data: ThingData, registry: Registry) {
  const values = [
    ...Object.entries(data.standalone),
    ...Object.values(data.values).flatMap((fields) => Object.entries(fields)),
  ];
  return [
    ...new Map(
      values.flatMap(([fieldId, stored]) =>
        stored.value !== null &&
        ['GROUP', 'CLASS', 'INSTANCE'].includes(
          registry.fields.get(fieldId)?.identifierKind ?? 'NONE',
        )
          ? [[fieldId, { fieldId, value: stored.value }] as const]
          : [],
      ),
    ).values(),
  ];
}
