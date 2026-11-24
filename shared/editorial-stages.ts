import type { CheeseData, EditorialEntry } from './editorial';

export const cheeseEditorialStages = ['drafts', 'approved', 'published'] as const;
export type CheeseEditorialStage = typeof cheeseEditorialStages[number];
export type PublishedCheeseOrigin = { country: string; region: string; count: number };
export type PublishedCheeseFilter = { originCountry?: string; originRegion?: string };

// A live snapshot remains published even while its next revision is in editing.
export function cheeseEditorialStage(entry: Pick<EditorialEntry, 'data' | 'publication'>): CheeseEditorialStage {
  if (entry.publication) return 'published';
  return (entry.data as CheeseData).status === 'ready' ? 'approved' : 'drafts';
}
