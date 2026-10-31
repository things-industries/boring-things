/** Google Vision image OCR, compresses request copies and returns extracted text without storing images. */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ensure } from '../../application/errors.js';
import { maxDocumentTextLength } from '../../lib/document-limits.js';

// Base64 and request metadata must fit Google's 10 MB JSON request limit.
const maxImageBytes = 7_000_000;

// Reads image text using Google Vision; failures never fall back to another provider.
export async function readImageText(
  content: Buffer,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  ensure(apiKey.trim(), 'Missing GOOGLE_VISION_API_KEY', 'UNAVAILABLE');
  signal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  signal.throwIfAborted();
  let imageBytes = content;
  if (imageBytes.length > maxImageBytes) {
    const image = await loadImage(content);
    let scale = 1;

    // Try JPEG at the original dimensions before reducing the request copy's dimensions.
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const canvas = createCanvas(
        Math.max(1, Math.floor(image.width * scale)),
        Math.max(1, Math.floor(image.height * scale)),
      );
      const context = canvas.getContext('2d');
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      imageBytes = await canvas.encode('jpeg', 90);
      if (imageBytes.length <= maxImageBytes) break;
      scale *= Math.sqrt(maxImageBytes / imageBytes.length) * 0.9;
    }
  }
  ensure(imageBytes.length <= maxImageBytes, 'OCR image too large', 'TOO_LARGE');
  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBytes.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });
  ensure(response.ok, `google_vision_http_${response.status}`, 'UNAVAILABLE');
  const body: unknown = await response.json();
  ensure(
    body !== null &&
      typeof body === 'object' &&
      'responses' in body &&
      Array.isArray(body.responses) &&
      body.responses.length === 1,
    'Invalid Google Vision response',
  );
  const result: unknown = body.responses[0];
  ensure(
    result !== null && typeof result === 'object' && !('error' in result),
    'Google Vision OCR failed',
    'UNAVAILABLE',
  );
  if (!('fullTextAnnotation' in result)) return '';
  const annotation = result.fullTextAnnotation;
  ensure(
    annotation !== null &&
      typeof annotation === 'object' &&
      'text' in annotation &&
      typeof annotation.text === 'string' &&
      annotation.text.length <= maxDocumentTextLength,
    'Invalid Google Vision text',
  );
  return annotation.text;
}
