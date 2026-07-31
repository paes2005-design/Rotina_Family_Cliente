const CACHE_NAME = 'metas-app-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Instalação do Service Worker e Cache dos arquivos essenciais
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Responde com o cache quando estiver offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});