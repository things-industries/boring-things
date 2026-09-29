import type pg from 'pg';
import type { Schema, ThingPatch, Value } from '../../../shared/model.js';
import { emptyData } from '../../../shared/model.js';
import { patchData } from './thing-data.js';
import type { Registry } from './registry.js';
import { rows, transaction, type Database } from '../db/connection.js';
export async function profile(db: Database, owner: string) {
  return (
    await rows<Schema['Profile']>(
      db,
      'select id,display_name,samples_added from bt.users where id=$1',
      [owner],
    )
  )[0];
}
export async function seedSamples(pool: pg.Pool, owner: string, registry: Registry) {
  return transaction(pool, async (db) => {
    const [user] = await rows<Schema['Profile']>(
      db,
      'select id,display_name,samples_added from bt.users where id=$1 for update',
      [owner],
    );
    if (user.samplesAdded) return user;
    const add = async (
      name: string,
      categoryId: string,
      addFieldSetIds: string[],
      values: Schema['ValuePatch'][] = [],
    ) => {
      const patch: ThingPatch = { addFieldSetIds, values };
      const data = patchData(emptyData(), patch, categoryId, registry);
      const [item] = await rows<{ id: string }>(
        db,
        'insert into bt.things(owner_id,category_id,name,description,data,is_sample) values($1,$2,$3,$4,$5,true) returning id',
        [owner, categoryId, name, 'Sample data for exploring the interface.', JSON.stringify(data)],
      );
      return item.id;
    };
    const v = (fieldSetId: string, fieldId: string, value: Value) => ({
      fieldSetId,
      fieldId,
      value,
    });
    const hob = await add(
      'Kitchen hob',
      'appliances',
      ['appliances.neff'],
      [
        v('appliances.appliance', 'common.manufacturer', 'Neff'),
        v('appliances.neff', 'appliances.zNumber', '00015'),
      ],
    );
    await add(
      'Weekend van',
      'vehicles',
      ['vehicles.van'],
      [
        v('vehicles.vehicle', 'common.manufacturer', 'Example Motors'),
        v('vehicles.van', 'vehicles.payloadKg', 950),
      ],
    );
    const insurance = await add(
      'Home insurance',
      'insurance',
      ['insurance.combined'],
      [
        v('insurance.buildings', 'insurance.sumInsured', {
          amountMinor: 50000000,
          currency: 'GBP',
        }),
        v('insurance.contents', 'insurance.sumInsured', { amountMinor: 6000000, currency: 'GBP' }),
      ],
    );
    await add(
      'Museum membership',
      'memberships',
      ['memberships.museum'],
      [
        v('memberships.museum', 'membership.provider', 'Example Museum'),
        v('memberships.museum', 'membership.level', 'Individual'),
        v('memberships.museum', 'membership.autoRenew', false),
        v('memberships.museum', 'membership.accessPin', '0000'),
      ],
    );
    const [tag] = await rows<{ id: string }>(
      db,
      "insert into bt.tags(owner_id,name) values($1,'Home') on conflict(owner_id,name) do update set name=excluded.name returning id",
      [owner],
    );
    for (const id of [hob, insurance])
      await db.query('insert into bt.thing_tags(thing_id,tag_id,owner_id) values($1,$2,$3)', [
        id,
        tag.id,
        owner,
      ]);
    await db.query(
      "insert into bt.issues(owner_id,thing_id,title,description,is_sample) values($1,$2,'One ring heats unevenly','Example issue for the dashboard. No fault has been diagnosed.',true)",
      [owner, hob],
    );
    await db.query(
      "insert into bt.events(owner_id,thing_id,title,description,status,starts_at,is_sample) values($1,$2,'Review home cover','Example reminder. Check the actual renewal date.','scheduled',now()+interval '5 days',true)",
      [owner, insurance],
    );
    await db.query(
      "insert into bt.events(owner_id,thing_id,title,description,is_sample) values($1,$2,'Check the hob manual','Example task for exploring maintenance cards.',true)",
      [owner, hob],
    );
    for (const [kind, name] of [
      ['consumable', 'Hob cleaner'],
      ['accessory', 'Cookware set'],
      ['upgrade', 'Replacement hob'],
    ])
      await db.query(
        'insert into bt.purchasables(owner_id,thing_id,kind,name,description,merchant_url,is_sample) values($1,$2,$3,$4,$5,$6,true)',
        [
          owner,
          hob,
          kind,
          name,
          'Sample suggestion. Compatibility and availability have not been checked.',
          'https://example.com',
        ],
      );
    await db.query('update bt.users set samples_added=true where id=$1', [owner]);
    return profile(db, owner);
  });
}
