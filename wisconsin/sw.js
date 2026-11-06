// Offline support: the app shell is cached when the service worker installs
// and served from the cache afterwards. Bump VERSION (and js/version.js) on
// every release so phones pick up the new files.

const VERSION = '2.11.0';
const CACHE = `prayer-tracker-wisconsin-${VERSION}`;
// This copy's own caches, and not the other editions' (prayer-tracker-public-…,
// prayer-tracker-wisconsin-…), which can live at the same web address.
const OWN_CACHE = /^prayer-tracker-wisconsin-\d/;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/OFL-Fraunces.txt',
  './fonts/OFL-InstrumentSans.txt',
  './fonts/README.txt',
  './fonts/fraunces-latin-ext-full-italic.woff2',
  './fonts/fraunces-latin-ext-full-normal.woff2',
  './fonts/fraunces-latin-full-italic.woff2',
  './fonts/fraunces-latin-full-normal.woff2',
  './fonts/instrument-sans-latin-ext-standard-normal.woff2',
  './fonts/instrument-sans-latin-standard-normal.woff2',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/bundles.js',
  './js/calendar.js',
  './js/collects.js',
  './js/data/acp.js',
  './js/data/collects.js',
  './js/data/diocese.js',
  './js/data/office.js',
  './js/data/prayers.js',
  './js/dates.js',
  './js/diocesan-seed.js',
  './js/edition.js',
  './js/extras.js',
  './js/importer.js',
  './js/lff-ui.js',
  './js/lff.js',
  './js/lists.js',
  './js/liturgy.js',
  './js/names.js',
  './js/pdf.js',
  './js/prayers.js',
  './js/praythrough.js',
  './js/reach.js',
  './js/schedule.js',
  './js/seeds.js',
  './js/settings.js',
  './js/share-ui.js',
  './js/sheets.js',
  './js/store.js',
  './js/sync.js',
  './js/today.js',
  './js/ui.js',
  './js/version.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (OWN_CACHE.test(key) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isShell = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
    if (isShell) {
      // Any ?add or ?text= query still gets the same page.
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    // The PDF reader is large and rarely needed: keep it once it has been used.
    if (res.ok && url.pathname.includes('/vendor/')) cache.put(req, res.clone());
    return res;
  })());
});
