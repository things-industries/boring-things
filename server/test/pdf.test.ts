import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { pdfPageCount, pdfText } from '../src/lib/pdf.js';

test('PDF page counts use parsed page trees, including compressed objects', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Not a page object: /Type /Page');
  pdf.addPage();
  for (const useObjectStreams of [true, false]) {
    const content = Buffer.from(await pdf.save({ useObjectStreams }));
    assert.equal(await pdfPageCount(content, 'application/pdf'), 2);
  }
});

test('PDF text retains original pages, line breaks and identifiers beyond page 100', async () => {
  const pdf = await PDFDocument.create();
  for (let number = 1; number <= 101; number++) {
    const page = pdf.addPage();
    if (number === 1)
      page.drawText('Model 0015\nEnglish user guide', { x: 40, y: 750, lineHeight: 18 });
    if (number === 101) page.drawText('Output power 900 W');
  }
  const content = Buffer.from(await pdf.save());
  assert.deepEqual(await pdfText(content), {
    pageCount: 101,
    text: '[PDF page 1]\nModel 0015\nEnglish user guide\n\n[PDF page 101]\nOutput power 900 W',
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(pdfText(content, controller.signal));
});

test('PDF text is bounded and scanned documents return no embedded text', async () => {
  const { DocumentSizeError, maxDocumentTextLength } =
    await import('../src/lib/document-limits.js');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  assert.deepEqual(await pdfText(Buffer.from(await pdf.save())), { pageCount: 1, text: '' });
  pdf
    .addPage([4000, 4000])
    .drawText(
      Array.from({ length: 1000 }, () => 'x'.repeat(maxDocumentTextLength / 1000 + 1)).join('\n'),
      {
        x: 10,
        y: 3900,
        size: 1,
        lineHeight: 2,
      },
    );
  await assert.rejects(
    pdfText(Buffer.from(await pdf.save())),
    (error: unknown) => error instanceof DocumentSizeError && error.limit === maxDocumentTextLength,
  );
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
