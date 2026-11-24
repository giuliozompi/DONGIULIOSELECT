import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { publicMediaUrl, STORE_ORIGIN } from '@shared/web-discovery';

interface MetaOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'product' | 'article';
  price?: string;
  currency?: string;
  noindex?: boolean;
  defer?: boolean;
}

const SITE_NAME = 'Don Giulio Select';
const DEFAULT_DESC = 'Магазин премиальных итальянских деликатесов с доставкой по всей России. Сыры, мясные деликатесы, паста и многое другое.';
const DEFAULT_IMAGE = 'https://dongiulioselect.ru/og-image.jpg';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function useWebMeta(options: MetaOptions = {}) {
  const [path] = useLocation();
  const canonical = options.url || `${STORE_ORIGIN}${path.replace(/\/+$/, '') || '/web'}`;
  useEffect(() => {
    if (options.defer) return;
    const {
      title,
      description = DEFAULT_DESC,
      image = DEFAULT_IMAGE,
      type = 'website',
      price,
      currency = 'RUB',
      noindex,
    } = options;

    // Title
    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Итальянские деликатесы премиум качества`;
    document.title = fullTitle;

    // Standard meta
    setMeta('description', description);
    setMeta('robots', noindex ? 'noindex, follow' : 'index, follow');

    // Open Graph
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:image', publicMediaUrl(image) ?? DEFAULT_IMAGE, 'property');
    setMeta('og:url', canonical, 'property');
    setMeta('og:type', type, 'property');
    setMeta('og:site_name', SITE_NAME, 'property');
    setMeta('og:locale', 'ru_RU', 'property');

    // Twitter Card
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image', publicMediaUrl(image) ?? DEFAULT_IMAGE);

    // Product-specific
    if (type === 'product' && price) {
      setMeta('product:price:amount', price, 'property');
      setMeta('product:price:currency', currency, 'property');
    } else {
      document.querySelector('meta[property="product:price:amount"]')?.remove();
      document.querySelector('meta[property="product:price:currency"]')?.remove();
    }

    // Canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonical);

    return () => {
      // Reset to defaults on unmount
      document.title = SITE_NAME;
    };
  }, [options.title, options.description, options.image, canonical, options.price, options.currency, options.type, options.noindex, options.defer]);
}
