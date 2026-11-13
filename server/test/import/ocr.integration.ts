/** Verifies image and PDF OCR before attachment summaries, including persisted text and failure outcomes. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { createTestApp, type TestApp } from '../support/test-app.js';
import type { Schema } from '../../../shared/model.js';
import type { ImportAi } from '../../src/application/import/types.js';
import * as googleVision from '../../src/providers/google-vision/index.js';
import { setDiagnosticLogger } from '../../src/metrics.js';

// Uploads a fixture and waits for its persisted transcription outcome.
async function uploadAttachment(
  env: TestApp,
  content: Buffer,
  mediaType: string,
  expected: string,
) {
  const response = await env.app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      authorization: env.authorization,
      'content-type': 'multipart/form-data; boundary=fixture',
    },
    payload: Buffer.concat([
      Buffer.from(
        `--fixture\r\nContent-Disposition: form-data; name="file"; filename="fixture"\r\nContent-Type: ${mediaType}\r\n\r\n`,
      ),
      content,
      Buffer.from('\r\n--fixture--\r\n'),
    ]),
  });
  assert.equal(response.statusCode, 201, response.body);
  const id = response.json<Schema['Attachment']>().id;
  for (let attempt = 0; attempt < 250; attempt++) {
    const result = await env.pool.query(
      'select transcription,transcription_status,identifier_observations,page_count,transcription_usage from bt.attachments where id=$1',
      [id],
    );
    const source = result.rows[0];
    if (['COMPLETE', 'EMPTY', 'PARTIAL', 'FAILED'].includes(source.transcription_status)) {
      assert.equal(source.transcription_status, expected);
      return { id, ...source };
    }
    await setTimeout(20);
  }
  throw new Error('Fixture OCR timed out');
}

test('image analysis receives OCR text and the original image while OCR failures stop analysis', async (t) => {
  const content = await createCanvas(300, 300).encode('png');
  const text = 'Model: AX1/02\nZ-Nr: 00026\n';
  let outcome = 'text',
    ocrCalls = 0,
    aiCalls = 0;
  const env = await createTestApp({
    readImageText: async (bytes, signal) => {
      ocrCalls++;
      assert.deepEqual(bytes, content);
      if (outcome === 'missing-key') return googleVision.readImageText(bytes, signal);
      if (outcome === 'error') throw new Error('Fixture OCR failure');
      return outcome === 'empty' ? '' : text;
    },
  });
  const warnings: unknown[] = [];
  setDiagnosticLogger({
    info: () => {},
    warn: () => {},
    error: (details: unknown, message?: string) => {
      if (message === 'Background job finished') warnings.push(details);
    },
  });
  t.after(() => setDiagnosticLogger(undefined));
  try {
    const ai: ImportAi = env.importAi;
    ai.summarizeAttachment = async ({ text: input, image }) => {
      aiCalls++;
      assert.equal(ocrCalls, aiCalls);
      assert.equal(input, outcome === 'empty' ? '' : text);
      assert.deepEqual(image?.content, content);
      assert.equal(image?.mediaType, 'image/png');
      if (outcome === 'empty')
        return { summary: null, terms: [], status: 'EMPTY', metadata: null, identifiers: [] };
      return {
        summary: 'Fixture label',
        terms: ['model'],
        status: 'COMPLETE',
        metadata: null,
        identifiers: [{ label: 'Z-Nr', value: '00026', page: null, quote: 'Z-Nr: 00026' }],
      };
    };
    const upload = (expected: string) => uploadAttachment(env, content, 'image/png', expected);
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
    const missingKey = await upload('FAILED');
    outcome = 'error';
    const ocrFailure = await upload('FAILED');
    assert.deepEqual(
      warnings.map((warning) => {
        assert.ok(warning && typeof warning === 'object');
        return ['jobId', 'stage', 'reason', 'status'].map((key) => Reflect.get(warning, key));
      }),
      [
        [missingKey.id, 'ocr', 'ocr_credentials_missing', 'FAILED'],
        [ocrFailure.id, 'ocr', 'transcription_failed', 'FAILED'],
      ],
    );
    assert.doesNotMatch(JSON.stringify(warnings), /Fixture OCR failure/);
    assert.equal(ocrCalls, 4);
    assert.equal(aiCalls, 2);
  } finally {
    await env.close();
  }
});

test('only uploaded images with fewer than 500 trimmed OCR characters include original content', async () => {
  const content = await createCanvas(20, 20).encode('png');
  let text = '';
  const env = await createTestApp({ readImageText: async () => text });
  try {
    const ai: ImportAi = env.importAi;
    const cases = [
      { text: '  ' + 'x'.repeat(499) + '\n', mediaType: 'image/png', image: true },
      { text: 'x'.repeat(500), mediaType: 'image/png', image: false },
      { text: 'Short note', mediaType: 'text/plain', image: false },
    ];
    for (const entry of cases) {
      text = entry.text;
      let calls = 0;
      ai.summarizeAttachment = async (input) => {
        calls++;
        assert.equal(input.text, text);
        assert.equal(!!input.image, entry.image);
        return { summary: 'Fixture source', terms: [], status: 'COMPLETE', metadata: null };
      };
      const source = await uploadAttachment(
        env,
        entry.mediaType === 'text/plain' ? Buffer.from(text) : content,
        entry.mediaType,
        'COMPLETE',
      );
      assert.equal(source.transcription, text);
      assert.equal(calls, 1);
    }
  } finally {
    await env.close();
  }
});

test('images without OCR text supply visual summaries to Thing resolution and recommendations', async () => {
  const env = await createTestApp({ readImageText: async () => '' });
  try {
    const ai: ImportAi = env.importAi;
    const summary = 'A blue kettle with a handle and spout.';
    ai.summarizeAttachment = async ({ text, image }) => {
      assert.equal(text, '');
      assert.ok(image);
      return {
        summary,
        terms: ['kettle'],
        status: 'COMPLETE',
        metadata: { title: 'Kettle photo' },
      };
    };
    const source = await uploadAttachment(
      env,
      await createCanvas(20, 20).encode('png'),
      'image/png',
      'COMPLETE',
    );
    assert.equal(source.transcription, '');
    let resolutions = 0,
      recommendations = 0;
    env.importAi.resolveThing = async ({ sources }) => {
      resolutions++;
      assert.equal(sources[0]?.summary, summary);
      return {
        contradiction: false,
        candidates: [
          {
            name: 'Kettle',
            categoryId: 'appliances',
            terms: ['kettle'],
            identifiers: [],
            attachmentIds: [source.id],
            strength: 1,
            matchedThingId: null,
          },
        ],
      };
    };
    env.importAi.suggestTasks = async ({ sources }) => {
      recommendations++;
      assert.equal(sources[0]?.summary, summary);
      return { items: [] };
    };
    const headers = { authorization: env.authorization };
    const submitted = await env.app.inject({
      method: 'POST',
      url: '/api/imports',
      headers,
      payload: { attachmentIds: [source.id] },
    });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const id = submitted.json<Schema['ImportAccepted']>().importId;
    let job: Schema['Import'] | undefined;
    for (let attempt = 0; attempt < 250; attempt++) {
      const result = await env.app.inject({ url: '/api/imports/' + id, headers });
      assert.equal(result.statusCode, 200, result.body);
      job = result.json<Schema['Import']>();
      if (['COMPLETE', 'FAILED', 'INCOMPLETE'].includes(job.status)) break;
      await setTimeout(20);
    }
    assert.equal(job?.status, 'COMPLETE', JSON.stringify(job));
    assert.equal(resolutions, 1);
    assert.equal(recommendations, 1);
    const saved = await env.pool.query(
      'select title,transcription_summary from bt.attachments where id=$1',
      [source.id],
    );
    assert.deepEqual(saved.rows, [{ title: 'Kettle photo', transcription_summary: summary }]);
  } finally {
    await env.close();
  }
});

test('PDF OCR saves mixed-page text before summarization and handles empty or failed scans', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 100]).drawText('Model AX1', { x: 10, y: 60 });
  const image = await pdf.embedPng(await createCanvas(200, 100).encode('png'));
  pdf.addPage([200, 100]).drawImage(image, { x: 0, y: 0, width: 200, height: 100 });
  pdf.addPage([200, 100]).drawText('Power 900 W', { x: 10, y: 60 });
  const content = Buffer.from(await pdf.save());
  const expectedText =
    '[PDF page 1]\nModel AX1\n\n[PDF page 2]\nSerial: 00026\n\n[PDF page 3]\nPower 900 W';
  let outcome = 'text',
    ocrCalls = 0,
    summaryCalls = 0;
  const env = await createTestApp({
    readImageText: async (bytes) => {
      ocrCalls++;
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      if (outcome === 'error') throw new Error('Fixture OCR failure');
      return outcome === 'empty' ? '' : 'Serial: 00026';
    },
  });
  try {
    const ai: ImportAi = env.importAi;
    ai.summarizeAttachment = async ({ text, image }) => {
      summaryCalls++;
      assert.equal(text, expectedText);
      assert.equal(image, undefined);
      return {
        summary: 'Fixture manual',
        terms: ['manual'],
        status: 'COMPLETE',
        metadata: null,
        identifiers: [{ label: 'Serial', value: '00026', page: 2, quote: 'Serial: 00026' }],
      };
    };
    const saved = await uploadAttachment(env, content, 'application/pdf', 'COMPLETE');
    assert.equal(saved.transcription, expectedText);
    assert.equal(saved.page_count, 3);
    assert.equal(saved.identifier_observations[0].page, 2);
    assert.equal(saved.transcription_usage.toolCalls[0].name, 'google_vision_ocr');
    assert.equal(ocrCalls, 1);
    assert.equal(summaryCalls, 1);

    const scanned = await PDFDocument.create();
    scanned.addPage([200, 100]);
    const scan = Buffer.from(await scanned.save());
    outcome = 'empty';
    const empty = await uploadAttachment(env, scan, 'application/pdf', 'EMPTY');
    assert.equal(empty.transcription, '');
    assert.equal(empty.page_count, 1);
    outcome = 'error';
    await uploadAttachment(env, scan, 'application/pdf', 'FAILED');
    assert.equal(ocrCalls, 3);
    assert.equal(summaryCalls, 1);
  } finally {
    await env.close();
  }
});

// Literal quote checks discarded readable attachments when model quotes collapsed PDF whitespace.
test('attachment quote mismatches omit quotations while keeping text and identifiers', async () => {
  const text = 'Model: AX1\nSerial:   00026\n';
  const env = await createTestApp({ readImageText: async () => text });
  try {
    const ai: ImportAi = env.importAi;
    ai.summarizeAttachment = async () => ({
      summary: 'Fixture label',
      terms: ['model'],
      status: 'COMPLETE',
      metadata: null,
      identifiers: [
        { label: ' Serial ', value: ' 00026 ', page: null, quote: ' Serial: 00026 ' },
        { label: 'Model', value: 'UNKNOWN', page: null, quote: 'Model: UNKNOWN' },
      ],
    });
    const source = await uploadAttachment(
      env,
      await createCanvas(20, 20).encode('png'),
      'image/png',
      'COMPLETE',
    );
    assert.equal(source.transcription, text);
    assert.deepEqual(source.identifier_observations, [
      { label: 'Serial', value: '00026', page: null, quote: 'Serial: 00026' },
      { label: 'Model', value: 'UNKNOWN', page: null, quote: '' },
    ]);
  } finally {
    await env.close();
  }
});

// Summary, language and metadata validation discarded text that OCR had already extracted.
test('attachment analysis failures keep text and valid metadata available', async () => {
  const text = 'Model AX1';
  const env = await createTestApp({ readImageText: async () => text });
  try {
    const ai: ImportAi = env.importAi;
    for (const outcome of ['error', 'language', 'metadata']) {
      ai.summarizeAttachment = async () => {
        if (outcome === 'error') throw new Error('Synthetic summary failure');
        return {
          summary: 'Fixture label',
          terms: ['model'],
          identifiers: [],
          status: outcome === 'language' ? 'INSUFFICIENT_LANGUAGE' : 'COMPLETE',
          metadata:
            outcome === 'metadata' ? { title: 'Fixture label', documentDate: 'invalid' } : null,
        };
      };
      const source = await uploadAttachment(
        env,
        await createCanvas(20, 20).encode('png'),
        'image/png',
        outcome === 'metadata' ? 'COMPLETE' : 'PARTIAL',
      );
      assert.equal(source.transcription, text);
      if (outcome === 'metadata') {
        const saved = await env.pool.query(
          'select title,document_date from bt.attachments where id=$1',
          [source.id],
        );
        assert.deepEqual(saved.rows, [{ title: 'Fixture label', document_date: null }]);
      }
    }
  } finally {
    await env.close();
  }
});
