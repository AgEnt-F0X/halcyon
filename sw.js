// Halcyon service worker.
// - App shell + CDN assets: precached, then served Stale-While-Revalidate.
// - /api/* telemetry: network-first with cache fallback, so the last GitHub /
//   README / tree payload always survives an offline moment.
const CACHE = 'halcyon-v5-ferrofluid';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './js/config.js', './js/quality.js', './js/main.js', './js/github-service.js',
  './js/scene/materials.js', './js/scene/matrix.js', './js/scene/nodes.js',
  './js/scene/camera.js', './js/scene/post.js',
  './js/ui/showcase.js', './js/ui/interactions.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(CORE.map(u => c.add(u)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await refresh) || new Response('{"error":"offline"}', {
    status: 503, headers: { 'Content-Type': 'application/json' },
  });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    return hit || new Response('{"error":"offline"}', {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' && !url.pathname.startsWith('/api/pulse')) return;

  // telemetry APIs: network-first, cached fallback (SW keeps the last payload)
  if (url.pathname.startsWith('/api/')) {
    if (e.request.method === 'GET') {
      e.respondWith(networkFirst(e.request, CACHE));
    }
    return;
  }
  // local dev: always go to the network so edits show up instantly
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  // app shell + CDN: stale-while-revalidate
  e.respondWith(staleWhileRevalidate(e.request, CACHE));
});
