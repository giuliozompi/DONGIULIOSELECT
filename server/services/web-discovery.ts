import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { EditorialError } from './editorial';
import { publicCheeseDetail, publicCheesesForProduct, publicEditorialList, publicVideoDetail } from './public-editorial';
import { CATALOG_PAGE_SIZE, discoveryCatalog, discoveryCategories, discoveryProduct, discoverySitemap } from './web-discovery-data';
import {
  cheeseContent, cheesenames, cheeseLink, deliveryContent, escapeHtml, image, link, list,
  paragraph, productContent, productLink, renderDiscoveryHtml, section, summary, videoLink, type DiscoveryDocument,
} from './web-discovery-html';
import { ATLAS_DEFAULT_COUNTRY, discoveryUrl, publicMediaUrl, readDiscoveryPage, STORE_ORIGIN, storefrontPath } from '../../shared/web-discovery';
import type { PublicCheeseSummary, PublicVideo } from '../../shared/public-editorial';

const SITE_NAME = 'Don Giulio Select';
const EDITORIAL_SIZE = 12;
const descriptions = {
  home: 'Итальянские деликатесы Don Giulio Select: каталог, история сыров, видеотека и доставка по России.',
  catalog: 'Сыры, мясные деликатесы, паста и соусы Don Giulio Select. Цены, наличие и доставка по России.',
  cheeses: 'Сырный атлас Don Giulio Select: история, происхождение, виды молока, характеристики и кулинарное использование сыров.',
  videos: 'Видеотека Don Giulio Select: рецепты, интервью, обзоры продуктов и гастрономические места.',
  delivery: 'Доставка по Москве и регионам России, бесплатный самовывоз на Покровке и оплата онлайн.',
};
const missing: DiscoveryDocument = { title: 'Страница не найдена', description: 'Эта страница недоступна.', status: 404, noindex: true,
  body: paragraph('Эта страница недоступна. Вы можете вернуться в каталог или атлас сыров.') };
const unavailable: DiscoveryDocument = { title: 'Раздел временно недоступен', description: 'Попробуйте открыть страницу позже.', status: 503, noindex: true,
  body: paragraph('Не удалось загрузить данные. Попробуйте открыть страницу позже.') };
const exempt = /^\/web\/(?:admin|account|orders|order-success|wishlist|cart|checkout)(?:\/|$)|^\/web\/(?:about|legal|privacy)$/;
const json = (type: string, name: string, canonical: string) => ({
  '@context': 'https://schema.org', '@type': type, name, url: `${STORE_ORIGIN}${canonical}`, inLanguage: 'ru',
});
const publisher = { '@type': 'Organization', name: SITE_NAME, url: `${STORE_ORIGIN}/web` };

function pagination(page: number, total: number, size: number, pathAt: (page: number) => string) {
  const links = [page > 1 && link(pathAt(page - 1), 'Предыдущая страница'),
    page * size < total && link(pathAt(page + 1), 'Следующая страница')].filter(Boolean);
  return links.length ? `<nav aria-label="Страницы">${links.join('')}</nav>` : '';
}

export async function storefrontDocument(path: string, query: URLSearchParams, database = pool): Promise<DiscoveryDocument | undefined> {
  const page = readDiscoveryPage(query.get('page'));
  if (path === '/web') return { title: 'Итальянские деликатесы', description: descriptions.home, canonical: path,
    body: paragraph(descriptions.home) + section('Магазин и редакция', list([
      link('/web/catalog', 'Каталог товаров и цены'), link('/web/cheeses', 'История и виды сыров в Атласе'),
      link('/web/videos', 'Рецепты, интервью и обзоры'), link('/web/delivery', 'Доставка и оплата'),
    ])),
    structured: { ...json('Organization', SITE_NAME, path), logo: `${STORE_ORIGIN}/icon-512.png` } };
  if (path === '/web/delivery') return { title: 'Доставка и оплата', description: descriptions.delivery, canonical: path, body: deliveryContent() };
  if (path === '/web/catalog' || path === '/web/search') {
    const [categories, categoryQuery, q] = [await discoveryCategories(database), query.get('category') || '', (query.get('q') || '').trim().slice(0, 200)];
    const category = categoryQuery ? categories.find(item => item.slug === categoryQuery) ?? categories.find(item => item.id === categoryQuery) : undefined;
    if (categoryQuery && !category) return missing;
    const data = await discoveryCatalog(category?.id || '', q, page, database);
    if (page > 1 && (page - 1) * CATALOG_PAGE_SIZE >= data.total) return missing;
    const canonical = discoveryUrl('/web/catalog', { category: category?.slug, page: !q && page > 1 ? page : undefined });
    const title = q ? `Поиск в каталоге: ${q}` : category ? `Каталог: ${category.name}` : 'Каталог товаров';
    const description = category ? summary(`${category.name}. ${descriptions.catalog}`, descriptions.catalog) : descriptions.catalog;
    const pathAt = (next: number) => discoveryUrl(path, { category: category?.slug, q, page: next > 1 ? next : undefined });
    return { title: page > 1 ? `${title} · страница ${page}` : title, description, canonical, noindex: Boolean(q) || path === '/web/search' || (Boolean(category) && !data.total),
      body: paragraph(description) + section('Категории', list(categories.map(item => link(
        discoveryUrl('/web/catalog', { category: item.slug }), item.name)))) +
        section('Товары', data.items.length ? list(data.items.map(productLink)) : paragraph('По выбранным условиям товары не найдены.')) +
        pagination(page, data.total, CATALOG_PAGE_SIZE, pathAt) };
  }
  if (path === '/web/cheeses' || path === '/web/videos') {
    const kind = path === '/web/cheeses' ? 'cheese' : 'video';
    const allCountries = kind === 'cheese' && query.get('country') === 'all';
    const data = await publicEditorialList(kind, { search: '', country: kind === 'cheese' && !allCountries ? ATLAS_DEFAULT_COUNTRY : undefined, page, limit: EDITORIAL_SIZE }, database);
    if (page > 1 && (page - 1) * EDITORIAL_SIZE >= data.total) return missing;
    const title = kind === 'cheese' ? 'Атлас сыров' : 'Видеотека Don Giulio';
    const description = kind === 'cheese' ? descriptions.cheeses : descriptions.videos;
    const pathAt = (next: number) => discoveryUrl(path, { country: allCountries ? 'all' : undefined, page: next > 1 ? next : undefined });
    const items = kind === 'cheese' ? (data.items as PublicCheeseSummary[]).map(item => cheeseLink(item, true)) :
      (data.items as PublicVideo[]).map(item => videoLink(item, true));
    return { title: page > 1 ? `${title} · страница ${page}` : title, description, canonical: pathAt(page),
      body: paragraph(description) +
        (kind === 'cheese' ? `<nav aria-label="Страны">${link('/web/cheeses', 'Италия')}${link('/web/cheeses?country=all', 'Все страны')}</nav>` : '') +
        section(kind === 'cheese' ? (allCountries ? 'Сыры всех стран' : 'Сыры Италии') : 'Опубликованные видео',
          items.length ? list(items) : paragraph('Опубликованных материалов пока нет.')) + pagination(page, data.total, EDITORIAL_SIZE, pathAt) };
  }

  const parts = path.match(/^\/web\/(product|cheeses|videos)\/([^/]+)$/);
  if (parts) {
    let value: string;
    try { value = decodeURIComponent(parts[2]); } catch { return missing; }
    if (value.length > 250 || /[/\\\u0000-\u001f]/.test(value) || value === '.' || value === '..') return missing;
    if (parts[1] === 'product') {
      const product = await discoveryProduct(value, database);
      if (!product) return missing;
      const related = await publicCheesesForProduct(product.id, database);
      const canonical = storefrontPath.product(product.slug);
      const description = summary(product.description_short || product.description_full, `${product.name}: цена, наличие и доставка в Don Giulio Select.`);
      const photo = product.images?.find(Boolean);
      const validPrice = product.price.trim() !== '' && Number.isFinite(Number(product.price)) && Number(product.price) >= 0;
      return { title: product.name, description, canonical, type: 'product', image: photo, body: productContent(product, related),
        structured: { ...json('Product', product.name, canonical), description, sku: product.id, image: publicMediaUrl(photo),
          ...(validPrice ? { offers: { '@type': 'Offer', url: `${STORE_ORIGIN}${canonical}`, price: product.price, priceCurrency: 'RUB',
            availability: `https://schema.org/${product.in_stock ? 'InStock' : 'OutOfStock'}`, seller: publisher } } : {}) } };
    }

    if (!z.string().uuid().safeParse(value).success) return missing;
    if (parts[1] === 'cheeses') {
      const cheese = await publicCheeseDetail(value, database);
      const title = cheesenames(cheese);
      const canonical = storefrontPath.cheese(cheese.id);
      const description = summary(cheese.description, `${title}: происхождение, вид молока и применение в кухне.`);
      return { title, description, canonical, image: cheese.photo, type: 'article', body: cheeseContent(cheese),
        structured: { ...json('Article', title, canonical), headline: title, description, dateModified: cheese.publishedAt,
          image: publicMediaUrl(cheese.photo), publisher, mainEntityOfPage: `${STORE_ORIGIN}${canonical}` } };
    }
    const video = await publicVideoDetail(value, database);
    const canonical = storefrontPath.video(video.id);
    const description = summary(video.description, `${video.title} — материал видеотеки Don Giulio Select.`);
    const source = publicMediaUrl(video.url);
    const body = paragraph(video.description) + image(video.cover, video.title) +
      section('Первоисточник', source ? link(source, 'Открыть оригинальную публикацию') : '') +
      section('Связанные статьи атласа', list(video.relatedCheeses.map(item => cheeseLink(item))));
    const cover = publicMediaUrl(video.cover);
    return { title: video.title, description, canonical, image: video.cover, body,
      // The original upload date is not stored, so mark up the page and its source, not a hosted video.
      structured: { ...json('WebPage', video.title, canonical), description, dateModified: video.publishedAt, image: cover,
        ...(source ? { relatedLink: source } : {}) } };
  }
  if (exempt.test(path)) return { title: 'Don Giulio Select', description: '', noindex: true };
  if (path.startsWith('/web/')) return missing;
  // "/" still belongs to the Telegram/bootstrap entry point.
  return undefined;
}

export async function sendStorefrontDocument(req: Request, res: Response, template: string, database = pool): Promise<boolean> {
  // Express rewrites req.path underneath a wildcard mount.
  const [rawPath, ...queryParts] = req.originalUrl.split('?');
  if (!['GET', 'HEAD'].includes(req.method) || !/^\/web(?:\/|$)/.test(rawPath)) return false;
  const path = rawPath.replace(/\/+$/, '');
  const query = new URLSearchParams(queryParts.join('?'));
  let doc: DiscoveryDocument | undefined;
  try {
    doc = await storefrontDocument(path, query, database);
  } catch (error) {
    if (error instanceof EditorialError && error.status === 404) doc = missing;
    else {
      console.warn('[web-discovery] Public page data unavailable');
      doc = unavailable;
    }
  }
  if (!doc) return false;
  res.set('Cache-Control', 'no-store');
  if (doc.noindex) res.set('X-Robots-Tag', 'noindex, follow');
  if (doc.status === 503) res.set('Retry-After', '60');
  res.status(doc.status ?? 200).type('html').send(renderDiscoveryHtml(template, doc));
  return true;
}

export async function sendDiscoverySitemap(res: Response, database = pool) {
  res.set('Cache-Control', 'no-store');
  try {
    const urls = (await discoverySitemap(database)).map(({ path, modifiedAt }) =>
      `  <url><loc>${escapeHtml(`${STORE_ORIGIN}${path}`)}</loc>${modifiedAt ? `<lastmod>${modifiedAt}</lastmod>` : ''}</url>`);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  } catch {
    res.status(503).set('Retry-After', '60').type('text/plain').send('Sitemap временно недоступна.');
  }
}
