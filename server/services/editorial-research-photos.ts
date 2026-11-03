import { createHash } from 'node:crypto';
import { validateSourceUrl, type SourceEvidence } from './editorial-ai-sources';
import type { ResearchPhoto } from '../../shared/editorial-ai';

export type SourceImage = { url: string; alt: string; licenseUrl?: string };
function decode(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi, (match, decimal, hex) => {
    if (decimal || hex) {
      const n = parseInt(decimal || hex, decimal ? 10 : 16);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' } as Record<string, string>)[match.toLowerCase()] || '';
  });
}
function attributes(tag: string) {
  const result: Record<string, string> = {};
  for (const match of Array.from(tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)))
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}
function safeUrl(value: string | undefined, base: string) {
  if (!value) return undefined;
  try { const url = validateSourceUrl(new URL(value, base).href); url.hash = ''; return url.href; } catch { return undefined; }
}
// Only references actually present in fetched HTML; no AI-authored image URLs.
// No image request, download, license inference or claim of depicted identity.
export function sourcePageImages(html: string, finalUrl: string): SourceImage[] {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const main = cleaned.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i)?.[1];
  const mediaHtml = main ? `${(cleaned.match(/<(?:meta|link)\b[^>]*>/gi) || []).join(' ')} ${main}` : cleaned;
  const tags = mediaHtml.match(/<(?:meta|img|link)\b[^>]*>/gi) || [];
  const licenseTag = tags.find(tag => /^<link\b/i.test(tag) && /\blicense\b/i.test(attributes(tag).rel || ''));
  const licenseUrl = licenseTag ? safeUrl(attributes(licenseTag).href, finalUrl) : undefined;
  const seen = new Set<string>(), images: SourceImage[] = [];
  // Prefer article social images; fall back to sufficiently large content images.
  const ordered = [...tags.filter(tag => /^<meta\b/i.test(tag)), ...tags.filter(tag => /^<img\b/i.test(tag))];
  for (const tag of ordered) {
    const a = attributes(tag), meta = /^<meta\b/i.test(tag);
    if (meta && !/^(og:image(?::url|:secure_url)?|twitter:image(?::src)?)$/i.test(a.property || a.name || '')) continue;
    if (!meta && ((a.width && /^\d+$/.test(a.width) && +a.width < 160) || (a.height && /^\d+$/.test(a.height) && +a.height < 120))) continue;
    const url = safeUrl(meta ? a.content : (a['data-src'] || a.src), finalUrl);
    if (!url || /(?:logo|favicon|sprite|placeholder|banner|pixel|tracking|avatar)|\.svg(?:\?|$)/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    images.push({ url, alt: (a.alt || '').replace(/<[^>]*>/g, '').slice(0, 300), ...(licenseUrl ? { licenseUrl } : {}) });
    if (images.length === 8) break;
  }
  return images;
}
export function researchPhotos(sources: SourceEvidence[]): ResearchPhoto[] {
  const candidates: ResearchPhoto[] = [], seen = new Set<string>();
  // Round-robin across sources rather than three copies from the same page.
  for (let index = 0; index < 8 && candidates.length < 3; index++) for (const source of sources) {
    const image = source.images?.[index];
    if (!image || seen.has(image.url)) continue;
    try {
      const imageUrl = validateSourceUrl(image.url).href, sourceUrl = validateSourceUrl(source.finalUrl).href;
      const licenseUrl = image.licenseUrl ? validateSourceUrl(image.licenseUrl).href : undefined;
      seen.add(imageUrl);
      candidates.push({
        id: createHash('sha256').update(`${sourceUrl}\n${imageUrl}`).digest('hex').slice(0, 24),
        imageUrl, sourceUrl, label: image.alt || source.title.slice(0, 300), ...(licenseUrl ? { licenseUrl } : {}),
      });
      if (candidates.length === 3) break;
    } catch { /* invalid source metadata cannot become a preview */ }
  }
  return candidates;
}
