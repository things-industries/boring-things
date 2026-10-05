// cspell:words sslmode
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import * as database from '../src/db/connection.js';
import { readConfig } from '../src/config.js';

test('Supabase connections enable TLS without a CA, preserving explicit verification', async () => {
  for (const [url, expected] of [
    [
      'postgresql://postgres:synthetic@db.project.supabase.co:5432/postgres',
      { rejectUnauthorized: false },
    ],
    [
      'postgresql://postgres.project:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres',
      { rejectUnauthorized: false },
    ],
    [
      'postgresql://postgres:synthetic@db.project.supabase.co:5432/postgres?sslmode=verify-full',
      {},
    ],
    ['postgresql://postgres:synthetic@127.0.0.1:55432/postgres', false],
    ['postgresql://postgres:supabase.co@database.example:5432/postgres', false],
    ['postgresql://postgres:synthetic@db.project.supabase.co.example:5432/postgres', false],
  ] as const) {
    const pool = database.createPool(url);
    try {
      // Resolve through pg because URL SSL parameters override the pool options.
      const client = new pg.Client(pool.options);
      assert.deepEqual(client.ssl, expected, url);
    } finally {
      await pool.end();
    }
  }
});

test('production accepts the session pooler URL without SSL parameters and rejects transaction mode', () => {
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://postgres.project:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres',
    LOGTO_ENDPOINT: 'https://identity.example',
    LOGTO_APP_ID: 'synthetic',
    LOGTO_API_RESOURCE: 'https://api.example',
    BLOB_STORAGE: 's3',
    S3_ENDPOINT: 'https://project.storage.supabase.co/storage/v1/s3',
    S3_REGION: 'eu-west-2',
    S3_BUCKET: 'attachments',
    S3_ACCESS_KEY_ID: 'synthetic',
    S3_SECRET_ACCESS_KEY: 'synthetic',
  };
  const { databaseUrl } = readConfig(env);
  assert.equal(databaseUrl, env.DATABASE_URL);
  assert.throws(
    () => readConfig({ ...env, DATABASE_URL: databaseUrl.replace(':5432/', ':6543/') }),
    /session connection on port 5432/,
  );
});
