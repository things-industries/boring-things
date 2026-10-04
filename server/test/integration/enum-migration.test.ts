import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as database from '../../src/db/connection.js';

// The fixture starts with the released lowercase representation, including nested private values.
test('enum and chat migrations preserve values, receipts, defaults and in-flight uniqueness', async () => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  );
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const databaseName = 'bt_test_' + randomUUID().replaceAll('-', '');
  const admin = database.createPool(url.toString());
  url.pathname = '/' + databaseName;
  const pool = database.createPool(url.toString());
  try {
    await admin.query(`create database ${databaseName}`);
    const directory = new URL('../../../supabase/migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files.filter((file) => file < '20260930000000_domain_enums.sql'))
      await pool.query(await readFile(new URL(file, directory), 'utf8'));
    const owner = randomUUID(),
      thing = randomUUID(),
      conversation = randomUUID(),
      attachment = randomUUID(),
      importId = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      owner,
      'migration-fixture',
    ]);
    await pool.query(
      "insert into bt.categories(id,name,description,icon,sort_order) values('other','Other','','',0)",
    );
    await pool.query(
      "insert into bt.field_definitions(id,name,description,schema,ui_hint) values('test','Test','',$1,'text')",
      [JSON.stringify({ type: 'string', enum: ['user', 'import'] })],
    );
    const entry = { value: 'user', origin: 'user', sourceRefs: [{ quote: 'import' }] };
    const custom = {
      id: randomUUID(),
      label: 'status',
      value: { origin: 'user', status: 'open' },
      origin: 'import',
      sensitive: true,
      sourceRefs: [],
    };
    const data = {
      setIds: [],
      values: { set: { field: entry } },
      standalone: { test: entry },
      undefinedFields: [custom],
      pins: [],
      userEdited: ['name'],
    };
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name,data) values($1,$2,'other','user',$3)",
      [thing, owner, JSON.stringify(data)],
    );
    await pool.query(
      "insert into bt.attachments(id,owner_id,filename,media_type,byte_size,storage_key) values($1,$2,'test','text/plain',4,'test')",
      [attachment, owner],
    );
    const extraction = {
      text: 'user',
      candidates: [{ facts: [{ value: 'open', quote: 'import' }] }],
    };
    await pool.query(
      "insert into bt.imports(id,owner_id,attachment_id,target_thing_id,status,extraction) values($1,$2,$3,$4,'mapping',$5)",
      [importId, owner, attachment, thing, JSON.stringify(extraction)],
    );
    await pool.query('insert into bt.conversations(id,owner_id,thing_id) values($1,$2,$3)', [
      conversation,
      owner,
      thing,
    ]);
    const card = { type: 'thing', thingId: thing };
    const receipt = {
      key: 'create_event',
      card,
      result: { id: randomUUID(), thingId: thing, description: 'user' },
    };
    await pool.query(
      "insert into bt.messages(conversation_id,request_id,role,text,status,intent,cards,tool_results) values($1,$2,'assistant','user','processing','create_event',$3,$4)",
      [conversation, randomUUID(), JSON.stringify([card]), JSON.stringify([receipt])],
    );
    await pool.query(await readFile(new URL('20260930000000_domain_enums.sql', directory), 'utf8'));
    const migrated = (await pool.query('select name,data from bt.things where id=$1', [thing]))
      .rows[0];
    assert.equal(migrated.name, 'user');
    assert.deepEqual(migrated.data.values.set.field, { ...entry, origin: 'USER' });
    assert.deepEqual(migrated.data.standalone.test, { ...entry, origin: 'USER' });
    assert.deepEqual(migrated.data.undefinedFields, [{ ...custom, origin: 'IMPORT' }]);
    const job = (
      await pool.query('select status,extraction from bt.imports where id=$1', [importId])
    ).rows[0];
    assert.equal(job.status, 'MAPPING');
    assert.deepEqual(job.extraction, extraction);
    const message = (
      await pool.query(
        'select role,status,intent,text,cards,tool_results from bt.messages where conversation_id=$1',
        [conversation],
      )
    ).rows[0];
    assert.deepEqual(message, {
      role: 'ASSISTANT',
      status: 'PROCESSING',
      intent: 'CREATE_EVENT',
      text: 'user',
      cards: [{ ...card, type: 'THING' }],
      tool_results: [{ ...receipt, card: { ...card, type: 'THING' } }],
    });
    const field = (
      await pool.query("select ui_hint,schema from bt.field_definitions where id='test'")
    ).rows[0];
    assert.equal(field.ui_hint, 'TEXT');
    assert.deepEqual(field.schema, { type: 'string', enum: ['user', 'import'] });
    await assert.rejects(
      pool.query(
        "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'ASSISTANT','','QUEUED')",
        [conversation, randomUUID()],
      ),
      { code: '23505' },
    );
    const event = (
      await pool.query(
        "insert into bt.events(owner_id,thing_id,title) values($1,$2,'New') returning status",
        [owner, thing],
      )
    ).rows[0];
    assert.equal(event.status, 'SUGGESTED');
    await assert.rejects(
      pool.query(
        "insert into bt.events(owner_id,thing_id,title,status) values($1,$2,'New','SCHEDULED')",
        [owner, thing],
      ),
      { code: '23514' },
    );
    for (const file of files.filter((file) => file > '20260930000000_domain_enums.sql'))
      await pool.query(await readFile(new URL(file, directory), 'utf8'));
    const messages = (
      await pool.query('select * from bt.messages where conversation_id=$1', [conversation])
    ).rows;
    assert.equal(messages.length, 1);
    const current = messages[0];
    assert.equal(Object.hasOwn(current, 'intent'), false);
    for (const key of ['role', 'status', 'text', 'cards', 'tool_results'] as const)
      assert.deepEqual(current[key], message[key]);
    await pool.query(
      "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'USER','Add a task','COMPLETE')",
      [conversation, randomUUID()],
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  }
});
