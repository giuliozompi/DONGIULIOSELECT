import { webApi } from '../../lib/webApi';
import type { EditorialKind, EditorialData, EditorialEntry } from '@shared/editorial';
import type { CheeseEditorialStage, PublishedCheeseFilter, PublishedCheeseOrigin } from '@shared/editorial-stages';

const base = '/admin/editorial';
export const editorialApi = {
  list: (kind: EditorialKind, offset = 0, limit = 50, stage?: CheeseEditorialStage, origin: PublishedCheeseFilter = {}) => {
    const params = new URLSearchParams({ kind, offset: String(offset), limit: String(limit) });
    if (stage) params.set('stage', stage);
    if (origin.originCountry !== undefined) params.set('originCountry', origin.originCountry);
    if (origin.originRegion !== undefined) params.set('originRegion', origin.originRegion);
    return webApi.get<{ items: EditorialEntry[]; total: number; origins?: PublishedCheeseOrigin[] }>(`${base}?${params}`);
  },
  create: (kind: EditorialKind, data: EditorialData, publish = false) =>
    webApi.post<EditorialEntry>(base, { kind, data, ...(publish ? { publish: true } : {}) }),
  update: (record: EditorialEntry, data: EditorialData, publish = false) =>
    webApi.patch<EditorialEntry>(`${base}/${record.id}`, { kind: record.kind, revision: record.revision, data, ...(publish ? { publish: true } : {}) }),
  remove: (record: EditorialEntry) =>
    webApi.delete<void>(`${base}/${record.id}?revision=${record.revision}`),
  moderate: (record: EditorialEntry, decision: 'approved' | 'rejected', note: string) =>
    webApi.post<EditorialEntry>(`${base}/${record.id}/moderate`, { revision: record.revision, decision, note }),
  publish: (record: EditorialEntry) =>
    webApi.post<EditorialEntry>(`${base}/${record.id}/publish`, { revision: record.revision }),
  approveDraftCheeses: (entries: Pick<EditorialEntry, 'id' | 'revision'>[]) =>
    webApi.post<{ approvedCount: number }>(`${base}/cheese/approve-batch`, { entries }),
  publishApprovedCheeses: (entries: Pick<EditorialEntry, 'id' | 'revision'>[]) =>
    webApi.post<{ publishedCount: number }>(`${base}/cheese/publish-batch`, { entries }),
  unpublish: (record: EditorialEntry) =>
    webApi.post<EditorialEntry>(`${base}/${record.id}/unpublish`, { revision: record.revision }),
  all: async (kind: EditorialKind) => {
    const entries: EditorialEntry[] = [];
    let offset = 0;
    while (true) {
      const page = await editorialApi.list(kind, offset, 200);
      entries.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total || !page.items.length) return entries;
    }
  },
};
