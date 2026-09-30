import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../src/db/connection.js';

test('homescreen migration preserves existing records and enforces schedule and usage constraints', async () => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  );
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const database = 'bt_test_' + randomUUID().replaceAll('-', '');
  const admin = createPool(url.toString());
  url.pathname = '/' + database;
  const pool = createPool(url.toString());
  try {
    await admin.query(`create database ${database}`);
    const directory = new URL('../../../supabase/migrations/', import.meta.url);
    const migration = '20260930010000_homescreen.sql';
    for (const file of (await readdir(directory))
      .filter((f) => f.endsWith('.sql') && f < migration)
      .sort())
      await pool.query(await readFile(new URL(file, directory), 'utf8'));
    const owner = randomUUID(),
      thing = randomUUID(),
      issue = randomUUID(),
      event = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      owner,
      'migration-test',
    ]);
    await pool.query(
      "insert into bt.categories(id,name,description,icon,sort_order) values('other','Other','','',0)",
    );
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name,created_at,updated_at) values($1,$2,'other','Existing','2026-09-01Z','2026-09-02Z')",
      [thing, owner],
    );
    await pool.query(
      "insert into bt.issues(id,owner_id,thing_id,title,status) values($1,$2,$3,'Existing issue','OPEN')",
      [issue, owner, thing],
    );
    await pool.query(
      "insert into bt.events(id,owner_id,thing_id,issue_id,title,status,starts_at) values($1,$2,$3,$4,'Existing event','SCHEDULED','2026-10-01T09:00:00Z')",
      [event, owner, thing, issue],
    );
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const existing = (await pool.query('select * from bt.things where id=$1', [thing])).rows[0];
    assert.equal(existing.access_count, 0);
    assert.equal(existing.last_viewed_at, null);
    assert.equal(existing.updated_at.toISOString(), '2026-09-02T00:00:00.000Z');
    const savedIssue = (await pool.query('select * from bt.issues where id=$1', [issue])).rows[0];
    assert.equal(savedIssue.status_text, null);
    assert.equal(savedIssue.due_date, null);
    const savedEvent = (await pool.query('select * from bt.events where id=$1', [event])).rows[0];
    assert.equal(savedEvent.starts_on, null);
    assert.equal(savedEvent.starts_at.toISOString(), '2026-10-01T09:00:00.000Z');
    for (const sql of [
      'update bt.events set starts_at=null where id=$1',
      "update bt.events set starts_on='2026-10-01' where id=$1",
    ])
      await assert.rejects(pool.query(sql, [event]), { code: '23514' });
    await pool.query("update bt.events set starts_at=null,starts_on='2026-10-01' where id=$1", [
      event,
    ]);
    await assert.rejects(pool.query('update bt.things set access_count=-1 where id=$1', [thing]), {
      code: '23514',
    });
    await pool.query('update bt.things set access_count=1,last_viewed_at=now() where id=$1', [
      thing,
    ]);
    assert.equal(
      (
        await pool.query('select updated_at from bt.things where id=$1', [thing])
      ).rows[0].updated_at.toISOString(),
      '2026-09-02T00:00:00.000Z',
    );
    await pool.query('update bt.things set revision=revision+1 where id=$1', [thing]);
    assert.notEqual(
      (
        await pool.query('select updated_at from bt.things where id=$1', [thing])
      ).rows[0].updated_at.toISOString(),
      '2026-09-02T00:00:00.000Z',
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${database} with (force)`);
    await admin.end();
  }
});
