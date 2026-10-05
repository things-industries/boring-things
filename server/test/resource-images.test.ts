import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { resourceLinks } from '../src/providers/web/resources.js';
import { validateProductImage } from '../src/providers/web/image.js';

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
