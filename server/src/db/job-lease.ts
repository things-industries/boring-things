/** Holds a database-wide runner lock on a dedicated session across deploys. */
import type pg from 'pg';
import type { JobLease } from '../application/jobs/runner.js';

const lock = [18451, 1];
const acquireQuery = {
  text: 'select pg_try_advisory_lock($1, $2) as acquired',
  values: lock,
  query_timeout: 5000,
};
const releaseQuery = {
  text: 'select pg_advisory_unlock($1, $2)',
  values: lock,
  query_timeout: 5000,
};
const heartbeatQuery = { text: 'select 1', query_timeout: 5000 };

export function jobLease(pool: pg.Pool, lost: () => void): JobLease {
  return {
    async acquire() {
      const client = await pool.connect();
      let released = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
      const failed = () => {
        if (released) return;
        released = true;
        clearInterval(heartbeat);
        client.release(true);
        lost();
      };
      client.on('error', failed);
      try {
        const result = await client.query<{ acquired: boolean }>(acquireQuery);
        if (!result.rows[0].acquired) {
          released = true;
          client.removeListener('error', failed);
          client.release();
          return undefined;
        }
      } catch (error) {
        if (!released) {
          released = true;
          client.removeListener('error', failed);
          client.release(true);
        }
        throw error;
      }
      heartbeat = setInterval(() => {
        void client.query(heartbeatQuery).catch(failed);
      }, 10000);
      heartbeat.unref();
      return async () => {
        if (released) return;
        released = true;
        clearInterval(heartbeat);
        try {
          await client.query(releaseQuery);
        } finally {
          client.removeListener('error', failed);
          client.release(true);
        }
      };
    },
  };
}
