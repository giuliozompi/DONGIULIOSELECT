import { STORE_ORIGIN, jsonLdText, publicMediaUrl, storefrontPath } from '../../shared/web-discovery';
import { cheeseMilkText } from '../../shared/editorial-cheese-milk';
import { MOSCOW_DELIVERY_RUB, WEB_MOSCOW_DELIVERY_TEXT, WEB_PICKUP, WEB_REGIONAL_DELIVERY_TEXT } from '../../shared/web-delivery';
import type { PublicCheese, PublicCheeseSummary, PublicVideo } from '../../shared/public-editorial';
import type { DiscoveryProduct, DiscoveryProductDetail } from './web-discovery-data';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
));
const roubles = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export function summary(text: string | null | undefined, fallback: string) {
  const normalized = text?.replace(/\s+/g, ' ').trim() || fallback;
  return normalized.length > 165 ? `${normalized.slice(0, 164).trimEnd()}…` : normalized;
}
export const paragraph = (text?: string | null) => text?.trim() ? `<p>${escapeHtml(text)}</p>` : '';
export const link = (href: string, text: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
export const section = (title: string, body: string) => body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : '';
export const list = (items: string[]) => items.length ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>` : '';
export const listLink = (url: string, label: string, details?: string) => `${link(url, label)}${paragraph(details)}`;
export const image = (url: string | null | undefined, alt: string) => {
  const src = publicMediaUrl(url);
  return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="320" loading="lazy">` : '';
};

export function priceText(product: { price: string; unit: string; inStock: boolean }) {
  const valid = Number.isFinite(Number(product.price)) && product.price.trim() !== '' && Number(product.price) >= 0;
  const price = valid ? `${roubles.format(Number(product.price))} ₽ / ${product.unit}` : 'Цена не указана';
  return `${price} · ${product.inStock ? 'В наличии' : 'Нет в наличии'}`;
}
export function cheesenames(cheese: PublicCheeseSummary) {
  return cheese.nameOriginal && cheese.nameOriginal.toLowerCase() !== cheese.title.toLowerCase()
    ? `${cheese.title} (${cheese.nameOriginal})` : cheese.title;
}
export const cheeseLink = (cheese: PublicCheeseSummary, details = false) =>
  listLink(storefrontPath.cheese(cheese.id), cheesenames(cheese), details ?
    `${[cheese.country, cheese.region].filter(Boolean).join(' · ')}. Вид молока: ${cheeseMilkText(cheese.milk)}.${cheese.description ? ` ${summary(cheese.description, '')}` : ''}` : undefined);
export const videoLink = (video: PublicVideo, details = false) =>
  listLink(storefrontPath.video(video.id), video.title, details ? summary(video.description, '') : undefined);
export const productLink = (product: DiscoveryProduct) => listLink(storefrontPath.product(product.slug), product.name,
  priceText({ ...product, inStock: product.in_stock }));

export function productContent(product: DiscoveryProductDetail, related: PublicCheeseSummary[]) {
  const composition = product.nutrition?.composition;
  return paragraph(product.description_short) + paragraph(priceText({ ...product, inStock: product.in_stock })) +
    image(product.images?.find(Boolean), product.name) +
    section('Состав', Array.isArray(composition) ? paragraph(composition.filter(part => typeof part === 'string').join(', ')) : '') +
    section('Описание товара', product.description_full !== product.description_short ? paragraph(product.description_full) : '') +
    section('Как получить заказ', paragraph(WEB_MOSCOW_DELIVERY_TEXT) + link('/web/delivery', 'Условия доставки и самовывоза')) +
    section('Об этом сыре в Атласе', related.length ? paragraph('Атлас описывает историю и традиции сыра, а не подтверждает место производства этого товара.') +
      list(related.map(cheese => cheeseLink(cheese))) : '');
}

export function cheeseContent(cheese: PublicCheese) {
  return paragraph(cheese.description) + paragraph(`Вид молока: ${cheeseMilkText(cheese.milk)}.`) +
    image(cheese.photos?.find(Boolean) || cheese.photo, cheese.title) +
    section('Происхождение и производство', paragraph(`Историческое происхождение: ${[cheese.country, cheese.region].filter(Boolean).join(', ')}.`) +
      paragraph(cheese.productionCountry ? `Страна производства, указанная редакцией: ${cheese.productionCountry}.` : 'Страна производства в статье не указана.') +
      paragraph('История и происхождение сыра не подтверждают место производства конкретных товаров из каталога.')) +
    section('История', paragraph(cheese.history)) +
    section('Характеристики', paragraph(cheese.characteristics)) +
    section('Кулинарное использование', paragraph(cheese.culinaryUses)) +
    section('Связанные товары каталога', list(cheese.products.map(product => listLink(
      storefrontPath.product(product.slug), product.name, priceText(product))))) +
    section('Видео по теме', list([...cheese.relatedVideos.map(video => videoLink(video)),
      ...cheese.externalVideoUrls.flatMap(url => publicMediaUrl(url) ? [link(publicMediaUrl(url)!, 'Внешнее видео')] : [])])) +
    section('Источники', list(cheese.sources.flatMap(url => {
      const safe = publicMediaUrl(url);
      return safe ? [link(safe, new URL(safe).hostname)] : [];
    })));
}

export function deliveryContent() {
  return paragraph('Доставляем заказы по Москве, Московской области и регионам России.') +
    section('Сколько стоит доставка по Москве?', paragraph(`Доставка по Москве — ${roubles.format(MOSCOW_DELIVERY_RUB)} ₽.`) + paragraph(WEB_MOSCOW_DELIVERY_TEXT)) +
    section('Доставка по Московской области и регионам', paragraph(WEB_REGIONAL_DELIVERY_TEXT)) +
    section('Самовывоз', paragraph(`Бесплатно: ${WEB_PICKUP.label}, ${WEB_PICKUP.address}.`)) +
    section('Оплата', paragraph('Заказы оплачиваются онлайн через ЮKassa после подтверждения заказа.')) +
    link('/web/catalog', 'Перейти в каталог');
}

export interface DiscoveryDocument {
  title: string; description: string; canonical?: string; body?: string;
  image?: string | null; type?: 'article' | 'product'; structured?: object;
  status?: number; noindex?: boolean;
}

const fallbackStyle = '<style>.discover{max-width:57rem;margin:auto;padding:1.4rem 1rem 3rem;color:#29352f;font:16px/1.6 system-ui,sans-serif}.discover h1,.discover h2{font-weight:700;line-height:1.25;margin:1rem 0 .45rem}.discover h1{font-size:clamp(1.6rem,4vw,2.3rem)}.discover h2{font-size:1.2rem}.discover p{margin:.4rem 0;white-space:pre-line;overflow-wrap:anywhere}.discover section{margin:1.15rem 0}.discover li{margin:.4rem 0}.discover a{text-decoration:underline;color:#315647}.discover nav{display:flex;flex-wrap:wrap;gap:.7rem 1rem}.discover img{height:auto;max-width:100%;border-radius:.35rem}</style>';
const navigation = `<nav aria-label="Разделы сайта">${[
  ['/web', 'Don Giulio Select'], ['/web/catalog', 'Каталог'], ['/web/cheeses', 'Атлас сыров'],
  ['/web/videos', 'Видеотека'], ['/web/delivery', 'Доставка и оплата'],
].map(([url, name]) => link(url, name)).join('')}</nav>`;
const baseMeta = /<meta (?:name|property)="(?:description|robots|og:title|og:description|og:type|og:image|og:url|twitter:card|twitter:title|twitter:description|twitter:image)"[^>]*>/gi;

export function renderDiscoveryHtml(template: string, doc: DiscoveryDocument) {
  const title = `${doc.title} — Don Giulio Select`;
  const canonical = doc.canonical ? `${STORE_ORIGIN}${doc.canonical}` : undefined;
  const media = publicMediaUrl(doc.image);
  const meta = (attribute: 'name' | 'property', name: string, value: string) =>
    `<meta ${attribute}="${name}" content="${escapeHtml(value)}">`;
  const head = [
    meta('name', 'description', doc.description),
    meta('name', 'robots', doc.noindex ? 'noindex, follow' : 'index, follow'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', doc.description),
    meta('property', 'og:type', doc.type ?? 'website'),
    meta('name', 'twitter:card', media ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', doc.description),
    ...(canonical ? [`<link rel="canonical" href="${escapeHtml(canonical)}">`, meta('property', 'og:url', canonical)] : []),
    ...(media ? [meta('property', 'og:image', media), meta('name', 'twitter:image', media)] : []),
    ...(doc.structured ? [`<script type="application/ld+json" data-document-discovery="${escapeHtml(doc.canonical || '')}">${jsonLdText(doc.structured)}</script>`] : []),
    ...(doc.body !== undefined ? [fallbackStyle] : []),
  ].join('\n');
  const page = template.replace(baseMeta, '').replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`)
    .replace('</head>', () => `${head}\n</head>`);
  return doc.body === undefined ? page : page.replace('<div id="root"></div>', () =>
    `<div id="root"><div class="discover" data-discovery-content>${navigation}<main><h1>${escapeHtml(doc.title)}</h1>${doc.body}</main></div></div>`);
}
