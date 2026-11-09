/** Checks scope migration without changing stored field values, citations or owner permissions. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import * as database from '../../src/db/connection.js';
import * as thingFieldsDb from '../../src/db/entities/thing-fields.js';
import type { FieldDefinition } from '../../../shared/model.js';

const migration = '20261102091734_field_scope_and_identifier.sql';

test('scope migration converts registry and custom metadata and keeps field data', async () => {
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
    const definitions = [
      ['provider', false, 'GROUP', 'GROUP', true],
      ['model', false, 'CLASS', 'CLASS', true],
      ['capacity', false, 'NONE', 'CLASS', false],
      ['serial', true, 'INSTANCE', 'INSTANCE', true],
      ['price', true, 'NONE', 'INSTANCE', false],
      ['subscriptions.domainName', true, 'CLASS', 'INSTANCE', true],
      ['vehicles.registrationCountry', true, 'GROUP', 'INSTANCE', true],
      ['appliances.fdNumber', true, 'GROUP', 'INSTANCE', true],
    ] as const;
    for (const [id, instanceSpecific, kind] of definitions)
      await pool.query(
        `insert into bt.field_definitions(id,name,description,schema,ui_hint,sensitive,instance_specific,identifier_kind)
        values($1,$1,'','{"type":"string"}','TEXT',true,$2,$3)
        on conflict(id) do update set instance_specific=excluded.instance_specific,identifier_kind=excluded.identifier_kind,sensitive=true`,
        [id, instanceSpecific, kind],
      );
    const owner = randomUUID(),
      thing = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      owner,
      'scope-upgrade',
    ]);
    await pool.query(
      "insert into bt.categories(id,name,description,icon,sort_order) values('test','Test','','',0)",
    );
    await pool.query(
      "insert into bt.things(id,owner_id,category_id,name) values($1,$2,'test','Test')",
      [thing, owner],
    );
    const sourceRefs = [{ url: 'https://example.com/spec', quote: 'Value 0012' }];
    for (const [id, flag] of [
      ['public', false],
      ['private', true],
      ['unclassified', null],
    ] as const) {
      const definition = {
        id: randomUUID(),
        label: id,
        sensitive: true,
        ...(flag === null ? {} : { instanceSpecific: flag }),
      };
      await pool.query(
        `insert into bt.thing_fields(thing_id,owner_id,field_key,value,auto_populate,origin,source_refs,custom_definition)
        values($1,$2,$3,'"0012"',false,'USER',$4,$5)`,
        [
          thing,
          owner,
          'local:' + definition.id,
          JSON.stringify(sourceRefs),
          JSON.stringify(definition),
        ],
      );
    }
    await pool.query(
      `insert into bt.thing_fields(thing_id,owner_id,field_key,field_id,value,auto_populate,origin,source_refs)
      values($1,$2,':serial','serial','"0012"',false,'USER',$3)`,
      [thing, owner, JSON.stringify(sourceRefs)],
    );
    const before = (await pool.query('select * from bt.thing_fields order by field_key')).rows;
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const fields = await database.rows<
      Pick<FieldDefinition, 'id' | 'scope' | 'isIdentifier' | 'sensitive'>
    >(pool, 'select id,scope,is_identifier,sensitive from bt.field_definitions');
    for (const [id, , , scope, isIdentifier] of definitions)
      assert.deepEqual(
        fields.find((field) => field.id === id),
        { id, scope, isIdentifier, sensitive: true },
      );
    const after = (await pool.query('select * from bt.thing_fields order by field_key')).rows;
    for (let index = 0; index < before.length; index++) {
      const { custom_definition: oldDefinition, ...original } = before[index];
      const { custom_definition: definition, ...current } = after[index];
      assert.deepEqual(current, original);
      if (oldDefinition) {
        const { instanceSpecific, ...metadata } = oldDefinition;
        assert.deepEqual(definition, {
          ...metadata,
          scope: instanceSpecific === false ? 'CLASS' : 'INSTANCE',
        });
      }
    }
    assert.deepEqual(await thingFieldsDb.identifiers(pool, owner, 'test'), [
      { thingId: thing, fieldId: 'serial', value: '0012' },
    ]);
    await pool.query(`insert into bt.field_definitions(id,name,description,schema,ui_hint)
      values('new','New','','{"type":"string"}','TEXT')`);
    assert.deepEqual(
      (await pool.query("select scope,is_identifier from bt.field_definitions where id='new'"))
        .rows,
      [{ scope: 'INSTANCE', is_identifier: false }],
    );
    await assert.rejects(
      pool.query("update bt.field_definitions set scope='PUBLIC' where id='new'"),
      /check constraint/,
    );
    await assert.rejects(
      pool.query(
        "update bt.thing_fields set custom_definition=jsonb_set(custom_definition,'{scope}','\"PUBLIC\"') where custom_definition is not null",
      ),
      /check constraint/,
    );
    const columns = (
      await pool.query(
        "select column_name from information_schema.columns where table_schema='bt' and table_name='field_definitions'",
      )
    ).rows;
    assert.ok(
      !columns.some(({ column_name }) =>
        ['instance_specific', 'identifier_kind'].includes(column_name),
      ),
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
