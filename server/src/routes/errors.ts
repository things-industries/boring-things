/** Maps application errors to HTTP responses and reports unexpected request failures. */

import type { FastifyInstance } from 'fastify';
import { ApplicationError, getFailureReason, type ErrorKind } from '../application/errors.js';
import { captureFailure } from '../sentry.js';
import { getRequestContext } from '../http/logging.js';

interface HttpFailure extends Error {
  code?: string;
  statusCode?: number;
  validation?: unknown;
}

const statuses: Record<ErrorKind, number> = {
  INVALID_INPUT: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHENTICATED: 401,
  UNAVAILABLE: 503,
  TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
};

// Registers the error handler for API responses and request diagnostics.
export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const failure = error as HttpFailure;
    const status =
      failure instanceof ApplicationError
        ? statuses[failure.kind]
        : failure.validation
          ? 422
          : failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 600
            ? failure.statusCode
            : 500;
    const message =
      failure instanceof ApplicationError
        ? failure.message
        : failure.validation
          ? 'Invalid request'
          : status === 413
            ? 'File exceeds upload limit'
            : status === 415
              ? 'Unsupported media type'
              : status === 404
                ? 'Not found'
                : 'Request could not be completed';
    if (status >= 500) {
      const context = getRequestContext(request);
      const reason = getFailureReason(error);
      request.log.error(
        { event: 'request_failed', ...context, statusCode: status, reason },
        'Request failed',
      );
      if (!(failure instanceof ApplicationError))
        captureFailure(error, 'http_request', reason, {
          requestId: context.requestId,
          route: context.route,
        });
    }
    return reply.code(status).send({ message, statusCode: status });
  });
}
