import type { FastifyInstance } from 'fastify';
import { ApplicationError, type ErrorKind } from '../application/errors.js';

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
    if (status >= 500)
      request.log.error(
        { code: failure.code ?? failure.name, requestId: request.id },
        'Request failed',
      );
    return reply.code(status).send({ message, statusCode: status });
  });
}
