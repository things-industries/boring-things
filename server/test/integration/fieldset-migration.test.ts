import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { emptyData, type ThingData, type StoredValue } from '../../../shared/model.js';
import * as database from '../../src/db/connection.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';
import { Registry } from '../../src/application/registry/registry.js';
import { patchData, projectData, revealValue } from '../../src/application/thing-data.js';

const migration = '20260930040000_expanded_fieldsets.sql';
const stored = (value: StoredValue['value']): StoredValue => ({
  value,
  origin: 'IMPORT',
  sourceRefs: [{ quote: 'Synthetic source evidence', url: 'https://example.com/source' }],
});

test('fieldset migration preserves scoped values, clears, secrets, conflicts and standalone values', async () => {
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
    for (const file of (await readdir(directory))
      .filter((f) => f.endsWith('.sql') && f < migration)
      .sort())
      await pool.query(await readFile(new URL(file, directory), 'utf8'));
    const owner = randomUUID();
    await pool.query('insert into bt.users(id,auth_subject) values($1,$2)', [
      owner,
      'fieldset-fixture',
    ]);
    for (const id of ['appliances', 'vehicles', 'memberships', 'insurance', 'other'])
      await pool.query(
        "insert into bt.categories(id,name,description,icon,sort_order) values($1,$1,'','',0)",
        [id],
      );
    for (const [id, name, sensitive] of [
      ['appliances.purchaseDate', 'Purchase date', false],
      ['appliances.warrantyEnd', 'Warranty end', false],
      ['appliances.retailer', 'Retailer', false],
      ['insurance.renewalDate', 'Renewal date', false],
      ['membership.accessPin', 'Access PIN', true],
    ] as const)
      await pool.query(
        "insert into bt.field_definitions(id,name,description,schema,ui_hint,sensitive) values($1,$2,'',$3,'TEXT',$4)",
        [id, name, JSON.stringify({ type: 'string' }), sensitive],
      );
    const ids = new Map<string, string>();
    async function add(name: string, category: string, data: Partial<ThingData>) {
      const id = randomUUID();
      ids.set(name, id);
      await pool.query(
        'insert into bt.things(id,owner_id,category_id,name,data) values($1,$2,$3,$4,$5)',
        [id, owner, category, name, JSON.stringify({ ...emptyData(), ...data })],
      );
    }
    await add('appliance', 'appliances', {
      setIds: ['appliances.appliance', 'appliances.bosch'],
      values: {
        'appliances.appliance': {
          'appliances.purchaseDate': stored('2022-03-12'),
          'appliances.retailer': stored(''),
        },
        'appliances.bosch': { 'appliances.zNumber': stored('007') },
      },
      pins: [
        { fieldSetId: 'appliances.appliance', fieldId: 'appliances.purchaseDate' },
        { fieldSetId: 'appliances.appliance', fieldId: 'appliances.warrantyEnd' },
      ],
      userEdited: [
        'appliances.appliance:appliances.purchaseDate',
        'appliances.appliance:appliances.warrantyEnd',
        'pins',
      ],
      standalone: {
        'appliances.purchaseDate': stored('2020-01-01'),
        'insurance.renewalDate': stored('2030-01-01'),
      },
    });
    await add('vehicle', 'vehicles', {
      setIds: ['vehicles.vehicle', 'vehicles.van'],
      values: {
        'vehicles.vehicle': {
          'vehicles.registration': stored('EXAMPLE-01'),
          'vehicles.vin': stored('000001'),
          'vehicles.firstRegistered': stored('2021-01-01'),
        },
        'vehicles.van': { 'vehicles.payloadKg': stored(0) },
      },
      pins: [{ fieldSetId: 'vehicles.vehicle', fieldId: 'vehicles.vin' }],
    });
    await add('museum', 'memberships', {
      setIds: ['memberships.museum'],
      values: {
        'memberships.museum': {
          'membership.provider': stored('Example Museum'),
          'membership.number': stored('00042'),
          'membership.level': stored('Family'),
          'membership.autoRenew': stored(false),
          'membership.accessPin': stored('7856'),
        },
      },
      pins: [{ fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin' }],
      userEdited: [
        'memberships.museum:membership.accessPin',
        'memberships.museum:membership.expires',
      ],
    });
    await add('insurance', 'insurance', {
      setIds: [
        'insurance.policy',
        'insurance.buildings',
        'insurance.contents',
        'insurance.combined',
      ],
      values: {
        'insurance.policy': { 'insurance.renewalDate': stored('2027-04-01') },
        'insurance.buildings': {
          'insurance.sumInsured': stored({ amountMinor: 50000000, currency: 'GBP' }),
        },
        'insurance.contents': {
          'insurance.sumInsured': stored({ amountMinor: 6000000, currency: 'GBP' }),
        },
      },
      pins: [{ fieldSetId: 'insurance.policy', fieldId: 'insurance.renewalDate' }],
      userEdited: ['insurance.policy:insurance.renewalDate'],
    });
    await add('conflict', 'appliances', {
      setIds: ['appliances.appliance', 'appliances.ownership', 'appliances.warranty'],
      values: {
        'appliances.appliance': {
          'appliances.purchaseDate': stored('2020-01-01'),
          'appliances.retailer': stored('Original'),
          'appliances.warrantyEnd': stored('2028-01-01'),
        },
        'appliances.ownership': { 'common.acquiredOn': stored('2021-01-01') },
      },
      standalone: {
        'appliances.purchaseDate': stored('2019-01-01'),
        'common.acquiredOn': stored('2018-01-01'),
      },
      pins: [{ fieldSetId: 'appliances.appliance', fieldId: 'appliances.retailer' }],
      userEdited: ['appliances.ownership:common.seller', 'appliances.warranty:common.warrantyEnds'],
    });
    await add('removed', 'memberships', {
      setIds: ['memberships.museum'],
      values: { 'memberships.museum': { 'membership.accessPin': stored('0987') } },
      pins: [{ fieldSetId: 'memberships.museum', fieldId: 'membership.accessPin' }],
      userEdited: ['set:memberships.access'],
    });
    await add('empty', 'memberships', { setIds: ['memberships.museum'] });
    await add('untouched', 'other', {});
    const sql = await readFile(new URL(migration, directory), 'utf8');
    await pool.query(sql);
    const registry = new Registry(registrySeedDb.fields, registrySeedDb.sets);
    async function get(name: string) {
      const row = (
        await pool.query<{ data: ThingData; revision: string }>(
          'select data,revision from bt.things where id=$1',
          [ids.get(name)],
        )
      ).rows[0];
      assert.doesNotThrow(() => projectData(row.data, registry));
      assert.doesNotThrow(() =>
        patchData(
          row.data,
          {},
          name === 'vehicle'
            ? 'vehicles'
            : name === 'insurance'
              ? 'insurance'
              : ['museum', 'removed', 'empty'].includes(name)
                ? 'memberships'
                : name === 'untouched'
                  ? 'other'
                  : 'appliances',
          registry,
        ),
      );
      for (const setId of row.data.setIds) {
        for (const [fieldId, value] of Object.entries(row.data.values[setId] ?? {})) {
          assert.ok(registry.sets.get(setId)!.fields.some((f) => f.id === fieldId));
          registry.validate(fieldId, value.value);
        }
      }
      return row;
    }
    const appliance = (await get('appliance')).data;
    assert.deepEqual(
      appliance.values['appliances.ownership']['common.acquiredOn'],
      stored('2022-03-12'),
    );
    assert.deepEqual(appliance.values['appliances.ownership']['common.seller'], stored(''));
    assert.equal(appliance.values['appliances.warranty']['common.warrantyEnds'], undefined);
    assert.ok(appliance.userEdited!.includes('appliances.warranty:common.warrantyEnds'));
    assert.deepEqual(appliance.standalone['common.acquiredOn'], stored('2020-01-01'));
    assert.equal(appliance.undefinedFields[0].value, '2030-01-01');
    assert.deepEqual(appliance.pins, [
      { fieldSetId: 'appliances.ownership', fieldId: 'common.acquiredOn' },
      { fieldSetId: 'appliances.warranty', fieldId: 'common.warrantyEnds' },
    ]);
    const vehicle = (await get('vehicle')).data;
    assert.deepEqual(
      vehicle.values['vehicles.registration']['vehicles.registration'],
      stored('EXAMPLE-01'),
    );
    assert.deepEqual(
      vehicle.values['vehicles.registration']['vehicles.firstRegistered'],
      stored('2021-01-01'),
    );
    assert.deepEqual(vehicle.values['vehicles.vin']['vehicles.vin'], stored('000001'));
    assert.equal(vehicle.values['vehicles.van']['vehicles.payloadKg'].value, 0);
    assert.ok(vehicle.setIds.includes('vehicles.roadMotor'));
    const museum = (await get('museum')).data;
    assert.equal(museum.values['memberships.membership']['membership.autoRenew'].value, false);
    assert.ok(museum.userEdited!.includes('memberships.membership:membership.expires'));
    assert.deepEqual(
      museum.values['memberships.account']['membership.provider'],
      stored('Example Museum'),
    );
    assert.equal(
      revealValue(
        museum,
        { fieldSetId: 'memberships.access', fieldId: 'membership.accessPin' },
        registry,
      ),
      '7856',
    );
    assert.ok(!JSON.stringify(projectData(museum, registry)).includes('7856'));
    assert.deepEqual(museum.pins, [
      { fieldSetId: 'memberships.access', fieldId: 'membership.accessPin' },
    ]);
    const insurance = (await get('insurance')).data;
    assert.deepEqual(
      insurance.values['insurance.buildings']['insurance.sumInsured'],
      stored({ amountMinor: 50000000, currency: 'GBP' }),
    );
    assert.deepEqual(
      insurance.values['insurance.contents']['insurance.sumInsured'],
      stored({ amountMinor: 6000000, currency: 'GBP' }),
    );
    assert.deepEqual(insurance.undefinedFields[0], {
      ...stored('2027-04-01'),
      id: insurance.undefinedFields[0].id,
      label: 'Renewal date',
      sensitive: false,
    });
    assert.deepEqual(insurance.pins, [{ undefinedFieldId: insurance.undefinedFields[0].id }]);
    assert.ok(insurance.userEdited!.includes('local:' + insurance.undefinedFields[0].id));
    const conflict = (await get('conflict')).data;
    assert.deepEqual(
      conflict.values['appliances.ownership']['common.acquiredOn'],
      stored('2021-01-01'),
    );
    assert.equal(conflict.values['appliances.ownership']['common.seller'], undefined);
    assert.equal(conflict.values['appliances.warranty']?.['common.warrantyEnds'], undefined);
    assert.deepEqual(conflict.standalone['common.acquiredOn'], stored('2018-01-01'));
    assert.deepEqual(conflict.undefinedFields.map((f) => f.value).sort(), [
      '2019-01-01',
      '2020-01-01',
      '2028-01-01',
      'Original',
    ]);
    assert.ok(conflict.pins[0].undefinedFieldId);
    for (const f of conflict.undefinedFields) assert.deepEqual(f.sourceRefs, stored('').sourceRefs);
    const removed = (await get('removed')).data;
    assert.ok(!removed.setIds.includes('memberships.access'));
    assert.equal(removed.undefinedFields[0].sensitive, true);
    assert.equal(removed.undefinedFields[0].value, '0987');
    assert.ok(!JSON.stringify(projectData(removed, registry)).includes('0987'));
    const empty = (await get('empty')).data;
    assert.deepEqual(
      new Set(empty.setIds),
      new Set(['memberships.museum', 'memberships.membership', 'memberships.account']),
    );
    assert.equal((await get('untouched')).revision, '1');
    const snapshot = async () => ({
      fields: (await pool.query('select * from bt.field_definitions order by id')).rows,
      sets: (await pool.query('select * from bt.field_sets order by id')).rows,
      things: (await pool.query('select * from bt.things order by id')).rows,
    });
    const migrated = await snapshot();
    assert.equal(migrated.fields.length, 413);
    assert.equal(migrated.sets.length, 165);
    await database.transaction(pool, registrySeedDb.seedRegistry);
    assert.deepEqual(
      await snapshot(),
      migrated,
      'Seed must match the SQL catalogue and preserve owned data',
    );
    await pool.query(sql);
    assert.deepEqual(
      await snapshot(),
      migrated,
      'Migration must not duplicate values or increment revisions again',
    );
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  }
});
