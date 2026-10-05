import * as attachmentsDb from '../../db/entities/attachments.js';
import * as registryDb from '../../db/entities/registry.js';

/**
 * Runs persisted import and assistant jobs in one process, coordinating bounded AI work,
 * incremental commits, retries and notifications.
 */

import type pg from 'pg';
import type { ThingData } from '../../../../shared/model.js';
import type { EnvConfig } from '../../config.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Registry } from '../registry/registry.js';
import type { ApplicationEvents } from '../events.js';
import type { AiContext, ExtractedThing, ImportAi, RegistryTools, Usage } from './types.js';
import { blankUsage } from './types.js';
import { applyFactMapping, applySelectedSets, validateExtraction } from './mapping.js';
import { searchFieldSets, searchFields } from '../registry/search.js';
import { ensure } from '../errors.js';
import * as database from '../../db/connection.js';
import * as importsDb from '../../db/entities/imports.js';
import type { ImportRow, Target } from '../../db/entities/imports.js';
import * as thingsDb from '../../db/entities/things.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { isResearchPersistenceError, persistResearch, researchImportTarget } from './research.js';
import { updateAttachmentMetadata } from '../attachments.js';
import { pdfPageCount } from '../../lib/pdf.js';

export class ImportProcessor {
  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ImportAi | undefined,
    private config: EnvConfig,
    private events: ApplicationEvents,
  ) {}

  async recover() {
    await importsDb.recoverImports(this.pool);
  }

  async next(signal: AbortSignal): Promise<boolean> {
    if (!this.ai) return false;
    const job = await importsDb.getNextQueuedImport(this.pool);
    if (!job) return false;
    await this.run(job, signal);
    return true;
  }

  private async status(job: ImportRow, status: ImportRow['status'], error: string | null = null) {
    await importsDb.setImportStatus(this.pool, job.ownerId, job.id, status, error);
    this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
  }

  private async run(initial: ImportRow, shutdown: AbortSignal) {
    let job = initial;
    const started = Date.now();
    const usage: Usage = job.usage ?? blankUsage(this.config.openaiModel);
    const previousElapsed = usage.elapsedMs;

    const record = async (delta: Partial<Usage>) => {
      if (!usage.model) usage.model = delta.model ?? usage.model;
      if (delta.entries?.length) (usage.entries ??= []).push(...delta.entries);
      usage.inputTokens += delta.inputTokens ?? 0;
      usage.outputTokens += delta.outputTokens ?? 0;
      usage.cachedTokens += delta.cachedTokens ?? 0;
      usage.toolCalls.push(...(delta.toolCalls ?? []));
      usage.elapsedMs = previousElapsed + Date.now() - started;
      await importsDb.recordImportUsage(this.pool, job, usage);
    };

    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(this.config.importTimeoutMs)]);

    const context: AiContext = {
      signal,
      record: async (delta) => {
        signal.throwIfAborted();
        await record(delta);
      },
    };

    try {
      await importsDb.markImportStarted(this.pool, job);

      if (!job.extraction) {
        await this.status(job, 'EXTRACTING');
        const file = await attachmentsDb.getOwnedAttachmentOrThrow(
          this.pool,
          job.ownerId,
          job.attachmentId,
        );
        const chunks: Buffer[] = [];

        for await (const chunk of await this.blobs.read(file.storageKey, signal)) {
          signal.throwIfAborted();
          chunks.push(Buffer.from(chunk));
        }

        const categories = await registryDb.listCategoryIds(this.pool);
        const extraction = validateExtraction(
          await awaitWithSignal(
            this.ai!.extract({ ...file, content: Buffer.concat(chunks) }, categories, context),
            signal,
          ),
          categories,
        );
        signal.throwIfAborted();
        // Preserve the literal text input too, even if the model omitted part of it.
        if (file.mediaType === 'text/plain')
          extraction.text = Buffer.concat(chunks).toString('utf8');
        const pageCount =
          file.pageCount ?? (await pdfPageCount(Buffer.concat(chunks), file.mediaType, signal));
        signal.throwIfAborted();
        await database.transaction(this.pool, async (db) => {
          await importsDb.saveExtraction(db, job, extraction);
          if (extraction.metadata || pageCount !== null)
            await updateAttachmentMetadata(
              db,
              job.ownerId,
              file.id,
              extraction.metadata ?? { title: null },
              {
                origin: 'IMPORT',
                sourceRefs: [{ attachmentId: file.id }],
              },
              pageCount,
            );
        });
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
        job = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
      }

      if (!job.selection) {
        if (job.extraction!.extractedThings.length > 1) {
          await this.status(job, 'AWAITING_SELECTION');
          return;
        }

        await database.transaction(this.pool, async (db) => {
          const current = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id, {
            lock: true,
          });
          await importsDb.allocateTargets(db, current, [
            {
              candidateId: current.extraction!.extractedThings[0].id,
              targetThingId: current.skeletonId ? null : current.targetThingId,
            },
          ]);
        });
        job = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
      }

      const selected = await importsDb.listImportTargets(this.pool, job);
      ensure(selected.length === job.selection!.length, 'Import target no longer exists');

      for (const target of selected) {
        const candidate = job.extraction!.extractedThings.find((c) => c.id === target.candidateId)!;

        if (!target.mapped) {
          await this.status(job, 'MAPPING');
          await this.map(job, target, candidate, context);
        }
      }

      // Discovery has its own budget, after all extracted data is usable.
      for (const target of await importsDb.listImportTargets(this.pool, job)) {
        if (target.discovered) continue;
        await this.status(job, 'DISCOVERING');
        const discoverySignal = AbortSignal.any([
          shutdown,
          AbortSignal.timeout(this.config.discoveryTimeoutMs),
        ]);
        try {
          const discoveryContext: AiContext = {
            signal: discoverySignal,
            record: async (delta) => {
              discoverySignal.throwIfAborted();
              await persistResearch(() => record(delta));
            },
          };
          await researchImportTarget(
            this.pool,
            this.registry,
            this.blobs,
            this.ai!,
            this.events,
            job,
            target,
            discoveryContext,
            {
              maxBytes: this.config.maxUploadBytes,
              searchCalls: this.config.discoverySearchCalls,
            },
          );

          await importsDb.markTargetStage(this.pool, job, target.candidateId, 'discovered');
          this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
        } catch (error) {
          if (shutdown.aborted || isResearchPersistenceError(error)) throw error;
          const current = (await importsDb.listImportTargets(this.pool, job)).find(
            (entry) => entry.candidateId === target.candidateId,
          )!;
          const found = current.discovery ?? { items: [], sources: [] };
          await importsDb.saveTargetDiscovery(this.pool, job, target.candidateId, {
            ...found,
            warnings: [
              ...(found.warnings ?? []),
              {
                code: discoverySignal.aborted ? 'TIMEOUT' : 'RESEARCH_FAILED',
                sourceUrl: null,
                retryable: true,
                actual: null,
                limit: null,
              },
            ],
          });
          await importsDb.markTargetStage(this.pool, job, target.candidateId, 'discovered');
          this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
        }
      }

      await this.status(job, 'COMPLETE');
    } catch (error) {
      const hasResults =
        (await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id)).resultThingIds
          .length > 0;
      const code = shutdown.aborted
        ? 'interrupted'
        : signal.aborted
          ? 'timeout'
          : error instanceof Error && error.message === 'tool_limit'
            ? 'tool_limit'
            : 'import_failed';
      await this.status(job, hasResults ? 'INCOMPLETE' : 'FAILED', code);
    } finally {
      await record({});
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    }
  }

  private async map(job: ImportRow, target: Target, candidate: ExtractedThing, context: AiContext) {
    const allowedSets = new Set<string>(),
      allowedFields = new Set<string>();
    let calls = 0;

    const checkBudget = () => {
      context.signal.throwIfAborted();
      if (++calls > this.config.importToolRounds) throw new Error('tool_limit');
    };

    const tools: RegistryTools = {
      searchFieldSets: async (category, terms) => {
        checkBudget();
        ensure(category === candidate.categoryId, 'Wrong category');
        const result = await searchFieldSets(this.pool, this.registry, category, terms);
        result.sets.forEach((s) => {
          allowedSets.add(s.id);
        });
        await context.record({
          toolCalls: [
            {
              name: 'search_field_sets',
              resultCount: result.sets.length,
              truncated: result.truncated,
            },
          ],
        });

        return result;
      },
      searchFields: async (labels) => {
        checkBudget();
        const result = await searchFields(this.pool, this.registry, labels);
        result.results.forEach((r) => r.fields.forEach((f) => allowedFields.add(f.id)));
        await context.record({
          toolCalls: [
            {
              name: 'search_fields',
              resultCount: result.results.reduce((n, r) => n + r.fields.length, 0),
              truncated: result.truncated,
            },
          ],
        });

        return {
          results: result.results.map(({ label, fields, truncated }) => ({
            label,
            fields: fields.map(({ id, name, description, schema, sensitive }) => ({
              id,
              name,
              description,
              schema,
              sensitive,
            })),
            truncated,
          })),
          truncated: result.truncated,
        };
      },
    };
    const commit = async (
      update: (data: ThingData, category: string) => ThingData,
      mapping: NonNullable<ExtractedThing['mapping']>,
    ) => {
      context.signal.throwIfAborted();
      const extraction = {
        ...job.extraction!,
        extractedThings: job.extraction!.extractedThings.map((subject) =>
          subject.id === candidate.id ? { ...subject, mapping } : subject,
        ),
      };
      await database.transaction(this.pool, async (db) => {
        const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, target.thingId, {
          lock: true,
        });
        const data = update(thing.data, thing.categoryId);
        context.signal.throwIfAborted();
        await thingsDb.saveThingData(db, job.ownerId, thing.id, data);
        await importsDb.saveExtraction(db, job, extraction);
      });
      job.extraction = extraction;
      candidate.mapping = mapping;
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    };
    if (!candidate.mapping) {
      const selection = await awaitWithSignal(
        this.ai!.selectFieldSets(candidate, tools, context),
        context.signal,
      );
      await commit(
        (data, category) =>
          applySelectedSets(data, selection.setIds, category, this.registry, allowedSets),
        { setIds: selection.setIds, batches: [] },
      );
    }
    const selectedSets = this.registry
      .expand(candidate.mapping!.setIds, candidate.categoryId)
      .map((id) => this.registry.sets.get(id)!);
    const completed = new Set(
      candidate.mapping!.batches.flatMap((batch) => [
        ...batch.values.map((value) => value.factId),
        ...batch.customFactIds,
        ...batch.discardedFactIds,
      ]),
    );
    const pending = candidate.facts.filter((fact) => !completed.has(fact.id));
    for (let offset = 0; offset < pending.length; offset += 20) {
      calls = 0;
      allowedFields.clear();
      selectedSets.forEach((set) => set.fields.forEach((field) => allowedFields.add(field.id)));
      const facts = pending.slice(offset, offset + 20);
      const batch = await awaitWithSignal(
        this.ai!.mapFacts(candidate, facts, selectedSets, tools, context),
        context.signal,
      );
      await commit(
        (data) =>
          applyFactMapping(
            data,
            batch,
            { id: candidate.id, facts },
            this.registry,
            allowedFields,
            job.id,
            job.attachmentId,
          ),
        { ...candidate.mapping!, batches: [...candidate.mapping!.batches, batch] },
      );
    }

    context.signal.throwIfAborted();
    await importsDb.markTargetStage(this.pool, job, target.candidateId, 'mapped');
  }
}
