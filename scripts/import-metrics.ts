/** Read-only import report, joins Langfuse calls to owner-scoped import and attachment relationships. */

import { LangfuseClient } from '@langfuse/client';
import * as database from '../server/src/db/connection.js';
import * as importsDb from '../server/src/db/entities/imports.js';
import { getEnv } from '../server/src/env.js';
import { getJobTraceId } from '../server/src/metrics.js';
import { summarizeProviderCalls, type RecordedObservation } from '../server/src/metrics-report.js';

const [importId, ownerId] = process.argv.slice(2);
if (!importId || !ownerId) throw new Error('Usage: pnpm metrics:import <import-id> <owner-id>');
getEnv('LANGFUSE_PUBLIC_KEY');
getEnv('LANGFUSE_SECRET_KEY');
const pool = database.createPool(getEnv('DATABASE_URL'));
try {
  const job = await importsDb.getOwnedImportOrThrow(pool, ownerId, importId);
  const client = new LangfuseClient();
  const traceIds = [getJobTraceId(job.id), ...new Set(job.attachmentIds.map(getJobTraceId))];
  const observations: RecordedObservation[] = [];
  const traces = [];
  for (const traceId of traceIds) {
    let cursor: string | undefined;
    let count = 0;
    do {
      const page = await client.api.observations.getMany({
        traceId,
        cursor,
        limit: 1000,
        environment: [
          process.env.LANGFUSE_TRACING_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
        ],
        fields: 'core,basic,usage,metadata',
      });
      for (const row of page.data) {
        if (row.traceId !== traceId) throw new Error('Unexpected telemetry trace ID');
        observations.push({ ...row, traceId: row.traceId });
      }
      count += page.data.length;
      cursor = page.meta.cursor ?? undefined;
    } while (cursor);
    traces.push({ traceId, observations: count });
  }
  console.log(
    JSON.stringify(
      {
        importId,
        status: job.status,
        traces,
        missingTraceIds: traces
          .filter(({ observations }) => !observations)
          .map(({ traceId }) => traceId),
        importWork: summarizeProviderCalls(
          observations.filter((row) => row.traceId === traceIds[0]),
        ),
        associatedSourcePreparation: summarizeProviderCalls(
          observations.filter((row) => row.traceId !== traceIds[0]),
        ),
        combined: summarizeProviderCalls(observations),
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
