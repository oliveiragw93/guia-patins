// Service Worker do Guia de Patins — cache simples "app shell" para uso offline.
// Estratégia: network-first para o HTML principal (sempre tenta buscar a versão mais
// recente quando há internet), com fallback pro cache quando não há conexão.
// Isso evita ficar preso numa versão antiga por engano, mas garante que o app abre
// mesmo sem sinal.

const CACHE_NAME = 'guia-patins-v1'; // troque para v2, v3... a cada nova versão publicada, para forçar atualização do cache
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
