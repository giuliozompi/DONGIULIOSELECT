import { z } from 'zod';
import type { EditorialEntry } from './editorial';
import type { DraftRequest, DraftResult, EditorialAiRun } from './editorial-ai';

export const draftBatchStartSchema = z.object({
  requestId: z.string().uuid(),
  eligibleCount: z.number().int().positive(),
  confirmed: z.literal(true),
}).strict();

export const draftBatchItemStatuses = ['queued', 'running', 'ready', 'failed', 'skipped', 'cancelled'] as const;
export type DraftBatchItemStatus = typeof draftBatchItemStatuses[number];
export type DraftBatchItem = {
  entryId: string;
  title: string;
  status: DraftBatchItemStatus;
  detail: string | null;
};
export type DraftBatchOverview = {
  eligibleCount: number;
  active: boolean;
  history: { id: string; createdAt: string }[];
  latest: {
    id: string;
    finishedAt: string | null;
    stoppedAt: string | null;
    counts: Record<DraftBatchItemStatus, number>;
    items: DraftBatchItem[];
    total: number;
    visibleTotal: number;
    page: number;
    limit: number;
  } | null;
};
export type DraftBatchReview = {
  entry: EditorialEntry;
  run: EditorialAiRun & { params: DraftRequest; result: DraftResult };
};
