const CACHE_NAME = 'pretext-v1.0.10';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.ts',
  '/src/style.css',
  'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600&family=Source+Code+Pro:wght@400;500&display=swap'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
  e.waitUntil(
    caches.keys().then((keys) => {
        return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Try cache first, then network
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).then((networkRes) => {
          // Put to cache for next time if it's an asset
          if (e.request.url.includes('fonts.gstatic.com') || e.request.url.includes('fonts.googleapis.com')) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return networkRes;
      });
    })
  );
});
