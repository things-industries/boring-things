/** Public page links and surrounding evidence for document and product-image research. */

import { downloadResource, documentUrl } from './pdf.js';

export interface ResourcePage {
  url: string;
  links: { url: string; context: string }[];
}

// Resolves downloadable resources and image markup, including responsive and transformed URLs.
export function resourceLinks(html: string, pageUrl: string): ResourcePage['links'] {
  const text = html
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\\\//g, '/');
  const links = new Map<string, { context: string; image: boolean }>();
  for (const match of text.matchAll(
    /\b(href|src|srcset)\s*=\s*["']([^"']+)["']|https:\/\/[^\s"'<>\\]+/gi,
  )) {
    const attribute = match[1]?.toLowerCase();
    const tag = text.slice(text.lastIndexOf('<', match.index), match.index);
    const image = attribute === 'srcset' || (attribute === 'src' && /^<img\b/i.test(tag));
    const candidates =
      attribute === 'srcset'
        ? match[2].split(/,\s+|\s+[\d.]+[wx]\s*,\s*/).map((value) => value.trim().split(/\s+/)[0])
        : [match[2] ?? match[0]];
    for (const value of candidates) {
      try {
        const url = documentUrl(new URL(value, pageUrl).href).href;
        if (!links.has(url) || (image && !links.get(url)?.image))
          links.set(url, {
            context: text.slice(
              Math.max(0, match.index - 700),
              match.index + match[0].length + 250,
            ),
            image,
          });
      } catch {
        continue;
      }
    }
  }
  const modelTokens = pageUrl
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && /[a-z]/.test(token) && /[0-9]/.test(token));
  const priority = (url: string) =>
    /\.pdf|download/i.test(url)
      ? 2
      : Number(modelTokens.some((token) => url.toLowerCase().includes(token)));
  return [...links]
    .filter(
      ([url, { context, image }]) =>
        image ||
        /\.(pdf|png|(?:jpg|jpeg)|webp)(?:[/#?]|$)|download|\/is\/image\//i.test(url) ||
        /downloadUrl|og:image/.test(context),
    )
    .sort(([left], [right]) => priority(right) - priority(left))
    .slice(0, 30)
    .map(([url, { context }]) => ({ url, context }));
}

// Downloads public HTML through the resource provider's size and address checks.
export async function readResourcePage(
  url: string,
  signal: AbortSignal,
): Promise<ResourcePage | null> {
  try {
    const resource = await downloadResource(url, { signal, maxBytes: 2_000_000 }, undefined, [
      'text/html',
      'application/xhtml+xml',
    ]);
    if (!resource) return null;
    return { url, links: resourceLinks(resource.content.toString('utf8'), resource.url) };
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

// This validates citation links only; PDF downloads also enforce DNS and address restrictions in the document provider.
export function publicUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      ['https:', 'http:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
