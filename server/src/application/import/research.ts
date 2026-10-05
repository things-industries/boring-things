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
  ResearchContext,
  ResearchTarget,
} from './types.js';
import type { ImportRow, Target } from '../../db/entities/imports.js';
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
import { buildResearchContext } from './mapping.js';
import { discoveryItemKey, persistDiscovery, publicUrl } from '../discovery/discovery.js';

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

export const researchTargetKey = (target: Pick<ResearchTarget, 'fieldSetId' | 'fieldId'>) =>
  `${target.fieldSetId ?? ''}:${target.fieldId}`;

export function validateDocumentExtraction(
  result: DocumentExtraction,
  document: Pick<ReferenceDocument, 'pageCount'>,
  targets: ResearchTarget[],
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
  research: ResearchContext,
  registry: Registry,
  document: Pick<ReferenceDocument, 'attachmentId' | 'url' | 'pageCount'>,
): ThingData {
  validateDocumentExtraction(result, document, research.targets, registry);
  const data = structuredClone(original);
  if (!result.applicable) return data;
  const current = buildResearchContext(research, data, registry);
  for (const entry of result.values) {
    const key = researchTargetKey(entry);
    if (!current?.targets.some((target) => researchTargetKey(target) === key)) continue;
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
}

export async function researchImportTarget(
  pool: pg.Pool,
  registry: Registry,
  blobs: BlobStorage,
  ai: ImportAi,
  events: ApplicationEvents,
  job: ImportRow,
  target: Target,
  context: AiContext,
  options: ImportResearchOptions,
) {
  const maxBytes = Math.min(options.maxBytes, maxDocumentBytes);
  const subject = {
    id: target.candidateId,
    categoryId: (
      await persistResearch(() => thingsDb.getOwnedThingOrThrow(pool, job.ownerId, target.thingId))
    ).categoryId,
  };
  const readContext = async () =>
    buildResearchContext(
      subject,
      (
        await persistResearch(() =>
          thingsDb.getOwnedThingOrThrow(pool, job.ownerId, target.thingId),
        )
      ).data,
      registry,
    );
  let research = await readContext();
  if (!research) return;
  const initialTargets = research.targets;
  const firstBudget = Math.ceil(options.searchCalls / 2);
  const saved = target.discovery;
  const reuse =
    saved &&
    !(
      saved.items.length === 0 &&
      saved.warnings?.some((warning) => warning.sourceUrl === null && warning.retryable)
    );
  let found: Discovery =
    (reuse ? saved : null) ??
    (await awaitWithSignal(
      ai.discover(
        { ...research, documentLimits: { maxBytes, maxTextCharacters: maxDocumentTextLength } },
        context,
        'reference',
        firstBudget,
      ),
      context.signal,
    ));
  ensure(
    Array.isArray(found.items) && found.items.length <= 8 && Array.isArray(found.sources),
    'Invalid discovery',
  );
  const previousWarnings = found.warnings ?? [];
  found = {
    ...found,
    warnings: [],
    documentBatches: found.documentBatches ?? [],
    researchRounds: previousWarnings.length ? 1 : (found.researchRounds ?? 1),
  };
  const publish = () => events.publish({ type: 'data.changed', ownerId: job.ownerId });
  const save = async () => {
    await persistResearch(() =>
      importsDb.saveTargetDiscovery(pool, job, target.candidateId, found),
    );
    publish();
  };
  const warn = (warning: DiscoveryWarning) => {
    if (
      !found.warnings!.some(
        (old) => old.code === warning.code && old.sourceUrl === warning.sourceUrl,
      )
    )
      found.warnings!.push(warning);
  };
  await save();
  const visited = new Set<string>();

  for (let round = 0; round < 2; round++) {
    for (const item of found.items.filter((item) => item.kind === 'reference')) {
      if (visited.has(item.url) || visited.size >= 3) continue;
      visited.add(item.url);
      context.signal.throwIfAborted();
      ensure(
        publicUrl(item.url) &&
          publicUrl(item.sourceUrl) &&
          found.sources.includes(item.url) &&
          found.sources.includes(item.sourceUrl),
        'Uncited reference document',
      );
      const rejection = previousWarnings.find(
        (warning) =>
          warning.sourceUrl === item.url &&
          ((warning.code === 'SIZE_LIMIT' && warning.limit === maxBytes) ||
            (warning.code === 'MODEL_INPUT_LIMIT' &&
              [maxModelDocumentBytes, maxModelDocumentPages, maxDocumentTextLength].includes(
                warning.limit!,
              ))),
      );
      if (rejection) {
        warn(rejection);
        await save();
        continue;
      }
      let extracting = false;
      try {
        const key = discoveryItemKey(job.id, target.candidateId, item);
        let file = await persistResearch(() =>
          discoveryDb.findDiscoveryAttachment(pool, job.ownerId, key),
        );
        let content: Buffer;
        if (file) {
          const attachment = await persistResearch(() =>
            attachmentsDb.getOwnedAttachmentOrThrow(pool, job.ownerId, file!.id),
          );
          if (attachment.byteSize > maxBytes)
            throw new DocumentSizeError(attachment.byteSize, maxBytes);
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of await blobs.read(attachment.storageKey, context.signal)) {
            context.signal.throwIfAborted();
            size += chunk.length;
            if (size > maxBytes) throw new DocumentSizeError(size, maxBytes);
            chunks.push(Buffer.from(chunk));
          }
          content = Buffer.concat(chunks);
        } else {
          const downloaded = await (options.download ?? downloadPdf)(item.url, {
            maxBytes,
            signal: context.signal,
          });
          if (!downloaded) {
            warn({
              code: 'UNAVAILABLE',
              sourceUrl: item.url,
              retryable: true,
              actual: null,
              limit: null,
            });
            await save();
            continue;
          }
          if (downloaded.length > maxBytes)
            throw new DocumentSizeError(downloaded.length, maxBytes);
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
        };
        research = await readContext();
        if (!research || (file && !research.targets.length)) continue;
        const pending = research.targets.filter(
          (field) =>
            !found.documentBatches!.some(
              (batch) =>
                batch.attachmentId === file?.id &&
                batch.targetKeys.includes(researchTargetKey(field)) &&
                batch.firstPage === undefined,
            ),
        );
        const batches = pending.length
          ? Array.from({ length: Math.min(5, Math.ceil(pending.length / 20)) }, (_, index) =>
              pending.slice(index * 20, index * 20 + 20),
            )
          : file
            ? []
            : [[]];
        for (const targets of batches) {
          let result: DocumentExtraction | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              result = await awaitWithSignal(
                ai.extractDocument(document, research, targets, context),
                context.signal,
              );
              validateDocumentExtraction(result, document, targets, registry);
              break;
            } catch (error) {
              context.signal.throwIfAborted();
              const retryable =
                error instanceof Error &&
                /Invalid AI output|AI response incomplete|Invalid document|Missing document|Unrequested or duplicate|Invalid value/.test(
                  error.message,
                );
              if (attempt === 1 || !retryable) throw error;
            }
          }
          if (!result!.applicable) continue;
          if (!file) {
            await persistResearch(() =>
              persistDiscovery(
                pool,
                blobs,
                job,
                target,
                { items: [item], sources: found.sources },
                { maxBytes, signal: context.signal },
                async () => content,
              ),
            );
            file = await persistResearch(() =>
              discoveryDb.findDiscoveryAttachment(pool, job.ownerId, key),
            );
            ensure(file, 'Reference document unavailable');
            document.attachmentId = file.id;
            publish();
          }
          const completed: Discovery = {
            ...found,
            documentBatches: [
              ...found.documentBatches!,
              {
                attachmentId: file.id,
                targetKeys: targets.map(researchTargetKey),
              },
            ],
          };
          await persistResearch(() =>
            database.transaction(pool, async (db) => {
              context.signal.throwIfAborted();
              const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, target.thingId, {
                lock: true,
              });
              const data = applyDocumentValues(
                thing.data,
                result!,
                { ...research!, targets },
                registry,
                document,
              );
              await thingsDb.saveThingData(db, job.ownerId, target.thingId, data);
              await importsDb.saveTargetDiscovery(db, job, target.candidateId, completed);
            }),
          );
          found = completed;
          publish();
        }
      } catch (error) {
        if (isResearchPersistenceError(error)) throw error;
        warn(
          error instanceof DocumentSizeError
            ? {
                code: extracting ? 'MODEL_INPUT_LIMIT' : 'SIZE_LIMIT',
                sourceUrl: item.url,
                retryable: false,
                actual: error.actual,
                limit: error.limit,
              }
            : {
                code: context.signal.aborted
                  ? 'TIMEOUT'
                  : extracting
                    ? 'EXTRACTION_FAILED'
                    : 'UNAVAILABLE',
                sourceUrl: item.url,
                retryable: true,
                actual: null,
                limit: null,
              },
        );
        await save();
        if (context.signal.aborted) return;
      }
      await save();
    }
    research = await readContext();
    if (
      (!research?.targets.length && !found.warnings!.length) ||
      found.researchRounds! >= 2 ||
      options.searchCalls <= firstBudget ||
      visited.size >= 3
    )
      break;
    const additional = await awaitWithSignal(
      ai.discover(
        {
          ...research!,
          documentLimits: { maxBytes, maxTextCharacters: maxDocumentTextLength },
          rejectedDocuments: found.warnings!,
        },
        context,
        'reference',
        options.searchCalls - firstBudget,
      ),
      context.signal,
    );
    ensure(
      Array.isArray(additional.items) &&
        additional.items.length <= 8 &&
        Array.isArray(additional.sources),
      'Invalid discovery',
    );
    found = {
      ...found,
      identity: found.identity ?? additional.identity,
      items: [
        ...found.items,
        ...additional.items.filter(
          (item) => !found.items.some((old) => old.kind === item.kind && old.url === item.url),
        ),
      ].slice(0, 8),
      sources: [...new Set([...found.sources, ...additional.sources])],
      researchRounds: 2,
    };
    await save();
  }
  await persistResearch(() =>
    persistDiscovery(
      pool,
      blobs,
      job,
      target,
      { ...found, items: found.items.filter((item) => item.kind !== 'reference') },
      { maxBytes, signal: context.signal },
    ),
  );
  const retrievalFailed = found.warnings!.some(
    (warning) => !['SIZE_LIMIT', 'MODEL_INPUT_LIMIT', 'PAGE_BUDGET'].includes(warning.code),
  );
  research = await readContext();
  const currentData = (
    await persistResearch(() => thingsDb.getOwnedThingOrThrow(pool, job.ownerId, target.thingId))
  ).data;
  const previouslyFound =
    found.outcomes?.filter((outcome) => outcome.fieldId !== null && outcome.outcome === 'found') ??
    [];
  const considered = [
    ...initialTargets,
    ...previouslyFound
      .filter(
        (field) =>
          !initialTargets.some(
            (target) =>
              researchTargetKey(target) ===
              researchTargetKey({ ...field, fieldId: field.fieldId! }),
          ),
      )
      .map((field) => ({ ...field, fieldId: field.fieldId! })),
  ];
  const filled = considered.filter(
    (field) =>
      (field.fieldSetId === null
        ? currentData.standalone[field.fieldId]
        : currentData.values[field.fieldSetId]?.[field.fieldId]
      )?.origin === 'DISCOVERY',
  );
  const resourceOutcome: NonNullable<Discovery['outcomes']>[number] = {
    fieldSetId: null,
    fieldId: null,
    outcome:
      (found.documentBatches?.length ?? 0)
        ? 'found'
        : retrievalFailed
          ? 'retrieval_failed'
          : found.warnings!.length
            ? 'budget_exhausted'
            : 'unavailable',
  };
  found.outcomes = [
    resourceOutcome,
    ...filled.map((field) => ({
      fieldSetId: field.fieldSetId,
      fieldId: field.fieldId,
      outcome: 'found' as const,
    })),
    ...(research?.targets.map<NonNullable<Discovery['outcomes']>[number]>((field) => ({
      fieldSetId: field.fieldSetId,
      fieldId: field.fieldId,
      outcome: retrievalFailed
        ? 'retrieval_failed'
        : found.researchRounds! >= 2 || visited.size >= 3
          ? 'budget_exhausted'
          : 'unavailable',
    })) ?? []),
  ];
  await persistResearch(() => importsDb.saveTargetDiscovery(pool, job, target.candidateId, found));
  publish();
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
