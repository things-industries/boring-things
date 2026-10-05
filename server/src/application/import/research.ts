// Validates and persists applicable research documents, metadata and cited field enrichment.
import { downloadImage } from '../../providers/web/image.js';
import type pg from 'pg';
import type { Schema, ThingData } from '../../../../shared/model.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Registry } from '../registry/registry.js';
import type { ApplicationEvents } from '../events.js';
import type {
  AiContext,
  Discovery,
  DiscoveryWarning,
  DocumentExtraction,
  ImportAi,
  ReferenceDocument,
  ResearchThing,
  EmptyResearchField,
} from './types.js';
import type { ImportRow, ImportDestination } from '../../db/entities/imports.js';
import type { DocumentDownload } from '../../providers/web/pdf.js';
import * as database from '../../db/connection.js';
import * as thingsDb from '../../db/entities/things.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import * as importsDb from '../../db/entities/imports.js';
import { publicUrl } from '../../providers/web/resources.js';
import { downloadPdf } from '../../providers/web/pdf.js';
import { pdfText } from '../../lib/pdf.js';
import {
  DocumentSizeError,
  maxDocumentBytes,
  maxModelDocumentBytes,
  maxModelDocumentPages,
  maxDocumentTextLength,
} from '../../lib/document-limits.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { ensure } from '../errors.js';
import { updateAttachmentMetadata, validateAttachmentMetadata } from '../attachments.js';
import { buildResearchThing } from './mapping.js';
import {
  resourceKey,
  refineImportedName,
  saveResourceAttachment,
  validateResource,
} from './resources.js';

export class ResearchPersistenceError extends Error {
  constructor(cause: unknown) {
    super('Research persistence failed', { cause });
  }
}

export const researchTargetKey = (target: Pick<EmptyResearchField, 'fieldSetId' | 'fieldId'>) =>
  `${target.fieldSetId ?? ''}:${target.fieldId}`;

export function validateDocumentExtraction(
  result: DocumentExtraction,
  document: Pick<ReferenceDocument, 'pageCount'>,
  targets: EmptyResearchField[],
  registry: Registry,
) {
  const evidence = (entry: { page: number; quote: string } | null) =>
    entry &&
    Number.isInteger(entry.page) &&
    entry.page > 0 &&
    entry.page <= document.pageCount &&
    typeof entry.quote === 'string' &&
    entry.quote.trim().length > 0 &&
    entry.quote.length <= 2000;
  ensure(
    typeof result.applicable === 'boolean' &&
      Array.isArray(result.values) &&
      result.values.length <= 20,
    'Invalid document extraction',
  );
  if (!result.applicable) {
    ensure(
      result.applicability === null && result.values.length === 0,
      'Inapplicable document supplied values',
    );
    return;
  }
  ensure(evidence(result.applicability), 'Missing document applicability evidence');
  const seen = new Set<string>();
  for (const entry of result.values) {
    const key = researchTargetKey(entry);
    ensure(
      targets.some((target) => researchTargetKey(target) === key) && !seen.has(key),
      'Unrequested or duplicate enrichment field',
    );
    ensure(evidence(entry), 'Invalid document field evidence');
    registry.validate(entry.fieldId, entry.value);
    seen.add(key);
  }
}

export function applyDocumentValues(
  original: ThingData,
  result: DocumentExtraction,
  research: ResearchThing,
  registry: Registry,
  document: Pick<ReferenceDocument, 'attachmentId' | 'url' | 'pageCount'>,
): ThingData {
  validateDocumentExtraction(result, document, research.emptyFields, registry);
  const data = structuredClone(original);
  if (!result.applicable) return data;
  const current = buildResearchThing(research, data, registry);
  for (const entry of result.values) {
    const key = researchTargetKey(entry);
    if (!current?.emptyFields.some((target) => researchTargetKey(target) === key)) continue;
    const target =
      entry.fieldSetId === null ? data.standalone : (data.values[entry.fieldSetId] ??= {});
    if (target[entry.fieldId] || data.userEdited?.includes(key)) continue;
    target[entry.fieldId] = {
      value: entry.value,
      origin: 'DISCOVERY',
      sourceRefs: [
        {
          attachmentId: document.attachmentId,
          url: document.url,
          page: entry.page,
          quote: entry.quote,
        },
      ],
    };
  }
  return data;
}

export interface ImportResearchOptions {
  maxBytes: number;
  searchCalls: number;
  download?: DocumentDownload;
  downloadImage?: typeof downloadImage;
  timeoutMs?: number;
}

export async function researchThing(...args: ConstructorParameters<typeof ResearchSession>) {
  await new ResearchSession(...args).run();
}

class ResearchSession {
  private found: Discovery & Required<Pick<Discovery, 'warnings' | 'documentBatches'>>;
  private maxBytes: number;
  private shutdown: AbortSignal;

  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ImportAi,
    private events: ApplicationEvents,
    private job: ImportRow,
    private destination: ImportDestination,
    private context: AiContext,
    private options: ImportResearchOptions,
  ) {
    const saved = destination.discovery;
    this.found = structuredClone({
      items: saved?.items ?? [],
      sources: saved?.sources ?? [],
      identity: saved?.identity,
      rejectedDocumentUrls: saved?.rejectedDocumentUrls ?? [],
      warnings: (saved?.warnings ?? []).filter((warning) => warning.code !== 'PAGE_BUDGET'),
      // Page-range checkpoints do not establish completion for the full document.
      documentBatches: (saved?.documentBatches ?? []).filter((batch) => !('firstPage' in batch)),
    });
    this.maxBytes = Math.min(options.maxBytes, maxDocumentBytes);
    this.shutdown = context.signal;
    this.context = {
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(options.timeoutMs ?? 90000)]),
      record: async (usage) => {
        try {
          await context.record(usage);
        } catch (error) {
          throw new ResearchPersistenceError(error);
        }
      },
    };
  }

  async run() {
    try {
      const research = await this.readThing();
      if (research && (await this.search(research))) {
        const references = [
          ...new Map(
            this.found.items
              .filter((item) => item.kind === 'reference')
              .map((item) => [item.url, item]),
          ).values(),
        ];
        const savedUrls = new Set<string>();
        for (const item of references) {
          if (
            await attachmentsDb.findDiscoveryAttachment(
              this.pool,
              this.job.ownerId,
              resourceKey(this.job.id, this.destination.candidateId, item),
            )
          )
            savedUrls.add(item.url);
        }
        let accepted = savedUrls.size;
        for (const item of references) {
          if (this.context.signal.aborted) break;
          if (this.found.rejectedDocumentUrls?.includes(item.url)) continue;
          if (!savedUrls.has(item.url) && accepted >= 3) continue;
          if ((await this.enrichDocument(item)) && !savedUrls.has(item.url)) accepted++;
        }
        if (!this.context.signal.aborted) await this.attachImage();
      }
    } catch (error) {
      if (this.shutdown.aborted || error !== this.context.signal.reason) throw error;
      await this.warn('TIMEOUT', null, error);
    }
    await importsDb.markTargetStage(
      this.pool,
      this.job,
      this.destination.candidateId,
      'discovered',
    );
    this.publish();
  }

  private publish() {
    this.events.publish({ type: 'data.changed', ownerId: this.job.ownerId });
  }

  private async save() {
    await importsDb.saveTargetDiscovery(
      this.pool,
      this.job,
      this.destination.candidateId,
      this.found,
    );
    this.publish();
  }

  private async warn(code: DiscoveryWarning['code'], sourceUrl: string | null, error?: unknown) {
    if (this.shutdown.aborted || error instanceof ResearchPersistenceError)
      throw error ?? this.shutdown.reason;
    const size = error instanceof DocumentSizeError ? error : null;
    if (this.context.signal.aborted) code = 'TIMEOUT';
    if (!this.found.warnings.some((old) => old.code === code && old.sourceUrl === sourceUrl))
      this.found.warnings.push({
        code,
        sourceUrl,
        retryable: !size,
        actual: size?.actual ?? null,
        limit: size?.limit ?? null,
      });
    await this.save();
  }

  private async readThing() {
    const thing = await thingsDb.getOwnedThingOrThrow(
      this.pool,
      this.job.ownerId,
      this.destination.thingId,
    );
    return buildResearchThing(
      { id: this.destination.candidateId, categoryId: thing.categoryId },
      thing.data,
      this.registry,
    );
  }

  private async search(research: ResearchThing) {
    const saved = this.found;
    let fresh: Discovery;
    try {
      fresh =
        this.destination.discovery && !saved.warnings.length
          ? saved
          : await awaitWithSignal(
              this.ai.findResources(
                {
                  ...research,
                  documentLimits: {
                    maxBytes: this.maxBytes,
                    maxTextCharacters: maxDocumentTextLength,
                  },
                  rejectedDocuments: saved.warnings,
                  rejectedDocumentUrls: saved.rejectedDocumentUrls,
                },
                this.context,
                this.options.searchCalls,
              ),
              this.context.signal,
            );
      ensure(
        Array.isArray(fresh.items) && fresh.items.length <= 8 && Array.isArray(fresh.sources),
        'Invalid discovery',
      );
      if (fresh.identity) {
        const { name, sourceUrl } = fresh.identity;
        ensure(
          typeof name === 'string' &&
            name.trim().length > 0 &&
            name.length <= 200 &&
            publicUrl(sourceUrl) &&
            fresh.sources.includes(sourceUrl),
          'Uncited identity',
        );
      }
    } catch (error) {
      await this.warn('RESEARCH_FAILED', null, error);
      return false;
    }
    this.found = {
      identity: fresh.identity,
      warnings: [],
      documentBatches: saved.documentBatches,
      rejectedDocumentUrls: saved.rejectedDocumentUrls,
      items: [
        ...fresh.items,
        ...saved.items.filter(
          (item) =>
            !fresh.items.some((other) => other.kind === item.kind && other.url === item.url),
        ),
      ]
        .filter((item) => ['reference', 'image'].includes(item.kind))
        .slice(0, 8),
      sources: [...new Set([...fresh.sources, ...saved.sources])],
    };
    await this.save();
    await refineImportedName(
      this.pool,
      this.job,
      this.destination,
      this.found,
      this.context.signal,
    );
    return true;
  }

  private async enrichDocument(item: Discovery['items'][number]) {
    const { pool, job, destination, context, registry, blobs } = this;
    const limits = [maxModelDocumentBytes, maxModelDocumentPages, maxDocumentTextLength];
    const rejection = destination.discovery?.warnings?.find(
      (warning) =>
        warning.sourceUrl === item.url &&
        ((warning.code === 'SIZE_LIMIT' && warning.limit === this.maxBytes) ||
          (warning.code === 'MODEL_INPUT_LIMIT' && limits.includes(warning.limit!))),
    );
    if (rejection) {
      this.found.warnings.push(rejection);
      await this.save();
      return false;
    }
    try {
      validateResource(item, this.found.sources);
      item = {
        ...item,
        metadata: validateAttachmentMetadata({
          ...item.metadata,
          title: item.metadata?.title ?? item.title,
        }),
      };
    } catch (error) {
      await this.warn('UNAVAILABLE', item.url, error);
      return false;
    }
    const key = resourceKey(job.id, destination.candidateId, item);
    let file = await attachmentsDb.findDiscoveryAttachment(pool, job.ownerId, key);
    const research = await this.readThing();
    if (!research) return false;
    const fields = research.emptyFields.filter(
      (field) =>
        !this.found.documentBatches.some(
          (batch) =>
            batch.attachmentId === file?.id && batch.targetKeys.includes(researchTargetKey(field)),
        ),
    );
    if (file && !fields.length) return true;
    const attachment = file
      ? await attachmentsDb.getOwnedAttachmentOrThrow(pool, job.ownerId, file.id)
      : null;
    let content: Buffer;
    try {
      context.signal.throwIfAborted();
      if (attachment) {
        if (attachment.byteSize > this.maxBytes)
          throw new DocumentSizeError(attachment.byteSize, this.maxBytes);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of await blobs.read(attachment.storageKey, context.signal)) {
          context.signal.throwIfAborted();
          size += chunk.length;
          if (size > this.maxBytes) throw new DocumentSizeError(size, this.maxBytes);
          chunks.push(Buffer.from(chunk));
        }
        content = Buffer.concat(chunks);
      } else {
        const downloaded = await (this.options.download ?? downloadPdf)(item.url, {
          maxBytes: this.maxBytes,
          signal: context.signal,
        });
        ensure(downloaded, 'Reference document unavailable');
        if (downloaded.length > this.maxBytes)
          throw new DocumentSizeError(downloaded.length, this.maxBytes);
        content = downloaded;
      }
    } catch (error) {
      await this.warn(
        error instanceof DocumentSizeError ? 'SIZE_LIMIT' : 'UNAVAILABLE',
        item.url,
        error,
      );
      return false;
    }
    let document: ReferenceDocument | undefined;
    for (let offset = 0; offset < Math.max(1, Math.min(fields.length, 100)); offset += 20) {
      const emptyFields = fields.slice(offset, offset + 20);
      let result: DocumentExtraction;
      try {
        document ??= {
          attachmentId: file?.id ?? '',
          url: item.url,
          filename: 'reference.pdf',
          mediaType: 'application/pdf',
          content,
          ...(await pdfText(content, context.signal)),
          sourceContext: { url: item.sourceUrl, description: item.description },
        };
        result = await awaitWithSignal(
          this.ai.extractDocument(document, research, emptyFields, context),
          context.signal,
        );
        validateDocumentExtraction(result, document, emptyFields, registry);
        if (result.metadata) result.metadata = validateAttachmentMetadata(result.metadata);
      } catch (error) {
        await this.warn(
          error instanceof DocumentSizeError ? 'MODEL_INPUT_LIMIT' : 'EXTRACTION_FAILED',
          item.url,
          error,
        );
        return !!file;
      }
      if (!result.applicable) {
        this.found.rejectedDocumentUrls = [
          ...new Set([...(this.found.rejectedDocumentUrls ?? []), item.url]),
        ];
        await this.save();
        return false;
      }
      const metadata = { ...item.metadata };
      const metadataSources: Schema['AttachmentMetadataSources'] = {};
      for (const key of ['title', 'documentType', 'publisher', 'documentDate'] as const) {
        const contentValue = result.metadata?.[key];
        if (contentValue != null) Object.assign(metadata, { [key]: contentValue });
        if (metadata[key] != null)
          metadataSources[key] = {
            origin: 'DISCOVERY',
            sourceRefs: [{ url: contentValue != null ? item.url : item.sourceUrl }],
          };
      }
      if (!file) {
        file = await saveResourceAttachment(
          pool,
          blobs,
          job.ownerId,
          destination.thingId,
          key,
          { ...item, title: metadata.title ?? item.title, metadata },
          { content, mediaType: 'application/pdf', pageCount: document.pageCount, metadataSources },
          context.signal,
        );
        ensure(file, 'Reference document unavailable');
        document.attachmentId = file.id;
      }
      const completed = {
        ...this.found,
        documentBatches: [
          ...this.found.documentBatches,
          { attachmentId: file.id, targetKeys: emptyFields.map(researchTargetKey) },
        ],
      };
      await database.transaction(pool, async (db) => {
        context.signal.throwIfAborted();
        if (result.metadata)
          await updateAttachmentMetadata(
            db,
            job.ownerId,
            file!.id,
            result.metadata,
            { origin: 'DISCOVERY', sourceRefs: [{ url: item.url }] },
            undefined,
            { replaceAutomated: true },
          );
        const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, destination.thingId, {
          lock: true,
        });
        await thingsDb.saveThingData(
          db,
          job.ownerId,
          thing.id,
          applyDocumentValues(
            thing.data,
            result,
            { ...research, emptyFields },
            registry,
            document!,
          ),
        );
        await importsDb.saveTargetDiscovery(db, job, destination.candidateId, completed);
      });
      this.found = completed;
      this.publish();
    }
    return true;
  }

  private async attachImage() {
    const image = this.found.items.find((item) => item.kind === 'image');
    if (!image) return;
    const thing = await thingsDb.getOwnedThingOrThrow(
      this.pool,
      this.job.ownerId,
      this.destination.thingId,
    );
    if (thing.imageAttachmentId || thing.data.userEdited?.includes('imageAttachmentId')) return;
    let file: NonNullable<Awaited<ReturnType<typeof downloadImage>>>;
    let item: Discovery['items'][number];
    try {
      validateResource(image, this.found.sources);
      const downloaded = await (this.options.downloadImage ?? downloadImage)(image.url, {
        maxBytes: this.maxBytes,
        signal: this.context.signal,
      });
      ensure(downloaded, 'Image unavailable');
      file = downloaded;
      item = { ...image, metadata: validateAttachmentMetadata({ title: image.title }) };
    } catch (error) {
      await this.warn('UNAVAILABLE', image.url, error);
      return;
    }
    await saveResourceAttachment(
      this.pool,
      this.blobs,
      this.job.ownerId,
      this.destination.thingId,
      resourceKey(this.job.id, this.destination.candidateId, image),
      item,
      file,
      this.context.signal,
    );
    this.publish();
  }
}
