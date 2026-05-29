interface ProductJsonLdProps {
  name: string;
  description?: string;
  image?: string;
  price: string;
  currency?: string;
  availability?: boolean;
  brand?: string;
  sku?: string;
  url?: string;
}

export function ProductJsonLd({
  name, description, image, price, currency = 'RUB',
  availability = true, brand = 'Don Giulio Select', sku, url,
}: ProductJsonLdProps) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image,
    sku,
    brand: { '@type': 'Brand', name: brand },
    offers: {
      '@type': 'Offer',
      url: url || (typeof window !== 'undefined' ? window.location.href : ''),
      priceCurrency: currency,
      price: parseFloat(price).toFixed(2),
      availability: `https://schema.org/${availability ? 'InStock' : 'OutOfStock'}`,
      seller: { '@type': 'Organization', name: brand },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

interface BreadcrumbItem { name: string; url: string; }

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Don Giulio Select',
    url: 'https://dongiulioselect.ru',
    logo: 'https://dongiulioselect.ru/icon-512.png',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+7-495-123-45-67',
      contactType: 'customer service',
      availableLanguage: 'Russian',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Москва',
      addressCountry: 'RU',
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
