const CACHE_NAME = 'inventario-v7';
const urlsToCache = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/app.js', './js/db.js', './js/utils.js', './js/sync.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(cacheNames.map(cn => {
      if (cn !== CACHE_NAME) return caches.delete(cn);
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
    }))
  );
});
