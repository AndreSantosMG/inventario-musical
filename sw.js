// Service Worker vazio que apenas limpa o cache anterior
const CACHE_NAME = 'inventario-v4-LIMPO';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log('Limpando cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Não cachear nada, sempre buscar do servidor
  event.respondWith(fetch(event.request));
});
