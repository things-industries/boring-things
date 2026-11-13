/** Applies migrations with the same Supabase CLI options in deployment and tests. */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Runs the pinned CLI against the supplied database and optional migration checkout.
export function pushMigrations(url: URL, options: { dryRun?: boolean; workdir?: string } = {}) {
  return run(
    'pnpm',
    [
      'exec',
      'supabase',
      'db',
      'push',
      '--db-url',
      url.toString(),
      '--yes',
      '--skip-vault',
      ...(options.dryRun ? ['--dry-run'] : []),
      ...(options.workdir ? ['--workdir', options.workdir] : []),
    ],
    { encoding: 'utf8', timeout: 600000 },
  );
}
