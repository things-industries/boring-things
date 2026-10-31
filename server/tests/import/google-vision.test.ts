/** Checks Google Vision requests, response validation and image copies using mocked HTTP. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readImageText } from '../../src/providers/google-vision/index.js';
import { readConfig } from '../../src/config.js';

const signal = () => new AbortController().signal;

test('Google Vision returns literal text and sends its key only in the request header', async (t) => {
  const text = 'Model: AX1/02\nZ-Nr: 00026\n';
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests++;
    assert.equal(url, 'https://vision.googleapis.com/v1/images:annotate');
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'fixture-key');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const body = JSON.parse(String(options.body));
    assert.deepEqual(body.requests[0].features, [{ type: 'DOCUMENT_TEXT_DETECTION' }]);
    assert.equal(Buffer.from(body.requests[0].image.content, 'base64').toString(), 'fixture image');
    return Response.json({ responses: [{ fullTextAnnotation: { text } }] });
  });
  assert.equal(
    readConfig({ GOOGLE_VISION_API_KEY: ' fixture-key ' }).googleVisionApiKey,
    'fixture-key',
  );
  assert.equal(await readImageText(Buffer.from('fixture image'), 'fixture-key', signal()), text);
  assert.equal(requests, 1);
});

test('missing keys and cancellation stop OCR before making a request', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected request');
  });
  await assert.rejects(
    readImageText(Buffer.alloc(0), '', signal()),
    /Missing GOOGLE_VISION_API_KEY/,
  );
  await assert.rejects(readImageText(Buffer.alloc(0), 'fixture-key', AbortSignal.abort()), {
    name: 'AbortError',
  });
  assert.equal(request.mock.callCount(), 0);
});

test('Google HTTP, image and malformed-response errors fail OCR without using another provider', async (t) => {
  const cases = [
    {
      status: 403,
      body: { error: { message: 'Private provider details' } },
      reason: /google_vision_http_403/,
    },
    {
      status: 200,
      body: { responses: [{ error: { message: 'Private provider details' } }] },
      reason: /Google Vision OCR failed/,
    },
    { status: 200, body: {}, reason: /Invalid Google Vision response/ },
    {
      status: 200,
      body: { responses: [{ fullTextAnnotation: { text: 42 } }] },
      reason: /Invalid Google Vision text/,
    },
  ];
  for (const fixture of cases) {
    const request = t.mock.method(globalThis, 'fetch', async () =>
      Response.json(fixture.body, { status: fixture.status }),
    );
    await assert.rejects(
      readImageText(Buffer.from('fixture image'), 'fixture-key', signal()),
      fixture.reason,
    );
    assert.equal(request.mock.callCount(), 1);
    request.mock.restore();
  }
});

test('images without recognised text return an empty result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ responses: [{}] }));
  assert.equal(await readImageText(Buffer.from('fixture image'), 'fixture-key', signal()), '');
});

test('large image request copies become JPEG at their original dimensions', async (t) => {
  const png = await createCanvas(300, 300).encode('png');
  const content = Buffer.concat([png, Buffer.alloc(7_000_001)]);
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.ok(Buffer.byteLength(String(options.body)) < 10_000_000);
    const jpeg = Buffer.from(body.requests[0].image.content, 'base64');
    assert.equal(jpeg[0], 255);
    assert.equal(jpeg[1], 216);
    const image = await loadImage(jpeg);
    assert.equal(image.width, 300);
    assert.equal(image.height, 300);
    return Response.json({ responses: [{}] });
  });
  await readImageText(content, 'fixture-key', signal());
  assert.equal(content.length, png.length + 7_000_001);
  assert.deepEqual(content.subarray(0, png.length), png);
});
