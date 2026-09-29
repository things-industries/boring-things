export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(condition: unknown, message: string, status = 422): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
