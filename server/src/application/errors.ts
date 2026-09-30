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

export function ensure(
  condition: unknown,
  message: string,
  kind: ErrorKind = 'INVALID_INPUT',
): asserts condition {
  if (!condition) throw new ApplicationError(kind, message);
}
