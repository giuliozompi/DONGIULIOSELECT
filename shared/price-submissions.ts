import { z } from 'zod';
import { priceDataSchema } from './editorial';

// Ownership, moderation, notes and cheeseId are supplied only by the server.
export const priceSubmissionSchema = priceDataSchema.innerType().omit({
  cheeseId: true, sourceType: true, notes: true, offerConditions: true,
}).extend({ channel: z.enum(['online', 'shop']) }).strict().superRefine((data, ctx) => {
  if (data.channel === 'online' && !data.sourceUrl)
    ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'Для цены из Интернета нужна ссылка на источник' });
});
export type PriceSubmissionInput = z.infer<typeof priceSubmissionSchema>;
export interface OwnPriceSubmission {
  id: string;
  data: PriceSubmissionInput;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  submittedAt: string;
  updatedAt: string;
}
export interface OwnPriceSubmissionPage {
  items: OwnPriceSubmission[];
  total: number;
  page: number;
  limit: number;
  limits: { dailyRemaining: number; nextAllowedAt: string | null };
}
export const PRICE_SUBMISSION_LIMIT = 10;
export const PRICE_SUBMISSION_INTERVAL_MS = 60_000;
export const PRICE_SUBMISSION_WINDOW_MS = 24 * 60 * 60_000;
