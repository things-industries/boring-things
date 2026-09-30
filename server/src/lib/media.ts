// Magic bytes and UTF-8 checks reject mismatched uploads; this is not full document validation or malware scanning.
export function matchesMedia(buffer: Buffer, type: string) {
  if (type === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (type === 'image/png')
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;

  if (type === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    );

  if (type === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return !buffer.includes(0);
    } catch {
      return false;
    }
  }

  return false;
}
