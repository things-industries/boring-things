/** Server telemetry scopes and provider measurements for Langfuse and server logs. */

import { getEnv } from './config.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  LangfuseOtelSpanAttributes,
  propagateAttributes,
  startActiveObservation,
  startObservation,
  updateActiveObservation,
} from '@langfuse/tracing';
import { trace, type SpanContext } from '@opentelemetry/api';
import { ApplicationError, getFailureReason, ProviderHttpError } from './application/errors.js';
import { captureBackgroundFailure } from './sentry.js';
import { DocumentSizeError } from './lib/document-limits.js';

let sdk: NodeSDK | undefined;

type DiagnosticLogger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
let diagnosticLogger: DiagnosticLogger | undefined;

// Registers the process logger for diagnostics independently of trace export.
export function setDiagnosticLogger(logger: DiagnosticLogger | undefined) {
  diagnosticLogger = logger;
}

export interface DiagnosticEntity {
  type: 'thing' | 'task' | 'purchasable';
  id: string;
  name: string;
}
interface DiagnosticScope {
  jobId?: string;
  attemptId?: string;
  jobKind?: 'import' | 'attachment' | 'chat';
  conversationId?: string;
  stage?: string;
  entity?: DiagnosticEntity;
}
const diagnostics = new AsyncLocalStorage<DiagnosticScope>();

// Updates the current observation when tracing is active.
function updateTrace(update: Parameters<typeof updateActiveObservation>[0]) {
  if (trace.getActiveSpan()?.isRecording()) updateActiveObservation(update);
}

export interface ProviderFailure {
  kind:
    | 'deadline'
    | 'shutdown'
    | 'cancelled'
    | 'http'
    | 'connection_timeout'
    | 'connection'
    | 'response'
    | 'size_limit'
    | 'web_search_unfinished'
    | 'unknown';
  httpStatus?: number;
  httpRequestId?: string;
  sdkError?: string;
  networkCode?: string;
  toolStatus?: string;
}

export interface ProviderCall {
  task: string;
  provider: 'openai' | 'google_vision' | 'icecat' | 'zyfy' | 'web';
  operation?: string;
  startedAt?: number;
  model?: string;
  requestId?: string;
  serviceTier?: string | null;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
  units?: number;
  costUsd?: number;
  status: 'success' | 'error';
  failure?: ProviderFailure;
}

// Returns identifiers and the most relevant display label for diagnostics.
export function getDiagnosticContext(entity = diagnostics.getStore()?.entity) {
  const scope = diagnostics.getStore();
  return {
    ...(scope?.jobId && { jobId: scope.jobId, attemptId: scope.attemptId }),
    ...(entity && { entityType: entity.type, entityId: entity.id, entityName: entity.name }),
  };
}

// Adds the owner-scoped entity once its display label is available.
export function setJobEntity(entity: DiagnosticEntity) {
  const scope = diagnostics.getStore();
  if (!scope?.jobId || (scope.entity?.id === entity.id && scope.entity.name === entity.name))
    return;
  scope.entity = entity;
  updateTrace({ metadata: getDiagnosticContext() });
}

// Associates standalone work with an entity.
export function withEntity<T>(entity: DiagnosticEntity, work: () => T) {
  return diagnostics.run({ ...diagnostics.getStore(), entity }, work);
}

// Identifies the operation in progress if a job throws before returning an outcome.
export function setJobStage(stage: string) {
  const scope = diagnostics.getStore();
  if (scope?.jobId) scope.stage = stage;
}

// Reads the job's current stage when handling a failure.
export function getJobStage() {
  return diagnostics.getStore()?.stage;
}

// Records content-free workflow measurements and, where applicable, a display label.
export function recordImportDiagnostic(
  event: string,
  details: Record<string, unknown>,
  entity?: DiagnosticEntity,
) {
  const metadata = { ...getDiagnosticContext(entity), ...details };
  diagnosticLogger?.info(metadata, event);
  startObservation(event, { metadata }).end();
}

// Correlates job events by ID without including record names.
function getJobMetadata() {
  const { jobId, jobKind, attemptId, conversationId, entity } = diagnostics.getStore() ?? {};
  return { jobKind, jobId, attemptId, conversationId, entityId: entity?.id };
}

// Records an import warning with its affected source or provider.
export function recordImportWarning(details: {
  stage: string;
  reason: string;
  attachmentId?: string;
  provider?: string;
}) {
  const metadata = { ...getJobMetadata(), ...details };
  diagnosticLogger?.warn({ event: 'import_stage_warning', ...metadata }, 'Import stage warning');
  startObservation('import_stage_warning', { level: 'WARNING', metadata }).end();
}

export interface JobOutcome {
  status: 'COMPLETE' | 'INCOMPLETE' | 'FAILED' | 'PARTIAL' | 'EMPTY' | 'SKIPPED';
  stage?: string;
  reason?: string;
  warningCount?: number;
  mediaType?: string;
  byteSize?: number;
  unexpectedError?: unknown;
}

// Writes the same outcome to the server log and the job trace.
function recordJobOutcome(
  outcome: Omit<JobOutcome, 'status' | 'unexpectedError'> & {
    status?: JobOutcome['status'];
  },
  elapsedMs: number,
) {
  const { status, stage, reason, warningCount } = outcome;
  const failed = !status || status === 'FAILED' || status === 'INCOMPLETE';
  const degraded = reason || warningCount || status === 'PARTIAL';
  const level =
    reason === 'shutdown' ? 'DEFAULT' : failed ? 'ERROR' : degraded ? 'WARNING' : 'DEFAULT';
  const metadata = { ...getJobMetadata(), elapsedMs, ...outcome };
  const logLevel = level === 'ERROR' ? 'error' : level === 'WARNING' ? 'warn' : 'info';
  diagnosticLogger?.[logLevel]({ event: 'job_finished', ...metadata }, 'Background job finished');
  updateTrace({
    level,
    statusMessage: reason ?? (warningCount ? 'optional_work_omitted' : undefined),
    output: { status, stage, reason, warningCount },
    metadata,
  });
}

// Exposes proposal and provider-validation counts on the active task observation.
export function recordTaskCounts(aiCount: number, validCount: number) {
  updateTrace({ metadata: { ...getDiagnosticContext(), aiCount, validCount } });
}

// Starts one exporter when both credentials are configured; application startup stays independent.
export function initializeMetrics() {
  if (
    sdk ||
    !getEnv('LANGFUSE_TRACING_ENABLED') ||
    !getEnv('LANGFUSE_PUBLIC_KEY', { optional: true }) ||
    !getEnv('LANGFUSE_SECRET_KEY', { optional: true })
  )
    return;
  try {
    sdk = new NodeSDK({
      autoDetectResources: false,
      serviceName: 'boring-things',
      spanProcessors: [
        new LangfuseSpanProcessor({
          publicKey: getEnv('LANGFUSE_PUBLIC_KEY'),
          secretKey: getEnv('LANGFUSE_SECRET_KEY'),
          baseUrl: getEnv('LANGFUSE_BASE_URL'),
          environment: getEnv('LANGFUSE_TRACING_ENVIRONMENT'),
          release: getEnv('RENDER_GIT_COMMIT'),
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
        if (!parentSpanContext) span.update({ output: { status: 'completed' } });
        return { ok: true, value } as const;
      } catch (error) {
        if (!parentSpanContext)
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

// Records one trace per job and groups related traces in a session.
function withJobTrace(
  kind: 'import' | 'attachment' | 'chat',
  id: string,
  sessionId: string,
  work: () => Promise<JobOutcome>,
) {
  const started = Date.now();
  const attemptId = randomBytes(8).toString('hex');
  return diagnostics.run(
    {
      jobId: id,
      jobKind: kind,
      attemptId,
      conversationId: kind === 'chat' ? sessionId : undefined,
    },
    () =>
      propagateAttributes(
        {
          sessionId,
          traceName: `process_${kind}`,
          metadata: {
            jobKind: kind,
            jobId: id,
            attemptId,
            ...(kind === 'chat' && { sessionKind: 'conversation' }),
          },
        },
        () =>
          withScope(
            `process_${kind}`,
            async () => {
              let result: JobOutcome;
              try {
                result = await work();
              } catch (error) {
                const reason = getFailureReason(error);
                const stage = getJobStage() ?? 'process';
                recordJobOutcome({ stage, reason }, Date.now() - started);
                captureBackgroundFailure(error, kind + ':' + stage, reason);
                throw error;
              }
              const { unexpectedError, ...outcome } = result;
              recordJobOutcome(outcome, Date.now() - started);
              if (unexpectedError !== undefined)
                captureBackgroundFailure(
                  unexpectedError,
                  kind + ':' + outcome.stage,
                  outcome.reason ?? 'unexpected_error',
                );
            },
            {
              traceId: getJobTraceId(id),
              spanId: attemptId,
              traceFlags: 1,
              isRemote: true,
            },
          ),
      ),
  );
}

// Gives each import and attachment its own trace and session.
export function withJob(
  kind: 'import' | 'attachment',
  id: string,
  work: () => Promise<JobOutcome>,
) {
  return withJobTrace(kind, id, id, work);
}

// Groups assistant message traces in their conversation's session.
export function withChatTurn(
  messageId: string,
  conversationId: string,
  work: () => Promise<JobOutcome>,
) {
  return withJobTrace('chat', messageId, conversationId, work);
}

// Measures a task invocation, including its model turns, tools, validation and conversion.
export function withTask<T>(task: string, work: () => Promise<T>) {
  return withScope(`execute_${task}`, () => {
    updateTrace({ metadata: getDiagnosticContext() });
    return work();
  });
}

// Records one provider attempt; absent usage and costs remain unknown after a failed request.
export function recordProviderCall(call: ProviderCall) {
  try {
    const details = {
      ...getDiagnosticContext(),
      provider: call.provider,
      operation: call.operation ?? call.task,
      requestId: call.requestId,
      ...call.failure,
    };
    if (call.status === 'error')
      diagnosticLogger?.warn(
        {
          task: call.task,
          model: call.model,
          elapsedMs: call.startedAt === undefined ? undefined : Date.now() - call.startedAt,
          ...details,
        },
        'Provider request failed',
      );
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
        ...details,
        units: call.units,
        durationKnown: call.startedAt !== undefined,
        usageKnown: call.usage !== undefined,
        costBasis:
          call.costUsd !== undefined ? 'standard_rate' : call.usage ? 'model_price' : 'unknown',
      },
      level: call.status === 'error' ? 'ERROR' : 'DEFAULT',
      statusMessage:
        call.status === 'error' ? (call.failure?.kind ?? 'provider_failed') : undefined,
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
  let failure: ProviderFailure | undefined;
  try {
    const result = await work();
    status = 'success';
    return result;
  } catch (error) {
    failure = getProviderFailure(error);
    throw error;
  } finally {
    recordProviderCall({
      ...call,
      startedAt,
      status,
      failure,
      costUsd: status === 'success' ? call.costUsd : undefined,
    });
  }
}

// Describes an HTTP provider failure without exposing the request or response.
export function getProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof ProviderHttpError) return { kind: 'http', httpStatus: error.status };
  if (error instanceof DocumentSizeError) return { kind: 'size_limit' };
  if (error instanceof SyntaxError || error instanceof ApplicationError)
    return { kind: 'response' };
  if (error instanceof Error && error.name === 'TimeoutError') return { kind: 'deadline' };
  if (error instanceof Error && error.name === 'AbortError') return { kind: 'cancelled' };
  return { kind: 'unknown' };
}
