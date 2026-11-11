import * as database from '../server/src/db/connection.js';

import * as registrySeedDb from '../server/src/db/seeds/registry.js';

const pool = database.createPool();
try {
  await database.transaction(pool, registrySeedDb.seedRegistry);
  console.log('Registry seeded. Owned data unchanged.');
} finally {
  await pool.end();
}
