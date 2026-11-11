/** Migration of historical followup timestamps and conversation links. */

import { getEnv } from '../../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

const migration = '20261110161827_chat_followups.sql';

test('chat followup migration keeps timestamps and links historical chats', async () => {
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
    const owner = randomUUID(),
      thing = randomUUID(),
      chatTask = randomUUID(),
      fieldTask = randomUUID(),
      conversation = randomUUID();
    const completedAt = '2026-01-02T10:00:00Z';
    await pool.query("insert into bt.users(id,auth_subject) values($1,'followup-migration')", [
      owner,
    ]);
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name) values($1,$2,'other','Example kettle')",
      [thing, owner],
    );
    for (const [id, action] of [
      [chatTask, { type: 'CHAT', label: 'Discuss' }],
      [fieldTask, { type: 'UPDATE_FIELD', label: 'Update', fieldId: 'common.pricePaid' }],
    ])
      await pool.query(
        `insert into bt.tasks(id,owner_id,thing_id,title,status,completed_at,closed_at,completed_followup)
         values($1,$2,$3,'Completed work','CLOSED',$4,$4,$5)`,
        [id, owner, thing, completedAt, JSON.stringify({ action, completedAt })],
      );
    await pool.query(
      `insert into bt.conversations(id,owner_id,thing_id,activity_context,created_at) values($1,$2,$3,$4,'2026-01-02T09:59:59Z')`,
      [
        conversation,
        owner,
        thing,
        JSON.stringify({
          item: {
            id: chatTask,
            completedAt,
            completionActions: [{ type: 'CHAT', label: 'Discuss' }],
          },
          issue: null,
        }),
      ],
    );
    await pool.query(
      "insert into bt.events(owner_id,thing_id,title,starts_on,completion_actions) values($1,$2,'Visit','2026-01-01','[]')",
      [owner, thing],
    );
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const tasks = await database.rows<{
      id: string;
      completedFollowup: { conversationId: string | null; completedAt: string };
    }>(pool, 'select id,completed_followup from bt.tasks');
    assert.deepEqual(tasks.find((task) => task.id === chatTask)?.completedFollowup, {
      conversationId: conversation,
      completedAt,
    });
    assert.deepEqual(tasks.find((task) => task.id === fieldTask)?.completedFollowup, {
      conversationId: null,
      completedAt,
    });
    const [context] = await database.rows<{
      activityContext: { followup: boolean; item: { id: string } };
    }>(pool, 'select activity_context from bt.conversations where id=$1', [conversation]);
    assert.deepEqual(context.activityContext, {
      item: { id: chatTask, completedAt },
      issue: null,
      followup: true,
    });
    const [event] = await database.rows<{ status: string; completedFollowup: unknown }>(
      pool,
      'select status,completed_followup from bt.events',
    );
    assert.equal(event.status, 'SCHEDULED');
    assert.equal(event.completedFollowup, null);
    await assert.rejects(pool.query('select completion_actions from bt.tasks'), { code: '42703' });
    await assert.rejects(pool.query('select completion_actions from bt.events'), { code: '42703' });
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
