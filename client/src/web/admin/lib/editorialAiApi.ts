import { webApi } from '../../lib/webApi';
import type { EditorialEntry } from '@shared/editorial';
import type { CatalogRequest, DraftRequest, EditorialAiRun, ImportResult, AiField } from '@shared/editorial-ai';
export type { CatalogRequest, DraftRequest, EditorialAiRun, ImportResult, CatalogResult, DraftResult, CatalogItem, AiField } from '@shared/editorial-ai';
const base = '/admin/editorial-ai';
export const editorialAiApi = {
  catalog: (body: CatalogRequest) => webApi.post<EditorialAiRun>(`${base}/catalog`, body),
  draft: (body: DraftRequest) => webApi.post<EditorialAiRun>(`${base}/draft`, body),
  run: (id: string) => webApi.get<EditorialAiRun>(`${base}/runs/${id}`),
  history: (kind: 'catalog' | 'draft', page = 1, entryId?: string) =>
    webApi.get<{ items: EditorialAiRun[]; total: number; page: number; limit: number }>(`${base}/runs?kind=${kind}&page=${page}${entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''}`),
  rank: (run: EditorialAiRun, ranks: { id: string; importance: number }[]) =>
    webApi.patch<EditorialAiRun>(`${base}/runs/${run.id}/ranking`, { revision: run.revision, ranks }),
  import: (run: EditorialAiRun, itemIds: string[]) =>
    webApi.post<ImportResult>(`${base}/runs/${run.id}/import`, { revision: run.revision, itemIds }),
  apply: (run: EditorialAiRun, entry: EditorialEntry, fields: AiField[], edits?: Partial<Record<AiField, string>>) =>
    webApi.post<EditorialEntry>(`${base}/runs/${run.id}/apply`, { entryId: entry.id, revision: entry.revision, fields, edits }),
};
