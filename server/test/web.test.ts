import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import web from '../src/plugins/web.js';

test('web plugin serves assets and deep links without swallowing API or non-GET misses', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'boring-web-'));
  const app = Fastify();
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  await writeFile(join(directory, 'index.html'), '<main>Application</main>');
  await writeFile(join(directory, 'asset.js'), 'export const ready = true;');
  await app.register(async (api) => {
    api.get('/api/example', async () => ({ ok: true }));
  });
  await app.register(web, { directory });

  assert.deepEqual((await app.inject('/api/example')).json(), { ok: true });
  assert.equal((await app.inject('/asset.js')).body, 'export const ready = true;');
  for (const url of ['/', '/things/example', '/things/example?tab=activity']) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 200, url);
    assert.equal(response.body, '<main>Application</main>');
  }
  for (const url of ['/api', '/api/missing', '/api/missing?query=value']) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 404, url);
    assert.deepEqual(response.json(), { message: 'Not found', statusCode: 404 });
  }
  const response = await app.inject({ method: 'POST', url: '/things/example' });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { message: 'Not found', statusCode: 404 });
});

test('web plugin returns JSON 404s when the frontend build is absent', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'boring-web-'));
  const app = Fastify();
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  await app.register(web, { directory: join(directory, 'missing') });
  for (const url of ['/', '/things/example', '/api', '/api/missing']) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 404, url);
    assert.deepEqual(response.json(), { message: 'Not found', statusCode: 404 });
  }
});
