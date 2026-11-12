export type ErrorKind =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHENTICATED'
  | 'UNAVAILABLE'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_MEDIA';

export class ApplicationError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Returns an operational code without including the exception message.
export function getFailureReason(error: unknown) {
  if (error instanceof ProviderHttpError) return 'http_' + error.status;
  if (error instanceof ApplicationError) return error.kind.toLowerCase();
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'AbortError') return 'cancelled';
    if (
      'code' in error &&
      typeof error.code === 'string' &&
      /^(?:[A-Z0-9][0-9]|XX|HV)[A-Z0-9]{3}$/.test(error.code)
    )
      return 'database_' + error.code;
  }
  return 'unexpected_error';
}

export function ensure(
  condition: unknown,
  message: string,
  kind: ErrorKind = 'INVALID_INPUT',
): asserts condition {
  if (!condition) throw new ApplicationError(kind, message);
}
