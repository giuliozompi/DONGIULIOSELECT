import { pool } from '../db';
import { videoDataSchema, cheeseDataSchema, priceDataSchema, pricePerKg } from '../../shared/editorial';
import type { PublicVideo, PublicCheeseSummary, PublicCheese, PublicMarketPrice, EditorialPage } from '../../shared/public-editorial';
import { EditorialError } from './editorial';

type Publication = { entry_id: string; kind: 'video' | 'cheese'; data: unknown; published_at: Date };
function publicVideo(row: Publication): PublicVideo {
  const v = videoDataSchema.parse(row.data);
  return { id: row.entry_id, title: v.title, description: v.description, url: v.url,
    cover: v.cover, category: v.category, publishedAt: row.published_at.toISOString() };
}
function cheeseSummary(row: Publication): PublicCheeseSummary {
  const c = cheeseDataSchema.parse(row.data);
  return { id: row.entry_id, title: c.title, nameOriginal: c.nameOriginal, description: c.description, country: c.country,
    region: c.region, latitude: c.latitude, longitude: c.longitude, photo: c.photos.find(Boolean) || '',
    publishedAt: row.published_at.toISOString() };
}
export interface PublicFilters { search: string; category?: string; country?: string; page: number; limit: number }
const filterSql = `kind=$1 AND ($2='' OR strpos(lower(concat_ws(' ',data->>'title',data->>'nameOriginal',data->>'description',data->>'country',data->>'region')),lower($2))>0)
  AND ($3='' OR data->>'category'=$3) AND ($4='' OR data->>'country'=$4)`;
export async function publicEditorialList(kind: 'video' | 'cheese', filters: PublicFilters, database = pool) {
  const params = [kind, filters.search, filters.category || '', filters.country || ''];
  const [list, count] = await Promise.all([
    database.query(`SELECT * FROM editorial_publications WHERE ${filterSql}
      ORDER BY (data->>'sortOrder')::int, published_at DESC,entry_id LIMIT $5 OFFSET $6`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]),
    database.query(`SELECT count(*)::int n FROM editorial_publications WHERE ${filterSql}`, params),
  ]);
  const page = { items: list.rows.map((row: Publication) => kind === 'video' ? publicVideo(row) : cheeseSummary(row)),
    total: count.rows[0].n, page: filters.page, limit: filters.limit };
  if (kind === 'video') return page;
  const countries = await database.query(`SELECT DISTINCT data->>'country' AS country
    FROM editorial_publications WHERE kind='cheese' ORDER BY country`);
  return { ...page, countries: countries.rows.map(r => r.country) };
}
export async function publicCheeseMap(filters: PublicFilters, database = pool) {
  const result = await publicEditorialList('cheese', { ...filters, page: 1, limit: 1000 }, database);
  return { items: result.items, total: result.total, truncated: result.total > result.items.length };
}
async function publication(id: string, kind: 'video' | 'cheese', database: typeof pool) {
  const row: Publication | undefined = (await database.query(
    'SELECT * FROM editorial_publications WHERE entry_id=$1 AND kind=$2', [id, kind])).rows[0];
  if (!row) throw new EditorialError(404, 'Материал не опубликован или больше недоступен');
  return row;
}
export async function publicVideoDetail(id: string, database = pool) {
  const row = await publication(id, 'video', database);
  const video = videoDataSchema.parse(row.data);
  const related = await database.query(`SELECT * FROM editorial_publications WHERE kind='cheese'
    AND ((data->'videoIds') ? $1 OR entry_id=ANY($2::uuid[]))
    ORDER BY (data->>'sortOrder')::int,entry_id`, [id, video.cheeseIds]);
  return { ...publicVideo(row), relatedCheeses: related.rows.map(cheeseSummary) };
}
export async function publicCheeseDetail(id: string, database = pool): Promise<PublicCheese> {
  const row = await publication(id, 'cheese', database);
  const cheese = cheeseDataSchema.parse(row.data);
  const [videos, products] = await Promise.all([
    database.query(`SELECT * FROM editorial_publications WHERE kind='video'
      AND ((data->'cheeseIds') ? $1 OR entry_id=ANY($2::uuid[]))
      ORDER BY (data->>'sortOrder')::int,entry_id`, [id, cheese.videoIds]),
    // Deliberately live catalogue data, never a copied commercial price in the article.
    database.query(`SELECT id,name,slug,images,price,price_old,unit,in_stock,description_short
      FROM products WHERE id=ANY($1::varchar[]) AND is_visible=true ORDER BY name,id`, [cheese.productIds]),
  ]);
  return { ...cheeseSummary(row), photos: cheese.photos, history: cheese.history,
    characteristics: cheese.characteristics, culinaryUses: cheese.culinaryUses,
    productionCountry: cheese.productionCountry, productionPoints: cheese.productionPoints || [], sources: cheese.sources,
    externalVideoUrls: cheese.externalVideoUrls, relatedVideos: videos.rows.map(publicVideo),
    products: products.rows.map(p => ({
      id: p.id, name: p.name, slug: p.slug, images: p.images, price: p.price,
      ...(p.price_old === null ? {} : { priceOld: p.price_old }),
      unit: p.unit, inStock: p.in_stock,
      ...(p.description_short === null ? {} : { descriptionShort: p.description_short }),
    })) };
}
export async function publicCheesePrices(id: string, page: number, limit: number, database = pool): Promise<EditorialPage<PublicMarketPrice>> {
  // Both the parent and observations are checked in the same SQL snapshot.
  const result = await database.query(`WITH parent AS (
      SELECT entry_id FROM editorial_publications WHERE entry_id=$1 AND kind='cheese'
    ), approved AS (
      SELECT e.id,e.data FROM editorial_entries e JOIN parent p ON e.data->>'cheeseId'=p.entry_id::text
      WHERE e.kind='price' AND e.moderation='approved'
    ), paged AS (
      SELECT * FROM approved ORDER BY data->>'observedOn' DESC,id LIMIT $2 OFFSET $3
    )
    SELECT EXISTS(SELECT 1 FROM parent) AS parent_exists,
      (SELECT count(*)::int FROM approved) AS total,
      COALESCE((SELECT jsonb_agg(paged ORDER BY data->>'observedOn' DESC,id) FROM paged),'[]'::jsonb) AS items`,
    [id, limit, (page - 1) * limit]);
  if (!result.rows[0].parent_exists) throw new EditorialError(404, 'Материал не опубликован или больше недоступен');
  return { items: result.rows[0].items.map((r: { id: string; data: unknown }) => {
    const p = priceDataSchema.parse(r.data);
    return { id: r.id, sourceType: p.sourceType, price: p.price, currency: p.currency,
      country: p.country, store: p.store, sourceUrl: p.sourceUrl, observedOn: p.observedOn,
      packageQuantity: p.packageQuantity, packageUnit: p.packageUnit, pricePerKg: pricePerKg(p),
      offerConditions: p.offerConditions };
  }), total: result.rows[0].total, page, limit };
}
