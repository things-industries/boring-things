/** Claims one persisted request and supplies cancellation, usage accounting and recovery to its workflow. */
import { getEnv } from '../../config.js';
import type pg from 'pg';
import type { Registry } from '../registry/registry.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { ApplicationEvents } from '../events.js';
import type { ImportAi } from './types.js';
import type { AiContext } from '../../providers/ai/types.js';
import { blankUsage, getImportFailureReason, UsagePersistenceError } from './types.js';
import * as importsDb from '../../db/entities/imports.js';
import { ImportWorkflow, type WorkflowOptions } from './workflow.js';
import { ensure } from '../errors.js';
import * as metrics from '../../metrics.js';

export class ImportProcessor {
  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ImportAi | undefined,
    private events: ApplicationEvents,
    private options: WorkflowOptions = {},
  ) {}

  // Restores interrupted requests without discarding committed application work.
  async recover() {
    await importsDb.recoverImports(this.pool);
  }

  // Runs one queued Import or Recommendation through the shared execution lifecycle.
  async next(shutdown: AbortSignal) {
    const ai = this.ai;
    if (!ai) return false;
    const job = await importsDb.getNextQueuedImport(this.pool);
    if (!job || !(await importsDb.markImportStarted(this.pool, job))) return false;
    const usage = job.usage ?? blankUsage();
    let requests = usage.entries?.length ?? 0;
    const started = Date.now(),
      elapsed = usage.elapsedMs;
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(getEnv('IMPORT_TIMEOUT_MS'))]);
    let usageWrites = Promise.resolve();
    const context: AiContext = {
      signal,
      cancellationReason: () => (shutdown.aborted ? 'shutdown' : 'deadline'),
      beforeRequest: () => ensure(requests++ < getEnv('IMPORT_MAX_REQUESTS'), 'tool_limit'),
      record: async (delta) => {
        if (!usage.model) usage.model = delta.model ?? usage.model;
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
    const { id, userId, targetThingId: thingId, queuedAt, sourceWaitStartedAt } = job;
    const sourceWaitMs =
      queuedAt && sourceWaitStartedAt
        ? Math.max(0, Date.parse(queuedAt) - Date.parse(sourceWaitStartedAt))
        : undefined;
    await metrics.withJob('import', { id, userId, thingId, queuedAt, sourceWaitMs }, async () => {
      let warningCount = 0;
      let failure: { error: unknown; stage: string | undefined; reason: string } | undefined;
      try {
        warningCount = await new ImportWorkflow(
          this.pool,
          this.registry,
          this.blobs,
          ai,
          this.events,
          job,
          context,
          this.options,
        ).run();
      } catch (error) {
        failure = {
          error,
          stage: metrics.getJobStage(),
          reason: shutdown.aborted
            ? 'shutdown'
            : signal.aborted
              ? 'deadline'
              : getImportFailureReason(error),
        };
      }
      metrics.setJobStage('save_usage');
      try {
        await context.record({});
      } catch (error) {
        const reason = getImportFailureReason(error);
        if (failure) metrics.recordImportWarning({ stage: 'save_usage', reason });
        else failure = { error, stage: 'save_usage', reason };
      }
      if (failure) {
        const { error, stage, reason } = failure;
        const code =
          reason === 'shutdown'
            ? 'interrupted'
            : reason === 'deadline'
              ? 'timeout'
              : [
                    'no_thing_identified',
                    'wrong_thing',
                    'tool_limit',
                    'text_limit',
                    'source_removed',
                    'source_changed',
                  ].includes(reason)
                ? reason
                : 'import_failed';
        metrics.setJobStage('save_outcome');
        const current = await importsDb.getImportForUserOrThrow(this.pool, job.userId, job.id);
        const status = current.targetThingId ? 'INCOMPLETE' : 'FAILED';
        await importsDb.saveWorkflow(this.pool, current, {
          ...current.workflow,
          failure: { stage: current.workflow.stage, reason },
        });
        await importsDb.setImportStatus(this.pool, job.userId, job.id, status, code);
        this.events.publish({ type: 'data.changed', userId: job.userId });
        return {
          status,
          stage,
          reason,
          warningCount: current.workflow.warnings.length,
          sourceCount: current.sources.length,
          unexpectedError:
            reason.startsWith('database_') || reason === 'import_failed' ? error : undefined,
        };
      }
      metrics.setJobStage('save_outcome');
      await importsDb.setImportStatus(this.pool, job.userId, job.id, 'COMPLETE');
      this.events.publish({ type: 'data.changed', userId: job.userId });
      return { status: 'COMPLETE', warningCount, sourceCount: job.sources.length };
    });
    return true;
  }
}
