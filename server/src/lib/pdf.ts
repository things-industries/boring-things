/** PDF page counting, text extraction and bounded rendering for pages requiring OCR. */

import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { DocumentSizeError, maxDocumentTextLength } from './document-limits.js';

const parserPath = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.mjs');
const canvasPath = createRequire(import.meta.url).resolve('@napi-rs/canvas');

// Parse untrusted PDFs outside the API thread with bounded time, heap and extracted text.
async function parsePdf<T>(
  content: Buffer,
  extractText: boolean,
  signal?: AbortSignal,
  readImageText?: (content: Buffer) => Promise<string>,
): Promise<T> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
       (async () => {
         const { getDocument } = await import(workerData.parserPath);
         const task = getDocument({ data: workerData.content, verbosity: 0,
           useSystemFonts: false, disableFontFace: true, useWorkerFetch: false, stopAtErrors: true });
         try {
           const pdf = await task.promise;
           if (!workerData.extractText) return { result: pdf.numPages };
           const pages = [];
           let size = 0;
           for (let number = 1; number <= pdf.numPages; number++) {
             const page = await pdf.getPage(number);
             const { items } = await page.getTextContent();
             let text = items.filter(item => typeof item.str === 'string')
               .map(item => item.str + (item.hasEOL ? '\\n' : ' ')).join('').trim();
             if (!text && workerData.ocr) {
               const { createCanvas } = require(workerData.canvasPath);
               const viewport = page.getViewport({ scale: 1 });
               const scale = Math.min(2, Math.sqrt(4000000 / (viewport.width * viewport.height)));
               const scaled = page.getViewport({ scale });
               const canvas = createCanvas(Math.ceil(scaled.width), Math.ceil(scaled.height));
               await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
               const image = await canvas.encode('png');
               canvas.width = canvas.height = 1;
               text = await new Promise(resolve => {
                 parentPort.once('message', result => resolve(result.text));
                 parentPort.postMessage({ image });
               });
             }
             page.cleanup();
             if (!text.trim()) continue;
             const labelled = '[PDF page ' + number + ']\\n' + text;
             size += labelled.length + (pages.length ? 2 : 0);
             if (size > workerData.maxTextLength) return { size };
             pages.push(labelled);
           }
           return { result: { pageCount: pdf.numPages, text: pages.join('\\n\\n') } };
         } finally {
           await task.destroy();
         }
       })().then(result => parentPort.postMessage(result))
         .catch(() => parentPort.postMessage({ error: true }));`,
      {
        eval: true,
        execArgv: [],
        workerData: {
          parserPath,
          canvasPath,
          content,
          extractText,
          ocr: !!readImageText,
          maxTextLength: maxDocumentTextLength,
        },
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 16 },
        stdout: true,
        stderr: true,
      },
    );
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (result?: T, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(undefined, signal?.reason ?? new Error('Document parsing timeout'));
    let timeout = setTimeout(abort, 15000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.on(
      'message',
      (message: { result?: T; size?: number; error?: boolean; image?: Uint8Array }) => {
        if (settled) return;
        if (message.image && readImageText) {
          // OCR uses its own deadline; restart the parsing deadline when the worker resumes.
          clearTimeout(timeout);
          void readImageText(Buffer.from(message.image)).then(
            (text) => {
              if (settled) return;
              timeout = setTimeout(abort, 15000);
              worker.postMessage({ text });
            },
            (error: unknown) =>
              finish(undefined, error instanceof Error ? error : new Error('PDF OCR failed')),
          );
          return;
        }
        if (message.size)
          finish(undefined, new DocumentSizeError(message.size, maxDocumentTextLength));
        else if (message.error) finish(undefined, new Error('Document parsing failed'));
        else finish(message.result);
      },
    );
    worker.once('error', () => finish(undefined, new Error('Document parsing failed')));
    worker.once('exit', () => finish(undefined, new Error('Document parsing failed')));
  });
}

// Counts parsed PDF pages, returning null for unreadable or other file types.
export async function pdfPageCount(
  content: Buffer,
  mediaType: string,
  signal?: AbortSignal,
): Promise<number | null> {
  if (mediaType !== 'application/pdf' || signal?.aborted) return null;
  try {
    const count = await parsePdf<number>(content, false, signal);
    return Number.isInteger(count) && count > 0 ? count : null;
  } catch {
    return null;
  }
}

// Extracts labelled page text, using the supplied OCR reader for pages without embedded text.
export function pdfText(
  content: Buffer,
  signal?: AbortSignal,
  readImageText?: (content: Buffer) => Promise<string>,
) {
  return parsePdf<{ pageCount: number; text: string }>(content, true, signal, readImageText);
}
