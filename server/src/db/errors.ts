import { ApplicationError } from '../application/errors.js';

export function databaseError(error: unknown): unknown {
  const code = (error as { code?: string })?.code;
  if (code === '23505') return new ApplicationError('CONFLICT', 'Record already exists');
  if (code === '23503') return new ApplicationError('INVALID_INPUT', 'Invalid reference');
  return error;
}
