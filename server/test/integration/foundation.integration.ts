/** Exercises authenticated API persistence, user isolation and import flows with fixture providers. */

import { getEnv, setEnvMode, setEnvValue } from '../../src/config.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { activeStatuses } from '../../src/application/import/types.js';
import type { FastifyInstance, InjectOptions } from 'fastify';
import spec from '../../../openapi.json' with { type: 'json' };
import type { Schema } from '../../../shared/model.js';
import { buildApp } from '../../src/app.js';
import { FixtureAi } from '../fixtures/imports.js';
import { FixtureChat } from '../fixtures/chat.js';
import { loadRegistry } from '../../src/application/registry/index.js';
import * as database from '../../src/db/connection.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';

setEnvMode('test');

const url = new URL(getEnv('TEST_DATABASE_URL'));
assert.ok(
  ['localhost', '127.0.0.1'].includes(url.hostname),
  'Integration tests require a local database',
);
const databaseName = 'bt_test_' + randomUUID().replaceAll('-', '');
const admin = database.createPool(url.toString());
url.pathname = '/' + databaseName;
const pool = database.createPool(url.toString());
let app: FastifyInstance;
let importAi: FixtureAi;
const chatAi = new FixtureChat();
let directory: string;
const verifyIdentity = async (token: string) => {
  if (!['alice', 'bob'].includes(token)) throw new Error('bad token');
  return { subject: token };
};
const request = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: object,
  userSubject = 'alice',
) =>
  app.inject({
    method,
    url: '/api' + path,
    payload: body,
    headers: { authorization: 'Bearer ' + userSubject },
  });
async function create(input: Partial<Schema['ThingCreate']> = {}, userSubject = 'alice') {
  const res = await request(
    'POST',
    '/things',
    { name: 'Test thing', categoryId: 'other', ...input },
    userSubject,
  );
  assert.equal(res.statusCode, 201, res.body);
  return res.json<Schema['Thing']>();
}
before(async () => {
  directory = await mkdtemp(tmpdir() + '/boring-test-');
  await admin.query(`create database ${databaseName}`);
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(await readFile(new URL(file, migrations), 'utf8'));
  }
  await database.transaction(pool, registrySeedDb.seedRegistry);
  importAi = new FixtureAi({ db: pool, registry: await loadRegistry(pool) });
  setEnvValue('BLOB_DIRECTORY', directory);
  setEnvValue('ENABLE_SAMPLE_DATA', true);
  setEnvValue('MAX_UPLOAD_BYTES', 64);
  app = await buildApp({
    dbPool: pool,
    importAi,
    chatAi,
    verifyIdentity,
  });
  await app.ready();
});
after(async () => {
  await app?.close();
  await pool.end();
  await admin.query(`drop database if exists ${databaseName} with (force)`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test('all private routes require authentication and unknown tokens fail', async () => {
  for (const [path, operations] of Object.entries(spec.paths)) {
    if (path === '/api/config') continue;
    for (const method of Object.keys(operations)) {
      const url = path.replace(/\{\w+\}/g, '00000000-0000-4000-8000-000000000001');
      for (const headers of [{}, { authorization: 'Bearer bad' }]) {
        const response = await app.inject({
          method: method.toUpperCase() as InjectOptions['method'],
          url,
          headers,
        });
        assert.equal(response.statusCode, 401, `${method} ${path}: ${response.body}`);
        assert.equal(response.headers['cache-control'], 'private, no-store');
      }
    }
  }
  assert.equal((await app.inject('/api/config')).statusCode, 200);
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.equal((await app.inject('/api/documentation/')).statusCode, 200);
  assert.equal((await app.inject('/api/documentation/json')).statusCode, 200);
  const profile = await request('GET', '/profile');
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.headers['cache-control'], 'private, no-store');
});
test('reseeding replaces category glyphs and preserves appliance details', async () => {
  const values = [
    { fieldSetId: 'appliances.ownership', fieldId: 'common.acquiredOn', value: '2022-03-12' },
    { fieldSetId: 'appliances.warranty', fieldId: 'common.warrantyEnds', value: '2027-03-12' },
    { fieldSetId: 'appliances.ownership', fieldId: 'common.seller', value: 'Example retailer' },
  ];
  const thing = await create({
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.appliance', 'appliances.ownership', 'appliances.warranty'],
    values,
    pinnedFields: [{ fieldSetId: 'appliances.ownership', fieldId: 'common.acquiredOn' }],
  });
  const categoryIcons = {
    appliances: 'appliance',
    devices: 'device',
    vehicles: 'vehicle',
    memberships: 'membership',
    subscriptions: 'subscription',
    utilities: 'utility',
    insurance: 'insurance',
    household: 'household',
    other: 'other',
  };
  await pool.query("update bt.categories set icon='○'");
  for (let pass = 0; pass < 2; pass++) {
    await database.transaction(pool, registrySeedDb.seedRegistry);
    const response = await request('GET', '/categories');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(
      Object.fromEntries(
        response.json<Schema['CategoryList']>().items.map(({ id, icon }) => [id, icon]),
      ),
      categoryIcons,
    );
    const saved = await request('GET', `/things/${thing.id}`);
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json<Schema['Thing']>(), thing);
  }
  const saved = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  for (const value of values) {
    const field = saved.fieldSets
      .find((set) => set.id === value.fieldSetId)!
      .fields.find((field) => field.id === value.fieldId)!;
    assert.equal(field.value, value.value);
    assert.ok(field.icon);
    const definition = (await request('GET', `/fields/${value.fieldId}`)).json();
    assert.equal(definition.icon, field.icon);
  }
  assert.deepEqual(saved.pinnedFields, thing.pinnedFields);
  const invalid = await request('PATCH', `/things/${thing.id}`, {
    values: [{ ...values[0], value: '2022-02-30' }],
  });
  assert.equal(invalid.statusCode, 422, invalid.body);
  assert.equal((await request('GET', `/things/${thing.id}`, undefined, 'bob')).statusCode, 404);
});

test('Household basics, shared meter access and energy performance persist independently', async () => {
  const address = { fieldSetId: 'household.household', fieldId: 'household.address' };
  const access = 'household.installationAccess';
  const home = await create({
    name: 'Test studio',
    categoryId: 'household',
    addFieldSetIds: [
      'household.waterInstallation',
      'household.electricalInstallation',
      'household.energyPerformance',
    ],
    values: [
      { ...address, value: 'Flat 2, 1 Example Street' },
      {
        fieldSetId: 'household.household',
        fieldId: 'household.occupancyArrangement',
        value: 'Rented',
      },
      { fieldSetId: 'household.household', fieldId: 'household.bedrooms', value: 0 },
      {
        fieldSetId: 'household.waterInstallation',
        fieldId: 'household.stopcockLocation',
        value: 'Under the sink',
      },
      { fieldSetId: 'household.waterInstallation', fieldId: access, value: 'Ask the caretaker' },
      {
        fieldSetId: 'household.electricalInstallation',
        fieldId: access,
        value: 'Communal cupboard',
      },
      { fieldSetId: 'household.energyPerformance', fieldId: 'household.energyRating', value: 'C' },
    ],
  });
  const saved = await request('GET', `/things/${home.id}`);
  assert.equal(saved.statusCode, 200, saved.body);
  const detail = saved.json<Schema['Thing']>();
  const sets = new Map(detail.fieldSets.map((set) => [set.id, set.fields]));
  const find = (set: string, id: string) => sets.get(set)?.find((field) => field.id === id);
  assert.equal(find(address.fieldSetId, address.fieldId)?.masked, false);
  assert.equal(find(address.fieldSetId, address.fieldId)?.value, 'Flat 2, 1 Example Street');
  assert.equal(find('household.household', 'household.bedrooms')?.value, 0);
  assert.equal(
    find('household.waterInstallation', 'household.stopcockLocation')?.value,
    'Under the sink',
  );
  assert.equal(find('household.waterInstallation', 'household.waterMeterLocation')?.value, null);
  assert.equal(find('household.waterInstallation', access)?.value, 'Ask the caretaker');
  assert.equal(find('household.electricalInstallation', access)?.value, 'Communal cupboard');
  assert.equal(find('household.energyPerformance', 'household.energyRating')?.value, 'C');
  assert.ok(!sets.has('household.gasInstallation'));
  assert.ok(!sets.has('household.building'));
});

test('country fields accept ISO codes and reject names and unassigned codes', async () => {
  for (const [categoryId, fieldSetId, fieldId] of [
    ['household', 'household.household', 'household.country'],
    ['vehicles', 'vehicles.vehicle', 'vehicles.registrationCountry'],
  ]) {
    const thing = await create({ categoryId });
    const write = (value: string) =>
      request('PATCH', '/things/' + thing.id, { values: [{ fieldSetId, fieldId, value }] });
    for (const value of ['United Kingdom', 'gb', 'ZZ']) {
      const result = await write(value);
      assert.equal(result.statusCode, 422, result.body);
    }
    const result = await write('GB');
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(
      result
        .json<Schema['Thing']>()
        .fieldSets.find(({ id }) => id === fieldSetId)
        ?.fields.find(({ id }) => id === fieldId)?.value,
      'GB',
    );
  }
});

test('country migration converts known names and keeps source references and other values', async () => {
  const home = await create({ categoryId: 'household' });
  const sourceRefs = [{ quote: 'Great Britain' }];
  const before = (
    await pool.query(
      `insert into bt.thing_fields(thing_id, user_id, field_key, field_id, value, origin, source_refs)
      select t.id, t.user_id, ':' || input.field_id, input.field_id, to_jsonb(input.value), 'USER', $2
      from bt.things t cross join (values
        ('household.country', ' Great Britain '),
        ('vehicles.registrationCountry', 'Unrecognised location'),
        ('common.model', 'Great Britain')
      ) as input(field_id, value) where t.id = $1
      returning *`,
      [home.id, JSON.stringify(sourceRefs)],
    )
  ).rows;
  await pool.query(
    await readFile(
      new URL(
        '../../../supabase/migrations/20261113122520_country_field_codes.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const after = await pool.query('select * from bt.thing_fields where id = any($1::uuid[])', [
    before.map(({ id }) => id),
  ]);
  assert.deepEqual(
    new Map(after.rows.map((row) => [row.id, row])),
    new Map(
      before.map((row) => [
        row.id,
        row.field_id === 'household.country' ? { ...row, value: 'GB' } : row,
      ]),
    ),
  );
});

test('appliance field migration moves values and keeps ambiguous values and pins', async () => {
  const service = { fieldSetId: 'appliances.maintenance', fieldId: 'common.serviceInterval' };
  const cleaning = {
    fieldSetId: 'appliances.cleaning',
    fieldId: 'appliances.cleaningInstructions',
  };
  const dishwasher = await create({
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.dishwasher'],
  });
  const washerDryer = await create({
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.washing', 'appliances.drying'],
  });

  // Restore the legacy registry and occurrences used by these fixtures.
  await pool.query(`
    insert into bt.field_sets(id,category_id,name,field_ids) values
      ('appliances.maintenance','appliances','Maintenance',array['common.serviceInterval']),
      ('appliances.cleaning','appliances','Cleaning',array['appliances.cleaningInstructions']),
      ('appliances.consumables','appliances','Consumables','{}');
  `);
  const sourceRefs = [{ url: 'https://example.test/manual', quote: 'Clean the drum.' }];
  for (const { thing, address, value } of [
    { thing: dishwasher, address: service, value: 'Every 12 months' },
    { thing: dishwasher, address: cleaning, value: 'Run the machine care programme' },
    { thing: washerDryer, address: cleaning, value: 'Clean the drum' },
  ]) {
    await pool.query('delete from bt.thing_fields where thing_id=$1 and field_id=$2', [
      thing.id,
      address.fieldId,
    ]);
    await pool.query(
      `update bt.things set data=jsonb_set(jsonb_set(data,'{setIds}',(data->'setIds') || $2::jsonb),
        '{pins}',(data->'pins') || $3::jsonb) where id=$1`,
      [thing.id, JSON.stringify([address.fieldSetId]), JSON.stringify([address])],
    );
    await pool.query(
      `insert into bt.thing_fields(thing_id,user_id,field_key,field_id,field_set_id,value,origin,auto_populate,source_refs)
        select id,user_id,$2,$3,$4,$5,'USER',false,$6 from bt.things where id=$1`,
      [
        thing.id,
        `${address.fieldSetId}:${address.fieldId}`,
        address.fieldId,
        address.fieldSetId,
        JSON.stringify(value),
        JSON.stringify(sourceRefs),
      ],
    );
  }
  await pool.query(
    await readFile(
      new URL(
        '../../../supabase/migrations/20261111175657_appliance_subtype_fields.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await database.transaction(pool, registrySeedDb.seedRegistry);
  const read = async (id: string) => {
    const result = await request('GET', '/things/' + id);
    assert.equal(result.statusCode, 200, result.body);
    return result.json<Schema['Thing']>();
  };
  const migrated = await read(dishwasher.id);
  assert.deepEqual(migrated.pinnedFields, [
    { ...service, fieldSetId: 'appliances.appliance' },
    { ...cleaning, fieldSetId: 'appliances.dishwasher' },
  ]);
  const fieldValue = (setId: string, fieldId: string) =>
    migrated.fieldSets.find(({ id }) => id === setId)?.fields.find(({ id }) => id === fieldId);
  assert.equal(fieldValue('appliances.appliance', service.fieldId)?.value, 'Every 12 months');
  assert.deepEqual(fieldValue('appliances.dishwasher', cleaning.fieldId)?.sourceRefs, sourceRefs);
  const ambiguous = await read(washerDryer.id);
  assert.equal(ambiguous.customFields[0].value, 'Clean the drum');
  assert.equal(ambiguous.customFields[0].origin, 'USER');
  assert.deepEqual(ambiguous.pinnedFields, [{ customFieldId: ambiguous.customFields[0].id }]);
  const { rows } = await pool.query(
    'select auto_populate from bt.thing_fields where thing_id = $1 and field_id = $2',
    [dishwasher.id, service.fieldId],
  );
  assert.deepEqual(rows, [{ auto_populate: false }]);
});
test('retired appliance labels discover the shared field definitions', async () => {
  for (const [label, id] of [
    ['Retailer', 'common.seller'],
    ['Purchase date', 'common.acquiredOn'],
    ['Warranty end', 'common.warrantyEnds'],
  ]) {
    const response = await request('GET', '/fields?q=' + encodeURIComponent(label));
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(
      response
        .json<{ items: Schema['FieldDefinition'][] }>()
        .items.some((field) => field.id === id),
    );
  }
});

test('category change moves shared fields and queues research for the same Thing', async () => {
  const thing = await create({
    name: 'Fixture media player',
    categoryId: 'appliances',
    addFieldSetIds: ['appliances.warranty'],
    values: [
      { fieldSetId: 'appliances.appliance', fieldId: 'common.model', value: 'Player A' },
      { fieldSetId: 'appliances.appliance', fieldId: 'common.serialNumber', value: null },
      { fieldSetId: 'appliances.warranty', fieldId: 'common.warrantyEnds', value: '2090-02-28' },
      { fieldSetId: 'appliances.appliance', fieldId: 'appliances.eNumber', value: 'A/01' },
    ],
    pinnedFields: [{ fieldSetId: 'appliances.appliance', fieldId: 'common.model' }],
  });
  const {
    rows: [oldImport],
  } = await pool.query<{ id: string }>(
    "insert into bt.imports(user_id,target_thing_id,status) select user_id,id,'INCOMPLETE' from bt.things where id=$1 returning id",
    [thing.id],
  );
  await pool.query(
    `insert into bt.tasks(user_id,thing_id,title,status,import_key,scheduled_on)
     select user_id,id,title,status,key,scheduled_on::date from bt.things cross join (values
       ('Old suggestion','SUGGESTED','old-suggestion',null),
       ('Accepted task','ACTIVE','accepted-task','2090-02-28')
     ) as fixture(title,status,key,scheduled_on) where id=$1`,
    [thing.id],
  );
  await pool.query(
    `insert into bt.purchasables(user_id,thing_id,kind,name,description,merchant_url,import_key)
     select user_id,id,'ACCESSORY','Old accessory','','https://example.test/accessory','old-accessory'
     from bt.things where id=$1`,
    [thing.id],
  );

  const path = `/things/${thing.id}:change-category`;
  let releasePopulation = () => {};
  importAi.pause = new Promise<void>((resolve) => {
    releasePopulation = resolve;
  });
  const response = await (async () => {
    try {
      const changed = await request('POST', path, { categoryId: 'devices', findDetails: true });
      assert.equal(changed.statusCode, 200, changed.body);
      const competing = await request('POST', path, { categoryId: 'appliances' });
      assert.equal(competing.statusCode, 409, competing.body);
      return changed;
    } finally {
      releasePopulation();
      importAi.pause = undefined;
    }
  })();
  const changed = response.json<Schema['Thing']>();
  assert.equal(changed.id, thing.id);
  assert.equal(changed.categoryId, 'devices');
  const deviceFields = changed.fieldSets.find(({ id }) => id === 'devices.device')?.fields;
  assert.equal(deviceFields?.find(({ id }) => id === 'common.model')?.value, 'Player A');
  assert.equal(deviceFields?.find(({ id }) => id === 'common.serialNumber')?.autoPopulate, false);
  assert.equal(
    changed.fieldSets
      .find(({ id }) => id === 'devices.warranty')
      ?.fields.find(({ id }) => id === 'common.warrantyEnds')?.value,
    '2090-02-28',
  );
  assert.deepEqual(changed.pinnedFields, [
    { fieldSetId: 'devices.device', fieldId: 'common.model' },
  ]);
  assert.ok(changed.customFields.some(({ value }) => value === 'A/01'));
  assert.deepEqual(changed.purchasableIds, []);
  const tasks = (await request('GET', `/tasks?thingId=${thing.id}`)).json<Schema['TaskList']>()
    .items;
  assert.deepEqual(
    tasks.map(({ title, scheduledOn }) => [title, scheduledOn]),
    [['Accepted task', '2090-02-28']],
  );

  const fresh = changed.import;
  assert.equal(fresh?.status, 'QUEUED');
  assert.notEqual(fresh.id, oldImport.id);
  let completed = fresh;
  for (let attempt = 0; attempt < 100 && activeStatuses.includes(completed.status); attempt++) {
    await setTimeout(20);
    completed = (await request('GET', `/imports/${fresh.id}`)).json<Schema['Import']>();
  }
  assert.equal(completed.status, 'COMPLETE', JSON.stringify(completed));
  assert.equal(completed.candidates?.[0]?.categoryId, 'devices');

  const back = await request('POST', path, { categoryId: 'appliances' });
  assert.equal(back.statusCode, 200, back.body);
  assert.equal(back.json<Schema['Thing']>().import, null);
  const previous = await request('GET', `/imports/${oldImport.id}`);
  assert.equal(previous.json<Schema['Import']>().previousCategory, true);
  const retry = await request('POST', `/imports/${oldImport.id}:retry`);
  assert.equal(retry.statusCode, 409, retry.body);
  assert.match(retry.body, /previous category/);
});

test('isolation covers reads, edits, lists and relationships', async () => {
  const thing = await create({
    categoryId: 'memberships',
    addFieldSetIds: ['memberships.museum', 'memberships.access'],
    values: [
      {
        fieldSetId: 'memberships.access',
        fieldId: 'membership.accessPin',
        value: '0098',
      },
    ],
  });
  for (const [method, path, body] of [
    ['GET', `/things/${thing.id}`, undefined],
    ['PATCH', `/things/${thing.id}`, { name: 'stolen' }],
    ['POST', `/things/${thing.id}:change-category`, { categoryId: 'other' }],
    ['DELETE', `/things/${thing.id}`, undefined],
  ] as const) {
    const response = await request(method, path, body, 'bob');
    assert.equal(response.statusCode, 404, method + ' ' + path + ' ' + response.body);
  }
  assert.equal((await request('GET', '/things', undefined, 'bob')).json().items.length, 0);
  const tag = (await request('POST', '/tags', { name: 'Private' }, 'bob')).json();
  assert.equal(
    (await request('PATCH', `/things/${thing.id}`, { tagIds: [tag.id] })).statusCode,
    422,
  );
  assert.equal(
    (await request('POST', '/issues', { thingId: thing.id, title: 'Not mine' }, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('POST', '/conversations', { thingId: thing.id }, 'bob')).statusCode,
    404,
  );
  const response = await request('GET', `/things/${thing.id}`);
  assert.equal(response.statusCode, 200, response.body);
  const pin = response
    .json<Schema['Thing']>()
    .fieldSets.find((set) => set.id === 'memberships.access')?.fields[0];
  assert.equal(pin?.value, '0098');
  assert.equal(pin?.masked, true);
  assert.match(response.headers['cache-control'] as string, /no-store/);
});
test('contract rejects unknown properties and invalid references; category counts are user-scoped', async () => {
  assert.equal(
    (
      await request('POST', '/things', {
        name: 'x',
        categoryId: 'other',
        userId: randomUUID(),
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (await request('POST', '/things', { name: 'x', categoryId: 'invented' })).statusCode,
    422,
  );
  assert.equal((await request('GET', '/things/not-a-uuid')).statusCode, 422);
  assert.ok(
    (await request('GET', '/categories', undefined, 'bob'))
      .json()
      .items.every((c: Schema['Category']) => c.thingCount === 0),
  );
  assert.equal((await request('GET', '/things?limit=0')).statusCode, 422);
});
test('concurrent field patches preserve each other and insurance values stay independent', async () => {
  const thing = await create({
    categoryId: 'insurance',
    addFieldSetIds: ['insurance.combined'],
  });
  const edits = await Promise.all(
    ['buildings', 'contents'].map((part, i) =>
      request('PATCH', `/things/${thing.id}`, {
        values: [
          {
            fieldSetId: 'insurance.' + part,
            fieldId: 'insurance.sumInsured',
            value: { amountMinor: (i + 1) * 10000, currency: 'GBP' },
          },
        ],
      }),
    ),
  );
  edits.forEach((r) => assert.equal(r.statusCode, 200, r.body));
  const result = (await request('GET', `/things/${thing.id}`)).json<Schema['Thing']>();
  assert.deepEqual(
    result.fieldSets
      .find((s) => s.id === 'insurance.buildings')!
      .fields.find((field) => field.id === 'insurance.sumInsured')!.value,
    {
      amountMinor: 10000,
      currency: 'GBP',
    },
  );
  assert.deepEqual(
    result.fieldSets
      .find((s) => s.id === 'insurance.contents')!
      .fields.find((field) => field.id === 'insurance.sumInsured')!.value,
    {
      amountMinor: 20000,
      currency: 'GBP',
    },
  );
  assert.equal(
    result.fieldSets
      .find((s) => s.id === 'insurance.contents')!
      .fields.find((field) => field.id === 'insurance.excess')!.value,
    null,
  );
});
async function upload(content = 'manual', type = 'text/plain', userSubject = 'alice') {
  const boundary = 'test-boundary';
  return app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: 'Bearer ' + userSubject,
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="manual.txt"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  });
}
// Waits for the Import started by linking an Attachment before the next Thing write.
async function linkAttachment(id: string, thingId: string, userSubject = 'alice') {
  const response = await request(
    'PUT',
    `/attachments/${id}/things/${thingId}`,
    undefined,
    userSubject,
  );
  assert.equal(response.statusCode, 204, response.body);
  const signal = AbortSignal.timeout(10000);
  while (true) {
    signal.throwIfAborted();
    const pending = await pool.query(
      'select 1 from bt.imports where target_thing_id=$1 and status=any($2)',
      [thingId, activeStatuses],
    );
    if (!pending.rowCount) return;
    await setTimeout(20, undefined, { signal });
  }
}

// Required AI providers start Imports on attachment links, so later writes wait for completion.
test('list filters omit inaccessible records on every page', async (t) => {
  const alice = await create();
  const bob = await create({}, 'bob');
  t.after(async () => {
    await request('DELETE', `/things/${alice.id}`);
    await request('DELETE', `/things/${bob.id}`, undefined, 'bob');
  });
  const paths = ['/attachments', '/issues', '/events', '/purchasables'];
  const foreignIds = new Set<string>();
  for (const [userSubject, thing] of [
    ['alice', alice],
    ['bob', bob],
  ] as const) {
    const userId = (await request('GET', '/profile', undefined, userSubject)).json().id;
    for (let index = 0; index < 2; index++) {
      const file = (await upload('manual', 'text/plain', userSubject)).json<Schema['Attachment']>();
      await linkAttachment(file.id, thing.id, userSubject);
      const ids = [file.id];
      for (const path of ['/issues', '/events']) {
        const response = await request(
          'POST',
          path,
          {
            thingId: thing.id,
            title: 'List fixture',
            ...(path === '/events' ? { startsOn: '2026-10-01' } : {}),
          },
          userSubject,
        );
        assert.equal(response.statusCode, 201, response.body);
        ids.push(response.json().id);
      }
      const productId = randomUUID();
      await pool.query(
        "insert into bt.purchasables(id,user_id,thing_id,kind,name,merchant_url) values($1,$2,$3,$4,'List fixture','https://example.com/product')",
        [productId, userId, thing.id, index ? 'ACCESSORY' : 'CONSUMABLE'],
      );
      ids.push(productId);
      if (userSubject === 'bob') for (const id of ids) foreignIds.add(id);
    }
  }
  for (const path of paths) {
    const query = new URLSearchParams({ thingId: alice.id, limit: '1' });
    const first = await request('GET', path + '?' + query);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().items.length, 1);
    assert.ok(first.json().nextCursor);
    query.set('cursor', first.json().nextCursor);
    const second = await request('GET', path + '?' + query);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().items.length, 1);
    assert.notEqual(second.json().items[0].id, first.json().items[0].id);
    assert.equal(second.json().nextCursor, null);
    for (const thingId of [bob.id, randomUUID()]) {
      for (const cursor of ['', first.json().nextCursor]) {
        const response = await request(
          'GET',
          path + '?' + new URLSearchParams({ thingId, limit: '1', ...(cursor ? { cursor } : {}) }),
        );
        assert.equal(response.statusCode, 200, response.body);
        assert.deepEqual(response.json(), { items: [], nextCursor: null });
      }
    }
    query.delete('thingId');
    query.delete('cursor');
    let cursor: string | null;
    do {
      const response = await request('GET', path + '?' + query);
      assert.equal(response.statusCode, 200, response.body);
      const page = response.json<{ items: { id: string }[]; nextCursor: string | null }>();
      for (const item of page.items) assert.ok(!foreignIds.has(item.id));
      cursor = page.nextCursor;
      if (cursor) query.set('cursor', cursor);
    } while (cursor);
    assert.equal((await request('GET', path + '?thingId=invalid')).statusCode, 422);
  }
  for (const kind of ['CONSUMABLE', 'ACCESSORY']) {
    const response = await request(
      'GET',
      '/purchasables?' + new URLSearchParams({ thingId: alice.id, kind, limit: '1' }),
    );
    assert.equal(response.statusCode, 200, response.body);
    const page = response.json<Schema['PurchasableList']>();
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].kind, kind);
    assert.equal(page.nextCursor, null);
    assert.equal((await request('GET', `/purchasables/${page.items[0].id}`)).statusCode, 200);
    assert.equal(
      (await request('GET', `/purchasables/${page.items[0].id}`, undefined, 'bob')).statusCode,
      404,
    );
  }
  const tag = (await request('POST', '/tags', { name: 'Private filter' }, 'bob')).json();
  await request('PATCH', `/things/${bob.id}`, { tagIds: [tag.id] }, 'bob');
  for (const tagId of [tag.id, randomUUID()]) {
    const response = await request('GET', '/things?tagId=' + tagId);
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { items: [], nextCursor: null });
  }
});

test('shared attachments, authorized downloads, unlinking and retained-import deletion checks', async () => {
  const a = await create(),
    b = await create();
  const uploaded = await upload();
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const file = uploaded.json<Schema['Attachment']>();
  assert.equal(
    (await request('PATCH', `/things/${a.id}`, { description: 'Owner note' })).statusCode,
    200,
  );
  for (const thing of [a, b]) await linkAttachment(file.id, thing.id);
  assert.equal(
    (await request('GET', `/attachments/${file.id}/content`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal(
    (await request('PUT', `/attachments/${file.id}/things/${a.id}`, undefined, 'bob')).statusCode,
    404,
  );
  assert.equal((await request('DELETE', `/attachments/${file.id}`)).statusCode, 409);
  assert.equal((await request('DELETE', `/things/${a.id}`)).statusCode, 204);
  assert.equal((await request('GET', `/attachments/${file.id}/content`)).body, 'manual');
  assert.equal((await request('DELETE', `/attachments/${file.id}/things/${b.id}`)).statusCode, 204);
  const userId = (await request('GET', '/profile')).json().id;
  await pool.query("insert into bt.imports(user_id,attachment_id,status) values($1,$2,'FAILED')", [
    userId,
    file.id,
  ]);
  assert.equal((await request('DELETE', `/attachments/${file.id}`)).statusCode, 409);
  await pool.query('delete from bt.imports where attachment_id=$1', [file.id]);
  assert.equal((await request('DELETE', `/attachments/${file.id}`)).statusCode, 204);
});
test('upload limits and content type checks are enforced', async () => {
  assert.equal((await upload('x'.repeat(100))).statusCode, 413);
  assert.equal((await upload('not a png', 'image/png')).statusCode, 415);
  assert.equal((await upload('<svg/>', 'image/svg+xml')).statusCode, 415);
});
test('attachment metadata edits are partial, user-scoped and shared without changing downloads', async () => {
  const file = (await upload()).json<Schema['Attachment']>();
  assert.equal(file.title, null);
  assert.equal(file.pageCount, null);
  assert.deepEqual(file.metadataSources, {});
  const a = await create(),
    b = await create();
  for (const thing of [a, b]) await request('PUT', `/attachments/${file.id}/things/${thing.id}`);
  const revisions = await Promise.all(
    [a, b].map(async (thing) => (await request('GET', `/things/${thing.id}`)).json().revision),
  );
  const path = `/attachments/${file.id}`;
  assert.equal((await request('PATCH', path, { title: 'Foreign edit' }, 'bob')).statusCode, 404);
  assert.equal(
    (await app.inject({ method: 'PATCH', url: '/api' + path, payload: { title: 'Anonymous' } }))
      .statusCode,
    401,
  );
  for (const patch of [
    { pageCount: 44 },
    { filename: 'changed.pdf' },
    { metadataSources: {} },
    { documentType: 'UNKNOWN' },
    { documentDate: '2026-02-30' },
    { documentDate: '0000-01-01' },
    { title: '   ' },
    {},
  ])
    assert.equal((await request('PATCH', path, patch)).statusCode, 422);
  const edits = await Promise.all([
    request('PATCH', path, { title: '  Owner manual  ', documentType: 'MANUAL' }),
    request('PATCH', path, { publisher: 'Example manufacturer', documentDate: '2022-03-12' }),
  ]);
  for (const edit of edits) assert.equal(edit.statusCode, 200, edit.body);
  const saved = (await request('GET', path)).json<Schema['Attachment']>();
  assert.equal(saved.title, 'Owner manual');
  assert.equal(saved.publisher, 'Example manufacturer');
  assert.equal(saved.documentDate, '2022-03-12');
  assert.deepEqual(saved.metadataSources.title, { origin: 'USER', sourceRefs: [] });
  for (const [index, thing] of [a, b].entries()) {
    assert.ok((await request('GET', `/things/${thing.id}`)).json().revision > revisions[index]);
    assert.equal(
      (await request('GET', `/attachments?thingId=${thing.id}`)).json().items[0].title,
      saved.title,
    );
  }
  const cleared = (await request('PATCH', path, { title: null })).json<Schema['Attachment']>();
  assert.equal(cleared.title, null);
  assert.equal(cleared.publisher, saved.publisher);
  assert.equal(cleared.metadataSources.title?.origin, 'USER');
  assert.equal(cleared.filename, file.filename);
  const download = await request('GET', `${path}/content`);
  assert.equal(download.body, 'manual');
  assert.ok(String(download.headers['content-disposition']).includes(file.filename));
  assert.ok(!JSON.stringify(cleared).includes('storageKey'));
});
test('activity transitions and conversation/message persistence are user-scoped', async () => {
  const thing = await create();
  const issue = (
    await request('POST', '/issues', { thingId: thing.id, title: 'A problem' })
  ).json();
  assert.equal((await request('GET', `/issues/${issue.id}`, undefined, 'bob')).statusCode, 404);
  assert.equal(
    (
      await request('POST', '/events', {
        thingId: thing.id,
        title: 'Task',
        status: 'SCHEDULED',
      })
    ).statusCode,
    422,
  );
  const event = (
    await request('POST', '/events', {
      thingId: thing.id,
      title: 'Task',
      issueId: issue.id,
      startsOn: '2026-10-01',
    })
  ).json();
  const changed = await request('PATCH', `/events/${event.id}`, {
    startsOn: null,
    startsAt: '2026-10-01T09:00:00Z',
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const conversation = (await request('POST', '/conversations', { thingId: thing.id })).json();
  await pool.query(
    "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'USER','A stored message','COMPLETE')",
    [conversation.id, randomUUID()],
  );
  assert.equal(
    (await request('GET', `/conversations/${conversation.id}`)).json().messages.length,
    1,
  );
  assert.equal(
    (await request('GET', `/conversations/${conversation.id}`, undefined, 'bob')).statusCode,
    404,
  );
  await request('DELETE', `/things/${thing.id}`);
  assert.equal((await request('GET', `/events/${event.id}`)).statusCode, 404);
  assert.equal((await request('GET', `/conversations/${conversation.id}`)).statusCode, 404);
  assert.equal(
    (await pool.query('select 1 from bt.messages where conversation_id=$1', [conversation.id]))
      .rowCount,
    0,
  );
});
test('sample data is explicit, labelled and idempotent', async () => {
  const before = (await request('GET', '/things?limit=100')).json().items.length;
  const result = await request('POST', '/profile:seed-samples');
  assert.equal(result.statusCode, 200, result.body);
  await request('POST', '/profile:seed-samples');
  const after = (await request('GET', '/things?limit=100')).json().items;
  assert.equal(after.length, before + 4);
  assert.equal(after.filter((t: Schema['ThingSummary']) => t.isSample).length, 4);
  const purchases = (await request('GET', '/purchasables')).json().items;
  assert.equal(purchases.length, 3);
  assert.ok(purchases.every((p: Schema['Purchasable']) => p.isSample));
  assert.equal((await request('GET', '/purchasables', undefined, 'bob')).json().items.length, 0);
});
test('private schema cannot be accessed by Supabase browser roles', async () => {
  const { rows } = await pool.query(
    "select has_schema_privilege('anon','bt','usage') as anon,has_schema_privilege('authenticated','bt','usage') as authenticated",
  );
  assert.deepEqual(rows[0], { anon: false, authenticated: false });
});
test('stored data survives application restart', async () => {
  const thing = await create({ name: 'Persists' });
  await app.close();
  app = await buildApp({
    dbPool: pool,
    importAi,
    chatAi,
    verifyIdentity,
  });
  assert.equal((await request('GET', `/things/${thing.id}`)).json().name, 'Persists');
});

test('Issue status text and due dates preserve omission, clear with null and stay user-scoped', async () => {
  const thing = await create();
  const res = await request('POST', '/issues', {
    thingId: thing.id,
    title: 'Renew cover',
    statusText: 'Renewal due',
    dueDate: '2026-10-12',
  });
  assert.equal(res.statusCode, 201, res.body);
  const issue = res.json<Schema['Issue']>();
  assert.equal(issue.dueDate, '2026-10-12');
  const path = `/issues/${issue.id}`;
  const changed = await request('PATCH', path, { title: 'Review cover' });
  assert.equal(changed.json().issue.statusText, 'Renewal due');
  assert.equal(changed.json().issue.dueDate, '2026-10-12');
  for (const dueDate of ['2026-02-30', '2026-10-12T12:00:00Z'])
    assert.equal((await request('PATCH', path, { dueDate })).statusCode, 422);
  assert.equal((await request('PATCH', path, { statusText: 'x'.repeat(501) })).statusCode, 422);
  assert.equal((await request('PATCH', path, { dueDate: null }, 'bob')).statusCode, 404);
  const listed = (await request('GET', `/issues?thingId=${thing.id}`)).json().items[0];
  assert.equal(listed.statusText, 'Renewal due');
  assert.equal(listed.dueDate, '2026-10-12');
  const cleared = await request('PATCH', path, {
    statusText: null,
    dueDate: null,
    status: 'RESOLVED',
  });
  assert.equal(cleared.json().issue.statusText, null);
  assert.equal(cleared.json().issue.dueDate, null);
  assert.ok(cleared.json().issue.resolvedAt);
  assert.equal((await request('PATCH', path, { statusText: '' })).json().issue.statusText, '');
});

test('date-only Events retain calendar dates, enforce one schedule and filter mixed schedules by viewer timezone', async () => {
  const thing = await create();
  const add = async (schedule: object, title = 'Task') => {
    const res = await request('POST', '/events', {
      thingId: thing.id,
      title,
      status: 'SCHEDULED',
      ...schedule,
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json<Schema['Event']>();
  };
  const day = await add({ startsOn: '2026-10-25' }, 'Date only');
  const before = await add({ startsAt: '2026-10-24T22:30:00Z' }, 'Previous local day');
  const timed = await add({ startsAt: '2026-10-25T09:00:00Z' }, 'Timed');
  const after = await add({ startsOn: '2026-10-26' }, 'Next day');
  assert.equal(day.startsAt, null);
  assert.equal(day.startsOn, '2026-10-25');
  const path = `/events/${day.id}`;
  assert.equal((await request('GET', path)).json().startsOn, '2026-10-25');
  assert.equal(
    (await request('PATCH', path, { title: 'Clean oven' })).json().startsOn,
    '2026-10-25',
  );
  for (const patch of [
    { startsAt: '2026-10-25T09:00:00Z' },
    { startsOn: null },
    { startsOn: '2026-02-30' },
    { startsOn: '2026-10-25T00:00:00Z' },
  ])
    assert.equal((await request('PATCH', path, patch)).statusCode, 422, JSON.stringify(patch));
  assert.equal((await request('PATCH', path, { startsOn: '2026-11-01' }, 'bob')).statusCode, 404);
  assert.equal(
    (
      await request('POST', '/events', {
        thingId: thing.id,
        title: 'Both',
        startsOn: '2026-10-25',
        startsAt: '2026-10-25T09:00:00Z',
      })
    ).statusCode,
    422,
  );
  // Close fixtures so date-range assertions exclude pending followup carryover.
  for (const event of [day, before, timed, after])
    await request('POST', `/events/${event.id}:close`);

  const query = new URLSearchParams({
    thingId: thing.id,
    timeZone: 'Europe/London',
    from: '2026-10-24T23:00:00Z',
    to: '2026-10-25T23:59:59Z',
    limit: '1',
  });
  const first = (await request('GET', '/events?' + query)).json();
  assert.deepEqual(
    first.items.map((e: Schema['Event']) => e.id),
    [day.id],
  );
  query.set('cursor', first.nextCursor);
  const second = (await request('GET', '/events?' + query)).json();
  assert.deepEqual(
    second.items.map((e: Schema['Event']) => e.id),
    [timed.id],
  );
  assert.equal(second.nextCursor, null);
  query.delete('cursor');
  query.set('limit', '100');
  query.set('from', '2026-10-25T12:00:00Z');
  const afternoon = (await request('GET', '/events?' + query)).json();
  assert.deepEqual(
    afternoon.items.map((e: Schema['Event']) => e.id),
    [day.id],
  );
  const all = (await request('GET', `/events?thingId=${thing.id}&timeZone=Europe%2FLondon`)).json();
  assert.deepEqual(
    all.items.map((e: Schema['Event']) => e.id),
    [before.id, day.id, timed.id, after.id],
  );
  assert.equal((await request('GET', '/events?timeZone=Invalid%2FZone')).statusCode, 422);
  const switched = await request('PATCH', path, {
    startsOn: null,
    startsAt: '2026-10-25T10:00:00Z',
  });
  assert.equal(switched.statusCode, 200, switched.body);
  assert.equal(switched.json().startsOn, null);
  const back = await request('PATCH', path, { startsAt: null, startsOn: '2026-10-25' });
  assert.equal(back.statusCode, 200, back.body);
  const done = await request('POST', path + ':close');
  assert.equal(done.json().startsOn, '2026-10-25');
  assert.ok(done.json().closedAt);
});

test('explicit Thing views increment atomically without changing content timestamps and support paginated rankings', async () => {
  const a = await create({ name: 'Usage fixture A' }),
    b = await create({ name: 'Usage fixture B' }),
    c = await create({ name: 'Usage fixture C' });
  assert.equal(a.accessCount, 0);
  assert.equal(a.lastViewedAt, null);
  for (let i = 0; i < 2; i++) await request('GET', `/things/${a.id}`);
  assert.equal((await request('GET', `/things/${a.id}`)).json().accessCount, 0);
  const path = `/things/${a.id}:view`;
  assert.equal((await app.inject({ method: 'POST', url: '/api' + path })).statusCode, 401);
  assert.equal((await request('POST', path, undefined, 'bob')).statusCode, 404);
  const views = await Promise.all(Array.from({ length: 8 }, () => request('POST', path)));
  views.forEach((res) => assert.equal(res.statusCode, 200, res.body));
  assert.deepEqual(
    views.map((res) => res.json().accessCount).sort((x, y) => x - y),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  const viewed = (await request('GET', `/things/${a.id}`)).json<Schema['Thing']>();
  assert.equal(viewed.accessCount, 8);
  assert.ok(viewed.lastViewedAt);
  assert.equal(viewed.updatedAt, a.updatedAt);
  assert.equal(viewed.revision, a.revision);
  await request('POST', `/things/${b.id}:view`);
  const list = async (sort: string, cursor?: string) =>
    (
      await request(
        'GET',
        '/things?' +
          new URLSearchParams({
            q: 'Usage fixture',
            sort,
            limit: '1',
            ...(cursor ? { cursor } : {}),
          }),
      )
    ).json();
  const frequent = await list('MOST_VIEWED');
  assert.equal(frequent.items[0].id, a.id);
  assert.equal(frequent.items[0].accessCount, 8);
  const next = await list('MOST_VIEWED', frequent.nextCursor);
  assert.equal(next.items[0].id, b.id);
  assert.equal((await list('MOST_VIEWED', next.nextCursor)).items[0].id, c.id);
  assert.equal((await list('RECENTLY_VIEWED')).items[0].id, b.id);
  assert.equal((await list('UPDATED')).items[0].id, c.id);
  const edited = await request('PATCH', `/things/${a.id}`, { description: 'An edit' });
  assert.equal(edited.json().accessCount, 8);
  assert.notEqual(edited.json().updatedAt, a.updatedAt);
  assert.equal((await list('UPDATED')).items[0].id, a.id);
  assert.equal((await request('GET', '/things?sort=INVENTED')).statusCode, 422);
  assert.equal(
    (await request('GET', '/things?sort=MOST_VIEWED&q=Usage%20fixture', undefined, 'bob')).json()
      .items.length,
    0,
  );
});

// Checks that classification changes reach API responses and custom-field persistence.
test('field scopes and identifier status round-trip through the Thing API', async () => {
  let thing = await create({
    categoryId: 'appliances',
    customFields: [
      { label: 'Model note', value: 'Public model data', sensitive: false, scope: 'CLASS' },
      { label: 'Owner note', value: 'Private data', sensitive: false },
    ],
  });
  const fields = thing.fieldSets.flatMap((set) => set.fields);
  assert.equal(fields.find((field) => field.id === 'common.manufacturer')?.scope, 'GROUP');
  assert.equal(fields.find((field) => field.id === 'common.model')?.isIdentifier, true);
  assert.equal(fields.find((field) => field.id === 'common.serialNumber')?.scope, 'INSTANCE');
  assert.ok(!JSON.stringify(thing).includes('instanceSpecific'));
  assert.ok(!JSON.stringify(thing).includes('identifierKind'));
  const custom = thing.customFields.find((field) => field.label === 'Model note')!;
  assert.equal(custom.scope, 'CLASS');
  assert.equal(thing.customFields.find((field) => field.label === 'Owner note')?.scope, 'INSTANCE');
  const edited = await request('PATCH', '/things/' + thing.id, {
    customFields: [
      { id: custom.id, label: 'Updated note', value: 'Updated data', sensitive: false },
    ],
  });
  assert.equal(edited.statusCode, 200, edited.body);
  const saved = await request('GET', '/things/' + thing.id);
  assert.equal(saved.statusCode, 200, saved.body);
  thing = saved.json<Schema['Thing']>();
  assert.equal(thing.customFields.find((field) => field.id === custom.id)?.scope, 'CLASS');
  const rejected = await request('PATCH', '/things/' + thing.id, {
    customFields: [
      { id: custom.id, label: 'Note', value: 'Text', sensitive: false, scope: 'PUBLIC' },
    ],
  });
  assert.equal(rejected.statusCode, 422, rejected.body);
});
