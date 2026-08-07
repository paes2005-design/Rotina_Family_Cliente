const CACHE_NAME = 'rotina-family-cliente-v2';
const APP_SHELL = ['./','./index.html','./index-CLIENTE-v6.html','./manifest.json','./icon-cliente-192.png','./icon-cliente-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => { if(event.request.method!=='GET') return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp=>{ if(resp && resp.ok && new URL(event.request.url).origin===self.location.origin){ const copy=resp.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)); } return resp; }).catch(()=>caches.match('./index.html')))); });
