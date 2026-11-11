/** Checks public resource link extraction and product image validation. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { resourceLinks } from '../src/providers/web/resources.js';
import { validateProductImage } from '../src/providers/web/image.js';

// Resource extraction dropped Mazda-style image URLs with a transformation after the extension.
test('resource catalogue includes transformed image sources and images without filename extensions', () => {
  const links = resourceLinks(
    '<img src="/photos/car.jpg/half-size?token=example" alt="Example Roadster">' +
      '<img src="/assets/car-preview?id=42">' +
      '<a href="/photos/car.jpg/full-size?token=example">Full size</a>' +
      '<script src="/scripts/app.js"></script>',
    'https://maker.example/models/roadster',
  );
  assert.deepEqual(
    links.map((link) => link.url),
    [
      'https://maker.example/photos/car.jpg/half-size?token=example',
      'https://maker.example/assets/car-preview?id=42',
      'https://maker.example/photos/car.jpg/full-size?token=example',
    ],
  );
  assert.match(links[0].context, /Example Roadster/);
});

test('resource catalogue resolves responsive images without splitting URL transformation commas', () => {
  const links = resourceLinks(
    '<picture><source srcset="/image/upload/q_auto,f_auto/car-small 1x, /image/upload/q_auto,f_auto/car-large 2x">' +
      '<img srcset="../car-medium 600w,../car-wide 1200w" src="../car-medium"></picture>' +
      '<img srcset="https://127.0.0.1/private 1x, /car-safe 2x">',
    'https://maker.example/models/roadster',
  );
  assert.deepEqual(
    links.map((link) => link.url),
    [
      'https://maker.example/image/upload/q_auto,f_auto/car-small',
      'https://maker.example/image/upload/q_auto,f_auto/car-large',
      'https://maker.example/car-medium',
      'https://maker.example/car-wide',
      'https://maker.example/car-safe',
    ],
  );
});

test('resource catalogue finds embedded downloads after navigation, resolves links and rejects private addresses', () => {
  const navigation = Array.from(
    { length: 200 },
    (_, index) => `<a href="/navigation/${index}">Navigation</a><img src="/icons/${index}.png">`,
  ).join('');
  const links = resourceLinks(
    navigation +
      '<script>{"description":"User Manual","downloadUrl":"https://docs.example/download?file=manual.pdf&amp;language=EN"}</script><img src="/model/photo.webp"><a href="https://127.0.0.1/private.pdf">Unsafe</a>',
    'https://maker.example/support/model',
  );
  assert.equal(links[0].url, 'https://docs.example/download?file=manual.pdf&language=EN');
  assert.match(links[0].context, /User Manual/);
  assert.ok(!links.some((link) => link.url.includes('127.0.0.1')));
  assert.ok(links.length <= 30);
  assert.ok(
    resourceLinks('<img src="/model/photo.webp">', 'https://maker.example/support/model').some(
      (link) => link.url === 'https://maker.example/model/photo.webp',
    ),
  );
});

test('product images require decodable supported bytes and useful dimensions', async () => {
  const canvas = createCanvas(300, 300);
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const content = format === 'png' ? await canvas.encode('png') : await canvas.encode(format);
    const image = await validateProductImage(content);
    assert.equal(image.mediaType, 'image/' + format);
  }
  await assert.rejects(validateProductImage(Buffer.from('<svg><script>bad()</script></svg>')));
  await assert.rejects(validateProductImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  await assert.rejects(validateProductImage(await createCanvas(20, 20).encode('png')));
  const oversized = await canvas.encode('png');
  oversized.writeUInt32BE(100000, 16);
  await assert.rejects(validateProductImage(oversized), /dimensions outside limits/);
});
