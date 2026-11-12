import { webApi } from '../../lib/webApi';
import type { CheeseData, EditorialEntry } from '@shared/editorial';
import type { CatalogRequest, DraftRequest, EditorialAiRun, ImportResult, AiField, SourceSuggestions, ResearchRequest, OriginLookup } from '@shared/editorial-ai';
export type { CatalogRequest, DraftRequest, EditorialAiRun, ImportResult, CatalogResult, DraftResult, CatalogItem, AiField } from '@shared/editorial-ai';
const base = '/admin/editorial-ai';
export const editorialAiApi = {
  catalog: (body: CatalogRequest) => webApi.post<EditorialAiRun>(`${base}/catalog`, body),
  draft: (body: DraftRequest) => webApi.post<EditorialAiRun>(`${base}/draft`, body),
  research: (body: ResearchRequest) => webApi.post<EditorialAiRun>(`${base}/research`, body),
  originLookup: (entry: EditorialEntry, place: string) =>
    webApi.post<OriginLookup>(`${base}/origin-geocoding`, { entryId: entry.id, revision: entry.revision, place }),
  originApply: (entry: EditorialEntry, lookupId: string, candidateId: string) =>
    webApi.post<EditorialEntry>(`${base}/origin-geocoding/apply`, { entryId: entry.id, revision: entry.revision, lookupId, candidateId }),
  suggestSources: (entry: EditorialEntry) =>
    webApi.post<SourceSuggestions>(`${base}/sources`, { entryId: entry.id, revision: entry.revision }),
  run: (id: string) => webApi.get<EditorialAiRun>(`${base}/runs/${id}`),
  history: (kind: 'catalog' | 'draft', page = 1, entryId?: string) =>
    webApi.get<{ items: EditorialAiRun[]; total: number; page: number; limit: number }>(`${base}/runs?kind=${kind}&page=${page}${entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''}`),
  rank: (run: EditorialAiRun, ranks: { id: string; importance: number }[]) =>
    webApi.patch<EditorialAiRun>(`${base}/runs/${run.id}/ranking`, { revision: run.revision, ranks }),
  import: (run: EditorialAiRun, itemIds: string[]) =>
    webApi.post<ImportResult>(`${base}/runs/${run.id}/import`, { revision: run.revision, itemIds }),
  apply: (
    run: EditorialAiRun,
    entry: EditorialEntry,
    fields: AiField[],
    edits?: Partial<Record<AiField, string>>,
    photos?: { photoIds: string[]; photoRightsConfirmed: boolean },
    origin?: { lookupId: string; candidateId: string },
    editorialData?: CheeseData,
  ) => webApi.post<EditorialEntry>(`${base}/runs/${run.id}/apply`, {
    entryId: entry.id, revision: entry.revision, fields, edits,
    ...(photos?.photoIds.length ? photos : {}),
    ...(origin ? { origin } : {}),
    ...(editorialData ? { editorialData } : {}),
  }),
  importPhotos: (
    run: EditorialAiRun,
    entry: EditorialEntry,
    photoIds: string[],
    photoRightsConfirmed: boolean,
  ) => webApi.post<EditorialEntry>(`${base}/runs/${run.id}/photos`, {
    entryId: entry.id,
    revision: entry.revision,
    photoIds,
    photoRightsConfirmed,
  }),
};
