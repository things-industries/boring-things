import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPages, apiData, createApiClient } from '../../src/app/core/api/api-client.js';

test('authenticated requests obtain the current token and disable caching', async () => {
  let token = 'first';
  const client = createApiClient(
    { token: async () => token, onUnauthorized: () => assert.fail('Unexpected 401') },
    {
      baseUrl: 'https://example.test',
      async fetch(request) {
        assert.equal(request.headers.get('Authorization'), `Bearer ${token}`);
        assert.equal(request.cache, 'no-store');
        assert.equal(request.method, 'DELETE');
        assert.equal(new URL(request.url).pathname, '/api/things/thing-1');
        return new Response(null, { status: 204 });
      },
    },
  );
  await client.DELETE('/api/things/{id}', { params: { path: { id: 'thing-1' } } });
  token = 'refreshed';
  await client.DELETE('/api/things/{id}', { params: { path: { id: 'thing-1' } } });
});

test('public configuration needs no token', async () => {
  const config = { logtoAppId: 'public-config' };
  const client = createApiClient(undefined, {
    baseUrl: 'https://example.test',
    async fetch(request) {
      assert.equal(request.headers.has('Authorization'), false);
      return Response.json(config);
    },
  });
  assert.deepEqual(await client.GET('/api/config').then(apiData), config);
});

test('JSON and non-JSON failures reject, including unauthorized blob downloads', async () => {
  let unauthorized = 0;
  let response = Response.json({ message: 'Session expired' }, { status: 401 });
  const client = createApiClient(
    {
      token: async () => 'expired',
      onUnauthorized: () => {
        unauthorized++;
      },
    },
    { baseUrl: 'https://example.test', fetch: async () => response },
  );
  await assert.rejects(
    client.GET('/api/attachments/{id}/content', {
      params: { path: { id: 'file-1' } },
      parseAs: 'blob',
    }),
    /Session expired/,
  );
  assert.equal(unauthorized, 1);
  response = new Response('Bad gateway', { status: 502 });
  await assert.rejects(client.GET('/api/profile'), /Request failed/);
  assert.equal(unauthorized, 1);
  response = Response.json({ message: 'File is still linked' }, { status: 409 });
  await assert.rejects(
    client.DELETE('/api/attachments/{id}', {
      params: { path: { id: 'file-1' } },
    }),
    /File is still linked/,
  );
});

test('pagination preserves filters and encodes opaque cursors across pages', async () => {
  const cursor = 'offset+/=&?';
  let requests = 0;
  const client = createApiClient(undefined, {
    baseUrl: 'https://example.test',
    async fetch(request) {
      const query = new URL(request.url).searchParams;
      assert.equal(query.get('thingId'), 'thing-1');
      assert.equal(query.get('limit'), '100');
      assert.equal(query.get('cursor'), requests === 0 ? null : cursor);
      requests++;
      return Response.json({
        items: [{ id: String(requests) }],
        nextCursor: requests === 1 ? cursor : null,
      });
    },
  });
  const items = await allPages((query) =>
    client.GET('/api/attachments', {
      params: { query: { ...query, thingId: 'thing-1' } },
    }),
  );
  assert.deepEqual(items, [{ id: '1' }, { id: '2' }]);
  assert.equal(requests, 2);
});
