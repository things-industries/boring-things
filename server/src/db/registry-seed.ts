import type { FieldDefinition, FieldSet, Schema } from '../../../shared/model.js';
import type { Database } from './connection.js';
import { Registry } from '../application/registry.js';

const names = [
  'Appliances',
  'Devices',
  'Vehicles',
  'Memberships',
  'Subscriptions',
  'Utilities',
  'Insurance',
  'Other',
];
export const categories = names.map(
  (name, i) =>
    ({
      id: name.toLowerCase(),
      name,
      description: `${name} you own or use.`,
      icon: ['▧', '⌘', '↗', '◉', '↻', '⌁', '◇', '○'][i],
      defaultImage: null,
      sortOrder: i,
      thingCount: 0,
    }) satisfies Schema['Category'],
);
const field = (
  id: string,
  name: string,
  schema: FieldDefinition['schema'] = { type: 'string', maxLength: 500 },
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  id,
  name,
  description: name,
  keywords: [],
  schema,
  uiHint: 'text',
  sensitive: false,
  ...extra,
});
export const moneySchema: FieldDefinition['schema'] = {
  type: 'object',
  additionalProperties: false,
  required: ['amountMinor', 'currency'],
  properties: {
    amountMinor: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    currency: { type: 'string', pattern: '^[A-Z]{3}$', enum: ['GBP', 'EUR', 'USD'] },
  },
};
export const fields: FieldDefinition[] = [
  field('common.manufacturer', 'Manufacturer'),
  field('common.model', 'Model'),
  field('appliances.eNumber', 'E-number', undefined, {
    description: 'Model identifier, including any slash suffix.',
    keywords: ['E-Nr', 'model'],
  }),
  field('appliances.fdNumber', 'FD number', undefined, {
    description: 'Production identifier. Preserve leading zeroes.',
    keywords: ['FD'],
  }),
  field('appliances.zNumber', 'Serial number (Z-Nr)', undefined, {
    description: 'Manufacturer Z-number; not globally unique.',
    keywords: ['Z-Nr', 'serial'],
  }),
  field('vehicles.registration', 'Registration'),
  field('vehicles.vin', 'VIN'),
  field(
    'vehicles.firstRegistered',
    'First registered',
    { type: 'string', format: 'date' },
    { uiHint: 'date' },
  ),
  field(
    'vehicles.seats',
    'Seats',
    { type: 'integer', minimum: 1, maximum: 99 },
    { uiHint: 'number' },
  ),
  field(
    'vehicles.payloadKg',
    'Load capacity (kg)',
    { type: 'number', minimum: 0 },
    { uiHint: 'number' },
  ),
  field('insurance.provider', 'Insurance provider'),
  field('insurance.policyNumber', 'Policy number'),
  field(
    'insurance.renewalDate',
    'Renewal date',
    { type: 'string', format: 'date' },
    { uiHint: 'date' },
  ),
  field('insurance.sumInsured', 'Sum insured', moneySchema, {
    uiHint: 'money',
    description: 'Coverage limit, with currency; independent for each cover section.',
  }),
  field('insurance.excess', 'Excess', moneySchema, { uiHint: 'money' }),
  field('membership.provider', 'Museum'),
  field('membership.number', 'Membership number'),
  field(
    'membership.expires',
    'Expiry date',
    { type: 'string', format: 'date' },
    { uiHint: 'date' },
  ),
  field('membership.autoRenew', 'Automatically renew', { type: 'boolean' }, { uiHint: 'checkbox' }),
  field(
    'membership.level',
    'Membership level',
    { type: 'string', enum: ['Individual', 'Joint', 'Family'] },
    { uiHint: 'select' },
  ),
  field(
    'membership.accessPin',
    'Access PIN',
    { type: 'string', minLength: 4, maxLength: 12, pattern: '^[0-9]+$' },
    {
      uiHint: 'password',
      sensitive: true,
      description: 'Optional access code. Hidden until revealed.',
    },
  ),
];
const set = (
  id: string,
  name: string,
  eligibility: string,
  fieldIds: string[],
  includes: string[] = [],
  alongside: string[] = [],
): FieldSet => ({
  id,
  categoryId: id.split('.')[0],
  name,
  eligibility,
  fields: fieldIds.map((id) => fields.find((f) => f.id === id)!),
  includes,
  considerAlongside: alongside,
  keywords: name.toLowerCase().split(' '),
});
export const sets: FieldSet[] = [
  set('appliances.appliance', 'Appliance', 'A household appliance.', [
    'common.manufacturer',
    'common.model',
  ]),
  set(
    'appliances.neff',
    'Neff appliance identifiers',
    'A Neff appliance with a manufacturer rating plate.',
    ['appliances.eNumber', 'appliances.fdNumber', 'appliances.zNumber'],
    ['appliances.appliance'],
  ),
  set(
    'appliances.bosch',
    'Bosch appliance identifiers',
    'A Bosch household appliance with manufacturer identifiers.',
    ['appliances.eNumber', 'appliances.fdNumber', 'appliances.zNumber'],
    ['appliances.appliance'],
  ),
  set('vehicles.vehicle', 'Vehicle', 'A road vehicle.', [
    'common.manufacturer',
    'common.model',
    'vehicles.registration',
    'vehicles.vin',
    'vehicles.firstRegistered',
  ]),
  set('vehicles.car', 'Car', 'A passenger car.', ['vehicles.seats'], ['vehicles.vehicle']),
  set(
    'vehicles.van',
    'Van',
    'A van used for carrying goods. Exclude passenger cars.',
    ['vehicles.payloadKg'],
    ['vehicles.vehicle'],
  ),
  set('insurance.policy', 'Policy', 'An insurance policy.', [
    'insurance.provider',
    'insurance.policyNumber',
    'insurance.renewalDate',
  ]),
  set(
    'insurance.buildings',
    'Buildings cover',
    'Insurance covering the building structure.',
    ['insurance.sumInsured', 'insurance.excess'],
    [],
    ['insurance.contents'],
  ),
  set(
    'insurance.contents',
    'Contents cover',
    'Insurance covering possessions within a property.',
    ['insurance.sumInsured', 'insurance.excess'],
    [],
    ['insurance.buildings'],
  ),
  set(
    'insurance.combined',
    'Buildings and contents policy',
    'One policy that provides both buildings and contents cover.',
    [],
    ['insurance.policy', 'insurance.buildings', 'insurance.contents'],
  ),
  set('memberships.museum', 'Museum membership', 'Membership of a museum or gallery.', [
    'membership.provider',
    'membership.number',
    'membership.expires',
    'membership.level',
    'membership.autoRenew',
    'membership.accessPin',
  ]),
];
export async function seedRegistry(db: Database) {
  new Registry(fields, sets);
  for (const c of categories)
    await db.query(
      'insert into bt.categories(id,name,description,icon,default_image,sort_order) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,default_image=excluded.default_image,sort_order=excluded.sort_order',
      [c.id, c.name, c.description, c.icon, c.defaultImage, c.sortOrder],
    );
  for (const f of fields)
    await db.query(
      'insert into bt.field_definitions(id,name,description,keywords,schema,ui_hint,sensitive) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do update set name=excluded.name,description=excluded.description,keywords=excluded.keywords,schema=excluded.schema,ui_hint=excluded.ui_hint,sensitive=excluded.sensitive',
      [f.id, f.name, f.description, f.keywords, JSON.stringify(f.schema), f.uiHint, f.sensitive],
    );
  for (const s of sets)
    await db.query(
      'insert into bt.field_sets(id,category_id,name,eligibility,keywords,includes,consider_alongside,field_ids) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,eligibility=excluded.eligibility,keywords=excluded.keywords,includes=excluded.includes,consider_alongside=excluded.consider_alongside,field_ids=excluded.field_ids',
      [
        s.id,
        s.categoryId,
        s.name,
        s.eligibility,
        s.keywords,
        s.includes,
        s.considerAlongside,
        s.fields.map((f) => f.id),
      ],
    );
}
