import { webApi } from '../lib/webApi';
import type { PublicVideo, PublicCheese, PublicCheeseSummary, PublicMarketPrice, EditorialPage } from '@shared/public-editorial';
export type { PublicVideo, PublicCheese, PublicCheeseSummary, PublicMarketPrice, EditorialPage } from '@shared/public-editorial';
const base = '/editorial';
const query = (values: Record<string, string | number | undefined>) => {
  const result = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') result.set(key, String(value)); });
  return result.toString();
};
export const editorialPublicApi = {
  videos: (options: { search?: string; category?: string; page?: number; limit?: number } = {}) =>
    webApi.get<EditorialPage<PublicVideo>>(`${base}/videos?${query(options)}`),
  video: (id: string) => webApi.get<PublicVideo & { relatedCheeses: PublicCheeseSummary[] }>(`${base}/videos/${id}`),
  cheeses: (options: { search?: string; country?: string; page?: number; limit?: number } = {}) =>
    webApi.get<EditorialPage<PublicCheeseSummary> & { countries: string[] }>(`${base}/cheeses?${query(options)}`),
  map: (options: { search?: string; country?: string } = {}) =>
    webApi.get<{ items: PublicCheeseSummary[]; total: number; truncated: boolean }>(`${base}/map?${query(options)}`),
  cheese: (id: string) => webApi.get<PublicCheese>(`${base}/cheeses/${id}`),
  prices: (id: string, page = 1, limit = 20) =>
    webApi.get<EditorialPage<PublicMarketPrice>>(`${base}/cheeses/${id}/prices?${query({ page, limit })}`),
};
