// Prepares uploaded Attachments independently of any Import that later cites them.
import type pg from 'pg';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { EnvConfig } from '../../config.js';
import type { ApplicationEvents } from '../events.js';
import { blankUsage } from './types.js';
import type { ImportAi, SourceTranscription } from './types.js';
import * as database from '../../db/connection.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import { updateAttachmentMetadata, validateAttachmentMetadata } from '../attachments.js';
import { ensure } from '../errors.js';
import { pdfPageCount } from '../../lib/pdf.js';
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
    const usage = file.transcriptionUsage ?? blankUsage(this.config.openaiModel),
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
      const context = {
        maxTextCharacters: this.config.importMaxTextCharacters,
        signal,
        beforeRequest: () => ensure(requests++ < this.config.importMaxRequests, 'tool_limit'),
        record: async (delta: Partial<import('./types.js').Usage>) => {
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
      const text = file.mediaType.startsWith('image/')
        ? await this.readImageText(content, this.config.googleVisionApiKey, signal)
        : undefined;
      if (text !== undefined)
        await context.record({
          toolCalls: [
            { name: 'google_vision_ocr', resultCount: text.trim() ? 1 : 0, truncated: false },
          ],
        });
      const source =
        text === undefined
          ? { ...file, content }
          : { filename: file.filename, mediaType: 'text/plain', content: Buffer.from(text) };
      const result: SourceTranscription =
        text !== undefined && !text.trim()
          ? { text, summary: null, terms: [], status: 'EMPTY', identifiers: [], metadata: null }
          : await this.ai.transcribe(source, context);
      signal.throwIfAborted();
      ensure(
        typeof result.text === 'string' &&
          result.text.length <= 1_000_000 &&
          (result.summary === null || result.summary.length <= 2000) &&
          result.terms.length <= 20 &&
          result.terms.every((term) => term.length <= 200) &&
          ['COMPLETE', 'EMPTY', 'PARTIAL', 'INSUFFICIENT_LANGUAGE'].includes(result.status),
        'Invalid transcription',
      );
      if (file.mediaType === 'text/plain') result.text = content.toString('utf8');
      if (text !== undefined) result.text = text;
      ensure(
        (result.identifiers ?? []).length <= 30 &&
          (result.identifiers ?? []).every(
            (identifier) =>
              identifier.label.length <= 200 &&
              identifier.value.length <= 200 &&
              identifier.quote.length > 0 &&
              identifier.quote.length <= 2000 &&
              result.text.includes(identifier.quote),
          ),
        'Invalid identifier observations',
      );
      const pageCount = file.pageCount ?? (await pdfPageCount(content, file.mediaType, signal));
      await database.transaction(this.pool, async (db) => {
        await attachmentsDb.saveTranscription(db, ownerId, file.id, {
          text: result.status === 'INSUFFICIENT_LANGUAGE' ? '' : result.text,
          summary: result.summary,
          terms: result.terms,
          status: result.status,
          identifiers: result.identifiers ?? [],
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
