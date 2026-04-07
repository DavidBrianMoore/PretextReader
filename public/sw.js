const CACHE_NAME = 'pretext-v1.0.46';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.ts',
  '/src/style.css',
  'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600&family=Source+Code+Pro:wght@400;500&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await clients.claim();
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isShell = url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.ts');

  if (isShell) {
      // Network-First for the app shell
      e.respondWith(
          fetch(e.request).then((res) => {
              const clone = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
              return res;
          }).catch(() => caches.match(e.request))
      );
  } else {
      // Cache-First for other assets
      e.respondWith(
          caches.match(e.request).then((res) => {
              return res || fetch(e.request).then((networkRes) => {
                  if (url.href.includes('fonts.gstatic.com') || url.href.includes('fonts.googleapis.com')) {
                      const clone = networkRes.clone();
                      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                  }
                  return networkRes;
              });
          })
      );
  }
});
