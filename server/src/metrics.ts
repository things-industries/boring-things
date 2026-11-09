/** Server telemetry scopes and provider measurements, exports content-free traces to Langfuse. */

import { randomBytes } from 'node:crypto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  LangfuseOtelSpanAttributes,
  propagateAttributes,
  startActiveObservation,
  startObservation,
} from '@langfuse/tracing';
import type { SpanContext } from '@opentelemetry/api';

let sdk: NodeSDK | undefined;

export interface ProviderCall {
  task: string;
  provider: 'openai' | 'google_vision' | 'icecat' | 'web';
  operation?: string;
  startedAt?: number;
  model?: string;
  requestId?: string;
  serviceTier?: string | null;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
  units?: number;
  costUsd?: number;
  status: 'success' | 'error';
}

// Starts one exporter when both credentials are configured; application startup stays independent.
export function initializeMetrics() {
  if (
    sdk ||
    process.env.LANGFUSE_TRACING_ENABLED === 'false' ||
    !process.env.LANGFUSE_PUBLIC_KEY ||
    !process.env.LANGFUSE_SECRET_KEY
  )
    return;
  try {
    sdk = new NodeSDK({
      autoDetectResources: false,
      serviceName: 'boring-things',
      spanProcessors: [
        new LangfuseSpanProcessor({
          environment:
            process.env.LANGFUSE_TRACING_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
          release: process.env.RENDER_GIT_COMMIT,
          mediaUploadEnabled: false,
        }),
      ],
    });
    sdk.start();
  } catch {
    sdk = undefined;
    console.warn('Telemetry initialization failed');
  }
}

// Flushes pending observations after application work has stopped.
export async function shutdownMetrics() {
  try {
    await sdk?.shutdown();
  } catch {
    console.warn('Telemetry shutdown failed');
  } finally {
    sdk = undefined;
  }
}

// Converts a persisted UUID into an OpenTelemetry trace ID without creating another identifier.
export function getJobTraceId(id: string) {
  const traceId = id.replaceAll('-', '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(traceId) || /^0+$/.test(traceId)) throw new Error('Invalid job ID');
  return traceId;
}

// Records a scope outcome without allowing SDK exception capture to export application error text.
async function withScope<T>(name: string, work: () => Promise<T>, parentSpanContext?: SpanContext) {
  const result = await startActiveObservation(
    name,
    async (span) => {
      if (parentSpanContext)
        span.otelSpan.setAttribute(LangfuseOtelSpanAttributes.IS_APP_ROOT, true);
      try {
        const value = await work();
        span.update({ output: { status: 'completed' } });
        return { ok: true, value } as const;
      } catch (error) {
        span.update({
          level: 'ERROR',
          statusMessage: 'operation_failed',
          output: { status: 'failed' },
        });
        return { ok: false, error } as const;
      }
    },
    { parentSpanContext },
  );
  if (!result.ok) throw result.error;
  return result.value;
}

// Groups attempts of one persisted job in a trace; independently processed sources keep their own IDs.
export function withJob<T>(
  kind: 'import' | 'attachment' | 'chat',
  id: string,
  work: () => Promise<T>,
) {
  return propagateAttributes(
    {
      sessionId: id,
      traceName: `process_${kind}`,
      metadata: { jobKind: kind, jobId: id },
    },
    () =>
      withScope(`process_${kind}`, work, {
        traceId: getJobTraceId(id),
        spanId: randomBytes(8).toString('hex'),
        traceFlags: 1,
        isRemote: true,
      }),
  );
}

// Measures a task invocation, including its model turns, tools, validation and conversion.
export function withTask<T>(task: string, work: () => Promise<T>) {
  return withScope(`execute_${task}`, work);
}

// Records one provider attempt; absent usage and costs remain unknown after a failed request.
export function recordProviderCall(call: ProviderCall) {
  try {
    const startTime = call.startedAt === undefined ? undefined : new Date(call.startedAt);
    const span = call.model
      ? startObservation(call.task, {}, { asType: 'generation', startTime })
      : startObservation(call.task, {}, { asType: 'tool', startTime });
    span.updateOtelSpanAttributes({
      model: call.model,
      modelParameters: call.serviceTier ? { service_tier: call.serviceTier } : undefined,
      usageDetails: call.usage && {
        input: call.usage.inputTokens - call.usage.cachedTokens,
        input_cached_tokens: call.usage.cachedTokens,
        output: call.usage.outputTokens,
      },
      costDetails: call.costUsd === undefined ? undefined : { total: call.costUsd },
      metadata: {
        provider: call.provider,
        operation: call.operation ?? call.task,
        requestId: call.requestId,
        units: call.units,
        durationKnown: call.startedAt !== undefined,
        usageKnown: call.usage !== undefined,
        costBasis:
          call.costUsd !== undefined ? 'standard_rate' : call.usage ? 'model_price' : 'unknown',
      },
      level: call.status === 'error' ? 'ERROR' : 'DEFAULT',
      statusMessage: call.status === 'error' ? 'provider_failed' : undefined,
    });
    span.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, [
      `provider:${call.provider}`,
    ]);
    span.end();
  } catch {
    console.warn('Telemetry recording failed');
  }
}

// Measures external work and records each attempt, including failures and cancellations.
export async function withProviderCall<T>(
  call: Omit<ProviderCall, 'status' | 'startedAt'>,
  work: () => Promise<T>,
) {
  const startedAt = Date.now();
  let status: ProviderCall['status'] = 'error';
  try {
    const result = await work();
    status = 'success';
    return result;
  } finally {
    recordProviderCall({
      ...call,
      startedAt,
      status,
      costUsd: status === 'success' ? call.costUsd : undefined,
    });
  }
}
