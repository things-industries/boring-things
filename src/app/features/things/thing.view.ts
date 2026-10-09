import type { Schema, Value } from '../../../../shared/model';
import type { ThingDetail } from '../../interfaces/thing.interface';
import { timeLeft, timeSince } from '../../utils/date.util';
import { fieldIcon } from '../../utils/field-icon.util';
import { fieldAnchor } from '../../utils/sections.util';

const ACTIVE_IMPORT = [
  'QUEUED',
  'WAITING_FOR_TRANSCRIPTION',
  'EXTRACTING',
  'MAPPING',
  'DISCOVERING',
];

export function activeImport(job: Schema['Import'] | null | undefined): boolean {
  return !!job && ACTIVE_IMPORT.includes(job.status);
}

/** Import stages shown to the user: read the source, add details, find more online. */
export const IMPORT_STEP_COUNT = 3;

const IMPORT_STEPS: Partial<Record<Schema['ImportStatusEnum'], number>> = {
  QUEUED: 0,
  WAITING_FOR_TRANSCRIPTION: 0,
  EXTRACTING: 0,
  MAPPING: 1,
  DISCOVERING: 2,
};

/** The zero-based stage an import status belongs to; finished imports are past the last. */
export function importStep(status: Schema['ImportStatusEnum']): number {
  return IMPORT_STEPS[status] ?? IMPORT_STEP_COUNT;
}

/** An import is still reading a source for a Thing that has no details yet. */
export function discovering(detail: ThingDetail, imageId: string | null): boolean {
  const status = detail.import?.status;
  const hasValues =
    detail.fieldSets.some((set) => set.fields.some((field) => field.value !== null)) ||
    detail.standaloneFields.length > 0 ||
    detail.customFields.length > 0;

  return (status === 'QUEUED' || status === 'EXTRACTING') && !hasValues && !imageId;
}

/** The first value of a registry field across the Thing's sets, then its standalone fields. */
export function fieldValueById(detail: ThingDetail, fieldId: string): Value | null {
  for (const field of [
    ...detail.fieldSets.flatMap((set) => set.fields),
    ...detail.standaloneFields,
  ])
    if (field.id === fieldId && field.value !== null && !field.masked) return field.value;
  return null;
}

export type WarrantyStatus =
  | { state: 'active'; amount: number; unit: 'year' | 'month' | 'day' }
  | { state: 'expired' }
  | { state: 'unknown' };

export function warrantyStatus(detail: ThingDetail, now = new Date()): WarrantyStatus {
  const ends = fieldValueById(detail, 'common.warrantyEnds');

  if (typeof ends !== 'string') return { state: 'unknown' };

  const left = timeLeft(ends, now);

  return left ? { state: 'active', ...left } : { state: 'expired' };
}

/** Time since the Thing was acquired, from `common.acquiredOn`. */
export function thingAge(detail: ThingDetail, now = new Date()) {
  const acquired = fieldValueById(detail, 'common.acquiredOn');

  return typeof acquired === 'string' ? timeSince(acquired, now) : null;
}

export interface KeyDetail {
  anchor: string;
  label: string;
  icon: string;
  value: Value | null;
  masked: boolean;
  format: 'date' | 'date-time' | null;
}

/** Pinned fields in pin order, skipping pins whose field no longer exists. */
export function keyDetails(detail: ThingDetail): KeyDetail[] {
  return detail.pinnedFields.flatMap((pin): KeyDetail[] => {
    if ('customFieldId' in pin) {
      const field = detail.customFields.find((f) => f.id === pin.customFieldId);

      return field
        ? [
            {
              anchor: 'custom-' + field.id,
              label: field.label,
              icon: fieldIcon(null),
              value: field.value,
              masked: field.masked,
              format: null,
            },
          ]
        : [];
    }

    const field = (
      pin.fieldSetId
        ? detail.fieldSets.find((set) => set.id === pin.fieldSetId)?.fields
        : detail.standaloneFields
    )?.find((f) => f.id === pin.fieldId);

    return field
      ? [
          {
            anchor: fieldAnchor(pin.fieldSetId ?? null, field.id),
            label: field.name,
            icon: fieldIcon(field.icon),
            value: field.value,
            masked: field.masked,
            format:
              field.schema.format === 'date' || field.schema.format === 'date-time'
                ? field.schema.format
                : null,
          },
        ]
      : [];
  });
}
