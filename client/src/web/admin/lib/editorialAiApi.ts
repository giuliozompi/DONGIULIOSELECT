import { webApi } from '../../lib/webApi';
import type { CheeseData, EditorialEntry } from '@shared/editorial';
import type { CatalogRequest, DraftRequest, EditorialAiRun, ImportResult, AiField, SourceSuggestions, ResearchRequest, OriginLookup, MapPlaceLookup, PhotoSearchRequest, PhotoSearchResult } from '@shared/editorial-ai';
import type { DraftBatchOverview, DraftBatchReview } from '@shared/editorial-ai-batch';
export type { CatalogRequest, DraftRequest, EditorialAiRun, ImportResult, CatalogResult, DraftResult, CatalogItem, AiField } from '@shared/editorial-ai';
const base = '/admin/editorial-ai';
export const draftBatchQueryKey = ['/web-api/admin/editorial-ai/batches'] as const;
export const editorialAiApi = {
  catalog: (body: CatalogRequest) => webApi.post<EditorialAiRun>(`${base}/catalog`, body),
  draft: (body: DraftRequest) => webApi.post<EditorialAiRun>(`${base}/draft`, body),
  research: (body: ResearchRequest) => webApi.post<EditorialAiRun>(`${base}/research`, body),
  originLookup: (entry: EditorialEntry, place: string) =>
    webApi.post<OriginLookup>(`${base}/origin-geocoding`, { entryId: entry.id, revision: entry.revision, place }),
  mapPlace: (place: string) => webApi.post<MapPlaceLookup>(`${base}/map-place`, { place }),
  originApply: (entry: EditorialEntry, lookupId: string, candidateId: string) =>
    webApi.post<EditorialEntry>(`${base}/origin-geocoding/apply`, { entryId: entry.id, revision: entry.revision, lookupId, candidateId }),
  suggestSources: (entry: EditorialEntry) =>
    webApi.post<SourceSuggestions>(`${base}/sources`, { entryId: entry.id, revision: entry.revision }),
  searchPhotos: (body: PhotoSearchRequest) => webApi.post<PhotoSearchResult>(`${base}/photo-search`, body),
  draftBatches: (page: number, batchId?: string) => webApi.get<DraftBatchOverview>(
    `${base}/batches?page=${page}${batchId ? `&batchId=${encodeURIComponent(batchId)}` : ''}`),
  startDraftBatch: (requestId: string, eligibleCount: number) =>
    webApi.post<{ id: string }>(`${base}/batches`, { requestId, eligibleCount, confirmed: true }),
  stopDraftBatch: (id: string) => webApi.post<void>(`${base}/batches/${id}/stop`),
  reviewDraftBatch: (id: string, entryId: string) => webApi.get<DraftBatchReview>(`${base}/batches/${id}/review/${entryId}`),
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
