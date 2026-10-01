/** Verifies hosted attachment bytes and private access, then removes the synthetic object. */
import assert from 'node:assert/strict';
import { readConfig } from '../server/src/config.js';
import { S3Blobs } from '../server/src/providers/blobs/s3.js';

async function verify() {
  const config = readConfig();
  if (!config.s3) throw new Error('S3 configuration required');
  const blobs = new S3Blobs(config.s3);
  let key: string | undefined;
  try {
    const content = Buffer.from('Synthetic Boring Things storage check.');
    key = await blobs.put(content);
    const chunks: Buffer[] = [];
    for await (const chunk of await blobs.read(key)) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), content);
    const endpoint = new URL(config.s3.endpoint);
    endpoint.pathname = `/storage/v1/object/public/${encodeURIComponent(config.s3.bucket)}/${key}`;
    const anonymous = await fetch(endpoint, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    await anonymous.body?.cancel();
    assert.ok([400, 401, 403, 404].includes(anonymous.status), 'Anonymous download must be denied');
    await blobs.remove(key);
    await assert.rejects(
      blobs.read(key),
      (error: unknown) =>
        (error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 404,
    );
    key = undefined;
    console.log('Hosted upload, byte comparison, private access and deletion passed.');
  } finally {
    try {
      if (key) await blobs.remove(key);
    } finally {
      blobs.close();
    }
  }
}

try {
  await verify();
} catch {
  console.error('Storage check failed. Verify credentials, bucket privacy and connectivity.');
  process.exitCode = 1;
}
