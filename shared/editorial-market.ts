import { z } from 'zod';
import type { AiSource } from './editorial-ai';
import type { EditorialEntry, PriceData } from './editorial';
import { editorialToday } from './editorial';
import { editorialSourceUrl } from './editorial-ai';

export function priceObservationAgeDays(observedOn: string, today = editorialToday()): number | null {
  if (![observedOn, today].every(day => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day) || observedOn > today) return null;
  return Math.floor((Date.parse(today) - Date.parse(observedOn)) / 86400000);
}

export const RUB_IMPORT_NOTICE = 'Пересчёт в рубли носит справочный характер и не является стоимостью товара при ввозе в Россию. Он не рассчитывает международную доставку, таможенные пошлины, НДС при ввозе и другие налоги и сборы. Налоги, уже включённые в цену иностранного продавца, сохраняются в исходной сумме.';
export interface FxRates {
  status: 'fresh' | 'stale' | 'unavailable';
  source: string; sourceUrl: string; effectiveOn: string | null; requestedOn: string;
  fetchedAt: string | null; rates: Record<string, number>; warning: string | null;
}
export function rubleEquivalent(amount: number, currency: string, fx: FxRates): number | null {
  const rate = fx.rates[currency];
  return Number.isFinite(amount) && amount > 0 && Number.isFinite(rate) && rate > 0
    ? Number((amount * rate).toFixed(2)) : null;
}
export const watchCreateSchema = z.object({
  cheeseId: z.string().uuid(), country: z.string().trim().min(1).max(100),
  sourceUrl: editorialSourceUrl, store: z.string().trim().max(200).default(''),
}).strict();
export const watchActiveSchema = z.object({ revision: z.number().int().positive(), active: z.boolean() }).strict();
export const priceProbeSchema = z.object({
  productName: z.string().trim().min(1).max(300), store: z.string().trim().max(200),
  price: z.number().positive().max(1e9).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  packageQuantity: z.number().positive().max(1e6).nullable(),
  packageUnit: z.enum(['kg', 'g', 'piece']).nullable(),
  pricePassageId: z.number().int().min(0).max(100).nullable(),
  packagePassageId: z.number().int().min(0).max(100).nullable(),
  conditions: z.string().trim().max(2000),
  warnings: z.array(z.string().trim().max(2000)).max(20),
}).strict();
export type PriceProposal = z.infer<typeof priceProbeSchema>;
export interface MarketCheck {
  id: string; watchId: string; status: 'running' | 'ready' | 'failed';
  startedAt: string; finishedAt: string | null; observedOn: string; error: string | null;
  proposal: PriceProposal | null; source: AiSource | null;
  evidence: { priceQuote: string | null; packageQuote: string | null } | null;
  entryId: string | null;
}
export interface PriceWatch {
  id: string; revision: number; cheeseId: string | null; cheeseTitle: string;
  country: string; store: string; sourceUrl: string; active: boolean;
  nextCheckAt: string; lastCheckAt: string | null; latest: MarketCheck | null;
}
export type MarketImport = Omit<PriceData, 'cheeseId' | 'sourceType' | 'sourceUrl' | 'observedOn' | 'country'>;
export type MarketApplyResult = { entry: EditorialEntry; check: MarketCheck };
