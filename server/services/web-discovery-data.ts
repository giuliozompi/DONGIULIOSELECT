import { pool } from '../db';
import { publicSectionPaths, storefrontPath, discoveryUrl } from '../../shared/web-discovery';

export const CATALOG_PAGE_SIZE = 24;
export interface DiscoveryProduct {
  id: string; name: string; slug: string; price: string; unit: string;
  images: string[]; in_stock: boolean; description_short: string | null;
}
export interface DiscoveryProductDetail extends DiscoveryProduct {
  description_full: string | null;
  nutrition: { composition?: string[] } | null;
}
export interface DiscoveryCategory { id: string; name: string; slug: string }

const productFields = 'id,name,slug,price,unit,images,in_stock,description_short';

export async function discoveryProduct(slug: string, database = pool): Promise<DiscoveryProductDetail | undefined> {
  return (await database.query(`SELECT ${productFields},description_full,nutrition FROM products
    WHERE slug=$1 AND is_visible=true`, [slug])).rows[0];
}

export async function discoveryCategories(database = pool): Promise<DiscoveryCategory[]> {
  return (await database.query('SELECT id,name,slug FROM categories WHERE is_visible=true ORDER BY sort_order,name,id')).rows;
}

export async function discoveryCatalog(category: string, search: string, page: number, database = pool) {
  const predicate = "is_visible=true AND ($1='' OR category_id=$1) AND ($2='' OR strpos(lower(name),lower($2))>0)";
  const params = [category, search];
  const [rows, count] = await Promise.all([
    database.query<DiscoveryProduct>(`SELECT ${productFields} FROM products WHERE ${predicate}
      ORDER BY sort_priority DESC,name,id LIMIT $3 OFFSET $4`, [...params, CATALOG_PAGE_SIZE, (page - 1) * CATALOG_PAGE_SIZE]),
    database.query<{ total: number }>(`SELECT count(*)::int total FROM products WHERE ${predicate}`, params),
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

export async function discoverySitemap(database = pool) {
  const [products, categories, editorial] = await Promise.all([
    database.query<{ slug: string }>('SELECT slug FROM products WHERE is_visible=true ORDER BY slug'),
    database.query<{ slug: string }>(`SELECT c.slug FROM categories c WHERE c.is_visible=true
      AND EXISTS (SELECT 1 FROM products p WHERE p.is_visible=true AND p.category_id=c.id) ORDER BY c.slug`),
    database.query<{ entry_id: string; kind: 'cheese' | 'video'; published_at: Date }>(
      "SELECT entry_id,kind,published_at FROM editorial_publications WHERE kind IN ('cheese','video') ORDER BY kind,entry_id"),
  ]);
  const entries: { path: string; modifiedAt?: string }[] = [
    ...publicSectionPaths.map(path => ({ path })),
    ...categories.rows.map(({ slug }) => ({ path: discoveryUrl('/web/catalog', { category: slug }) })),
    ...products.rows.map(({ slug }) => ({ path: storefrontPath.product(slug) })),
    ...editorial.rows.map(row => ({ path: storefrontPath[row.kind](row.entry_id), modifiedAt: row.published_at.toISOString() })),
  ];
  return Array.from(new Map(entries.map(item => [item.path, item])).values());
}
