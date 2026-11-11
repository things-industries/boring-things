/** Checks registration-month migration keeps provenance, field addresses and owner decisions. */

import { getEnv } from '../../src/config.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import * as database from '../../src/db/connection.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { Registry } from '../../src/application/registry/registry.js';

const migration = '20261110133000_vehicle_registration_month.sql';

test('registration migration converts full dates to months and keeps field metadata', async () => {
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
    await database.transaction(pool, registrySeedDb.seedRegistry);
    await pool.query(
      `update bt.field_definitions set schema='{"type":"string","format":"date"}',ui_hint='DATE' where id='vehicles.firstRegistered'`,
    );
    const owner = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      owner,
      'registration-upgrade',
    ]);
    for (const [index, value] of ['2020-02-29', '2021-06', null].entries()) {
      const thing = randomUUID();
      const setId = index === 0 ? 'vehicles.registration' : null;
      const pin = { fieldSetId: setId, fieldId: 'vehicles.firstRegistered' };
      await pool.query(
        "insert into bt.things(id,owner_id,category_id,name,data) values($1,$2,'vehicles','Test vehicle',$3)",
        [
          thing,
          owner,
          JSON.stringify({ setIds: ['vehicles.vehicle', 'vehicles.registration'], pins: [pin] }),
        ],
      );
      await pool.query(
        `insert into bt.thing_fields(thing_id,owner_id,field_key,field_id,field_set_id,value,origin,auto_populate,source_refs)
        values($1,$2,$3,'vehicles.firstRegistered',$4,$5,'USER',false,$6)`,
        [
          thing,
          owner,
          `${setId ?? ''}:vehicles.firstRegistered`,
          setId,
          JSON.stringify(value),
          JSON.stringify([
            {
              url: 'https://example.com/registration',
              quote: 'First registered',
              provider: 'TEST',
              retrievedAt: '2030-01-01T00:00:00Z',
            },
          ]),
        ],
      );
    }
    const before = (await pool.query('select * from bt.thing_fields order by id')).rows;
    const thingsBefore = (await pool.query('select * from bt.things order by id')).rows;
    await pool.query(await readFile(new URL(migration, directory), 'utf8'));
    const after = (await pool.query('select * from bt.thing_fields order by id')).rows;
    assert.deepEqual(
      after,
      before.map((row) => ({ ...row, value: row.value === '2020-02-29' ? '2020-02' : row.value })),
    );
    assert.deepEqual((await pool.query('select * from bt.things order by id')).rows, thingsBefore);
    const definition = (
      await pool.query(
        "select schema,ui_hint from bt.field_definitions where id='vehicles.firstRegistered'",
      )
    ).rows[0];
    assert.deepEqual(definition, {
      schema: registrySeedDb.fields.find((field) => field.id === 'vehicles.firstRegistered')
        ?.schema,
      ui_hint: 'TEXT',
    });
    const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);
    for (const row of after)
      if (row.value !== null) registry.validate('vehicles.firstRegistered', row.value);
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
