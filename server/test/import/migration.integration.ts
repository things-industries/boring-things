/** Checks the demo Import upgrade with unfinished jobs and existing Things and Attachments. */

// cspell:words fkey

import { getEnv } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

// Replacing Import checkpoints left an earlier migration blocking unfinished legacy jobs.
test('Import migrations replace unfinished demo jobs and retain Things and Attachments', async () => {
  const url = new URL(getEnv('TEST_DATABASE_URL'));
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

    const userId = randomUUID();
    const thing = randomUUID();
    const otherUserId = randomUUID();
    const sharedAttachment = randomUUID();
    const attachment = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      userId,
      'demo-upgrade',
    ]);
    await pool.query(
      "insert into bt.categories(id,name,description,icon,sort_order) values('test-category','Test','','',0)",
    );
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name,data) values($1,$2,'test-category','Test item',$3)",
      [
        thing,
        userId,
        JSON.stringify({ setIds: [], standalone: { test: { value: 'old value' } }, pins: [] }),
      ],
    );
    await pool.query(
      "insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status) values($1,$2,'test.txt','text/plain',4,'test','Source text','COMPLETE')",
      [attachment, userId],
    );
    await pool.query(
      'insert into bt.thing_attachments(thing_id,attachment_id,owner_id) values($1,$2,$3)',
      [thing, attachment, userId],
    );
    for (const status of ['QUEUED', 'MAPPING', 'INCOMPLETE', 'FAILED', 'COMPLETE']) {
      const importId = randomUUID();
      await pool.query(
        'insert into bt.imports(id,owner_id,attachment_id,target_thing_id,status) values($1,$2,$3,$4,$5)',
        [importId, userId, attachment, thing, status],
      );
      await pool.query(
        "insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new) values($1,'candidate',$2,$3,false)",
        [importId, thing, userId],
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
      (await pool.query('select id,user_id,transcription from bt.attachments')).rows,
      [{ id: attachment, user_id: userId, transcription: 'Source text' }],
    );
    assert.deepEqual((await pool.query('select * from bt.thing_attachments')).rows, [
      { thing_id: thing, attachment_id: attachment, user_id: userId },
    ]);
    const {
      rows: [job],
    } = await pool.query<{ id: string }>(
      "insert into bt.imports(user_id,target_thing_id,status) values($1,$2,'QUEUED') returning id",
      [userId, thing],
    );
    await pool.query("insert into bt.users(id,auth_subject) values($1,'other-user')", [
      otherUserId,
    ]);
    await pool.query(
      "insert into bt.attachments(id,filename,media_type,byte_size,storage_key,source_url) values($1,'shared.txt','text/plain',4,'shared','https://example.test/manual')",
      [sharedAttachment],
    );
    await pool.query(
      'insert into bt.import_sources(import_id,attachment_id,user_id,position) values($1,$2,$3,0)',
      [job.id, sharedAttachment, userId],
    );
    await assert.rejects(
      pool.query("insert into bt.imports(user_id,attachment_id,status) values($1,$2,'QUEUED')", [
        otherUserId,
        attachment,
      ]),
      { code: '23514', message: 'Attachment belongs to another user' },
    );
    await assert.rejects(
      pool.query("insert into bt.imports(user_id,target_thing_id,status) values($1,$2,'QUEUED')", [
        otherUserId,
        thing,
      ]),
      { code: '23503', constraint: 'imports_target_thing_id_user_id_fkey' },
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  }
});
