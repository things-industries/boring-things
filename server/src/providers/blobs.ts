/**
 * Defines private blob storage and a filesystem adapter using random keys, restricted permissions
 * and streamed reads.
 */

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

export interface BlobStorage {
  put(content: Buffer): Promise<string>;
  read(key: string): Readable;
  remove(key: string): Promise<void>;
}

export class LocalBlobs implements BlobStorage {
  constructor(private directory: string) {}

  private path(key: string) {
    // Only generated storage keys become paths; user filenames never control filesystem locations.
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error('Invalid storage key');
    return resolve(this.directory, key);
  }

  async put(content: Buffer) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = randomUUID();
    await writeFile(this.path(key), content, { flag: 'wx', mode: 0o600 });
    return key;
  }

  read(key: string) {
    return createReadStream(this.path(key));
  }

  async remove(key: string) {
    await unlink(this.path(key)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
