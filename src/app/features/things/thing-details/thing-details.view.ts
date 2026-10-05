import type { Pin, Schema, ThingPatch, Value } from '../../../../../shared/model';
import type { ThingDetail } from '../../../interfaces/thing.interface';
import { fieldAnchor, fieldSections, samePin } from '../../../utils/sections.util';

export interface DetailRow {
  anchor: string;
  label: string;
  value: Value | null;
  masked: boolean;
  format: 'date' | 'date-time' | null;
  pin: Pin;
  pinned: boolean;
  remove: ThingPatch;
}

/** A field section titled by its registry name, or the standalone or custom fields. */
export interface DetailGroup {
  id: string;
  kind: 'section' | 'standalone' | 'custom';
  title: string;
  rows: DetailRow[];
}

function dateFormat(field: Schema['Field']) {
  const format = field.schema.format;

  return format === 'date' || format === 'date-time' ? format : null;
}

function fieldRow(detail: ThingDetail, field: Schema['Field'], setId: string | null): DetailRow {
  const pin: Pin = { fieldSetId: setId, fieldId: field.id };

  return {
    anchor: fieldAnchor(setId, field.id),
    label: field.name,
    value: field.value,
    masked: field.masked,
    format: dateFormat(field),
    pin,
    pinned: detail.pinnedFields.some((p) => samePin(p, pin)),
    remove: { values: [{ fieldSetId: setId, fieldId: field.id, value: null }] },
  };
}

function customRow(detail: ThingDetail, field: Schema['UndefinedField']): DetailRow {
  const pin: Pin = { undefinedFieldId: field.id };

  return {
    anchor: 'custom-' + field.id,
    label: field.label,
    value: field.value,
    masked: field.masked,
    format: null,
    pin,
    pinned: detail.pinnedFields.some((p) => samePin(p, pin)),
    remove: {
      removeUndefinedFieldIds: [field.id],
      pinnedFields: detail.pinnedFields.filter((p) => !samePin(p, pin)),
    },
  };
}

/** Field sections, standalone fields and custom fields as groups of rows, skipping empty groups. */
export function detailGroups(detail: ThingDetail): DetailGroup[] {
  const groups: DetailGroup[] = fieldSections(detail.fieldSets).map((section) => ({
    id: section.id,
    kind: 'section' as const,
    title: section.name,
    rows: section.sets.flatMap((set) => set.fields.map((field) => fieldRow(detail, field, set.id))),
  }));

  groups.push(
    {
      id: 'standalone',
      kind: 'standalone',
      title: '',
      rows: detail.standaloneFields.map((field) => fieldRow(detail, field, null)),
    },
    {
      id: 'custom',
      kind: 'custom',
      title: '',
      rows: detail.undefinedFields.map((field) => customRow(detail, field)),
    },
  );
  return groups.filter((group) => group.rows.length);
}
