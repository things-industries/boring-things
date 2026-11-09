/** Provider usage summaries for imports and their shared attachment traces. */

export interface RecordedObservation {
  id: string;
  traceId: string;
  name?: string | null;
  type: string;
  level?: string | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  metadata?: unknown;
  usageDetails?: Record<string, number> | null;
  totalCost?: number | null;
}

// Counts each recorded call once, including attachments associated with more than one import.
export function summarizeProviderCalls(observations: RecordedObservation[]) {
  const unique = [
    ...new Map(observations.map((row) => [`${row.traceId}/${row.id}`, row])).values(),
  ];
  const calls = unique.flatMap((row) => {
    const metadata = row.metadata;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      !('provider' in metadata) ||
      typeof metadata.provider !== 'string'
    )
      return [];
    const usage = row.usageDetails ?? {};
    return [
      {
        task: row.name ?? 'unknown',
        provider: metadata.provider,
        calls: 1,
        failedCalls: Number(row.level === 'ERROR'),
        inputTokens: (usage.input ?? 0) + (usage.input_cached_tokens ?? 0),
        cachedTokens: usage.input_cached_tokens ?? 0,
        outputTokens: usage.output ?? 0,
        unknownUsageCalls: Number(
          row.type === 'GENERATION' && !('usageKnown' in metadata && metadata.usageKnown),
        ),
        knownCostUsd: row.totalCost ?? 0,
        unpricedCalls: Number(row.totalCost == null),
        summedRequestMs:
          'durationKnown' in metadata && metadata.durationKnown && row.endTime
            ? new Date(row.endTime).getTime() - new Date(row.startTime).getTime()
            : 0,
      },
    ];
  });

  // Uses the same measures for totals and provider/task breakdowns.
  const sum = (rows: typeof calls) => ({
    calls: rows.reduce((n, row) => n + row.calls, 0),
    failedCalls: rows.reduce((n, row) => n + row.failedCalls, 0),
    inputTokens: rows.reduce((n, row) => n + row.inputTokens, 0),
    cachedTokens: rows.reduce((n, row) => n + row.cachedTokens, 0),
    outputTokens: rows.reduce((n, row) => n + row.outputTokens, 0),
    unknownUsageCalls: rows.reduce((n, row) => n + row.unknownUsageCalls, 0),
    knownCostUsd: rows.reduce((n, row) => n + row.knownCostUsd, 0),
    unpricedCalls: rows.reduce((n, row) => n + row.unpricedCalls, 0),
    summedRequestMs: rows.reduce((n, row) => n + row.summedRequestMs, 0),
  });
  const group = (field: 'provider' | 'task') =>
    [...new Set(calls.map((row) => row[field]))]
      .map((name) => ({ [field]: name, ...sum(calls.filter((row) => row[field] === name)) }))
      .sort((a, b) => b.knownCostUsd - a.knownCostUsd);
  return { total: sum(calls), byProvider: group('provider'), byTask: group('task') };
}
