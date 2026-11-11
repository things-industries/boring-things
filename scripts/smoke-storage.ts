/** Verifies hosted attachment bytes and private access, then removes the synthetic object. */
import { getEnv } from '../server/src/config.js';
import assert from 'node:assert/strict';
import { S3Blobs } from '../server/src/providers/blobs/s3.js';

async function verify() {
  const blobs = new S3Blobs();
  let key: string | undefined;
  try {
    const content = Buffer.from('Synthetic Boring Things storage check.');
    key = await blobs.put(content);
    const chunks: Buffer[] = [];
    for await (const chunk of await blobs.read(key)) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), content);
    const endpoint = new URL(getEnv('S3_ENDPOINT'));
    endpoint.pathname = `/storage/v1/object/public/${encodeURIComponent(getEnv('S3_BUCKET'))}/${key}`;
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
