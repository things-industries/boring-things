/** Stores private attachments through the S3 API. */
import { randomUUID } from 'node:crypto';
import { Readable, addAbortSignal } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { EnvConfig } from '../../config.js';
import type { BlobStorage } from './index.js';

export function s3Client(config: NonNullable<EnvConfig['s3']>) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 10000, requestTimeout: 30000 },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class S3Blobs implements BlobStorage {
  private client: S3Client;

  constructor(private config: NonNullable<EnvConfig['s3']>) {
    this.client = s3Client(config);
  }

  async put(content: Buffer) {
    const key = randomUUID();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: content,
        ContentLength: content.length,
        ContentType: 'application/octet-stream',
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(60000) },
    );
    return key;
  }

  async read(key: string, signal?: AbortSignal) {
    const abortSignal = AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
      { abortSignal },
    );
    if (!(response.Body instanceof Readable)) throw new Error('Storage response has no stream');
    return addAbortSignal(abortSignal, response.Body);
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(60000),
    });
  }

  close() {
    this.client.destroy();
  }
}
