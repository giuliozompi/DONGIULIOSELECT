import type { VideoData, CheeseData, PriceData } from './editorial';

export interface PublicVideo extends Pick<VideoData, 'title' | 'description' | 'url' | 'cover' | 'category'> {
  id: string; publishedAt: string;
}
export interface PublicCheeseSummary extends Pick<CheeseData, 'title' | 'nameOriginal' | 'description' | 'country' | 'region' | 'latitude' | 'longitude'> {
  id: string; photo: string; publishedAt: string;
}
export interface EditorialProduct {
  id: string; name: string; slug: string; images: string[]; price: string;
  priceOld?: string; unit: string; inStock: boolean; descriptionShort?: string;
}
export interface PublicCheese extends PublicCheeseSummary,
  Pick<CheeseData, 'photos' | 'history' | 'characteristics' | 'culinaryUses' | 'productionCountry' | 'productionPoints' | 'sources' | 'externalVideoUrls'> {
  relatedVideos: PublicVideo[]; products: EditorialProduct[];
}
export type PublicMarketPrice = Omit<PriceData, 'notes' | 'cheeseId'> & {
  id: string; pricePerKg: number | null;
};
export interface EditorialPage<T> {
  items: T[]; total: number; page: number; limit: number;
}
