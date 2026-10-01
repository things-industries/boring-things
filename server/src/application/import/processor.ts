import { attachment } from '../../db/entities/attachments.js';
import { categoryIds } from '../../db/entities/registry.js';
/**
 * Runs persisted import and assistant jobs in one process, coordinating bounded AI work,
 * incremental commits, retries and notifications.
 */

import type pg from 'pg';
import type { EnvConfig } from '../../config.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Registry } from '../registry/registry.js';
import type { ApplicationEvents } from '../events.js';
import type { AiContext, Candidate, ImportAi, RegistryTools, Usage } from './types.js';
import { blankUsage } from './types.js';
import {
  applyImportStage,
  publicDiscoveryCandidate,
  retainFacts,
  validateExtraction,
} from './mapping.js';
import { searchFieldSets, searchFields } from '../registry/search.js';
import { ensure } from '../errors.js';
import { transaction } from '../../db/connection.js';
import {
  allocateTargets,
  ownedImport,
  setImportStatus,
  targets,
  recoverImports,
  nextImport,
  recordImportUsage,
  beginImport,
  saveExtraction,
  saveTargetDiscovery,
  markTarget,
  type ImportRow,
  type Target,
} from '../../db/entities/imports.js';
import { ownedThing, bumpThing, saveThingData } from '../../db/entities/things.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { persistDiscovery } from '../discovery/discovery.js';
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
    await recoverImports(this.pool);
  }

  async next(signal: AbortSignal): Promise<boolean> {
    if (!this.ai) return false;
    const job = await nextImport(this.pool);
    if (!job) return false;
    await this.run(job, signal);
    return true;
  }

  private async status(job: ImportRow, status: ImportRow['status'], error: string | null = null) {
    await setImportStatus(this.pool, job.ownerId, job.id, status, error);
    this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
  }

  private async run(initial: ImportRow, shutdown: AbortSignal) {
    let job = initial;
    const started = Date.now();
    const usage: Usage = job.usage ?? blankUsage(this.config.openaiModel);
    const previousElapsed = usage.elapsedMs;

    const record = async (delta: Partial<Usage>) => {
      usage.model = delta.model ?? usage.model;
      usage.inputTokens += delta.inputTokens ?? 0;
      usage.outputTokens += delta.outputTokens ?? 0;
      usage.cachedTokens += delta.cachedTokens ?? 0;
      usage.toolCalls.push(...(delta.toolCalls ?? []));
      usage.elapsedMs = previousElapsed + Date.now() - started;
      await recordImportUsage(this.pool, job, usage);
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
      await beginImport(this.pool, job);

      if (!job.extraction) {
        await this.status(job, 'EXTRACTING');
        const file = await attachment(this.pool, job.ownerId, job.attachmentId);
        const chunks: Buffer[] = [];

        for await (const chunk of await this.blobs.read(file.storageKey, signal)) {
          signal.throwIfAborted();
          chunks.push(Buffer.from(chunk));
        }

        const categories = await categoryIds(this.pool);
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
        await transaction(this.pool, async (db) => {
          await saveExtraction(db, job, extraction);
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
        job = await ownedImport(this.pool, job.ownerId, job.id);
      }

      if (!job.selection) {
        if (job.extraction!.candidates.length > 1) {
          await this.status(job, 'AWAITING_SELECTION');
          return;
        }

        await transaction(this.pool, async (db) => {
          const current = await ownedImport(db, job.ownerId, job.id, true);
          await allocateTargets(db, current, [
            {
              candidateId: current.extraction!.candidates[0].id,
              targetThingId: current.skeletonId ? null : current.targetThingId,
            },
          ]);
        });
        job = await ownedImport(this.pool, job.ownerId, job.id);
      }

      const selected = await targets(this.pool, job);
      ensure(selected.length === job.selection!.length, 'Import target no longer exists');

      for (const target of selected) {
        const candidate = job.extraction!.candidates.find((c) => c.id === target.candidateId)!;

        if (!target.mapped) {
          await this.status(job, 'MAPPING');
          await this.map(job, target, candidate, context);
        }
      }

      // Discovery has its own budget, after all extracted data is usable.
      let discoveryFailed = false;

      for (const target of await targets(this.pool, job)) {
        if (target.discovered) continue;
        await this.status(job, 'DISCOVERING');
        const thing = await ownedThing(this.pool, job.ownerId, target.thingId);
        const publicCandidate = publicDiscoveryCandidate(
          job.extraction!.candidates.find((c) => c.id === target.candidateId)!,
          thing.data,
        );

        try {
          if (publicCandidate || target.discovery) {
            const discoverySignal = AbortSignal.any([
              shutdown,
              AbortSignal.timeout(this.config.discoveryTimeoutMs),
            ]);

            const discoveryContext = {
              signal: discoverySignal,
              record: async (delta: Partial<Usage>) => {
                discoverySignal.throwIfAborted();
                await record(delta);
              },
            };

            const found =
              target.discovery ??
              (await awaitWithSignal(
                this.ai!.discover(publicCandidate!, discoveryContext),
                discoveryContext.signal,
              ));
            discoveryContext.signal.throwIfAborted();

            if (!target.discovery)
              await saveTargetDiscovery(this.pool, job, target.candidateId, found);

            await persistDiscovery(this.pool, this.blobs, job, target, found, {
              maxBytes: this.config.maxUploadBytes,
              signal: discoverySignal,
            });
          }

          await markTarget(this.pool, job, target.candidateId, 'discovered');
          this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
        } catch {
          discoveryFailed = true;
        }
      }

      await this.status(
        job,
        discoveryFailed ? 'INCOMPLETE' : 'COMPLETE',
        discoveryFailed ? 'discovery_failed' : null,
      );
    } catch (error) {
      const hasResults =
        (await ownedImport(this.pool, job.ownerId, job.id)).resultThingIds.length > 0;
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

  private async map(job: ImportRow, target: Target, candidate: Candidate, context: AiContext) {
    const allowedSets = new Set<string>(),
      allowedFields = new Set<string>();
    let calls = 0,
      selected = false;

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
          s.fields.forEach((f) => allowedFields.add(f.id));
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

        return result;
      },
    };
    // Retain every extracted fact before mapping, so unmapped facts survive a failed or partial provider response.
    await transaction(this.pool, async (db) => {
      const thing = await ownedThing(db, job.ownerId, target.thingId, true);
      const data = retainFacts(thing.data, candidate, job.id, job.attachmentId, this.registry);
      await saveThingData(db, job.ownerId, thing.id, data);
    });
    this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    const stages = this.ai!.map(candidate, tools, context)[Symbol.asyncIterator]();

    while (true) {
      const next = await awaitWithSignal(stages.next(), context.signal);
      if (next.done) break;
      const stage = next.value;
      context.signal.throwIfAborted();
      ensure(stage.kind === 'sets' || selected, 'Sets must precede values');
      ensure(stage.kind !== 'sets' || !selected, 'Sets already selected');
      // Commit each complete mapping stage under a fresh Thing lock; retries retain earlier stages and owner edits.
      await transaction(this.pool, async (db) => {
        context.signal.throwIfAborted();
        const thing = await ownedThing(db, job.ownerId, target.thingId, true);
        const data = applyImportStage(
          thing.data,
          stage,
          candidate,
          thing.categoryId,
          this.registry,
          allowedSets,
          allowedFields,
          job.id,
          job.attachmentId,
        );
        context.signal.throwIfAborted();
        await saveThingData(db, job.ownerId, thing.id, data);

        if (stage.kind === 'sets') await markTarget(db, job, target.candidateId, 'selected');
      });
      selected = true;
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    }

    ensure(selected, 'Mapping produced no selection');
    await transaction(this.pool, async (db) => {
      context.signal.throwIfAborted();
      await markTarget(db, job, target.candidateId, 'mapped');
      await bumpThing(db, job.ownerId, target.thingId);
    });
  }
}
