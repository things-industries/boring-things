/** Read-only import report, joins Langfuse calls to user-scoped import and attachment relationships. */

import { getEnv } from '../server/src/config.js';
import { LangfuseClient } from '@langfuse/client';
import * as database from '../server/src/db/connection.js';
import * as importsDb from '../server/src/db/entities/imports.js';
import { getJobTraceId } from '../server/src/metrics.js';
import { summarizeProviderCalls, type RecordedObservation } from '../server/src/metrics-report.js';

const [importId, userId] = process.argv.slice(2);
if (!importId || !userId) throw new Error('Usage: pnpm metrics:import <import-id> <user-id>');
const client = new LangfuseClient({
  publicKey: getEnv('LANGFUSE_PUBLIC_KEY'),
  secretKey: getEnv('LANGFUSE_SECRET_KEY'),
  baseUrl: getEnv('LANGFUSE_BASE_URL'),
});
const pool = database.createPool();
try {
  const job = await importsDb.getImportForUserOrThrow(pool, userId, importId);
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
        environment: [getEnv('LANGFUSE_TRACING_ENVIRONMENT')],
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
