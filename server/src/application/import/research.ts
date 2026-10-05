import { downloadImage } from '../../providers/web/image.js';
import type pg from 'pg';
import type { ThingData } from '../../../../shared/model.js';
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
import * as discoveryDb from '../../db/entities/discovery.js';
import * as importsDb from '../../db/entities/imports.js';
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
import { ApplicationError, ensure } from '../errors.js';
import { validateAttachmentMetadata } from '../attachments.js';
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

export async function persistResearch<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) ||
      (error instanceof ApplicationError && error.kind === 'INVALID_INPUT')
    )
      throw error;
    throw new ResearchPersistenceError(error);
  }
}

function researchWarning(
  code: DiscoveryWarning['code'],
  sourceUrl: string | null,
  error?: unknown,
): DiscoveryWarning {
  const size = error instanceof DocumentSizeError ? error : null;
  return {
    code,
    sourceUrl,
    retryable: !size,
    actual: size?.actual ?? null,
    limit: size?.limit ?? null,
  };
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
  private found: Discovery = { items: [], sources: [], warnings: [], documentBatches: [] };
  private initialFields: EmptyResearchField[] = [];
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
    this.found = structuredClone(destination.discovery ?? this.found);
    this.maxBytes = Math.min(options.maxBytes, maxDocumentBytes);
    this.shutdown = context.signal;
    this.context = {
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(options.timeoutMs ?? 90000)]),
      record: (usage) => persistResearch(() => context.record(usage)),
    };
  }

  async run() {
    try {
      const research = await this.readThing();
      if (research) {
        this.initialFields = research.emptyFields;
        await this.search(research);
        for (const item of [
          ...new Map(
            this.found.items
              .filter((item) => item.kind === 'reference')
              .map((item) => [item.url, item]),
          ).values(),
        ].slice(0, 3))
          await this.enrichDocument(item);
        await this.attachImage();
        await this.recordOutcomes();
      }
    } catch (error) {
      if (this.shutdown.aborted || isResearchPersistenceError(error)) throw error;
      this.warn(researchWarning(this.context.signal.aborted ? 'TIMEOUT' : 'RESEARCH_FAILED', null));
      await this.save();
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
    await persistResearch(() =>
      importsDb.saveTargetDiscovery(this.pool, this.job, this.destination.candidateId, this.found),
    );
    this.publish();
  }
  private warn(warning: DiscoveryWarning) {
    this.found.warnings ??= [];
    if (
      !this.found.warnings.some(
        (old) => old.code === warning.code && old.sourceUrl === warning.sourceUrl,
      )
    )
      this.found.warnings.push(warning);
  }
  private async readThing() {
    const thing = await persistResearch(() =>
      thingsDb.getOwnedThingOrThrow(this.pool, this.job.ownerId, this.destination.thingId),
    );
    return buildResearchThing(
      { id: this.destination.candidateId, categoryId: thing.categoryId },
      thing.data,
      this.registry,
    );
  }

  private async search(research: ResearchThing) {
    const saved = this.destination.discovery;
    const fresh =
      saved && !saved.warnings?.length
        ? saved
        : await awaitWithSignal(
            this.ai.findResources(
              {
                ...research,
                documentLimits: {
                  maxBytes: this.maxBytes,
                  maxTextCharacters: maxDocumentTextLength,
                },
                rejectedDocuments: saved?.warnings,
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
    this.found = {
      ...fresh,
      warnings: [],
      documentBatches: saved?.documentBatches ?? [],
      outcomes: saved?.outcomes,
      items: [
        ...fresh.items,
        ...(saved?.items ?? []).filter(
          (item) =>
            !fresh.items.some((other) => other.kind === item.kind && other.url === item.url),
        ),
      ]
        .filter((item) => ['reference', 'image'].includes(item.kind))
        .slice(0, 8),
      sources: [...new Set([...fresh.sources, ...(saved?.sources ?? [])])],
      researchRounds: 1,
    };
    await this.save();
    if (this.found.identity)
      await persistResearch(() =>
        refineImportedName(this.pool, this.job, this.destination, this.found, this.context.signal),
      );
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
      this.warn(rejection);
      await this.save();
      return;
    }
    let extracting = false;
    try {
      context.signal.throwIfAborted();
      validateResource(item, this.found.sources);
      item = {
        ...item,
        metadata: validateAttachmentMetadata({ title: item.title, ...item.metadata }),
      };
      const key = resourceKey(job.id, destination.candidateId, item);
      let file = await persistResearch(() =>
        discoveryDb.findDiscoveryAttachment(pool, job.ownerId, key),
      );
      const research = await this.readThing();
      if (!research) return;
      const fields = research.emptyFields.filter(
        (field) =>
          !this.found.documentBatches!.some(
            (batch) =>
              batch.attachmentId === file?.id &&
              batch.targetKeys.includes(researchTargetKey(field)) &&
              batch.firstPage === undefined,
          ),
      );
      if (file && !fields.length) return;
      let content: Buffer;
      if (file) {
        const attachment = await persistResearch(() =>
          attachmentsDb.getOwnedAttachmentOrThrow(pool, job.ownerId, file!.id),
        );
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
        if (!downloaded) {
          this.warn(researchWarning('UNAVAILABLE', item.url));
          await this.save();
          return;
        }
        if (downloaded.length > this.maxBytes)
          throw new DocumentSizeError(downloaded.length, this.maxBytes);
        content = downloaded;
      }
      extracting = true;
      const { text, pageCount } = await pdfText(content, context.signal);
      const document: ReferenceDocument = {
        attachmentId: file?.id ?? '',
        url: item.url,
        filename: 'reference.pdf',
        mediaType: 'application/pdf',
        content,
        text,
        pageCount,
        sourceContext: { url: item.sourceUrl, description: item.description },
      };
      for (let offset = 0; offset < Math.max(1, Math.min(fields.length, 100)); offset += 20) {
        const emptyFields = fields.slice(offset, offset + 20);
        const result = await awaitWithSignal(
          this.ai.extractDocument(document, research, emptyFields, context),
          context.signal,
        );
        validateDocumentExtraction(result, document, emptyFields, registry);
        if (!result.applicable) return;
        if (!file) {
          file = await persistResearch(() =>
            saveResourceAttachment(
              pool,
              blobs,
              job.ownerId,
              destination.thingId,
              key,
              item,
              { content, mediaType: 'application/pdf', pageCount },
              context.signal,
            ),
          );
          ensure(file, 'Reference document unavailable');
          document.attachmentId = file.id;
        }
        const completed = {
          ...this.found,
          documentBatches: [
            ...this.found.documentBatches!,
            { attachmentId: file.id, targetKeys: emptyFields.map(researchTargetKey) },
          ],
        };
        await persistResearch(() =>
          database.transaction(pool, async (db) => {
            context.signal.throwIfAborted();
            const thing = await thingsDb.getOwnedThingOrThrow(
              db,
              job.ownerId,
              destination.thingId,
              { lock: true },
            );
            await thingsDb.saveThingData(
              db,
              job.ownerId,
              thing.id,
              applyDocumentValues(
                thing.data,
                result,
                { ...research, emptyFields },
                registry,
                document,
              ),
            );
            await importsDb.saveTargetDiscovery(db, job, destination.candidateId, completed);
          }),
        );
        this.found = completed;
        this.publish();
      }
    } catch (error) {
      if (isResearchPersistenceError(error)) throw error;
      const code = context.signal.aborted
        ? 'TIMEOUT'
        : error instanceof DocumentSizeError
          ? extracting
            ? 'MODEL_INPUT_LIMIT'
            : 'SIZE_LIMIT'
          : extracting
            ? 'EXTRACTION_FAILED'
            : 'UNAVAILABLE';
      this.warn(researchWarning(code, item.url, error));
      await this.save();
      context.signal.throwIfAborted();
    }
  }

  private async attachImage() {
    const image = this.found.items.find((item) => item.kind === 'image');
    if (!image) return;
    try {
      const thing = await persistResearch(() =>
        thingsDb.getOwnedThingOrThrow(this.pool, this.job.ownerId, this.destination.thingId),
      );
      if (thing.imageAttachmentId || thing.data.userEdited?.includes('imageAttachmentId')) return;
      validateResource(image, this.found.sources);
      const file = await (this.options.downloadImage ?? downloadImage)(image.url, {
        maxBytes: this.maxBytes,
        signal: this.context.signal,
      });
      if (!file) throw new Error('Image unavailable');
      const item = { ...image, metadata: validateAttachmentMetadata({ title: image.title }) };
      await persistResearch(() =>
        saveResourceAttachment(
          this.pool,
          this.blobs,
          this.job.ownerId,
          this.destination.thingId,
          resourceKey(this.job.id, this.destination.candidateId, image),
          item,
          file,
          this.context.signal,
        ),
      );
      this.publish();
    } catch (error) {
      if (isResearchPersistenceError(error)) throw error;
      this.warn(
        researchWarning(this.context.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE', image.url, error),
      );
      await this.save();
      this.context.signal.throwIfAborted();
    }
  }

  private async recordOutcomes() {
    const data = (
      await persistResearch(() =>
        thingsDb.getOwnedThingOrThrow(this.pool, this.job.ownerId, this.destination.thingId),
      )
    ).data;
    const considered = new Map(
      [
        ...this.initialFields,
        ...(this.found.outcomes ?? []).filter(
          (field) => field.fieldId !== null && field.outcome === 'found',
        ),
      ].map((field) => [`${field.fieldSetId ?? ''}:${field.fieldId}`, field]),
    );
    const unavailable = this.found.warnings!.some(
      (warning) => !['SIZE_LIMIT', 'MODEL_INPUT_LIMIT', 'PAGE_BUDGET'].includes(warning.code),
    )
      ? ('retrieval_failed' as const)
      : ('budget_exhausted' as const);
    this.found.outcomes = [
      {
        fieldSetId: null,
        fieldId: null,
        outcome: this.found.documentBatches?.length ? 'found' : unavailable,
      },
      ...[...considered.values()].map((field) => ({
        fieldSetId: field.fieldSetId,
        fieldId: field.fieldId,
        outcome:
          (field.fieldSetId === null
            ? data.standalone[field.fieldId!]
            : data.values[field.fieldSetId]?.[field.fieldId!]
          )?.origin === 'DISCOVERY'
            ? ('found' as const)
            : unavailable,
      })),
    ];
    await this.save();
  }
}

export function isResearchPersistenceError(error: unknown) {
  const code = (error as { code?: string })?.code;
  return (
    error instanceof ResearchPersistenceError ||
    (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) ||
    (error instanceof ApplicationError && ['NOT_FOUND', 'CONFLICT'].includes(error.kind)) ||
    (error instanceof Error && error.message === 'Invalid reference')
  );
}
