import { createPool, transaction } from '../server/src/db/connection.js';
import { seedRegistry } from '../server/src/db/registry-seed.js';
const pool = createPool(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
);
try {
  await transaction(pool, seedRegistry);
  console.log('Registry seeded. Owned data unchanged.');
} finally {
  await pool.end();
}
