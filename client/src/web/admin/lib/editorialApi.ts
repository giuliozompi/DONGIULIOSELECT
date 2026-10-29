import { webApi } from '../../lib/webApi';
import type { EditorialKind, EditorialData, EditorialEntry } from '@shared/editorial';

const base = '/admin/editorial';
export const editorialApi = {
  list: (kind: EditorialKind, offset = 0, limit = 50) =>
    webApi.get<{ items: EditorialEntry[]; total: number }>(`${base}?kind=${kind}&offset=${offset}&limit=${limit}`),
  create: (kind: EditorialKind, data: EditorialData) =>
    webApi.post<EditorialEntry>(base, { kind, data }),
  update: (record: EditorialEntry, data: EditorialData) =>
    webApi.patch<EditorialEntry>(`${base}/${record.id}`, { kind: record.kind, revision: record.revision, data }),
  remove: (record: EditorialEntry) =>
    webApi.delete<void>(`${base}/${record.id}?revision=${record.revision}`),
  moderate: (record: EditorialEntry, decision: 'approved' | 'rejected', note: string) =>
    webApi.post<EditorialEntry>(`${base}/${record.id}/moderate`, { revision: record.revision, decision, note }),
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
