import * as attachmentsDb from '../../db/entities/attachments.js';
import * as registryDb from '../../db/entities/registry.js';
import { randomUUID } from 'node:crypto';

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
import type {
  AiContext,
  ExtractedThing,
  ImportAi,
  ImportSourceText,
  RegistryTools,
  Usage,
} from './types.js';
import { blankUsage } from './types.js';
import { applyFactMapping, applySelectedSets } from './mapping.js';
import { searchFieldSets, searchFields } from '../registry/search.js';
import { ensure } from '../errors.js';
import * as database from '../../db/connection.js';
import * as importsDb from '../../db/entities/imports.js';
import type { ImportRow, ImportDestination } from '../../db/entities/imports.js';
import * as thingsDb from '../../db/entities/things.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { researchThing, ResearchPersistenceError } from './research.js';
import { publicFields } from '../public-fields.js';
import * as activityDb from '../../db/entities/activity.js';
import * as purchasablesDb from '../../db/entities/purchasables.js';
import type { TaskSuggestions, PurchasableSuggestions } from './types.js';
import { schemaValidator } from '../../contracts/schemas.js';

const validValue = schemaValidator('Value');

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
    const job = initial;
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
      if (!(await importsDb.markImportStarted(this.pool, job))) return;

      await this.runImport(job, context, shutdown, record);
    } catch (error) {
      const hasResults =
        (await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id)).resultThingIds
          .length > 0;
      const code = shutdown.aborted
        ? 'interrupted'
        : signal.aborted
          ? 'timeout'
          : error instanceof Error && error.message === 'no_thing_identified'
            ? 'no_thing_identified'
            : error instanceof Error && error.message === 'no_readable_sources'
              ? 'no_readable_sources'
              : error instanceof Error && error.message === 'tool_limit'
                ? 'tool_limit'
                : 'import_failed';
      await this.status(job, hasResults ? 'INCOMPLETE' : 'FAILED', code);
    } finally {
      await record({});
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    }
  }

  private async runImport(
    initial: ImportRow,
    context: AiContext,
    shutdown: AbortSignal,
    record: AiContext['record'],
  ) {
    let job = initial;
    const sources = await importsDb.listImportSources(this.pool, job);
    const usable = sources.filter(
      (file) =>
        ['COMPLETE', 'PARTIAL'].includes(file.transcriptionStatus) && !!file.transcription?.trim(),
    );
    if (!usable.length && !(job.extraction && job.candidatesAllocated)) {
      if (sources.some((file) => file.transcriptionStatus === 'FAILED'))
        throw new Error('no_readable_sources');
      await this.status(job, 'COMPLETE');
      return;
    }
    const sourceTexts: ImportSourceText[] = usable.map((file) => ({
      attachmentId: file.id,
      filename: file.filename,
      text: file.transcription!,
      summary: file.transcriptionSummary,
      terms: file.transcriptionTerms,
    }));
    const byId = new Map(sourceTexts.map((source) => [source.attachmentId, source]));
    if (!job.extraction) {
      await this.status(job, 'EXTRACTING');
      if (job.targetThingId) {
        await database.transaction(this.pool, async (db) => {
          const current = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id, {
            lock: true,
          });
          await importsDb.allocateTarget(db, current);
        });
      } else {
        ensure(this.ai?.identifyCandidates, 'Open extraction is unavailable');
        const categories = await registryDb.listCategoryIds(this.pool);
        const proposed = await awaitWithSignal(
          this.ai.identifyCandidates(sourceTexts, categories, context),
          context.signal,
        );
        ensure(Array.isArray(proposed) && proposed.length <= 10, 'Invalid candidates');
        const candidates: ExtractedThing[] = proposed.map((entry) => {
          ensure(
            entry.name?.trim() &&
              entry.name.length <= 200 &&
              categories.includes(entry.categoryId) &&
              Array.isArray(entry.terms) &&
              entry.terms.length <= 20 &&
              entry.terms.every((term) => typeof term === 'string' && term.length <= 200) &&
              Array.isArray(entry.identifiers) &&
              Array.isArray(entry.sourceRefs),
            'Invalid candidate identity',
          );
          for (const evidence of [...entry.identifiers, ...entry.sourceRefs]) {
            const source = byId.get(evidence.attachmentId);
            ensure(
              source &&
                typeof evidence.quote === 'string' &&
                evidence.quote.length <= 2000 &&
                source.text.includes(evidence.quote) &&
                (evidence.page === null || (Number.isInteger(evidence.page) && evidence.page > 0)),
              'Invalid candidate source evidence',
            );
          }
          for (const identifier of entry.identifiers)
            ensure(
              typeof identifier.kind === 'string' &&
                typeof identifier.value === 'string' &&
                identifier.value.length > 0,
              'Invalid candidate identifier',
            );
          return { ...entry, id: randomUUID(), facts: [] };
        });
        context.signal.throwIfAborted();
        await database.transaction(this.pool, async (db) => {
          const current = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id, {
            lock: true,
          });
          await importsDb.saveExtraction(db, current, { text: '', extractedThings: candidates });
        });
      }
      job = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
    }

    if (!job.candidatesAllocated) {
      await database.transaction(this.pool, async (db) => {
        const current = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id, {
          lock: true,
        });
        await importsDb.allocateCandidates(db, current, current.extraction!.extractedThings);
      });
      job = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
    }

    for (const target of await importsDb.listImportTargets(this.pool, job)) {
      let candidate = job.extraction!.extractedThings.find(
        (entry) => entry.id === target.candidateId,
      )!;
      if (!candidate.targeted) {
        ensure(this.ai?.extractTargetFacts, 'Targeted extraction is unavailable');
        const assessed = await awaitWithSignal(
          this.ai.extractTargetFacts(sourceTexts, candidate, context),
          context.signal,
        );
        ensure(
          assessed.length === sourceTexts.length &&
            new Set(assessed.map((entry) => entry.attachmentId)).size === assessed.length,
          'Incomplete source assessment',
        );
        const facts: ExtractedThing['facts'] = [];
        for (const assessment of assessed) {
          const source = byId.get(assessment.attachmentId);
          ensure(
            source &&
              Array.isArray(assessment.facts) &&
              (assessment.summary === null ||
                (typeof assessment.summary === 'string' && assessment.summary.length <= 2000)) &&
              Array.isArray(assessment.terms) &&
              assessment.terms.length <= 20 &&
              assessment.terms.every((term) => typeof term === 'string' && term.length <= 200),
            'Invalid source assessment',
          );
          ensure(assessment.relevant || assessment.facts.length === 0, 'Unrelated source facts');
          for (const fact of assessment.facts) {
            ensure(
              typeof fact.label === 'string' &&
                fact.label.length > 0 &&
                fact.label.length <= 200 &&
                validValue(fact.value) &&
                typeof fact.quote === 'string' &&
                fact.quote.length <= 2000 &&
                source.text.includes(fact.quote) &&
                typeof fact.sensitive === 'boolean' &&
                (fact.page === null || (Number.isInteger(fact.page) && fact.page > 0)),
              'Invalid targeted fact',
            );
            facts.push({
              ...fact,
              id: `fact-${facts.length + 1}`,
              attachmentId: source.attachmentId,
            });
          }
        }
        ensure(facts.length <= 200, 'Too many targeted facts');
        const relevantIds = assessed
          .filter((entry) => entry.relevant)
          .map((entry) => entry.attachmentId);
        context.signal.throwIfAborted();
        await database.transaction(this.pool, async (db) => {
          const current = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id, {
            lock: true,
          });
          const extraction = current.extraction!;
          await importsDb.saveExtraction(db, current, {
            ...extraction,
            extractedThings: extraction.extractedThings.map((entry) =>
              entry.id === candidate.id
                ? {
                    ...entry,
                    targeted: true,
                    facts,
                    relevantAttachmentIds: relevantIds,
                    terms: [
                      ...new Set([
                        ...entry.terms,
                        ...assessed.filter((item) => item.relevant).flatMap((item) => item.terms),
                        ...sourceTexts
                          .filter((source) => relevantIds.includes(source.attachmentId))
                          .flatMap((source) => source.terms),
                        ...entry.name.split(/\s+/).filter((term) => term.length >= 3),
                      ]),
                    ].slice(0, 20),
                    assessments: assessed.map(({ attachmentId, relevant, summary, terms }) => ({
                      attachmentId,
                      relevant,
                      summary,
                      terms,
                    })),
                  }
                : entry,
            ),
          });
        });
        job = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
        candidate = job.extraction!.extractedThings.find(
          (entry) => entry.id === target.candidateId,
        )!;
      }
      if (!candidate.linksCommitted) {
        await database.transaction(this.pool, async (db) => {
          const current = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id, {
            lock: true,
          });
          for (const attachmentId of candidate.relevantAttachmentIds ?? [])
            await attachmentsDb.linkAttachment(db, job.ownerId, attachmentId, target.thingId, true);
          await importsDb.saveExtraction(db, current, {
            ...current.extraction!,
            extractedThings: current.extraction!.extractedThings.map((entry) =>
              entry.id === candidate.id ? { ...entry, linksCommitted: true } : entry,
            ),
          });
          await thingsDb.bumpThing(db, job.ownerId, target.thingId);
        });
        job = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
        candidate = job.extraction!.extractedThings.find(
          (entry) => entry.id === target.candidateId,
        )!;
      }
      if (!target.mapped) {
        await this.status(job, 'MAPPING');
        await this.map(job, target, candidate, context);
      }
    }

    for (const target of await importsDb.listImportTargets(this.pool, job)) {
      if (target.discovered) continue;
      await this.status(job, 'DISCOVERING');
      await researchThing(
        this.pool,
        this.registry,
        this.blobs,
        this.ai!,
        this.events,
        job,
        target,
        { signal: shutdown, record },
        {
          maxBytes: this.config.maxUploadBytes,
          searchCalls: this.config.discoverySearchCalls,
          timeoutMs: this.config.discoveryTimeoutMs,
        },
      );
    }
    for (const target of await importsDb.listImportTargets(this.pool, job))
      await this.researchSuggestions(job, target, { signal: shutdown, record });
    await this.status(
      job,
      job.extraction!.extractedThings.some((candidate) => candidate.reviewRequired)
        ? 'REVIEW_REQUIRED'
        : 'COMPLETE',
    );
  }

  private async researchSuggestions(job: ImportRow, target: ImportDestination, context: AiContext) {
    for (const operation of ['taskSuggestions', 'purchasableSuggestions'] as const) {
      if (target[operation]?.complete) continue;
      const thing = await thingsDb.getOwnedThingOrThrow(this.pool, job.ownerId, target.thingId);
      const existingTasks =
        operation === 'taskSuggestions'
          ? await activityDb.existingTasks(this.pool, job.ownerId, thing.id)
          : [];
      const existingPurchasables =
        operation === 'purchasableSuggestions'
          ? await purchasablesDb.existingPurchasables(this.pool, job.ownerId, thing.id)
          : [];
      const research = {
        categoryId: thing.categoryId,
        knownFields: publicFields(thing.data, this.registry),
        referenceUrls:
          target.discovery?.items
            .filter((item) => item.kind === 'reference')
            .map((item) => item.url) ?? [],
      };
      const taskContext: AiContext = {
        signal: AbortSignal.any([
          context.signal,
          AbortSignal.timeout(this.config.discoveryTimeoutMs),
        ]),
        record: async (usage) => {
          try {
            await context.record(usage);
          } catch (error) {
            throw new ResearchPersistenceError(error);
          }
        },
      };
      let tasks: TaskSuggestions['items'] | undefined;
      let products: PurchasableSuggestions['items'] | undefined;
      try {
        if (operation === 'taskSuggestions') {
          tasks = (
            await awaitWithSignal(
              this.ai!.suggestTasks(
                {
                  ...research,
                  existingTasks,
                },
                taskContext,
                this.config.discoverySearchCalls,
              ),
              taskContext.signal,
            )
          ).items;
        } else {
          products = (
            await awaitWithSignal(
              this.ai!.findPurchasables(
                {
                  ...research,
                  existingPurchasables,
                },
                taskContext,
                this.config.discoverySearchCalls,
              ),
              taskContext.signal,
            )
          ).items;
        }
        taskContext.signal.throwIfAborted();
      } catch (error) {
        if (context.signal.aborted || error instanceof ResearchPersistenceError) throw error;
        await importsDb.saveSuggestionCheckpoint(this.pool, job, target.candidateId, operation, {
          complete: false,
          warnings: [
            {
              code: taskContext.signal.aborted ? 'TIMEOUT' : 'RESEARCH_FAILED',
              sourceUrl: null,
              retryable: true,
              actual: null,
              limit: null,
            },
          ],
        });
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
        continue;
      }
      await database.transaction(this.pool, async (db) => {
        const current = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, target.thingId, {
          lock: true,
        });
        ensure(current.categoryId === thing.categoryId, 'Thing category changed');
        for (const task of tasks ?? [])
          await activityDb.saveSuggestedTask(db, job.ownerId, thing.id, task);
        for (const product of products ?? [])
          await purchasablesDb.saveSuggestedPurchasable(db, job.ownerId, thing.id, product);
        await importsDb.saveSuggestionCheckpoint(db, job, target.candidateId, operation, {
          complete: true,
          warnings: [],
        });
        await thingsDb.bumpThing(db, job.ownerId, thing.id);
      });
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    }
  }

  private async map(
    job: ImportRow,
    target: ImportDestination,
    subject: ExtractedThing,
    context: AiContext,
  ) {
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
        ensure(category === subject.categoryId, 'Wrong category');
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
        extractedThings: job.extraction!.extractedThings.map((entry) =>
          entry.id === subject.id ? { ...entry, mapping } : entry,
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
      subject.mapping = mapping;
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    };
    if (!subject.mapping) {
      const selection = await awaitWithSignal(
        this.ai!.selectFieldSets(subject, tools, context),
        context.signal,
      );
      await commit(
        (data, category) =>
          applySelectedSets(data, selection.setIds, category, this.registry, allowedSets),
        { setIds: selection.setIds, batches: [] },
      );
    }
    const selectedSets = this.registry
      .expand(subject.mapping!.setIds, subject.categoryId)
      .map((id) => this.registry.sets.get(id)!);
    const completed = new Set(
      subject.mapping!.batches.flatMap((batch) => [
        ...batch.values.map((value) => value.factId),
        ...batch.customFactIds,
        ...batch.discardedFactIds,
      ]),
    );
    const pending = subject.facts.filter((fact) => !completed.has(fact.id));
    for (let offset = 0; offset < pending.length; offset += 20) {
      calls = 0;
      allowedFields.clear();
      selectedSets.forEach((set) => set.fields.forEach((field) => allowedFields.add(field.id)));
      const facts = pending.slice(offset, offset + 20);
      const batch = await awaitWithSignal(
        this.ai!.mapFacts(subject, facts, selectedSets, tools, context),
        context.signal,
      );
      await commit(
        (data) =>
          applyFactMapping(
            data,
            batch,
            { id: subject.id, facts },
            this.registry,
            allowedFields,
            job.id,
            job.attachmentId,
          ),
        { ...subject.mapping!, batches: [...subject.mapping!.batches, batch] },
      );
    }

    context.signal.throwIfAborted();
    await importsDb.markTargetStage(this.pool, job, target.candidateId, 'mapped');
  }
}
