import { useEffect } from 'react';

interface MetaOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'product' | 'article';
  price?: string;
  currency?: string;
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
  useEffect(() => {
    const {
      title,
      description = DEFAULT_DESC,
      image = DEFAULT_IMAGE,
      url = typeof window !== 'undefined' ? window.location.href : '',
      type = 'website',
      price,
      currency = 'RUB',
    } = options;

    // Title
    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Итальянские деликатесы премиум качества`;
    document.title = fullTitle;

    // Standard meta
    setMeta('description', description);
    setMeta('robots', 'index, follow');

    // Open Graph
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:image', image, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:type', type === 'product' ? 'og:product' : 'website', 'property');
    setMeta('og:site_name', SITE_NAME, 'property');
    setMeta('og:locale', 'ru_RU', 'property');

    // Twitter Card
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image', image);

    // Product-specific
    if (type === 'product' && price) {
      setMeta('product:price:amount', price, 'property');
      setMeta('product:price:currency', currency, 'property');
    }

    // Canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    return () => {
      // Reset to defaults on unmount
      document.title = SITE_NAME;
    };
  }, [options.title, options.description, options.image, options.url, options.price]);
}
