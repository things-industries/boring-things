// Configures log formatting and places routine HTTP request and stream messages at trace severity.

import { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import type { EnvConfig } from '../config.js';

// Keep request diagnostics available without adding noise at the default info level.
export class RequestLogController extends LogController {
  override incomingRequest(request: FastifyRequest) {
    if (this.isLogDisabled(request)) return;
    request.log.trace({ req: request }, 'incoming request');
  }

  // Preserve response errors at their existing severity.
  override requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (error) return super.requestCompleted(error, request, reply);
    if (this.isLogDisabled(request)) return;
    reply.log.trace({ res: reply, responseTime: reply.elapsedTime }, 'request completed');
  }

  // Routine stream disconnects are visible when trace diagnostics are enabled.
  override streamError(
    error: Error & { code?: string },
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE')
      return super.streamError(error, request, reply);
    if (this.isLogDisabled(request)) return;
    reply.log.trace({ res: reply }, 'stream closed prematurely');
  }
}

// Use readable local output and structured production logs, preserving credential redaction.
export function loggerOptions(config: EnvConfig) {
  return {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(config.logFormat === 'pretty'
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
