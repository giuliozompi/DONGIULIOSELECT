import { z } from 'zod';

// Stored editorial data is plain text, never trusted HTML or embed code.
const text = (max = 4000) => z.string().trim().max(max);
const required = (max = 200) => text(max).min(1, 'Обязательное поле');
export const editorialKinds = ['video', 'cheese', 'price'] as const;
const httpUrl = z.string().trim().max(2000).url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Нужна ссылка http(s) без пароля');
const image = z.union([z.literal(''), httpUrl, z.string().regex(/^\/(?:objects|public-objects|uploads)\/[^\s?#]+$/)]).default('');
export const videoUrl = httpUrl.refine(value => {
  const u = new URL(value);
  return (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname) &&
    ((u.pathname === '/watch' && !!u.searchParams.get('v')) ||
      (u.pathname === '/playlist' && !!u.searchParams.get('list')) ||
      /^\/(?:shorts|live)\/[\w-]+\/?$/.test(u.pathname))
  ) || (u.hostname === 'youtu.be' && /^\/[\w-]+\/?$/.test(u.pathname)) ||
    (u.hostname === 't.me' && /^\/[A-Za-z0-9_]+\/\d+\/?$/.test(u.pathname));
}, 'Укажите ссылку на видео/плейлист YouTube или публичный пост Telegram');
const ids = z.array(z.string().uuid()).max(100).refine(a => new Set(a).size === a.length, 'Повторяющиеся связи');
const base = {
  title: required(),
  description: text(10000).default(''),
  status: z.enum(['draft', 'ready']).default('draft'),
  sortOrder: z.number().int().min(0).max(100000).default(0),
};
export const videoDataSchema = z.object({
  ...base, url: videoUrl, cover: image,
  category: z.enum(['recipe', 'interview', 'review', 'places']),
  cheeseIds: ids.default([]),
}).strict();
export const cheeseDataSchema = z.object({
  ...base, photos: z.array(image).max(12).default([]),
  country: required(100), region: text(200).default(''),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  history: text(20000).default(''), characteristics: text(20000).default(''),
  culinaryUses: text(20000).default(''), productionCountry: text(100).default(''),
  sources: z.array(httpUrl).max(30).default([]),
  productIds: z.array(required(100)).max(100).default([]),
  videoIds: ids.default([]), externalVideoUrls: z.array(videoUrl).max(30).default([]),
}).strict().superRefine((data, ctx) => {
  if ((data.latitude === null) !== (data.longitude === null))
    ctx.addIssue({ code: 'custom', message: 'Укажите обе координаты', path: ['latitude'] });
  if (data.status === 'ready' && (!data.history || !data.characteristics || !data.culinaryUses ||
    !data.sources.length || !data.photos.filter(Boolean).length || data.latitude === null))
    ctx.addIssue({ code: 'custom', message: 'Для готовой статьи нужны фото, координаты, история, характеристики, использование и источники', path: ['status'] });
});
export const priceDataSchema = z.object({
  cheeseId: z.string().uuid(), sourceType: z.enum(['internet', 'user']),
  price: z.number().positive().max(1e9),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Код валюты: RUB, EUR, USD…').refine(v => {
    try { return Intl.supportedValuesOf('currency').includes(v); } catch { return false; }
  }, 'Неизвестная валюта'),
  country: required(100), store: required(200), sourceUrl: z.union([z.literal(''), httpUrl]).default(''),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const date = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === v &&
      v <= new Date().toISOString().slice(0, 10);
  }, 'Укажите существующую дату не позднее сегодняшней'),
  packageQuantity: z.number().positive().max(1e6),
  packageUnit: z.enum(['kg', 'g', 'piece']),
  notes: text(2000).default(''),
}).strict().superRefine((data, ctx) => {
  if (data.sourceType === 'internet' && !data.sourceUrl)
    ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'Для интернет-цены нужна ссылка на источник' });
});
export const editorialSchemas = { video: videoDataSchema, cheese: cheeseDataSchema, price: priceDataSchema };
export type EditorialKind = typeof editorialKinds[number];
export type VideoData = z.infer<typeof videoDataSchema>;
export type CheeseData = z.infer<typeof cheeseDataSchema>;
export type PriceData = z.infer<typeof priceDataSchema>;
export type EditorialData = VideoData | CheeseData | PriceData;
export interface EditorialEntry {
  id: string; kind: EditorialKind; data: EditorialData; revision: number;
  moderation: 'pending' | 'approved' | 'rejected' | null;
  moderationNote: string; createdBy: string; updatedBy: string;
  createdAt: string; updatedAt: string;
  publication: { publishedAt: string; publishedRevision: number } | null;
}
export function pricePerKg(data: PriceData): number | null {
  if (data.packageUnit === 'piece') return null;
  return data.price / (data.packageQuantity * (data.packageUnit === 'g' ? 0.001 : 1));
}
