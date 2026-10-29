import { webApi } from '../lib/webApi';
import type { OwnPriceSubmission, OwnPriceSubmissionPage, PriceSubmissionInput } from '@shared/price-submissions';
export type { OwnPriceSubmission, OwnPriceSubmissionPage, PriceSubmissionInput };

const path = (cheeseId: string) => `/editorial/cheeses/${encodeURIComponent(cheeseId)}/price-submissions`;
export const priceSubmissionApi = {
  submit: (cheeseId: string, data: PriceSubmissionInput) => webApi.post<OwnPriceSubmission>(path(cheeseId), data),
  mine: (cheeseId: string, page = 1, limit = 10) =>
    webApi.get<OwnPriceSubmissionPage>(`${path(cheeseId)}/mine?page=${page}&limit=${limit}`),
};
