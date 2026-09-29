import type { UiErrorCode } from '../interfaces/error.interface';
export class UiError extends Error {
  constructor(readonly code: UiErrorCode) {
    super(code);
  }
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorCode(error: unknown): UiErrorCode {
  if (error instanceof UiError) return error.code;
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'unauthorized';
      case 404:
        return 'not-found';
      case 409:
        return 'conflict';
      case 413:
        return 'too-large';
      case 415:
        return 'unsupported-file';
      case 422:
        return 'invalid-value';
    }
  }
  return 'request-failed';
}
