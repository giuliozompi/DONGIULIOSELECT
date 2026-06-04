const CACHE_NAME = 'dg-select-v1';
const STATIC_ASSETS = [
  '/web',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/web-api/') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'Нет соединения' }), {
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // Cache-first for static assets (images, JS, CSS)
  if (
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|js|css)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages (SPA navigation)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/web').then((r) => r || fetch('/web'))
      )
    );
  }
});
