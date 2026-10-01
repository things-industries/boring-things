import { Registry } from './registry.js';
import { registryRecords } from '../../db/entities/registry.js';
import type { Database } from '../../db/connection.js';
import { ensure } from '../errors.js';
export { Registry } from './registry.js';
export { searchFields, searchFieldSets } from './search.js';
export async function loadRegistry(db: Database) {
  const { fields, sets } = await registryRecords(db);
  return new Registry(
    fields,
    sets.map((s) => ({
      ...s,
      fields: s.fieldIds.map((id) => {
        const f = fields.find((f) => f.id === id);
        ensure(f, 'Unknown field in registry');
        return f;
      }),
    })),
  );
}
