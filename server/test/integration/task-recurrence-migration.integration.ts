/** Existing Task conversion and database enforcement of deadline-free recurrence. */

import { getEnv } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

const migration = '20261110151123_task_deadlines_exclude_recurrence.sql';

test('recurrence migration keeps deadlines in all states and renames scheduled recurrence', async () => {
  const url = new URL(getEnv('TEST_DATABASE_URL'));
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
    const owner = randomUUID();
    const thing = randomUUID();
    await pool.query("insert into bt.users(id,auth_subject) values($1,'recurrence-migration')", [
      owner,
    ]);
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name) values($1,$2,'other','Example cover')",
      [thing, owner],
    );
    for (const status of ['SUGGESTED', 'ACTIVE', 'COMPLETED', 'CLOSED'])
      await pool.query(
        `insert into bt.tasks(owner_id,thing_id,title,status,deadline_on,recurrence,completed_at,closed_at)
         values($1,$2,$3,$3,'2096-01-10','{"interval":1,"unit":"YEAR","from":"COMPLETION"}',
           case when $3 in ('COMPLETED','CLOSED') then now() end,
           case when $3='CLOSED' then now() end)`,
        [owner, thing, status],
      );
    for (const from of ['DEADLINE', 'COMPLETION'])
      await pool.query(
        `insert into bt.tasks(owner_id,thing_id,title,status,scheduled_on,recurrence,reference_dates)
         values($1,$2,$3,'ACTIVE','2096-01-01',$4,'{"scheduledOn":"2096-01-01","deadlineOn":null}')`,
        [owner, thing, from, JSON.stringify({ interval: 1, unit: 'MONTH', from })],
      );
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const tasks = await database.rows<{
      title: string;
      status: string;
      deadline: string | null;
      recurrence: { from: string } | null;
    }>(pool, 'select title,status,deadline_on::text as deadline,recurrence from bt.tasks');
    for (const task of tasks) {
      if (['DEADLINE', 'COMPLETION'].includes(task.title)) {
        assert.equal(task.recurrence?.from, task.title === 'DEADLINE' ? 'SCHEDULED' : 'COMPLETION');
      } else {
        assert.equal(task.status, task.title);
        assert.equal(task.deadline, '2096-01-10');
        assert.equal(task.recurrence, null);
      }
    }
    for (const sql of [
      "update bt.tasks set deadline_on='2096-01-10' where title='DEADLINE'",
      `update bt.tasks set recurrence='{"interval":1,"unit":"MONTH","from":"SCHEDULED"}' where deadline_on is not null`,
      "update bt.tasks set scheduled_on=null where title='DEADLINE'",
    ])
      await assert.rejects(pool.query(sql), { code: '23514' });
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
