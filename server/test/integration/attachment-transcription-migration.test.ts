// Verifies that Attachment transcription migration retains readable legacy Import content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

const migration = '20261008100000_attachment_transcription.sql';

test('attachment migration keeps the latest readable extraction over an empty retry', async () => {
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
      "insert into bt.users(auth_subject) values('legacy') returning id",
    );
    const [{ id: attachmentId }] = await database.rows<{ id: string }>(
      pool,
      "insert into bt.attachments(owner_id,filename,media_type,byte_size,storage_key) values($1,'source.txt','text/plain',6,'legacy-key') returning id",
      [ownerId],
    );
    for (const text of ['[PDF page 1] Original source', ''])
      await pool.query(
        "insert into bt.imports(owner_id,attachment_id,status,extraction) values($1,$2,'COMPLETE',$3)",
        [ownerId, attachmentId, JSON.stringify({ text, candidates: [] })],
      );
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const [source] = await database.rows<{
      transcription: string;
      transcriptionStatus: string;
      transcriptionSummary: string | null;
    }>(
      pool,
      'select transcription,transcription_status,transcription_summary from bt.attachments where id=$1',
      [attachmentId],
    );
    assert.equal(source.transcription, '[PDF page 1] Original source');
    assert.equal(source.transcriptionStatus, 'COMPLETE');
    assert.equal(source.transcriptionSummary, null);
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
