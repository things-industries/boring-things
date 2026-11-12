/** Tests the deployment CLI against migration history from a Git revision in a local database. */

// cspell:words sslmode

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setEnvMode } from '../server/src/config.js';
import { createTestDatabase } from '../server/test/support/test-database.js';
import { pushMigrations } from './push-migrations.js';

const run = promisify(execFile);
const revision = process.argv[2];
if (!revision) throw new Error('Usage: pnpm test:migrations <baseline-revision>');

setEnvMode('test');
const baseline = await mkdtemp(join(tmpdir(), 'boring-migrations-'));
try {
  const { stdout } = await run(
    'git',
    [
      'archive',
      '--format=tar',
      '--end-of-options',
      revision,
      'supabase/config.toml',
      'supabase/migrations',
    ],
    { encoding: 'buffer' },
  );
  const archive = join(baseline, 'baseline.tar');
  await writeFile(archive, stdout);
  await run('tar', ['-xf', archive, '-C', baseline]);

  const db = await createTestDatabase();
  try {
    db.url.searchParams.set('sslmode', 'disable');
    console.log('Applying baseline migrations.');
    await pushMigrations(db.url, { workdir: baseline });
    console.log('Applying current migrations to the baseline database.');
    await pushMigrations(db.url);
    console.log('Migration upgrade passed.');
  } catch (error) {
    const output =
      error instanceof Error && 'stdout' in error && 'stderr' in error
        ? `${error.stdout}\n${error.stderr}`.trim()
        : error instanceof Error
          ? error.message
          : 'Migration command failed';
    console.error(output.replace(/postgres(?:ql)?:\/\/\S+/g, '[database URL]'));
    process.exitCode = 1;
  } finally {
    await db.close();
  }
} finally {
  await rm(baseline, { recursive: true, force: true });
}
