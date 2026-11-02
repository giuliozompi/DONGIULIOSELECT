import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
import { editorialSourceUrl, type AiSource } from '../../shared/editorial-ai';

export class EditorialSourceError extends Error {}
export type SourceEvidence = AiSource & { text: string };
// Reject non-global ranges, including IPv4-mapped IPv6, transition and documentation nets.
export function isPublicSourceAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return /^[23][0-9a-f]{0,3}:/.test(a) && !/^(2001:(db8|0|10|20):|2002:|3ffe:)/.test(a);
  }
  return false;
}
export function validateSourceUrl(value: string) {
  const url = new URL(editorialSourceUrl.parse(value));
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(hostname) || !hostname.includes('.') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(hostname))
    throw new EditorialSourceError('Нужна публичная веб-страница, не IP-адрес или внутренний ресурс.');
  return url;
}
const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();
const entities = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
  if (entity[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as any)[entity.toLowerCase()];
  const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
  return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ' ';
});
export function sourcePlainText(html: string) {
  return normalize(entities(html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')));
}
export function sourceResponseError(status: number, type: string, encoding?: string): string | undefined {
  if (status !== 200) {
    const hint = status === 403 ? 'Сайт запретил автоматическое чтение'
      : status === 404 ? 'Страница не найдена'
      : status === 429 ? 'Сайт ограничил частоту запросов'
      : 'Сайт вернул ошибку';
    return `${hint} (HTTP ${status}). Выберите другую публичную страницу.`;
  }
  if (!/^text\/(?:html|plain)(?:;|$)/i.test(type))
    return 'Источник не является HTML/текстом (например, PDF). Выберите текстовую веб-страницу.';
  if (encoding && encoding !== 'identity')
    return 'Сайт вернул неподдерживаемое сжатие. Выберите другую публичную страницу.';
}
export async function retrieveEditorialSource(value: string): Promise<SourceEvidence> {
  const host = validateSourceUrl(value).hostname;
  try {
    return await retrieveSource(value);
  } catch (error) {
    const detail = error instanceof EditorialSourceError ? error.message
      : 'Не удалось установить соединение или определить адрес сайта.';
    // Expose only the validated original hostname and allowlisted diagnostics,
    // never the response body, redirect URL, query parameters or network error.
    throw new EditorialSourceError(`${host}: ${detail}`);
  }
}
async function retrieveSource(value: string): Promise<SourceEvidence> {
  const original = validateSourceUrl(value);
  const deadline = Date.now() + 15_000;
  let url = original;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new EditorialSourceError('Источник не ответил вовремя.');
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new EditorialSourceError('Источник не ответил вовремя.')), remaining); timer.unref(); }),
    ]);
    if (!addresses.length || addresses.some(item => !isPublicSourceAddress(item.address)))
      throw new EditorialSourceError('Источник указывает на закрытую сеть и не может быть прочитан.');
    const pinned = addresses[0];
    const response = await new Promise<{ status: number; location?: string; body: string; type: string }>((resolve, reject) => {
      const req = request(url, {
        method: 'GET', headers: { Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'DonGiulioEditorial/1.0' },
        // Pin the verified DNS answer: checking DNS then using fetch would allow rebinding.
        lookup: ((_host: string, options: any, callback: any) => {
          if (options?.all) callback(null, [pinned]); else callback(null, pinned.address, pinned.family);
        }) as any,
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      }, res => {
        const status = res.statusCode || 0, type = String(res.headers['content-type'] || '');
        if (status >= 300 && status < 400) {
          res.resume(); resolve({ status, location: res.headers.location, body: '', type }); return;
        }
        const responseError = sourceResponseError(status, type, res.headers['content-encoding']);
        if (responseError) {
          res.resume(); reject(new EditorialSourceError(responseError)); return;
        }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 1024 * 1024) { req.destroy(new EditorialSourceError('Страница слишком большая. Выберите более конкретный источник.')); return; }
          chunks.push(Buffer.from(chunk));
        });
        res.on('end', () => {
          try {
            const charset = type.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
            resolve({ status, type, body: new TextDecoder(charset).decode(Buffer.concat(chunks)) });
          } catch { reject(new EditorialSourceError('Не удалось прочитать кодировку источника.')); }
        });
        res.on('error', reject);
      });
      req.on('error', reject); req.end();
    }).catch(error => { throw error instanceof EditorialSourceError ? error : new EditorialSourceError('Не удалось получить публичный источник.'); });
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || redirects === 3) throw new EditorialSourceError('Слишком много перенаправлений источника.');
      url = validateSourceUrl(new URL(response.location, url).href);
      continue;
    }
    const allText = /^text\/html/i.test(response.type) ? sourcePlainText(response.body) : normalize(response.body);
    if (allText.length < 150) throw new EditorialSourceError('В источнике недостаточно читаемого текста. Выберите другую страницу.');
    const title = entities(response.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url.hostname).replace(/<[^>]*>/g, '').trim().slice(0, 250);
    const text = allText.slice(0, 20_000);
    return { url: original.href, finalUrl: url.href, title, text, retrievedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(text).digest('hex'), characters: text.length, truncated: allText.length > text.length };
  }
  throw new EditorialSourceError('Не удалось получить источник.');
}
