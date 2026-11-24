export const STORE_ORIGIN = 'https://dongiulioselect.ru';
export const ATLAS_DEFAULT_COUNTRY = 'Италия';

export const publicSectionPaths = ['/web', '/web/catalog', '/web/cheeses', '/web/videos', '/web/delivery'] as const;
export const storefrontPath = {
  product: (slug: string) => `/web/product/${encodeURIComponent(slug)}`,
  cheese: (id: string) => `/web/cheeses/${encodeURIComponent(id)}`,
  video: (id: string) => `/web/videos/${encodeURIComponent(id)}`,
};

export function discoveryUrl(path: string, parameters: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return `${path}${query.size ? `?${query}` : ''}`;
}

export const readDiscoveryPage = (raw: string | null) => raw && /^\d{1,6}$/.test(raw) && Number(raw) > 0
  ? Math.min(Number(raw), 100000) : 1;

export function publicMediaUrl(value: string | null | undefined) {
  if (!value) return undefined;
  const ref = value.trim();
  if (!/^(?:https?:\/\/|\/(?![\\/]))/i.test(ref)) return undefined;
  try {
    const url = new URL(ref, STORE_ORIGIN);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function jsonLdText(value: object) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}
