/* Service worker minimo: guscio in cache, dati sempre freschi. */
const CACHE = 'cineteca-v14';
const SHELL = [
  './', './index.html', './css/styles.css',
  './js/store.js', './js/format.js', './js/charts.js', './js/stats.js', './js/detail.js', './js/app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Catalogo e locandine: prima la rete, la cache è il paracadute offline.
  if (url.pathname.includes('/data/') || url.hostname === 'image.tmdb.org') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  e.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
