/** Claims one persisted request and supplies cancellation, usage accounting and recovery to its workflow. */
import type pg from 'pg';
import type { Registry } from '../registry/registry.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { EnvConfig } from '../../config.js';
import type { ApplicationEvents } from '../events.js';
import type { ImportAi } from './types.js';
import type { AiContext } from '../../providers/ai/types.js';
import { blankUsage, getImportFailureReason, UsagePersistenceError } from './types.js';
import * as importsDb from '../../db/entities/imports.js';
import { ImportWorkflow, type WorkflowOptions } from './workflow.js';
import { ensure } from '../errors.js';

export class ImportProcessor {
  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ImportAi | undefined,
    private config: EnvConfig,
    private events: ApplicationEvents,
    private options: WorkflowOptions = {},
  ) {}

  // Restores interrupted requests without discarding committed application work.
  async recover() {
    await importsDb.recoverImports(this.pool);
  }

  // Runs one queued Import or Recommendation through the shared execution lifecycle.
  async next(shutdown: AbortSignal) {
    if (!this.ai) return false;
    const job = await importsDb.getNextQueuedImport(this.pool);
    if (!job || !(await importsDb.markImportStarted(this.pool, job))) return false;
    const usage = job.usage ?? blankUsage(this.config.openaiModel);
    let requests = usage.entries?.length ?? 0;
    const started = Date.now(),
      elapsed = usage.elapsedMs;
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(this.config.importTimeoutMs)]);
    let usageWrites = Promise.resolve();
    const context: AiContext = {
      maxTextCharacters: this.config.importMaxTextCharacters,
      signal,
      beforeRequest: () => ensure(requests++ < this.config.importMaxRequests, 'tool_limit'),
      record: async (delta) => {
        usage.inputTokens += delta.inputTokens ?? 0;
        usage.outputTokens += delta.outputTokens ?? 0;
        usage.cachedTokens += delta.cachedTokens ?? 0;
        usage.toolCalls.push(...(delta.toolCalls ?? []));
        if (delta.entries?.length) (usage.entries ??= []).push(...delta.entries);
        usage.elapsedMs = elapsed + Date.now() - started;
        try {
          // Parallel requests share totals; write snapshots in order.
          usageWrites = usageWrites
            .catch(() => {})
            .then(() => importsDb.recordImportUsage(this.pool, job, usage));
          await usageWrites;
        } catch (error) {
          throw new UsagePersistenceError(error);
        }
      },
    };
    try {
      await new ImportWorkflow(
        this.pool,
        this.registry,
        this.blobs,
        this.ai,
        this.config,
        this.events,
        job,
        context,
        this.options,
      ).run();
    } catch (error) {
      const current = await importsDb.getOwnedImportOrThrow(this.pool, job.ownerId, job.id);
      const code = shutdown.aborted
        ? 'interrupted'
        : signal.aborted
          ? 'timeout'
          : error instanceof Error &&
              [
                'no_thing_identified',
                'wrong_thing',
                'tool_limit',
                'text_limit',
                'source_removed',
                'source_changed',
              ].includes(error.message)
            ? error.message
            : 'import_failed';
      await importsDb.saveWorkflow(this.pool, current, {
        ...current.workflow,
        failure: { stage: current.workflow.stage, reason: getImportFailureReason(error) },
      });
      await importsDb.setImportStatus(
        this.pool,
        job.ownerId,
        job.id,
        current.targetThingId ? 'INCOMPLETE' : 'FAILED',
        code,
      );
    } finally {
      await context.record({});
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    }
    return true;
  }
}
