/**
 * Fastify test application with an isolated database, fixture providers and signed test tokens.
 */

import { getEnv, setEnvMode, setEnvValue } from '../../src/config.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { FixtureTaskScheduler } from '../fixtures/task-scheduling.js';
import { FixtureChat } from '../fixtures/chat.js';
import { FixtureAi } from '../fixtures/imports.js';
import { buildApp } from '../../src/app.js';
import { createTestDatabase } from './test-database.js';
import * as database from '../../src/db/connection.js';
import { loadRegistry } from '../../src/application/registry/index.js';
import * as registrySeedDb from '../../src/db/seeds/registry.js';

export const testAppId = 'browser-test';
const subject = 'browser-alice';

// Starts the test app for injected API requests and leaves its HTTP listener closed.
export async function createTestApp(
  options: {
    samples?: boolean;
    importWorkflow?: import('../../src/application/import/workflow.js').WorkflowOptions;
    readImageText?: import('../../src/app.js').BuildAppOptions['readImageText'];
  } = {},
) {
  const testDatabase = await createTestDatabase();
  const { pool } = testDatabase;
  const cleanup: (() => Promise<unknown> | unknown)[] = [testDatabase.close];
  const close = async () => {
    const errors = [];
    for (const step of cleanup.splice(0).reverse()) {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Test app cleanup failed');
  };
  try {
    const directory = await mkdtemp(tmpdir() + '/boring-test-blobs-');
    cleanup.push(() => rm(directory, { recursive: true, force: true }));

    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key' };
    const jwks = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/oidc/jwks') res.end(JSON.stringify({ keys: [jwk] }));
      else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    jwks.listen(0, '127.0.0.1');
    await once(jwks, 'listening');
    cleanup.push(() => jwks.close());
    const issuer = 'http://127.0.0.1:' + (jwks.address() as { port: number }).port;
    setEnvMode('test');
    setEnvValue('LOGTO_ENDPOINT', issuer);
    setEnvValue('LOGTO_APP_ID', testAppId);
    setEnvValue('BLOB_DIRECTORY', directory);
    setEnvValue('ENABLE_SAMPLE_DATA', true);
    cleanup.unshift(() => setEnvMode('runtime'));

    const migrations = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
      await pool.query(await readFile(new URL(file, migrations), 'utf8'));
    }
    await database.transaction(pool, registrySeedDb.seedRegistry);
    const importAi = new FixtureAi({ db: pool, registry: await loadRegistry(pool) });
    const chatAi = new FixtureChat();
    const taskScheduler = new FixtureTaskScheduler();
    const boot = () =>
      buildApp({
        dbPool: pool,
        importAi,
        chatAi,
        taskScheduler,
        importWorkflow: { specialists: [], ...options.importWorkflow },
        readImageText: options.readImageText ?? (async () => 'neff'),
      });
    let app = await boot();
    cleanup.push(() => app.close());

    // Long enough for a reused e2e server; the key only exists for this process.
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const signToken = (
      claims: {
        audience?: string;
        subject?: string;
        expiresIn?: string | number;
        issuer?: string;
        key?: Parameters<SignJWT['sign']>[0];
      } = {},
    ) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject(claims.subject ?? subject)
        .setAudience(claims.audience ?? getEnv('LOGTO_API_RESOURCE'))
        .setIssuer(claims.issuer ?? issuer + '/oidc')
        .setIssuedAt()
        .setExpirationTime(claims.expiresIn ?? expiresAt)
        .sign(claims.key ?? privateKey);
    const accessToken = await signToken();
    const authorization = 'Bearer ' + accessToken;
    const profile = await app.inject({ url: '/api/profile', headers: { authorization } });
    if (profile.statusCode !== 200) throw new Error('Profile request failed: ' + profile.body);
    if (options.samples) {
      const seeded = await app.inject({
        method: 'POST',
        url: '/api/profile:seed-samples',
        headers: { authorization },
      });
      if (seeded.statusCode !== 200) throw new Error('Sample seeding failed: ' + seeded.body);
    }

    return {
      get app() {
        return app;
      },
      pool,
      importAi,
      chatAi,
      taskScheduler,
      signToken,
      accessToken,
      expiresAt,
      authorization,
      // Changes persisted state while the runner is stopped, then starts a replacement app.
      async restart(prepare: () => Promise<unknown>) {
        await app.close();
        await prepare();
        app = await boot();
        await app.ready();
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
