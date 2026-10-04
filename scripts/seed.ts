import * as database from '../server/src/db/connection.js';
import * as registrySeedDb from '../server/src/db/seeds/registry.js';

const pool = database.createPool(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
try {
  await database.transaction(pool, registrySeedDb.seedRegistry);
  console.log('Registry seeded. Owned data unchanged.');
} finally {
  await pool.end();
}
