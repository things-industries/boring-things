/** Prepares source content for AI requests and converts model citations into application source references. */

import type { ResponseInputContent } from 'openai/resources/responses/responses';
import type { Source } from '../../application/import/types.js';
import type { SourceRef } from '../../../../shared/model.js';
import { pdfText } from '../../lib/pdf.js';
import {
  DocumentSizeError,
  maxDocumentBytes,
  maxDocumentTextLength,
  maxModelDocumentBytes,
  maxModelDocumentPages,
} from '../../lib/document-limits.js';

// Uses parsed text when available and bounds original file inputs.
export async function createSourceInput(
  source: Source,
  signal: AbortSignal,
  includeImages = false,
) {
  if (source.content.length > maxDocumentBytes)
    throw new DocumentSizeError(source.content.length, maxDocumentBytes);
  let text = source.text;
  let pageCount = source.pageCount;
  if (source.mediaType === 'application/pdf' && text === undefined && !includeImages)
    ({ text, pageCount } = await pdfText(source.content, signal));
  if (source.mediaType === 'text/plain') text = source.content.toString('utf8');
  let content: ResponseInputContent;
  if (text !== undefined && (text.trim() || source.mediaType === 'text/plain')) {
    if (text.length > maxDocumentTextLength)
      throw new DocumentSizeError(text.length, maxDocumentTextLength);
    content = { type: 'input_text', text };
  } else {
    if (source.content.length > maxModelDocumentBytes)
      throw new DocumentSizeError(source.content.length, maxModelDocumentBytes);
    if (
      source.mediaType === 'application/pdf' &&
      pageCount != null &&
      pageCount > maxModelDocumentPages
    )
      throw new DocumentSizeError(pageCount, maxModelDocumentPages);
    const data = `data:${source.mediaType};base64,${source.content.toString('base64')}`;
    content = source.mediaType.startsWith('image/')
      ? { type: 'input_image', image_url: data, detail: 'auto' }
      : { type: 'input_file', filename: source.filename, file_data: data };
    text = undefined;
  }
  return { content, text };
}

// Removes nullable page placeholders from model citations.
export function createSourceRef(source: {
  attachmentId: string;
  page: number | null;
  quote: string;
}): SourceRef {
  return {
    attachmentId: source.attachmentId,
    ...(source.page === null ? {} : { page: source.page }),
    quote: source.quote,
  };
}
