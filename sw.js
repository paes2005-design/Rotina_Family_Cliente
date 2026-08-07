const CACHE_NAME = 'rotina-family-cliente-v3';
const APP_SHELL = ['./','./index.html','./index-CLIENTE-v6.html','./manifest.json','./icon-cliente-192.png','./icon-cliente-512.png'];
const MODULE_ROOTS = [
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
];
const STATIC_SCRIPTS = ['https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'];

async function cacheModuleTree(url, cache, seen = new Set()) {
  if (seen.has(url)) return;
  seen.add(url);
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return;
    await cache.put(url, response.clone());
    const text = await response.text();
    const specs = [...text.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(m => m[1]);
    await Promise.allSettled(specs.map(spec => {
      const next = new URL(spec, url).href;
      return next.startsWith('https://www.gstatic.com/firebasejs/') ? cacheModuleTree(next, cache, seen) : Promise.resolve();
    }));
  } catch (e) { console.warn('Cache de módulo indisponível:', url); }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await Promise.allSettled(MODULE_ROOTS.map(url => cacheModuleTree(url, cache)));
    await Promise.allSettled(STATIC_SCRIPTS.map(async url => {
      try { const r = await fetch(url, { mode:'cors' }); if(r.ok) await cache.put(url, r); } catch(e) {}
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const staticCdn = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || url.hostname === 'cdn.jsdelivr.net';
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !staticCdn) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && (response.ok || response.type === 'opaque')) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (e) {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw e;
    }
  })());
});
