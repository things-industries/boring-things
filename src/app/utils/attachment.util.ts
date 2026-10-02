import type { Schema } from '../../../shared/model';
import type { IconBadgeTone } from '../interfaces/icon-badge.interface';

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
