import { z } from 'zod';
import type { EditorialEntry } from './editorial';

const codes = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
const names = new Intl.DisplayNames(['ru'], { type: 'region' });
export const editorialAiCountries = codes.map(code => ({ code, name: names.of(code) || code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
export const countryName = (code: string) => names.of(code) || code;
const countryCode = z.string().refine(value => codes.includes(value), 'Выберите страну из списка');
const text = (max: number) => z.string().trim().max(max);
export const editorialSourceUrl = z.string().trim().max(2000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443');
}, 'Нужна публичная ссылка https без пароля и нестандартного порта');
export const catalogRequestSchema = z.object({
  requestId: z.string().uuid(),
  countries: z.array(countryCode).min(1).max(3).refine(values => new Set(values).size === values.length),
  limit: z.number().int().min(1).max(30).default(12),
}).strict().refine(value => value.limit >= value.countries.length, 'Число сыров должно быть не меньше числа стран');
export const draftRequestSchema = z.object({
  requestId: z.string().uuid(), entryId: z.string().uuid(), revision: z.number().int().positive(),
  sources: z.array(editorialSourceUrl).max(3).refine(values => new Set(values).size === values.length),
  research: z.literal(true).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.research && !value.sources.length)
    ctx.addIssue({ code: 'custom', message: 'Укажите хотя бы один источник', path: ['sources'] });
});
export const researchRequestSchema = z.object({
  requestId: z.string().uuid(), entryId: z.string().uuid(), revision: z.number().int().positive(),
  sources: z.array(editorialSourceUrl).max(3).refine(values => new Set(values).size === values.length).default([]),
}).strict();
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export const originLookupRequestSchema = z.object({
  entryId: z.string().uuid(), revision: z.number().int().positive(),
  place: text(200).min(2),
}).strict();
export const originApplyRequestSchema = z.object({
  entryId: z.string().uuid(), revision: z.number().int().positive(),
  lookupId: z.string().uuid(), candidateId: text(100).min(1),
}).strict();
export const originCandidateSchema = z.object({
  id: text(100).min(1), label: text(1000).min(1), type: text(100),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  url: z.string().url().refine(value => /^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(value)),
}).strict();
export const originLookupSchema = z.object({
  lookupId: z.string().uuid(), entryId: z.string().uuid(), revision: z.number().int().positive(),
  query: text(400), candidates: z.array(originCandidateSchema).max(3),
  retrievedAt: z.string().datetime(), cached: z.boolean(),
  attribution: z.literal('© OpenStreetMap contributors'),
});
export type OriginLookup = z.infer<typeof originLookupSchema>;
export const sourceSuggestionsRequestSchema = z.object({
  entryId: z.string().uuid(), revision: z.number().int().positive(),
}).strict();
export const sourceSuggestionsSchema = z.object({
  sources: z.array(z.object({
    url: editorialSourceUrl,
    label: text(200).min(1),
    kind: z.enum(['consortium', 'cooperative', 'producer', 'institution']),
  }).strict()).max(3),
  warnings: z.array(text(2000)).max(10),
}).strict();
export type SourceSuggestions = z.infer<typeof sourceSuggestionsSchema>;
export const catalogModelItemSchema = z.object({
  nameOriginal: text(200).min(1), titleRu: text(200).min(1), countryCode,
  regions: z.array(text(100).min(1)).max(10),
  importance: z.number().int().min(1).max(100),
  importanceNote: text(1000).min(1), summary: text(2000),
}).strict();
export const catalogModelSchema = z.object({
  items: z.array(catalogModelItemSchema).min(1).max(30),
  warnings: z.array(text(2000)).max(20),
}).strict();
export const aiFieldNames = ['title', 'description', 'country', 'region', 'history', 'characteristics', 'culinaryUses'] as const;
export const aiFieldSchema = z.enum(aiFieldNames);
export type AiField = typeof aiFieldNames[number];
export const draftModelSchema = z.object({
  fields: z.object({
    title: text(200).optional(), description: text(10000).optional(), country: text(100).optional(),
    region: text(200).optional(), history: text(20000).optional(), characteristics: text(20000).optional(),
    culinaryUses: text(20000).optional(),
  }).strict(),
  citations: z.array(z.object({
    field: aiFieldSchema, sourceIndex: z.number().int().min(0).max(5), quote: text(1200).min(10),
  }).strict()).max(40),
  warnings: z.array(text(2000)).max(30),
}).strict();
// The provider identifies an immutable server-numbered passage; it never retypes a quote.
// The saved/admin DTO above contains the actual quote extracted by the server.
export const draftGenerationSchema = z.object({
  fields: draftModelSchema.shape.fields,
  citations: z.array(z.object({
    field: aiFieldSchema, sourceIndex: z.number().int().min(0).max(5),
    passageId: z.number().int().min(0).max(100),
  }).strict()).max(40),
  warnings: draftModelSchema.shape.warnings,
}).strict();
export type CatalogRequest = z.infer<typeof catalogRequestSchema>;
export type DraftRequest = z.infer<typeof draftRequestSchema>;
export type CatalogItem = z.infer<typeof catalogModelItemSchema> & {
  id: string; suggestedImportance: number; country: string;
  matches: { id: string; title: string }[];
};
export type AiSource = { url: string; finalUrl: string; title: string; retrievedAt: string; sha256: string; characters: number; truncated: boolean };
export type ResearchTopic = 'history' | 'origin' | 'characteristics' | 'culinaryUses';
export type ResearchCoverage = {
  topic: ResearchTopic; label: string; status: 'evidence' | 'missing';
  evidence: { sourceIndex: number; passageIds: number[]; excerpt: string }[];
};
export const researchPhotoSchema = z.object({
  id: text(64).min(1), imageUrl: editorialSourceUrl, sourceUrl: editorialSourceUrl,
  label: text(300), licenseUrl: editorialSourceUrl.optional(),
}).strict();
export type ResearchPhoto = z.infer<typeof researchPhotoSchema>;
export type ResearchReport = {
  provider: 'brave'; queries: string[];
  failures: { url: string; reason: string }[];
  warnings: string[]; searchedAt: string;
  coverage?: ResearchCoverage[]; photos?: ResearchPhoto[];
  queryPlan?: { topic: ResearchTopic | 'photos'; label: string; query: string }[];
};
export type CatalogResult = { items: CatalogItem[]; warnings: string[] };
export type DraftResult = z.infer<typeof draftModelSchema> & { sources: AiSource[]; research?: ResearchReport };
export interface EditorialAiRun {
  id: string; kind: 'catalog' | 'draft'; status: 'running' | 'ready' | 'failed';
  revision: number; model: string; createdAt: string; finishedAt: string | null;
  params: CatalogRequest | DraftRequest; result: CatalogResult | DraftResult | null;
  error: string | null; appliedTo: { entryId: string; revision: number } | null;
}
export const rankRequestSchema = z.object({
  revision: z.number().int().positive(),
  ranks: z.array(z.object({ id: z.string().uuid(), importance: z.number().int().min(1).max(100) }).strict()).min(1).max(30),
}).strict();
export const importRequestSchema = z.object({
  revision: z.number().int().positive(),
  itemIds: z.array(z.string().uuid()).min(1).max(10).refine(ids => new Set(ids).size === ids.length),
}).strict();
export const applyRequestSchema = z.object({
  entryId: z.string().uuid(), revision: z.number().int().positive(),
  fields: z.array(aiFieldSchema).refine(fields => new Set(fields).size === fields.length),
  edits: draftModelSchema.shape.fields.optional(),
  photoIds: z.array(text(64).min(1)).max(3).refine(ids => new Set(ids).size === ids.length).optional(),
  photoRightsConfirmed: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.fields.length && !value.photoIds?.length)
    ctx.addIssue({ code: 'custom', message: 'Выберите текстовые поля или фотографии' });
  if (value.photoIds?.length && value.photoRightsConfirmed !== true)
    ctx.addIssue({ code: 'custom', message: 'Подтвердите право использования выбранных фотографий' });
});
export type ImportResult = { created: EditorialEntry[]; skipped: { itemId: string; entryId: string; title: string }[] };
