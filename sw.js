// Halcyon service worker: app-shell cache (including the pinned Three.js CDN files
// so the site works offline once visited) + graceful passthrough for the API.
const CACHE = 'halcyon-v1';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './js/config.js', './js/time.js', './js/weather.js', './js/quality.js', './js/main.js', './js/audio.js',
  './js/scene/materials.js', './js/scene/sky.js', './js/scene/terrain.js', './js/scene/water.js',
  './js/scene/forest.js', './js/scene/cabin.js', './js/scene/clouds.js', './js/scene/weatherfx.js',
  './js/scene/stars.js', './js/scene/birds.js', './js/scene/camera.js', './js/scene/post.js',
  './js/ui/clock.js', './js/ui/scrubber.js', './js/ui/settings.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js',
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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // weather/geocoding: network first, cache as offline fallback
  if (url.hostname.includes('open-meteo.com')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  // app shell + CDN: cache first, then network (and backfill the cache)
  e.respondWith(
    caches.match(e.request, { ignoreSearch: url.href === self.location.origin + '/' }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }),
    ),
  );
});
