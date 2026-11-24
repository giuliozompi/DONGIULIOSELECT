import { webApi } from '../lib/webApi';
import type { PublicVideo, PublicCheese, PublicCheeseSummary, PublicMarketPrice, EditorialPage } from '@shared/public-editorial';
export type { PublicVideo, PublicCheese, PublicCheeseSummary, PublicMarketPrice, EditorialPage } from '@shared/public-editorial';
const base = '/editorial';
const query = (values: Record<string, string | number | undefined>) => {
  const result = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') result.set(key, String(value)); });
  return result.toString();
};
type MapPage = { items: PublicCheeseSummary[]; total: number; truncated: boolean };
const map = (options: { search?: string; country?: string; region?: string; page?: number } = {}) =>
  webApi.get<MapPage>(`${base}/map?${query(options)}`);

async function worldMap(signal: AbortSignal): Promise<MapPage> {
  const items = new Map<string, PublicCheeseSummary>();
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const result = await map({ page });
    const previousSize = items.size;
    for (const item of result.items) items.set(item.id, item);
    if (!result.truncated) return { items: Array.from(items.values()), total: result.total, truncated: false };
    if (items.size === previousSize) throw new Error('Не удалось загрузить все точки на карте мира.');
  }
}

export const editorialPublicApi = {
  videos: (options: { search?: string; category?: string; page?: number; limit?: number } = {}) =>
    webApi.get<EditorialPage<PublicVideo>>(`${base}/videos?${query(options)}`),
  video: (id: string) => webApi.get<PublicVideo & { relatedCheeses: PublicCheeseSummary[] }>(`${base}/videos/${id}`),
  cheeses: (options: { search?: string; country?: string; region?: string; page?: number; limit?: number } = {}) =>
    webApi.get<EditorialPage<PublicCheeseSummary> & { countries: string[] }>(`${base}/cheeses?${query(options)}`),
  map,
  worldMap,
  cheese: (id: string) => webApi.get<PublicCheese>(`${base}/cheeses/${id}`),
  prices: (id: string, page = 1, limit = 20) =>
    webApi.get<EditorialPage<PublicMarketPrice>>(`${base}/cheeses/${id}/prices?${query({ page, limit })}`),
};
