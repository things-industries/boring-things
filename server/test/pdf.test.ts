import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { pdfPageCount } from '../src/lib/pdf.js';

test('PDF page counts use parsed page trees, including compressed objects', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Not a page object: /Type /Page');
  pdf.addPage();
  for (const useObjectStreams of [true, false]) {
    const content = Buffer.from(await pdf.save({ useObjectStreams }));
    assert.equal(await pdfPageCount(content, 'application/pdf'), 2);
  }
});

test('unreadable, encrypted, non-PDF and cancelled documents have unknown page counts', async () => {
  assert.equal(
    await pdfPageCount(Buffer.from('%PDF-1.7\nmalformed\n%%EOF'), 'application/pdf'),
    null,
  );
  assert.equal(await pdfPageCount(Buffer.from('text'), 'text/plain'), null);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const content = Buffer.from(await pdf.save());
  const controller = new AbortController();
  const pending = pdfPageCount(content, 'application/pdf', controller.signal);
  controller.abort();
  assert.equal(await pending, null);
  pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: 'Standard' }));
  assert.equal(await pdfPageCount(Buffer.from(await pdf.save()), 'application/pdf'), null);
});
