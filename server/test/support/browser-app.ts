/**
 * Starts the built application against an isolated temporary database with fixture AI providers,
 * a local JWKS issuer and a signed-in Playwright browser, for browser checks and page previews.
 */

import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { FixtureChat } from '../fixtures/chat.js';
import { FixtureAi } from '../fixtures/imports.js';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { createPool, transaction } from '../../src/db/connection.js';
import { seedRegistry } from '../../src/db/registry-seed.js';

export const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1100 },
};

const appId = 'browser-test';
const subject = 'browser-alice';
// Cloud sessions ship a preinstalled Chromium that may not match the Playwright revision.
const preinstalledChromium = '/opt/pw-browsers/chromium';

export async function launchBrowser(): Promise<Browser> {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
    (!existsSync(chromium.executablePath()) && existsSync(preinstalledChromium)
      ? preinstalledChromium
      : undefined);
  return chromium.launch({ executablePath });
}

export async function startBrowserApp(options: { samples?: boolean } = {}) {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  );
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('TEST_DATABASE_URL must point at a local database');
  if (!existsSync('dist/web/browser/index.html'))
    throw new Error('Build the frontend first: CI=true pnpm build');
  const dbName = 'bt_browser_' + randomUUID().replaceAll('-', '');
  const admin = createPool(url.toString());
  const cleanup: (() => Promise<unknown> | unknown)[] = [() => admin.end()];
  const close = async () => {
    for (const step of cleanup.reverse()) await step();
  };
  try {
    // Supabase provides these roles; plain PostgreSQL needs them for the migrations' grants.
    await admin.query(`do $$ begin
      if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$`);
    await admin.query(`create database ${dbName}`);
    cleanup.push(() => admin.query(`drop database ${dbName} with (force)`));
    url.pathname = '/' + dbName;
    const pool = createPool(url.toString());
    cleanup.push(() => pool.end());
    const directory = await mkdtemp(tmpdir() + '/boring-browser-');
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
    const config = {
      ...readConfig(),
      logtoEndpoint: issuer,
      logtoAppId: appId,
      blobDirectory: directory,
      sampleDataEnabled: true,
    };

    const migrations = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
      await pool.query(await readFile(new URL(file, migrations), 'utf8'));
    }
    await transaction(pool, seedRegistry);
    const importAi = new FixtureAi();
    const chatAi = new FixtureChat();
    const app = await buildApp({ pool, config, importAi, chatAi });
    const base = await app.listen({ host: '127.0.0.1', port: 0 });
    cleanup.push(() => app.close());

    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject(subject)
      .setAudience(config.apiResource)
      .setIssuer(issuer + '/oidc')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(privateKey);
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

    const browser = await launchBrowser();
    cleanup.push(() => browser.close());
    // Seed a session only in this test browser; the API still validates the signed access token through JWKS.
    const signIn = (context: BrowserContext) =>
      context.addInitScript(
        ({ appId, accessToken, resource }) => {
          localStorage.setItem(`logto:${appId}:idToken`, 'test-session');
          localStorage.setItem(
            `logto:${appId}:accessToken`,
            JSON.stringify({
              ['@' + resource]: {
                token: accessToken,
                scope: '',
                expiresAt: Date.now() / 1000 + 43200,
              },
            }),
          );
        },
        { appId, accessToken, resource: config.apiResource },
      );
    const newContext = async (signedIn = true) => {
      const context = await browser.newContext({ viewport: viewports.desktop });
      if (signedIn) await signIn(context);
      return context;
    };

    return {
      base,
      app,
      pool,
      browser,
      config,
      importAi,
      chatAi,
      accessToken,
      authorization,
      newContext,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export type BrowserApp = Awaited<ReturnType<typeof startBrowserApp>>;
