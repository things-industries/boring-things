import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

const migration = '20261004123600_research_field_metadata.sql';
test('research metadata migration classifies existing definitions and defaults new definitions to instance-specific', async () => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  );
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const name = 'bt_test_' + randomUUID().replaceAll('-', '');
  const admin = database.createPool(url.toString());
  url.pathname = '/' + name;
  const pool = database.createPool(url.toString());
  try {
    await admin.query(`create database ${name}`);
    const directory = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory))
      .filter((file) => file.endsWith('.sql') && file < migration)
      .sort())
      await pool.query(await readFile(new URL(file, directory), 'utf8'));
    for (const id of [
      'common.model',
      'common.serialNumber',
      'insurance.policyNumber',
      'insurance.provider',
      'unclassified',
    ])
      await pool.query(
        "insert into bt.field_definitions(id,name,description,schema,ui_hint,sensitive) values($1,$1,'',$2,'TEXT',true) on conflict(id) do update set sensitive=true",
        [id, JSON.stringify({ type: 'string' })],
      );
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const definitions = await database.rows<{
      id: string;
      instanceSpecific: boolean;
      sensitive: boolean;
    }>(
      pool,
      'select id, instance_specific, sensitive from bt.field_definitions where id=any($1::text[])',
      [
        [
          'common.model',
          'common.serialNumber',
          'insurance.policyNumber',
          'insurance.provider',
          'unclassified',
        ],
      ],
    );
    for (const field of definitions) {
      assert.equal(
        field.instanceSpecific,
        !['common.model', 'insurance.provider'].includes(field.id),
      );
      assert.equal(field.sensitive, true);
    }
    await pool.query(
      "insert into bt.field_definitions(id,name,description,schema,ui_hint) values('new','New','','{\"type\":\"string\"}','TEXT')",
    );
    assert.equal(
      (await pool.query("select instance_specific from bt.field_definitions where id='new'"))
        .rows[0].instance_specific,
      true,
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
