// Grand Tour service worker (generated from tools/sw_template.js by tools/build_app.py — edit the template).
// App shell and course data are precached so the app works offline after the first visit.
const VERSION = '__VERSION__';
const SHELL = `gt-shell-${VERSION}`;
const DATA = `gt-data-${VERSION}`;
const PRECACHE_SHELL = __SHELL__;
const PRECACHE_DATA = __DATA__;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE_SHELL);
    const data = await caches.open(DATA);
    // Data is large; failures here must not block installing the shell.
    await Promise.allSettled(PRECACHE_DATA.map((u) => data.add(u)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('gt-') && key !== SHELL && key !== DATA && !key.startsWith('gt-books')) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // APIs, audio, Wikisource: straight to the network
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.includes('/data/')) {
        const c = await caches.open(DATA);
        c.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
