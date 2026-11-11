/**
 * Defines private blob storage and selects its configured adapter.
 */

import { getEnv } from '../../config.js';
import type { Readable } from 'node:stream';
import { LocalBlobs } from './local.js';
import { S3Blobs } from './s3.js';

export interface BlobStorage {
  put(content: Buffer): Promise<string>;
  read(key: string, signal?: AbortSignal): Promise<Readable>;
  remove(key: string): Promise<void>;
  close?(): void;
}

export function createBlobs(): BlobStorage {
  if (getEnv('BLOB_STORAGE') === 's3') {
    return new S3Blobs();
  }
  return new LocalBlobs();
}
