// Prepares uploaded Attachments independently of any Import that later cites them.

import type pg from 'pg';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { EnvConfig } from '../../config.js';
import type { ApplicationEvents } from '../events.js';
import { blankUsage } from './types.js';
import { normalizeWhitespace } from './evidence.js';
import type { ImportAi, AttachmentSummary } from './types.js';
import * as database from '../../db/connection.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import { updateAttachmentMetadata, validateAttachmentMetadata } from '../attachments.js';
import { ensure } from '../errors.js';
import { pdfText } from '../../lib/pdf.js';
import { maxDocumentBytes, maxDocumentTextLength } from '../../lib/document-limits.js';
import * as googleVision from '../../providers/google-vision/index.js';

export class AttachmentTranscriptionProcessor {
  constructor(
    private pool: pg.Pool,
    private blobs: BlobStorage,
    private ai: ImportAi | undefined,
    private config: EnvConfig,
    private events: ApplicationEvents,
    private readImageText = googleVision.readImageText,
  ) {}

  async recover() {
    await attachmentsDb.recoverTranscriptions(this.pool);
  }

  async next(shutdown: AbortSignal): Promise<boolean> {
    if (!this.ai) return false;
    const claimed = await database.transaction(this.pool, (db) =>
      attachmentsDb.claimPendingTranscription(db),
    );
    if (!claimed) return false;
    const { file, ownerId } = claimed;
    if (ownerId === null && file.mediaType.startsWith('image/')) {
      await attachmentsDb.setTranscriptionStatus(this.pool, ownerId, file.id, 'SKIPPED');
      return true;
    }
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(this.config.importTimeoutMs)]);
    const usage = file.transcriptionUsage ?? blankUsage(),
      started = Date.now();
    const elapsed = usage.elapsedMs;
    let requests = usage.entries?.length ?? 0;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of await this.blobs.read(file.storageKey, signal)) {
        signal.throwIfAborted();
        chunks.push(Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks);
      ensure(content.length <= maxDocumentBytes, 'Attachment too large', 'TOO_LARGE');
      const context = {
        maxTextCharacters: this.config.importMaxTextCharacters,
        signal,
        beforeRequest: () => ensure(requests++ < this.config.importMaxRequests, 'tool_limit'),
        record: async (delta: Partial<import('./types.js').Usage>) => {
          if (!usage.model) usage.model = delta.model ?? usage.model;
          usage.inputTokens += delta.inputTokens ?? 0;
          usage.outputTokens += delta.outputTokens ?? 0;
          usage.cachedTokens += delta.cachedTokens ?? 0;
          usage.toolCalls.push(...(delta.toolCalls ?? []));
          if (delta.entries?.length) (usage.entries ??= []).push(...delta.entries);
          usage.elapsedMs = elapsed + Date.now() - started;
          await database.execute(
            this.pool,
            'update bt.attachments set transcription_usage=$1 where id=$2',
            [JSON.stringify(usage), file.id],
          );
        },
      };
      const readImageText = async (bytes: Buffer) => {
        const text = await this.readImageText(bytes, this.config.googleVisionApiKey, signal);
        await context.record({
          toolCalls: [
            { name: 'google_vision_ocr', resultCount: text.trim() ? 1 : 0, truncated: false },
          ],
        });
        return text;
      };

      // Complete text extraction before asking the model for source analysis.
      let text: string;
      let pageCount = file.pageCount;
      if (file.mediaType === 'application/pdf')
        ({ text, pageCount } = await pdfText(content, signal, readImageText));
      else if (file.mediaType.startsWith('image/')) text = await readImageText(content);
      else {
        ensure(file.mediaType === 'text/plain', 'Unsupported attachment type');
        text = content.toString('utf8');
      }
      ensure(text.length <= maxDocumentTextLength, 'Attachment text too large', 'TOO_LARGE');
      const result: AttachmentSummary = !text.trim()
        ? { summary: null, terms: [], status: 'EMPTY', identifiers: [], metadata: null }
        : await this.ai.summarizeAttachment(text, context);
      signal.throwIfAborted();
      ensure(
        (result.summary === null || result.summary.length <= 2000) &&
          result.terms.length <= 20 &&
          result.terms.every((term) => term.length <= 200) &&
          ['COMPLETE', 'EMPTY', 'PARTIAL', 'INSUFFICIENT_LANGUAGE'].includes(result.status),
        'Invalid transcription',
      );
      const normalizedText = normalizeWhitespace(text);
      const identifiers = (result.identifiers ?? [])
        .map((identifier) => ({
          ...identifier,
          label: normalizeWhitespace(identifier.label),
          value: normalizeWhitespace(identifier.value),
          quote: normalizeWhitespace(identifier.quote),
        }))
        .filter(
          (identifier) =>
            identifier.label.length <= 200 &&
            identifier.value.length <= 200 &&
            identifier.quote.length > 0 &&
            identifier.quote.length <= 2000 &&
            normalizedText.includes(identifier.quote),
        )
        .slice(0, 30);
      await database.transaction(this.pool, async (db) => {
        await attachmentsDb.saveTranscription(db, ownerId, file.id, {
          text: result.status === 'INSUFFICIENT_LANGUAGE' ? '' : text,
          summary: result.summary,
          terms: result.terms,
          status: result.status,
          identifiers,
        });
        if (ownerId !== null && (result.metadata || pageCount !== null))
          await updateAttachmentMetadata(
            db,
            ownerId,
            file.id,
            result.metadata ?? { title: null },
            { origin: 'IMPORT', sourceRefs: [{ attachmentId: file.id }] },
            pageCount,
          );
        if (ownerId === null) {
          if (result.metadata) {
            const metadata = validateAttachmentMetadata(result.metadata);
            for (const key of ['title', 'documentType', 'publisher', 'documentDate'] as const)
              if (metadata[key] != null) {
                Object.assign(file, { [key]: metadata[key] });
                file.metadataSources[key] = {
                  origin: 'IMPORT',
                  sourceRefs: [{ attachmentId: file.id }],
                };
              }
          }
          file.pageCount = pageCount;
          await attachmentsDb.saveAttachmentMetadata(db, null, file);
        }
      });
    } catch {
      await attachmentsDb.setTranscriptionStatus(this.pool, ownerId, file.id, 'FAILED');
    }
    await database.execute(
      this.pool,
      `update bt.imports i set updated_at=now() from bt.import_sources s
       where s.import_id=i.id and s.attachment_id=$1
         and i.status='WAITING_FOR_TRANSCRIPTION'`,
      [file.id],
    );
    for (const recipient of await attachmentsDb.affectedOwners(this.pool, file))
      this.events.publish({ type: 'data.changed', ownerId: recipient });
    return true;
  }
}
