/** Checks the demo Import upgrade with unfinished jobs and existing Things and Attachments. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

// Replacing Import checkpoints left an earlier migration blocking unfinished legacy jobs.
test('Import migrations replace unfinished demo jobs and retain Things and Attachments', async () => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  );
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const databaseName = 'bt_test_' + randomUUID().replaceAll('-', '');
  const admin = database.createPool(url.toString());
  url.pathname = '/' + databaseName;
  const pool = database.createPool(url.toString());
  const directory = new URL('../../../supabase/migrations/', import.meta.url);
  const sourceMigration = '20261009100000_import_sources.sql';
  try {
    await admin.query(`create database ${databaseName}`);
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files.filter((file) => file < sourceMigration))
      await pool.query(await readFile(new URL(file, directory), 'utf8'));

    const owner = randomUUID();
    const thing = randomUUID();
    const attachment = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      owner,
      'demo-upgrade',
    ]);
    await pool.query(
      "insert into bt.categories(id,name,description,icon,sort_order) values('test-category','Test','','',0)",
    );
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name,data) values($1,$2,'test-category','Test item',$3)",
      [
        thing,
        owner,
        JSON.stringify({ setIds: [], standalone: { test: { value: 'old value' } }, pins: [] }),
      ],
    );
    await pool.query(
      "insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status) values($1,$2,'test.txt','text/plain',4,'test','Source text','COMPLETE')",
      [attachment, owner],
    );
    await pool.query(
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3)',
      [thing, attachment, owner],
    );
    for (const status of ['QUEUED', 'MAPPING', 'INCOMPLETE', 'FAILED', 'COMPLETE']) {
      const importId = randomUUID();
      await pool.query(
        'insert into bt.imports(id,owner_id,attachment_id,target_thing_id,status) values($1,$2,$3,$4,$5)',
        [importId, owner, attachment, thing, status],
      );
      await pool.query(
        "insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new) values($1,'candidate',$2,$3,false)",
        [importId, thing, owner],
      );
    }

    await pool.query(await readFile(new URL(sourceMigration, directory), 'utf8'));
    assert.deepEqual((await pool.query('select status from bt.imports')).rows, [
      { status: 'COMPLETE' },
    ]);
    assert.equal((await pool.query('select * from bt.import_targets')).rowCount, 1);
    for (const file of files.filter((file) => file > sourceMigration))
      await pool.query(await readFile(new URL(file, directory), 'utf8'));

    assert.equal((await pool.query('select * from bt.imports')).rowCount, 0);
    assert.deepEqual((await pool.query('select id,name,data from bt.things')).rows, [
      { id: thing, name: 'Test item', data: { setIds: [], pins: [] } },
    ]);
    assert.deepEqual(
      (await pool.query('select id,owner_id,transcription from bt.attachments')).rows,
      [{ id: attachment, owner_id: owner, transcription: 'Source text' }],
    );
    assert.deepEqual((await pool.query('select * from bt.thing_attachments')).rows, [
      { thing_id: thing, attachment_id: attachment, owner_id: owner },
    ]);
    await pool.query(
      "insert into bt.imports(owner_id,target_thing_id,status) values($1,$2,'QUEUED')",
      [owner, thing],
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  }
});
