/**
 * Runs persisted import and assistant jobs in one process, coordinating bounded AI work,
 * incremental commits, retries and notifications.
 */

import type pg from 'pg';
import type { Assistant } from './conversations.js';
import type { Config } from '../config.js';
import type { BlobStorage } from '../providers/blobs.js';
import type { Registry } from './registry.js';
import type { ThingChanges } from './streams.js';
import type { AiContext, Candidate, ImportAi, RegistryTools, Usage } from './import-types.js';
import { blankUsage } from './import-types.js';
import {
  applyImportStage,
  publicDiscoveryCandidate,
  retainFacts,
  validateExtraction,
} from './import-mapping.js';
import { searchFieldSets, searchFields } from './registry-search.js';
import { ensure } from './errors.js';
import { rows, transaction } from '../db/connection.js';
import {
  allocateTargets,
  ownedImport,
  setImportStatus,
  targets,
  touchImportThings,
  type ImportRow,
  type Target,
} from '../db/imports.js';
import { ownedThing, bumpThing } from '../db/things.js';
import { withDeadline } from './import-deadline.js';
import { persistDiscovery } from './discovery.js';

export class ImportRunner {
  private stopped = false;
  private pending: Promise<void> | undefined;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ImportAi | undefined,
    private config: Config,
    private changes: ThingChanges,
    private assistant?: Assistant,
  ) {}

  async start() {
    // A single runner owns this database. Interrupted attempts retain all committed work.
    await transaction(this.pool, async (db) => {
      const interrupted = await rows<ImportRow>(
        db,
        "select * from bt.imports where status in ('extracting','mapping','discovering') for update",
      );
      await db.query(
        "update bt.imports set status='failed',error='interrupted',finished_at=now() where status in ('extracting','mapping','discovering')",
      );
      for (const job of interrupted) await touchImportThings(db, job);
    });
    await this.assistant?.recover();
    this.timer = setInterval(() => this.wake(), 1000);
    this.timer.unref();
    this.wake();
  }

  wake() {
    if (this.stopped || this.pending || (!this.ai && !this.assistant)) return;
    this.pending = this.drain()
      .catch(() => {
        /* Retry database availability on the next tick; never log private errors. */
      })
      .finally(() => {
        this.pending = undefined;
      });
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.abort.abort();
    await this.pending;
  }

  private async drain() {
    while (!this.stopped) {
      // Each pass gives chat one turn before an import; all jobs share this single in-process runner.
      const chatted = await this.assistant?.next(this.abort.signal);
      if (this.stopped) return;
      const [job] = await rows<ImportRow>(
        this.pool,
        "select * from bt.imports where status='queued' order by created_at,id limit 1",
      );
      if (job && this.ai) await this.run(job);
      else if (!chatted) return;
    }
  }

  private async status(job: ImportRow, status: ImportRow['status'], error: string | null = null) {
    await setImportStatus(this.pool, job.ownerId, job.id, status, error);
    this.changes.publish(job.ownerId);
  }

  private async run(initial: ImportRow) {
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
      await this.pool.query('update bt.imports set usage=$1 where id=$2 and owner_id=$3', [
        JSON.stringify(usage),
        job.id,
        job.ownerId,
      ]);
    };

    const signal = AbortSignal.any([
      this.abort.signal,
      AbortSignal.timeout(this.config.importTimeoutMs),
    ]);

    const context: AiContext = {
      signal,
      record: async (delta) => {
        signal.throwIfAborted();
        await record(delta);
      },
    };

    try {
      await this.pool.query(
        'update bt.imports set started_at=now(),finished_at=null,error=null where id=$1 and owner_id=$2',
        [job.id, job.ownerId],
      );

      if (!job.extraction) {
        await this.status(job, 'extracting');
        const [file] = await rows<{
          filename: string;
          mediaType: string;
          storageKey: string;
        }>(this.pool, 'select * from bt.attachments where id=$1 and owner_id=$2', [
          job.attachmentId,
          job.ownerId,
        ]);
        ensure(file, 'Source not found');
        const chunks: Buffer[] = [];

        for await (const chunk of this.blobs.read(file.storageKey)) {
          signal.throwIfAborted();
          chunks.push(Buffer.from(chunk));
        }

        const categories = (
          await rows<{ id: string }>(this.pool, 'select id from bt.categories')
        ).map((c) => c.id);
        const extraction = validateExtraction(
          await withDeadline(
            this.ai!.extract({ ...file, content: Buffer.concat(chunks) }, categories, context),
            signal,
          ),
          categories,
        );
        signal.throwIfAborted();
        // Preserve the literal text input too, even if the model omitted part of it.
        if (file.mediaType === 'text/plain')
          extraction.text = Buffer.concat(chunks).toString('utf8');
        await this.pool.query('update bt.imports set extraction=$1 where id=$2 and owner_id=$3', [
          JSON.stringify(extraction),
          job.id,
          job.ownerId,
        ]);
        job = await ownedImport(this.pool, job.ownerId, job.id);
      }

      if (!job.selection) {
        if (job.extraction!.candidates.length > 1) {
          await this.status(job, 'awaiting_selection');
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
          await this.status(job, 'mapping');
          await this.map(job, target, candidate, context);
        }
      }

      // Discovery has its own budget, after all extracted data is usable.
      let discoveryFailed = false;

      for (const target of await targets(this.pool, job)) {
        if (target.discovered) continue;
        await this.status(job, 'discovering');
        const thing = await ownedThing(this.pool, job.ownerId, target.thingId);
        const publicCandidate = publicDiscoveryCandidate(
          job.extraction!.candidates.find((c) => c.id === target.candidateId)!,
          thing.data,
        );

        try {
          if (publicCandidate || target.discovery) {
            const discoverySignal = AbortSignal.any([
              this.abort.signal,
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
              (await withDeadline(
                this.ai!.discover(publicCandidate!, discoveryContext),
                discoveryContext.signal,
              ));
            discoveryContext.signal.throwIfAborted();

            if (!target.discovery)
              await this.pool.query(
                'update bt.import_targets set discovery=$1 where import_id=$2 and candidate_id=$3',
                [JSON.stringify(found), job.id, target.candidateId],
              );

            await persistDiscovery(this.pool, this.blobs, job, target, found, {
              maxBytes: this.config.maxUploadBytes,
              signal: discoverySignal,
            });
          }

          await this.pool.query(
            'update bt.import_targets set discovered=true where import_id=$1 and candidate_id=$2',
            [job.id, target.candidateId],
          );
          this.changes.publish(job.ownerId);
        } catch {
          discoveryFailed = true;
        }
      }

      await this.status(
        job,
        discoveryFailed ? 'incomplete' : 'complete',
        discoveryFailed ? 'discovery_failed' : null,
      );
    } catch (error) {
      const hasResults =
        (await ownedImport(this.pool, job.ownerId, job.id)).resultThingIds.length > 0;
      const code = this.abort.signal.aborted
        ? 'interrupted'
        : signal.aborted
          ? 'timeout'
          : error instanceof Error && error.message === 'tool_limit'
            ? 'tool_limit'
            : 'import_failed';
      await this.status(job, hasResults ? 'incomplete' : 'failed', code);
    } finally {
      await record({});
      this.changes.publish(job.ownerId);
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
      await db.query(
        'update bt.things set data=$1,revision=revision+1 where id=$2 and owner_id=$3',
        [JSON.stringify(data), thing.id, job.ownerId],
      );
    });
    this.changes.publish(job.ownerId);
    const stages = this.ai!.map(candidate, tools, context)[Symbol.asyncIterator]();

    while (true) {
      const next = await withDeadline(stages.next(), context.signal);
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
        await db.query(
          'update bt.things set data=$1,revision=revision+1 where id=$2 and owner_id=$3',
          [JSON.stringify(data), thing.id, job.ownerId],
        );

        if (stage.kind === 'sets')
          await db.query(
            'update bt.import_targets set selected=true where import_id=$1 and candidate_id=$2',
            [job.id, target.candidateId],
          );
      });
      selected = true;
      this.changes.publish(job.ownerId);
    }

    ensure(selected, 'Mapping produced no selection');
    await transaction(this.pool, async (db) => {
      context.signal.throwIfAborted();
      await db.query(
        'update bt.import_targets set mapped=true where import_id=$1 and candidate_id=$2',
        [job.id, target.candidateId],
      );
      await bumpThing(db, job.ownerId, target.thingId);
    });
  }
}
