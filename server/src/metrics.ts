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
  type LangfuseSpan,
  type LangfuseTool,
} from '@langfuse/tracing';
import { trace, type SpanContext } from '@opentelemetry/api';
import { ApplicationError, getFailureReason, ProviderHttpError } from './application/errors.js';
import { applicationMetrics, captureFailure } from './sentry.js';
import { ReportedJobError } from './application/jobs/runner.js';
import { DocumentSizeError } from './lib/document-limits.js';

let sdk: NodeSDK | undefined;

type DiagnosticLogger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'> &
  Partial<Pick<FastifyBaseLogger, 'debug'>>;
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
  ownerId?: string;
  thingId?: string;
  traceId?: string;
  jobId?: string;
  attemptId?: string;
  jobKind?: 'import' | 'attachment' | 'chat';
  conversationId?: string;
  stage?: string;
  entity?: DiagnosticEntity;
}
interface JobContext {
  id: string;
  ownerId?: string | null;
  thingId?: string | null;
  conversationId?: string;
  queuedAt?: string | null;
  sourceWaitMs?: number;
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
  provider: 'openai' | 'google_vision' | 'icecat' | 'zyfy' | 'epc_govuk' | 'web';
  operation?: string;
  startedAt?: number;
  model?: string;
  requestId?: string;
  httpRequestId?: string;
  responseId?: string;
  outcome?: 'found' | 'not_found' | 'pending' | 'redirected' | 'unsupported_media';
  httpStatus?: number;
  serviceTier?: string | null;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
  units?: number;
  costUsd?: number;
  status: 'success' | 'error';
  failure?: ProviderFailure;
}

// Returns identifiers and the most relevant display label for diagnostics.
export function getDiagnosticContext(entity = diagnostics.getStore()?.entity) {
  return {
    ...getJobMetadata(),
    ...(entity && { entityType: entity.type, entityId: entity.id, entityName: entity.name }),
  };
}

// Writes dependency diagnostics with a classified reason and no raw exception.
export function recordDependencyFailure(
  dependency: 'database' | 'storage' | 'logto',
  operation: string,
  error: unknown,
  context?: { ownerId?: string; attachmentId?: string; thingId?: string },
) {
  const reason = getFailureReason(error);
  const attributes = { dependency, operation, reason };
  applicationMetrics.count('dependency.failures', 1, { attributes });
  diagnosticLogger?.warn(
    { event: 'dependency_failed', ...getJobMetadata(), ...context, ...attributes },
    'Dependency failed',
  );
}

// Times non-provider work within the current Langfuse trace.
export function withStage<T>(name: string, work: () => Promise<T>) {
  return withScope(name, work);
}

// Records tool execution using its registered name without capturing arguments or output.
export function withTool<T>(name: string, work: () => Promise<T>) {
  return withScope(name, work, undefined, 'tool');
}

// Adds retrieval counts without sending the returned data.
export function recordToolResult(resultCount: number, truncated: boolean) {
  updateTrace({ metadata: { resultCount, truncated } });
}

// Adds the owner-scoped entity once its display label is available.
export function setJobEntity(entity: DiagnosticEntity) {
  const scope = diagnostics.getStore();
  if (!scope?.jobId || (scope.entity?.id === entity.id && scope.entity.name === entity.name))
    return;
  scope.entity = entity;
  if (entity.type === 'thing') scope.thingId = entity.id;
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
  event:
    | 'additional_information_batch'
    | 'task_recommendations_saved'
    | 'purchasable_recommendations_saved'
    | 'suggested_task_saved'
    | 'suggested_purchasable_saved'
    | 'import_resource_linked',
  details: {
    start?: number;
    end?: number;
    elapsedMs?: number;
    modelCalls?: number;
    toolCalls?: number;
    failureReason?: string;
    acceptedCount?: number;
    savedCount?: number;
    attachmentId?: string;
    reused?: boolean;
  },
  entity?: DiagnosticEntity,
) {
  const metadata = { ...getDiagnosticContext(entity), ...details };
  diagnosticLogger?.debug?.(
    { event, ...getJobMetadata(), ...details, entityId: entity?.id },
    event,
  );
  startObservation(event, { metadata }, { asType: 'event' }).end();
}

// Correlates job events by ID without including record names.
function getJobMetadata() {
  const { jobId, jobKind, attemptId, conversationId, ownerId, thingId, traceId } =
    diagnostics.getStore() ?? {};
  return {
    jobKind,
    jobId,
    attemptId,
    conversationId,
    ownerId,
    thingId,
    traceId,
    importId: jobKind === 'import' ? jobId : undefined,
    attachmentId: jobKind === 'attachment' ? jobId : undefined,
    messageId: jobKind === 'chat' ? jobId : undefined,
  };
}

// Records an import warning with its affected source or provider.
export function recordImportWarning(details: {
  stage: string;
  reason: string;
  attachmentId?: string;
  provider?: string;
}) {
  const metadata = { ...getDiagnosticContext(), ...details };
  diagnosticLogger?.warn({ event: 'import_stage_warning', ...metadata }, 'Import stage warning');
  startObservation(
    'import_stage_warning',
    { level: 'WARNING', metadata },
    { asType: 'event' },
  ).end();
}

export interface JobOutcome {
  status: 'COMPLETE' | 'INCOMPLETE' | 'FAILED' | 'PARTIAL' | 'EMPTY' | 'SKIPPED';
  stage?: string;
  reason?: string;
  warningCount?: number;
  mediaType?: string;
  byteSize?: number;
  pageCount?: number | null;
  ocrPageCount?: number;
  textCharacters?: number;
  sourceCount?: number;
  cardCount?: number;
  timeToFirstTokenMs?: number;
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
  const degraded = (reason && status !== 'SKIPPED') || warningCount || status === 'PARTIAL';
  const level =
    reason === 'shutdown' ? 'DEFAULT' : failed ? 'ERROR' : degraded ? 'WARNING' : 'DEFAULT';
  const metadata = { ...getDiagnosticContext(), elapsedMs, ...outcome };
  const attributes = { jobKind: metadata.jobKind ?? 'unknown', status: status ?? 'ERROR', level };
  applicationMetrics.count('jobs.finished', 1, { attributes });
  applicationMetrics.distribution('jobs.processing.duration', elapsedMs, {
    unit: 'millisecond',
    attributes,
  });
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
async function withScope<T>(
  name: string,
  work: () => Promise<T>,
  parentSpanContext?: SpanContext,
  asType: 'span' | 'tool' = 'span',
) {
  const run = async (span: LangfuseSpan | LangfuseTool) => {
    if (parentSpanContext) span.otelSpan.setAttribute(LangfuseOtelSpanAttributes.IS_APP_ROOT, true);
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
  };
  const result = await (asType === 'tool'
    ? startActiveObservation(name, run, { asType })
    : startActiveObservation(name, run, { parentSpanContext }));
  if (!result.ok) throw result.error;
  return result.value;
}

// Records one trace per job and groups related traces in a session.
function withJobTrace(
  kind: 'import' | 'attachment' | 'chat',
  job: JobContext,
  work: () => Promise<JobOutcome>,
) {
  const { id, ownerId, thingId, conversationId, queuedAt, sourceWaitMs } = job;
  const started = Date.now();
  const attemptId = randomBytes(8).toString('hex');
  const traceId = getJobTraceId(id);
  const queueWaitMs = queuedAt ? Math.max(0, started - Date.parse(queuedAt)) : undefined;
  return diagnostics.run(
    {
      jobId: id,
      jobKind: kind,
      attemptId,
      conversationId,
      ownerId: ownerId ?? undefined,
      thingId: thingId ?? undefined,
      traceId,
    },
    () =>
      propagateAttributes(
        {
          sessionId: conversationId ?? id,
          userId: ownerId ?? undefined,
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
              const context = { ...getJobMetadata(), queueWaitMs, sourceWaitMs };
              updateTrace({ metadata: context });
              diagnosticLogger?.info(
                { event: 'job_started', ...context },
                'Background job started',
              );
              if (queueWaitMs !== undefined)
                applicationMetrics.distribution('jobs.queue.wait', queueWaitMs, {
                  unit: 'millisecond',
                  attributes: { jobKind: kind },
                });
              if (sourceWaitMs !== undefined)
                applicationMetrics.distribution('jobs.source.wait', sourceWaitMs, {
                  unit: 'millisecond',
                  attributes: { jobKind: kind },
                });
              let result: JobOutcome;
              try {
                result = await work();
              } catch (error) {
                const reason = getFailureReason(error);
                const stage = getJobStage() ?? 'process';
                recordJobOutcome({ stage, reason }, Date.now() - started);
                captureFailure(error, kind + ':' + stage, reason, {
                  jobId: id,
                  attemptId,
                  traceId,
                });
                throw new ReportedJobError(error);
              }
              const { unexpectedError, ...outcome } = result;
              recordJobOutcome(outcome, Date.now() - started);
              if (unexpectedError !== undefined)
                captureFailure(
                  unexpectedError,
                  kind + ':' + (outcome.stage ?? 'process'),
                  outcome.reason ?? 'unexpected_error',
                  { jobId: id, attemptId, traceId },
                );
            },
            {
              traceId,
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
  job: JobContext,
  work: () => Promise<JobOutcome>,
) {
  return withJobTrace(kind, job, work);
}

// Groups assistant message traces in their conversation's session.
export function withChatTurn(
  job: JobContext & { conversationId: string },
  work: () => Promise<JobOutcome>,
) {
  return withJobTrace('chat', job, work);
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
      httpRequestId: call.httpRequestId,
      responseId: call.responseId,
      outcome: call.outcome,
      httpStatus: call.httpStatus,
      ...call.failure,
    };
    if (call.status === 'error')
      diagnosticLogger?.warn(
        {
          task: call.task,
          event: 'provider_request_failed',
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
  work: (
    report: (details: Pick<ProviderCall, 'outcome' | 'httpStatus' | 'units'>) => void,
  ) => Promise<T>,
) {
  const startedAt = Date.now();
  let status: ProviderCall['status'] = 'error';
  let failure: ProviderFailure | undefined;
  let details: Pick<ProviderCall, 'outcome' | 'httpStatus' | 'units'> = {};
  try {
    const result = await work((value) => {
      details = value;
    });
    status = 'success';
    return result;
  } catch (error) {
    failure = getProviderFailure(error);
    throw error;
  } finally {
    recordProviderCall({
      ...call,
      ...details,
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
