// Configures log formatting and places routine HTTP request and stream messages at trace severity.

import { getEnv } from '../config.js';
import { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import { getFailureReason } from '../application/errors.js';
import { recordHttpDuration } from '../sentry.js';

// Uses the matched route template and the internal owner resolved by authentication.
export function getRequestContext(request: FastifyRequest) {
  return {
    requestId: request.id,
    route: request.routeOptions.url ?? 'unmatched',
    method: request.method,
    ownerId: request.ownerId || undefined,
  };
}

// Keep request diagnostics available without adding noise at the default info level.
export class RequestLogController extends LogController {
  override incomingRequest(request: FastifyRequest) {
    if (this.isLogDisabled(request)) return;
    request.log.trace(
      { event: 'request_started', ...getRequestContext(request) },
      'Incoming request',
    );
  }

  // Preserve response errors at their existing severity.
  override requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (this.isLogDisabled(request)) return;
    const context = getRequestContext(request);
    const api = context.route.startsWith('/api/') || request.url.startsWith('/api/');
    const statusCode = reply.statusCode;
    const stream = reply.getHeader('content-type') === 'text/event-stream';
    const elapsedMs = reply.elapsedTime;
    if (api && !stream)
      recordHttpDuration(
        context.route.startsWith('/api/') ? context.route : 'unmatched',
        context.method,
        statusCode,
        elapsedMs,
      );
    const level = error ? 'error' : 'trace';
    reply.log[level](
      {
        event: 'request_completed',
        ...context,
        statusCode,
        elapsedMs,
        ...(error && { reason: getFailureReason(error) }),
      },
      'Request completed',
    );
  }

  // Routine stream disconnects are visible when trace diagnostics are enabled.
  override streamError(
    error: Error & { code?: string },
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (this.isLogDisabled(request)) return;
    const disconnected = error.code === 'ERR_STREAM_PREMATURE_CLOSE';
    reply.log[disconnected ? 'trace' : 'warn'](
      {
        event: 'response_stream_closed',
        ...getRequestContext(request),
        statusCode: reply.statusCode,
        elapsedMs: reply.elapsedTime,
        reason: disconnected ? 'client_disconnect' : getFailureReason(error),
      },
      'Response stream closed',
    );
  }

  // Records unmatched routes without copying the path or query string.
  override routeNotFound(request: FastifyRequest) {
    if (this.isLogDisabled(request)) return;
    request.log.trace(
      { event: 'route_not_found', ...getRequestContext(request) },
      'Route not found',
    );
  }

  // Reports a write failure after headers have started without serialising the exception.
  override writeHeadError(error: Error, request: FastifyRequest, reply: FastifyReply) {
    this.streamError(error, request, reply);
  }

  // Uses the same sanitised fields for framework-level errors.
  override defaultErrorLog(error: Error, request: FastifyRequest, reply: FastifyReply) {
    if (this.isLogDisabled(request)) return;
    request.log[reply.statusCode >= 500 ? 'error' : 'debug'](
      {
        event: 'request_failed',
        ...getRequestContext(request),
        statusCode: reply.statusCode,
        reason: getFailureReason(error),
      },
      'Request failed',
    );
  }
}

// Use readable local output and structured production logs, preserving credential redaction.
export function loggerOptions() {
  return {
    level: getEnv('LOG_LEVEL'),
    base: {
      release: getEnv('RENDER_GIT_COMMIT', { optional: true }),
      environment: getEnv('NODE_ENV'),
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(getEnv('LOG_FORMAT') === 'pretty'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: true,
            },
          },
        }
      : {}),
  };
}
