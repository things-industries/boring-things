import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { documentUrl, downloadPdf, publicAddress } from '../src/providers/documents.js';

const pdf = Buffer.from('%PDF-1.7\nsynthetic document\n%%EOF');
const options = () => ({ maxBytes: 1024, signal: new AbortController().signal });
function response(
  body = pdf,
  headers: IncomingMessage['headers'] = { 'content-type': 'application/pdf' },
  statusCode = 200,
) {
  return Object.assign(Readable.from([body]), { headers, statusCode }) as IncomingMessage;
}

test('documents reject local, reserved, mapped and obfuscated addresses', () => {
  for (const address of [
    '0.0.0.0',
    '127.0.0.2',
    '10.2.3.4',
    '172.20.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.100.100.200',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2002:7f00:1::',
    '2001:db8::1',
  ])
    assert.equal(publicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(publicAddress(address), true, address);
  for (const url of [
    'file:///etc/passwd',
    'http://example.com/manual',
    'https://user:password@example.com/',
    'https://example.com:444/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://[::ffff:127.0.0.1]/',
    'https://localhost/',
    'https://printer.local/',
  ])
    assert.throws(() => documentUrl(url), url);
});

test('downloads verify bytes and accept PDF endpoints without extensions', async () => {
  assert.deepEqual(
    await downloadPdf('https://example.com/download?id=1', options(), async () => response()),
    pdf,
  );
  assert.deepEqual(
    await downloadPdf('https://example.com/manual', options(), async () =>
      response(pdf, { 'content-type': 'application/octet-stream' }),
    ),
    pdf,
  );
  assert.equal(
    await downloadPdf('https://example.com/manual', options(), async () =>
      response(Buffer.from('<html>summary</html>'), { 'content-type': 'text/html' }),
    ),
    null,
  );
  await assert.rejects(
    downloadPdf('https://example.com/manual.pdf', options(), async () =>
      response(Buffer.from('<html>not a PDF</html>')),
    ),
  );
  await assert.rejects(
    downloadPdf('https://example.com/manual.pdf', options(), async () =>
      response(Buffer.from('%PDF-1.7\ntruncated')),
    ),
  );
  await assert.rejects(
    downloadPdf('https://example.com/manual.pdf', options(), async () => response(pdf, {}, 403)),
  );
});

test('downloads enforce declared and streamed size limits and cancellation', async () => {
  for (const headers of [{ 'content-length': '5000' }, {}]) {
    await assert.rejects(
      downloadPdf('https://example.com/file', { ...options(), maxBytes: 10 }, async () =>
        response(pdf, headers),
      ),
    );
  }
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    downloadPdf(
      'https://example.com/file',
      { ...options(), signal: controller.signal },
      async () => {
        calls++;
        return response();
      },
    ),
  );
  assert.equal(calls, 0);
});

test('redirects are bounded and revalidated before another request', async () => {
  const seen: string[] = [];
  assert.deepEqual(
    await downloadPdf('https://example.com/manual', options(), async (url) => {
      seen.push(url.href);
      return seen.length === 1
        ? response(Buffer.alloc(0), { location: '/manual.pdf' }, 302)
        : response();
    }),
    pdf,
  );
  assert.deepEqual(seen, ['https://example.com/manual', 'https://example.com/manual.pdf']);
  let calls = 0;
  await assert.rejects(
    downloadPdf('https://example.com/manual', options(), async () => {
      calls++;
      return response(Buffer.alloc(0), { location: 'https://169.254.169.254/' }, 302);
    }),
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    downloadPdf('https://example.com/manual', options(), async () => {
      calls++;
      return response(Buffer.alloc(0), { location: '/loop' }, 302);
    }),
  );
  assert.equal(calls, 4);
});
