import pg from 'pg';
export type Database = Pick<pg.Pool, 'query'>;
export function createPool(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', (error) => {
    // Idle connections can disappear on database restart. Never log query/value details.
    console.error('Idle database connection failed', { code: (error as pg.DatabaseError).code });
  });
  return pool;
}
export async function transaction<T>(pool: pg.Pool, fn: (db: Database) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
export async function rows<T>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  ) as T[];
}
