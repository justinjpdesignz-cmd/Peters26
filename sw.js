/* Offline support for the guest guide.
   - The guide page: tries the network first (so schedule changes show up), but falls back to the
     saved copy after 4 seconds or when there is no signal.
   - Fonts and images: saved after the first visit and reused.
   - Photo upload and gallery pages (/photos/...) are never saved; they always use the network.
   When fonts or images change, bump VERSION so guests' phones fetch the new ones. */
const VERSION = 'p26-v1';
const CORE = [
  './',
  'fonts/cormorant-garamond-latin-400-italic.woff2', 'fonts/cormorant-garamond-latin-400-normal.woff2',
  'fonts/cormorant-garamond-latin-500-italic.woff2', 'fonts/cormorant-garamond-latin-500-normal.woff2',
  'fonts/cormorant-garamond-latin-600-normal.woff2', 'fonts/montserrat-latin-400-normal.woff2',
  'fonts/montserrat-latin-500-normal.woff2', 'fonts/montserrat-latin-600-normal.woff2',
  'images/resort-map-1400.webp'
];
const BASE = new URL(self.registration.scope).pathname;
const OFFLINE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No connection</title>' +
  '<body style="font:17px/1.6 system-ui,sans-serif;background:#f6f1e9;color:#1c2a45;text-align:center;padding:18vh 24px 0">' +
  '<h1 style="font:500 2rem Georgia,serif;color:#1c3560;margin:0 0 8px">No connection</h1>' +
  '<p>This page needs the internet. Try again when you have a signal or Wi-Fi.</p>' +
  '<p><a style="color:#1c3560" href="' + BASE + '">Back to the guide</a></p>';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // never touch uploads, the gallery API or AWS
  const rel = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;
  if (rel.startsWith('photos')) {                                   // upload page + gallery: network only
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })));
    }
    return;
  }
  if (req.mode === 'navigate') { e.respondWith(guidePage(req, e)); return; }
  if (/^(fonts|images)\//.test(rel)) { e.respondWith(cacheFirst(req)); return; }
});

async function guidePage(req, e) {
  const cache = await caches.open(VERSION);
  const cached = (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./'));
  const net = fetch(req).then((res) => {
    if (res && res.ok) { cache.put(req, res.clone()); return res; }
    return cached || res;
  });
  e.waitUntil(net.catch(() => {}));
  if (!cached) return net;
  return Promise.race([net, new Promise((r) => setTimeout(() => r(cached), 4000))]).catch(() => cached);
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
