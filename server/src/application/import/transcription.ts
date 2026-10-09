// Prepares uploaded Attachments independently of any Import that later cites them.
import type pg from 'pg';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { EnvConfig } from '../../config.js';
import type { ApplicationEvents } from '../events.js';
import type { ImportAi, SourceTranscription } from './types.js';
import * as database from '../../db/connection.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import { updateAttachmentMetadata } from '../attachments.js';
import { ensure } from '../errors.js';
import { pdfPageCount } from '../../lib/pdf.js';

export class AttachmentTranscriptionProcessor {
  constructor(
    private pool: pg.Pool,
    private blobs: BlobStorage,
    private ai: ImportAi | undefined,
    private config: EnvConfig,
    private events: ApplicationEvents,
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
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(this.config.importTimeoutMs)]);
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of await this.blobs.read(file.storageKey, signal)) {
        signal.throwIfAborted();
        chunks.push(Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks);
      const source = { ...file, content };
      const context = { signal, record: async () => {} };
      const result: SourceTranscription = this.ai.transcribe
        ? await this.ai.transcribe(source, context)
        : await this.ai.extract(source, [], context).then((extraction) => ({
            text: extraction.text,
            summary: extraction.summary ?? null,
            terms: extraction.terms ?? [],
            status: extraction.transcriptionStatus ?? 'EMPTY',
            metadata: extraction.metadata ?? null,
          }));
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
      const pageCount = file.pageCount ?? (await pdfPageCount(content, file.mediaType, signal));
      await database.transaction(this.pool, async (db) => {
        await attachmentsDb.saveTranscription(db, ownerId, file.id, {
          text: result.status === 'INSUFFICIENT_LANGUAGE' ? '' : result.text,
          summary: result.summary,
          terms: result.terms,
          status: result.status,
        });
        if (result.metadata || pageCount !== null)
          await updateAttachmentMetadata(
            db,
            ownerId,
            file.id,
            result.metadata ?? { title: null },
            { origin: 'IMPORT', sourceRefs: [{ attachmentId: file.id }] },
            pageCount,
          );
      });
    } catch {
      await attachmentsDb.setTranscriptionStatus(this.pool, ownerId, file.id, 'FAILED');
    }
    await database.execute(
      this.pool,
      `update bt.imports i set updated_at=now() from bt.import_sources s
       where s.import_id=i.id and s.attachment_id=$1 and i.owner_id=$2
         and i.status='WAITING_FOR_TRANSCRIPTION'`,
      [file.id, ownerId],
    );
    this.events.publish({ type: 'data.changed', ownerId });
    return true;
  }
}
