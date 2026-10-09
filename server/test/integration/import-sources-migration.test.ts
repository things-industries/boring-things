import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

const migration = '20261009100000_import_sources.sql';

test('import source migration retains completed history and rejects unfinished work', async () => {
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

    const [{ id: ownerId }] = await database.rows<{ id: string }>(
      pool,
      "insert into bt.users(auth_subject) values('migration-owner') returning id",
    );
    const [{ id: attachmentId }] = await database.rows<{ id: string }>(
      pool,
      "insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key,transcription,transcription_status) values($1,'source.txt','text/plain',6,'migration-source','Source','COMPLETE') returning id",
      [ownerId],
    );
    const [{ id: unfinishedId }] = await database.rows<{ id: string }>(
      pool,
      "insert into bt.imports(owner_id,attachment_id,status) values($1,$2,'QUEUED') returning id",
      [ownerId, attachmentId],
    );
    const sql = await readFile(new URL(migration, directory), 'utf8');
    await assert.rejects(pool.query(sql), /Finish or remove unfinished Imports/);
    await pool.query('delete from bt.imports where id=$1', [unfinishedId]);

    await pool.query(
      "insert into bt.categories(id,name,description,icon,sort_order) values('other','Other','','box',0) on conflict do nothing",
    );
    const [{ id: thingId }] = await database.rows<{ id: string }>(
      pool,
      "insert into bt.things(owner_id,category_id,name) values($1,'other','Old Thing') returning id",
      [ownerId],
    );
    const candidate = {
      id: 'old-candidate',
      name: 'Old Thing',
      categoryId: 'other',
      terms: ['source'],
      facts: [
        {
          id: 'fact-1',
          label: 'Model',
          value: 'A1',
          quote: 'Source',
          page: null,
          sensitive: false,
        },
      ],
    };
    const [{ id: importId }] = await database.rows<{ id: string }>(
      pool,
      "insert into bt.imports(owner_id,attachment_id,target_thing_id,status,extraction,result_thing_ids) values($1,$2,$3,'COMPLETE',$4,$5) returning id",
      [
        ownerId,
        attachmentId,
        thingId,
        JSON.stringify({ text: 'Source', candidates: [candidate] }),
        [thingId],
      ],
    );
    await pool.query(
      "insert into bt.import_targets(import_id,candidate_id,thing_id,owner_id,is_new,selected,mapped,discovered) values($1,'old-candidate',$2,$3,false,true,true,true)",
      [importId, thingId, ownerId],
    );
    await pool.query(sql);

    const [job] = await database.rows<{
      attachmentId: string;
      candidatesAllocated: boolean;
      resultThingIds: string[];
      extraction: {
        text: string;
        candidates: (typeof candidate & { targeted: boolean; linksCommitted: boolean })[];
      };
    }>(
      pool,
      'select attachment_id,candidates_allocated,result_thing_ids,extraction from bt.imports where id=$1',
      [importId],
    );
    const [source] = await database.rows<{ attachmentId: string; position: number }>(
      pool,
      'select attachment_id,position from bt.import_sources where import_id=$1',
      [importId],
    );
    const [target] = await database.rows<{ thingId: string; mapped: boolean; discovered: boolean }>(
      pool,
      'select thing_id,mapped,discovered from bt.import_targets where import_id=$1',
      [importId],
    );
    assert.equal(job.attachmentId, attachmentId);
    assert.equal(job.candidatesAllocated, true);
    assert.deepEqual(job.resultThingIds, [thingId]);
    assert.equal(job.extraction.text, 'Source');
    assert.deepEqual(job.extraction.candidates, [
      { ...candidate, targeted: true, linksCommitted: true },
    ]);
    assert.deepEqual(source, { attachmentId, position: 0 });
    assert.deepEqual(target, { thingId, mapped: true, discovered: true });
    const oldColumns = await database.rows<{ columnName: string }>(
      pool,
      "select column_name from information_schema.columns where table_schema='bt' and table_name='imports' and column_name in ('skeleton_id','selection','workflow')",
    );
    assert.deepEqual(oldColumns, []);
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
