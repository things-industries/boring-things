import type { Schema, Value } from '../../../../shared/model';
import type { IconBadgeTone } from '../../interfaces/icon-badge.interface';
import type { EventKind } from '../../interfaces/event.interface';
import type { IssueKind } from '../../interfaces/issue.interface';
import type { ThingDetail } from '../../interfaces/thing.interface';
import { timeLeft, timeSince } from '../../utils/date.util';
import { fieldIcon } from '../../utils/field-icon.util';
import { fieldAnchor } from '../../utils/sections.util';

const ACTIVE_IMPORT = ['QUEUED', 'EXTRACTING', 'MAPPING', 'DISCOVERING', 'AWAITING_SELECTION'];

export function activeImport(job: Schema['Import'] | null | undefined): boolean {
  return !!job && ACTIVE_IMPORT.includes(job.status);
}

/** Import stages shown to the user: read the source, add details, find more online. */
export const IMPORT_STEP_COUNT = 3;

const IMPORT_STEPS: Partial<Record<Schema['ImportStatusEnum'], number>> = {
  QUEUED: 0,
  EXTRACTING: 0,
  AWAITING_SELECTION: 1,
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
    detail.undefinedFields.length > 0;

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
    if ('undefinedFieldId' in pin) {
      const field = detail.undefinedFields.find((f) => f.id === pin.undefinedFieldId);

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

export const attachmentBadges: Record<
  Schema['AttachmentDocumentTypeEnum'] | 'IMAGE' | 'FILE',
  { icon: string; tone: IconBadgeTone }
> = {
  MANUAL: { icon: 'attachmentManual', tone: 'info' },
  RECEIPT: { icon: 'attachmentReceipt', tone: 'neutral' },
  INVOICE: { icon: 'attachmentInvoice', tone: 'neutral' },
  INSTALLATION_GUIDE: { icon: 'attachmentGuide', tone: 'neutral' },
  SPECIFICATION: { icon: 'attachmentSpecification', tone: 'neutral' },
  OTHER: { icon: 'attachmentFile', tone: 'neutral' },
  IMAGE: { icon: 'attachmentImage', tone: 'neutral' },
  FILE: { icon: 'attachmentFile', tone: 'neutral' },
};

export function attachmentBadge(file: Schema['Attachment']) {
  return attachmentBadges[
    file.documentType ?? (file.mediaType.startsWith('image/') ? 'IMAGE' : 'FILE')
  ];
}

const formats: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'text/plain': 'Text',
};

/** Short file format name for an attachment's media type. */
export function attachmentFormat(mediaType: string): string {
  return formats[mediaType] ?? mediaType.split('/').pop()?.toUpperCase() ?? '';
}

export const taskBadges: Record<EventKind, { icon: string; tone: IconBadgeTone }> = {
  CLEANING: { icon: 'taskCleaning', tone: 'info' },
  INSPECTION: { icon: 'taskInspection', tone: 'neutral' },
  REPAIR: { icon: 'taskRepair', tone: 'neutral' },
  REPLACEMENT: { icon: 'taskReplacement', tone: 'neutral' },
  SERVICE: { icon: 'taskService', tone: 'neutral' },
  OTHER: { icon: 'taskOther', tone: 'neutral' },
};

export const issueBadges: Record<IssueKind, { icon: string; tone: IconBadgeTone }> = {
  RENEWAL: { icon: 'issueRenewal', tone: 'info' },
  WARRANTY: { icon: 'issueWarranty', tone: 'accent' },
  FAULT: { icon: 'issueFault', tone: 'warning' },
  OTHER: { icon: 'issueOther', tone: 'neutral' },
};
