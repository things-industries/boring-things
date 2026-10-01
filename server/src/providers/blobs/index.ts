/**
 * Defines private blob storage and selects its configured adapter.
 */

import type { Readable } from 'node:stream';
import { LocalBlobs } from './local.js';
import { S3Blobs } from './s3.js';
import type { EnvConfig } from '../../config.js';

export interface BlobStorage {
  put(content: Buffer): Promise<string>;
  read(key: string, signal?: AbortSignal): Promise<Readable>;
  remove(key: string): Promise<void>;
  close?(): void;
}

export function createBlobs(config: EnvConfig): BlobStorage {
  if (config.blobStorage === 's3') {
    if (!config.s3) throw new Error('Missing S3 configuration');
    return new S3Blobs(config.s3);
  }
  return new LocalBlobs(config.blobDirectory);
}
