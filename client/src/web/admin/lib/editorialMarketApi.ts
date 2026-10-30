import { webApi } from '../../lib/webApi';
import type { PriceWatch, MarketCheck, MarketImport, MarketApplyResult } from '@shared/editorial-market';
const base = '/admin/editorial-market';
export const editorialMarketApi = {
  list: (page = 1) => webApi.get<{ items: PriceWatch[]; total: number; page: number; limit: number }>(`${base}/watches?page=${page}`),
  create: (data: { cheeseId: string; country: string; store: string; sourceUrl: string }) => webApi.post<PriceWatch>(`${base}/watches`, data),
  active: (watch: PriceWatch, active: boolean) => webApi.patch<PriceWatch>(`${base}/watches/${watch.id}`, { revision: watch.revision, active }),
  check: (watch: PriceWatch, requestId: string) => webApi.post<MarketCheck>(`${base}/watches/${watch.id}/check`, { requestId }),
  history: (watchId: string, page = 1) => webApi.get<{ items: MarketCheck[]; total: number; page: number; limit: number }>(`${base}/watches/${watchId}/checks?page=${page}`),
  run: (id: string) => webApi.get<MarketCheck>(`${base}/checks/${id}`),
  apply: (id: string, data: MarketImport) => webApi.post<MarketApplyResult>(`${base}/checks/${id}/apply`, data),
};
