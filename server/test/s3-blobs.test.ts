import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { S3Blobs } from '../src/providers/blobs/s3.js';

test('S3 adapter signs private uploads, streams bytes and deletes objects', async (t) => {
  const objects = new Map<string, Buffer>();
  const server = createServer(async (req, res) => {
    assert.match(req.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /);
    const key = new URL(req.url!, 'http://localhost').pathname;
    if (req.method === 'PUT') {
      assert.equal(req.headers['cache-control'], 'private, no-store');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      res.end();
    } else if (req.method === 'GET') {
      const body = objects.get(key);
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        res.end('<Error><Code>NoSuchKey</Code></Error>');
      } else res.end(body);
    } else {
      objects.delete(key);
      res.writeHead(204).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const blobs = new S3Blobs({
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    bucket: 'attachments',
    region: 'eu-west-2',
    accessKeyId: 'synthetic-access',
    secretAccessKey: 'synthetic-secret',
  });
  t.after(() => blobs.close());
  const content = Buffer.from([0, 1, 255, 128, 20]);
  const key = await blobs.put(content);
  assert.match(key, /^[0-9a-f-]{36}$/);
  const chunks = [];
  for await (const chunk of await blobs.read(key)) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), content);
  await assert.rejects(blobs.read(key, AbortSignal.abort()));
  await blobs.remove(key);
  await blobs.remove(key);
  await assert.rejects(blobs.read(key), { name: 'NoSuchKey' });
  assert.equal(objects.size, 0);
});
