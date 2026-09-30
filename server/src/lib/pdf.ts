import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

const parserPath = createRequire(import.meta.url).resolve('pdf-lib');

export async function pdfPageCount(
  content: Buffer,
  mediaType: string,
  signal?: AbortSignal,
): Promise<number | null> {
  if (mediaType !== 'application/pdf' || signal?.aborted) return null;
  // Parse untrusted PDFs outside the API thread with bounded time and heap usage.
  return new Promise((resolve) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
       const { PDFDocument } = require(workerData.parserPath);
       PDFDocument.load(workerData.content, { updateMetadata: false, throwOnInvalidObject: true })
         .then((pdf) => parentPort.postMessage(pdf.getPageCount()))
         .catch(() => parentPort.postMessage(null));`,
      {
        eval: true,
        workerData: { parserPath, content },
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
        stdout: true,
        stderr: true,
      },
    );
    worker.stdout.resume();
    worker.stderr.resume();
    const finish = (count: unknown = null) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      resolve(
        typeof count === 'number' && Number.isInteger(count) && count > 0 && count <= 2147483647
          ? count
          : null,
      );
    };
    const abort = () => finish();
    const timeout = setTimeout(abort, 3000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', finish);
    worker.once('error', abort);
    worker.once('exit', abort);
  });
}
