/** Temporary PostgreSQL database for tests that need their own schema and migration history. */

import { randomUUID } from 'node:crypto';
import { getEnv } from '../../src/config.js';
import * as database from '../../src/db/connection.js';

// Creates a database on the local test server and returns its connection and cleanup.
export async function createTestDatabase() {
  const url = new URL(getEnv('TEST_DATABASE_URL'));
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('TEST_DATABASE_URL must point at a local database');
  const admin = database.createPool(url.toString());
  const name = 'bt_test_' + randomUUID().replaceAll('-', '');
  try {
    await admin.query(`create database ${name}`);
  } catch (error) {
    await admin.end();
    if (error instanceof Error && 'code' in error && error.code === 'ECONNREFUSED')
      throw new Error(`No PostgreSQL at ${url.host}. Run pnpm db:start.`, { cause: error });
    throw error;
  }
  url.pathname = '/' + name;
  const pool = database.createPool(url.toString());
  return {
    url,
    pool,
    async close() {
      try {
        await pool.end();
        await admin.query(`drop database ${name} with (force)`);
      } finally {
        await admin.end();
      }
    },
  };
}
