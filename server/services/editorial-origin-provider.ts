import { z } from 'zod';
import { editorialAiCountries, originCandidateSchema } from '../../shared/editorial-ai';
import { validateSourceUrl } from './editorial-ai-sources';
import { researchJson } from './editorial-research-http';
import { EditorialError } from './editorial';

export function originProviderSettings(env = process.env) {
  if (env.EDITORIAL_GEOCODER_DISABLED === 'true')
    throw new EditorialError(503, 'Географический поиск отключён администратором.');
  const url = validateSourceUrl(env.EDITORIAL_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search');
  url.hash = '';
  return url;
}
export function originCountryCode(country: string) {
  const normalized = country.trim().toLocaleLowerCase();
  const english = new Intl.DisplayNames(['en'], { type: 'region' });
  return editorialAiCountries.find(item => [item.code, item.name, english.of(item.code)]
    .some(value => value?.toLocaleLowerCase() === normalized))?.code.toLowerCase();
}
const rowSchema = z.object({
  osm_type: z.enum(['node', 'way', 'relation']),
  osm_id: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9]\d{0,15}$/)]),
  display_name: z.string().trim().min(1).max(1000),
  lat: z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().min(-90).max(90)),
  lon: z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().min(-180).max(180)),
  type: z.string().max(100).optional(),
  address: z.object({ country_code: z.string() }).optional(),
});
export async function fetchOriginCandidates(
  query: string, countryCode: string | undefined, endpoint: URL,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(endpoint);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '3');
  if (countryCode) url.searchParams.set('countrycodes', countryCode);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DonGiulioSelectEditorial/1.0 (+https://dongiulioselect.ru)' },
      signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new EditorialError(503, `Географический сервис вернул HTTP ${response.status}. Автоматического повтора нет.`);
    }
    const raw = z.array(z.unknown()).max(3).parse(await researchJson(response));
    const candidates = raw.flatMap(value => {
      const parsed = rowSchema.safeParse(value);
      if (!parsed.success) return [];
      const item = parsed.data;
      if (countryCode && item.address?.country_code?.toLowerCase() !== countryCode) return [];
      return [originCandidateSchema.parse({
        id: `${item.osm_type}/${item.osm_id}`, label: item.display_name, type: item.type || '',
        latitude: item.lat, longitude: item.lon,
        url: `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`,
      })];
    });
    return Array.from(new Map(candidates.map(value => [value.id, value])).values());
  } catch (error) {
    if (error instanceof EditorialError) throw error;
    throw new EditorialError(503, 'Не удалось получить координаты: сеть, TLS, тайм-аут или формат ответа. Данные статьи не изменены.');
  }
}
