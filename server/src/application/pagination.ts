import { ensure } from './errors.js';

export interface PageQuery {
  limit?: number;
  cursor?: string;
}

// Cursors contain only an offset; every query reapplies owner and filters.
export function page(query: PageQuery) {
  let offset = 0;

  if (query.cursor) {
    const raw = Buffer.from(query.cursor, 'base64url').toString();
    ensure(/^\d+$/.test(raw), 'Invalid cursor');
    offset = Number(raw);
    ensure(Number.isSafeInteger(offset) && offset <= 1000000, 'Invalid cursor');
  }

  return { offset, limit: query.limit ?? 50 };
}

// Callers fetch limit + 1 rows to detect another page; offset cursors can shift when records change.
export function pageResult<T>(items: T[], query: PageQuery) {
  const { offset, limit } = page(query);
  return {
    items: items.slice(0, limit),
    nextCursor:
      items.length > limit ? Buffer.from(String(offset + limit)).toString('base64url') : null,
  };
}
