/** Samples persisted queues and pool pressure for service metrics. */

import type { Pool } from 'pg';
import * as database from '../../db/connection.js';
import { recordDependencyFailure } from '../../metrics.js';
import { applicationMetrics, isSentryEnabled } from '../../sentry.js';

const sampleIntervalMs = 60000;

// Samples queue depths and oldest known entry times in one database read.
export function monitorQueues(pool: Pool) {
  if (!isSentryEnabled()) return;
  let pending: Promise<void> | undefined;
  const sample = () => {
    pending ??= (async () => {
      applicationMetrics.gauge('database.pool.waiting', pool.waitingCount);
      applicationMetrics.gauge('database.pool.in_use', pool.totalCount - pool.idleCount);
      const queues = await database.rows<{
        jobKind: string;
        state: string;
        depth: number;
        oldestAgeMs: number | null;
      }>(
        pool,
        `
        select 'import' as job_kind,'ready' as state,count(*)::integer as depth,
          extract(epoch from now()-min(queued_at))::float8*1000 as oldest_age_ms
        from bt.imports where status='QUEUED'
        union all
        select 'import','waiting_for_sources',count(*)::integer,
          extract(epoch from now()-min(source_wait_started_at))::float8*1000
        from bt.imports where status='WAITING_FOR_TRANSCRIPTION'
        union all
        select 'attachment','ready',count(*)::integer,
          extract(epoch from now()-min(transcription_queued_at))::float8*1000
        from bt.attachments where transcription_status='PENDING'
        union all
        select 'chat','ready',count(*)::integer,
          extract(epoch from now()-min(queued_at))::float8*1000
        from bt.messages where role='ASSISTANT' and status='QUEUED'
      `,
      );
      for (const { jobKind, state, depth, oldestAgeMs } of queues) {
        const attributes = { jobKind, state };
        applicationMetrics.gauge('jobs.queue.depth', depth, { attributes });
        if (oldestAgeMs !== null || depth === 0)
          applicationMetrics.gauge('jobs.queue.oldest_age', Math.max(0, oldestAgeMs ?? 0), {
            unit: 'millisecond',
            attributes,
          });
      }
    })()
      .catch((error: unknown) => recordDependencyFailure('database', 'queue_sample', error))
      .finally(() => {
        pending = undefined;
      });
  };
  const timer = setInterval(sample, sampleIntervalMs).unref();
  sample();
  return async () => {
    clearInterval(timer);
    await pending;
  };
}
