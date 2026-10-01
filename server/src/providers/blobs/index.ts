/**
 * Defines private blob storage and selects its configured adapter.
 */

import type { Readable } from 'node:stream';
import { LocalBlobs } from './local.js';

export interface BlobStorage {
  put(content: Buffer): Promise<string>;
  read(key: string): Readable;
  remove(key: string): Promise<void>;
}

export function createBlobs(directory: string): BlobStorage {
  return new LocalBlobs(directory);
}
