/**
 * Creates the PostgreSQL pool, manages transactions and maps database column names and timestamps
 * to application response shapes.
 */

import pg from 'pg';
import * as errorsDb from './errors.js';

export type Database = Pick<pg.Pool, 'query'>;

export function createPool(connectionString: string) {
  const { hostname } = new URL(connectionString);
  const supabase = hostname.endsWith('.supabase.co') || hostname.endsWith('.pooler.supabase.com');
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10000,
    ssl: supabase ? { rejectUnauthorized: false } : false,
  });
  pool.on('error', (error) => {
    // Idle connections can disappear on database restart. Never log query/value details.
    console.error('Idle database connection failed', {
      code: (error as pg.DatabaseError).code,
    });
  });

  return pool;
}

export async function transaction<T>(
  pool: pg.Pool,
  fn: (db: Database) => Promise<T>,
  isolation?: 'repeatable read',
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query(
      isolation === 'repeatable read' ? 'begin isolation level repeatable read' : 'begin',
    );
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw errorsDb.databaseError(error);
  } finally {
    client.release();
  }
}

// Only top-level column names and Date values are mapped; nested JSON retains its stored shape.
export async function rows<T>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await execute(db, sql, params);
  return result.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  ) as T[];
}

export async function execute(
  db: Database,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  try {
    return await db.query(sql, params);
  } catch (error) {
    throw errorsDb.databaseError(error);
  }
}
