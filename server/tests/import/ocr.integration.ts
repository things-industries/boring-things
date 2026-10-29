/** Verifies image OCR before text metadata extraction, empty results and failures without vision fallback. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { createCanvas } from '@napi-rs/canvas';
import { startTestApp } from '../../test/support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ImportAi } from '../../src/application/import/types.js';
import * as googleVision from '../../src/providers/google-vision/index.js';

test('image OCR supplies literal text before the AI task and never falls back on empty results or missing keys', async () => {
  const content = await createCanvas(300, 300).encode('png');
  const text = 'Model: AX1/02\nZ-Nr: 00026\n';
  let outcome = 'text',
    ocrCalls = 0,
    aiCalls = 0;
  const env = await startTestApp({
    readImageText: async (bytes, key, signal) => {
      ocrCalls++;
      assert.deepEqual(bytes, content);
      if (outcome === 'missing-key') return googleVision.readImageText(bytes, '', signal);
      if (outcome === 'error') throw new Error('Fixture OCR failure');
      return outcome === 'empty' ? '' : text;
    },
  });
  try {
    const ai: ImportAi = env.importAi;
    ai.transcribe = async (source) => {
      aiCalls++;
      assert.equal(ocrCalls, 1);
      assert.equal(source.mediaType, 'text/plain');
      assert.equal(source.content.toString(), text);
      return {
        text: 'Untrusted rewritten text',
        summary: 'Fixture label',
        terms: ['model'],
        status: 'COMPLETE',
        metadata: null,
        identifiers: [{ label: 'Z-Nr', value: '00026', page: null, quote: 'Z-Nr: 00026' }],
      };
    };
    const upload = async (expected: string) => {
      const response = await env.app.inject({
        method: 'POST',
        url: '/api/attachments',
        headers: {
          authorization: env.authorization,
          'content-type': 'multipart/form-data; boundary=fixture',
        },
        payload: Buffer.concat([
          Buffer.from(
            '--fixture\r\nContent-Disposition: form-data; name="file"; filename="plate.png"\r\nContent-Type: image/png\r\n\r\n',
          ),
          content,
          Buffer.from('\r\n--fixture--\r\n'),
        ]),
      });
      assert.equal(response.statusCode, 201, response.body);
      const id = response.json<Schema['Attachment']>().id;
      for (let attempt = 0; attempt < 250; attempt++) {
        const result = await env.pool.query(
          'select transcription,transcription_status,identifier_observations from bt.attachments where id=$1',
          [id],
        );
        const source = result.rows[0];
        if (['COMPLETE', 'EMPTY', 'FAILED'].includes(source.transcription_status)) {
          assert.equal(source.transcription_status, expected);
          return { id, ...source };
        }
        await setTimeout(20);
      }
      throw new Error('Fixture OCR timed out');
    };
    const source = await upload('COMPLETE');
    assert.equal(source.transcription, text);
    assert.equal(source.identifier_observations[0].value, '00026');
    const original = await env.app.inject({
      url: `/api/attachments/${source.id}/content`,
      headers: { authorization: env.authorization },
    });
    assert.equal(original.statusCode, 200, original.body);
    assert.deepEqual(original.rawPayload, content);

    outcome = 'empty';
    assert.equal((await upload('EMPTY')).transcription, '');
    outcome = 'missing-key';
    await upload('FAILED');
    outcome = 'error';
    await upload('FAILED');
    assert.equal(ocrCalls, 4);
    assert.equal(aiCalls, 1);
  } finally {
    await env.close();
  }
});
