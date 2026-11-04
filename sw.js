// Service worker : offline-first. Coque applicative pré-cachée ; fichiers OCR mis en cache à la première utilisation.
const VERSION = 'v16';
const SHELL = `shell-${VERSION}`;
const HEAVY = `vendor-${VERSION}`;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/dom.js', 'js/db.js', 'js/modules.js', 'js/engine.js', 'js/export.js', 'js/qr.js', 'js/scan.js', 'js/pdf.js', 'js/receive.js', 'js/backup.js', 'js/sync.js', 'js/qrsync.js', 'js/aide.js', 'js/drive.js', 'vendor/jsQR.js',
  'vendor/qrcode.mjs', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== HEAVY).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const heavy = req.url.includes('/vendor/tesseract/');
  e.respondWith((async () => {
    const cache = await caches.open(heavy ? HEAVY : SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    // fichiers lourds : cache d'abord ; coque : cache immédiat + mise à jour en arrière-plan
    const refresh = () => fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (hit) { if (!heavy) refresh().catch(() => {}); return hit; }
    try { return await refresh(); }
    catch {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
