import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { ensure } from '../application/errors.js';
import { withDeadline } from '../application/import-deadline.js';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
export function documentUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  ensure(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443'),
    'Unsafe document URL',
  );
  ensure(!isIP(hostname) || publicAddress(hostname), 'Unsafe document address');
  ensure(
    hostname !== 'localhost' && !hostname.endsWith('.localhost') && !hostname.endsWith('.local'),
    'Unsafe document host',
  );
  return url;
}

async function publicRequest(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await withDeadline(lookup(hostname, { all: true, verbatim: true }), signal);
  ensure(
    addresses.length && addresses.every(({ address }) => publicAddress(address)),
    'Unsafe document address',
  );
  signal.throwIfAborted();
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the validated DNS answer for this connection; keep the hostname for TLS verification.
    const request = get(
      url,
      {
        signal,
        agent: false,
        family: address.family,
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: { Accept: 'application/pdf', 'Accept-Encoding': 'identity' },
      },
      resolve,
    );
    request.on('error', reject);
  });
}

export interface DocumentOptions {
  maxBytes: number;
  signal: AbortSignal;
}
export type DocumentDownload = (url: string, options: DocumentOptions) => Promise<Buffer | null>;

export async function downloadPdf(
  value: string,
  options: DocumentOptions,
  request = publicRequest,
): Promise<Buffer | null> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(15000)]);
  let url = documentUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const response = await request(url, signal);
    try {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        ensure(redirects < 3 && response.headers.location, 'Document redirect limit');
        url = documentUrl(new URL(response.headers.location, url).href);
        continue;
      }
      ensure(response.statusCode === 200, 'Document download failed');
      const type = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (
        type &&
        !['application/pdf', 'application/octet-stream', 'binary/octet-stream'].includes(type)
      )
        return null;
      ensure(
        !response.headers['content-encoding'] ||
          response.headers['content-encoding'] === 'identity',
        'Unsupported document encoding',
      );
      ensure(
        Number(response.headers['content-length'] ?? 0) <= options.maxBytes,
        'Document too large',
      );
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response) {
        signal.throwIfAborted();
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        ensure(size <= options.maxBytes, 'Document too large');
        chunks.push(bytes);
      }
      const content = Buffer.concat(chunks);
      ensure(
        content.subarray(0, 5).toString() === '%PDF-' && content.subarray(-1024).includes('%%EOF'),
        'Invalid PDF document',
      );
      return content;
    } finally {
      response.destroy();
    }
  }
  throw new Error('Document redirect limit');
}
