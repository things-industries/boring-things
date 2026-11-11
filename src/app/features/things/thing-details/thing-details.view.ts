import type { Pin, Schema, ThingPatch, Value } from '../../../../../shared/model';
import type { FieldDraft, FieldInput } from '../../../interfaces/field-input.interface';
import type { ThingDetail } from '../../../interfaces/thing.interface';
import {
  customFieldInput,
  draftValue,
  fieldInput,
  sameValue,
  valueDraft,
} from '../../../utils/field.util';
import { fieldAnchor, fieldSections, samePin } from '../../../utils/sections.util';

/** Where an edited value is written: a registry field occurrence or a custom field. */
export type DetailTarget =
  | { kind: 'field'; fieldSetId: string | null; fieldId: string }
  | { kind: 'custom'; id: string; label: string; sensitive: boolean };

export interface DetailRow {
  anchor: string;
  label: string;
  value: Value | null;
  masked: boolean;
  format: 'date' | 'date-time' | null;
  input: FieldInput;
  target: DetailTarget;
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

/** Custom dates show formatted when they hold a calendar date, and as typed otherwise. */
function customDateFormat(field: Schema['CustomField']) {
  return field.valueType === 'DATE' &&
    typeof field.value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(field.value)
    ? 'date'
    : null;
}

function fieldRow(detail: ThingDetail, field: Schema['Field'], setId: string | null): DetailRow {
  const pin: Pin = { fieldSetId: setId, fieldId: field.id };

  return {
    anchor: fieldAnchor(setId, field.id),
    label: field.name,
    value: field.value,
    masked: field.masked,
    format: dateFormat(field),
    input: fieldInput(field),
    target: { kind: 'field', fieldSetId: setId, fieldId: field.id },
    pin,
    pinned: detail.pinnedFields.some((p) => samePin(p, pin)),
    remove: { values: [{ fieldSetId: setId, fieldId: field.id, value: null }] },
  };
}

function customRow(detail: ThingDetail, field: Schema['CustomField']): DetailRow {
  const pin: Pin = { customFieldId: field.id };

  return {
    anchor: 'custom-' + field.id,
    label: field.label,
    value: field.value,
    masked: field.masked,
    format: customDateFormat(field),
    input: customFieldInput(field),
    target: { kind: 'custom', id: field.id, label: field.label, sensitive: field.sensitive },
    pin,
    pinned: detail.pinnedFields.some((p) => samePin(p, pin)),
    remove: {
      removeCustomFieldIds: [field.id],
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
      rows: detail.customFields.map((field) => customRow(detail, field)),
    },
  );
  return groups.filter((group) => group.rows.length);
}

export const nameInput: FieldInput = {
  kind: 'text',
  sensitive: false,
  required: true,
  maxLength: 200,
};

export const descriptionInput: FieldInput = { kind: 'textarea', sensitive: false, maxLength: 4000 };

type Basics = Pick<Schema['ThingSummary'], 'name' | 'description' | 'categoryId'>;

/** Edit-mode drafts: the Thing's basics and one draft per row, keyed by row anchor. */
export interface DetailsDraft {
  name: FieldDraft;
  description: FieldDraft;
  categoryId: FieldDraft;
  fields: Partial<Record<string, FieldDraft>>;
}

/** Drafts holding the current values; masked values start empty unless revealed. */
export function detailsDraft(
  thing: Basics,
  rows: DetailRow[],
  revealed: ReadonlyMap<string, Value | null>,
): DetailsDraft {
  const fields: Record<string, FieldDraft> = {};

  for (const row of rows) {
    const known = revealed.has(row.anchor);

    fields[row.anchor] =
      row.masked && !known
        ? ''
        : valueDraft(row.input, known ? revealed.get(row.anchor)! : row.value);
  }

  return { name: thing.name, description: thing.description, categoryId: thing.categoryId, fields };
}

/**
 * The patches that save edit-mode drafts, in order. Field changes go first: a category change
 * drops sections that don't fit the new category, so their values must be written beforehand.
 */
export function detailsPatches(
  thing: Basics,
  detail: ThingDetail,
  rows: DetailRow[],
  draft: DetailsDraft,
  revealed: ReadonlyMap<string, Value | null>,
): ThingPatch[] {
  const patch: ThingPatch = {};
  const name = String(draft.name).trim();
  const description = String(draft.description).trim();
  const removedCustom: string[] = [];

  if (name !== thing.name) patch.name = name;
  if (description !== thing.description) patch.description = description;

  for (const row of rows) {
    const rowDraft = draft.fields[row.anchor];

    if (rowDraft === undefined) continue;

    const next = draftValue(row.input, rowDraft);
    const known = revealed.has(row.anchor) || !row.masked;
    const previous = revealed.has(row.anchor) ? revealed.get(row.anchor)! : row.value;

    // An unrevealed masked value starts empty; only a typed replacement changes it.
    if (!known && next === null) continue;
    if (known && sameValue(previous, next)) continue;

    if (row.target.kind === 'field') {
      (patch.values ??= []).push({
        fieldSetId: row.target.fieldSetId,
        fieldId: row.target.fieldId,
        value: next,
      });
    } else if (next === null) {
      removedCustom.push(row.target.id);
    } else {
      (patch.customFields ??= []).push({
        id: row.target.id,
        label: row.target.label,
        sensitive: row.target.sensitive,
        value: next,
      });
    }
  }

  if (removedCustom.length) {
    patch.removeCustomFieldIds = removedCustom;
    patch.pinnedFields = detail.pinnedFields.filter(
      (pin) => !removedCustom.some((id) => samePin(pin, { customFieldId: id })),
    );
  }

  const patches = Object.keys(patch).length ? [patch] : [];
  const categoryId = String(draft.categoryId);

  if (categoryId && categoryId !== thing.categoryId) patches.push({ categoryId });
  return patches;
}
