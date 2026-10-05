import { loadImage } from '@napi-rs/canvas';
import { imageSize } from 'image-size';
import { ensure } from '../../application/errors.js';
import { downloadResource, type DocumentOptions } from './pdf.js';

export interface ProductImage {
  content: Buffer;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export async function validateProductImage(content: Buffer): Promise<ProductImage> {
  const { type, width, height } = imageSize(content);
  ensure(type && ['png', 'jpg', 'webp'].includes(type), 'Unsupported product image');
  // Check header dimensions before allocating decoded pixels.
  ensure(
    width >= 200 && height >= 200 && width * height <= 16_000_000,
    'Product image dimensions outside limits',
  );
  const image = await loadImage(content);
  ensure(image.width === width && image.height === height, 'Invalid product image dimensions');
  return {
    content,
    mediaType: type === 'jpg' ? 'image/jpeg' : type === 'png' ? 'image/png' : 'image/webp',
  };
}

export async function downloadImage(
  url: string,
  options: DocumentOptions,
): Promise<ProductImage | null> {
  const resource = await downloadResource(
    url,
    { ...options, maxBytes: Math.min(options.maxBytes, 5_000_000) },
    undefined,
    ['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream', 'binary/octet-stream'],
  );
  return resource ? validateProductImage(resource.content) : null;
}
