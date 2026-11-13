/** Applies hosted migrations and registry metadata, then provisions private attachment storage. */
import { getEnv } from '../server/src/config.js';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import * as database from '../server/src/db/connection.js';
import * as registrySeedDb from '../server/src/db/seeds/registry.js';
import { s3Client } from '../server/src/providers/blobs/s3.js';
import { pushMigrations } from './push-migrations.js';

let stage = 'configuration';

async function deploy() {
  const project = getEnv('SUPABASE_PROJECT_REF');
  const target = getEnv('DATABASE_URL');
  if (!project || !target) throw new Error('SUPABASE_PROJECT_REF and DATABASE_URL are required');
  const url = new URL(target);
  const pooled =
    url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `postgres.${project}`;
  const direct = url.hostname === `db.${project}.supabase.co` && url.username === 'postgres';
  if ((!pooled && !direct) || url.port !== '5432' || url.pathname !== '/postgres')
    throw new Error('Use the project session pooler or direct connection on port 5432');
  if (!url.password) throw new Error('A database password is required');
  const dryRun = process.argv.includes('--dry-run');
  if (getEnv('BLOB_STORAGE') !== 's3')
    throw new Error('Deployment requires BLOB_STORAGE=s3 and S3 credentials');
  const endpoint = new URL(getEnv('S3_ENDPOINT'));
  if (
    endpoint.hostname !== `${project}.storage.supabase.co` ||
    endpoint.pathname !== '/storage/v1/s3'
  )
    throw new Error('S3_ENDPOINT must belong to the deployment project');

  const pool = database.createPool(url.toString());
  try {
    stage = 'database connection';
    await pool.query('select 1');
    console.log(`Connected to Supabase project ${project}.`);
    // Keep CLI connection diagnostics out of logs because they can contain credentials.
    stage = 'migrations';
    if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
    await pushMigrations(url, { dryRun });
    if (dryRun) {
      console.log('Migration dry run passed. No schema, registry or bucket changes applied.');
      return;
    }
    stage = 'registry seed';
    await database.transaction(pool, registrySeedDb.seedRegistry);
    stage = 'private storage bucket';
    const bucket = await pool.query('select public from storage.buckets where id=$1', [
      getEnv('S3_BUCKET'),
    ]);
    if (bucket.rows[0]?.public) throw new Error('Attachment bucket must be private');
    if (!bucket.rowCount) {
      const storage = s3Client();
      try {
        await storage.send(new CreateBucketCommand({ Bucket: getEnv('S3_BUCKET') }), {
          abortSignal: AbortSignal.timeout(60000),
        });
      } finally {
        storage.destroy();
      }
    }
    const verified = await pool.query('select public from storage.buckets where id=$1', [
      getEnv('S3_BUCKET'),
    ]);
    if (verified.rows[0]?.public !== false)
      throw new Error('Private attachment bucket verification failed');
    console.log('Migrations, registry and private attachment bucket ready.');
  } finally {
    await pool.end();
  }
}

try {
  await deploy();
} catch {
  console.error(`Deployment preparation failed during ${stage}. Check the deployment setup guide.`);
  process.exitCode = 1;
}
