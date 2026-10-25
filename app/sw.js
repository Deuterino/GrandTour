// Grand Tour service worker (generated from tools/sw_template.js by tools/build_app.py — edit the template).
// App shell and course data are precached so the app works offline after the first visit.
const VERSION = '126713c3b72c';
const SHELL = `gt-shell-${VERSION}`;
const DATA = `gt-data-${VERSION}`;
const PRECACHE_SHELL = [
 "./",
 "./css/app.css",
 "./icons/apple-touch-icon.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon-maskable-512.png",
 "./index.html",
 "./js/core/ai.js",
 "./js/core/books.js",
 "./js/core/data.js",
 "./js/core/db.js",
 "./js/core/game.js",
 "./js/core/sfx.js",
 "./js/core/speech.js",
 "./js/core/srs.js",
 "./js/core/store.js",
 "./js/core/sync.js",
 "./js/core/text.js",
 "./js/exercises/drills.js",
 "./js/exercises/generate.js",
 "./js/exercises/views.js",
 "./js/lang/analyzer.js",
 "./js/lang/de.js",
 "./js/lang/it.js",
 "./js/main.js",
 "./js/ui/app.js",
 "./js/ui/components.js",
 "./js/ui/h.js",
 "./js/ui/router.js",
 "./js/ui/screens/grammar.js",
 "./js/ui/screens/home.js",
 "./js/ui/screens/lesson.js",
 "./js/ui/screens/library.js",
 "./js/ui/screens/practice.js",
 "./js/ui/screens/profile.js",
 "./js/ui/screens/words.js",
 "./js/ui/tables.js",
 "./js/ui/tappable.js",
 "./js/ui/word.js",
 "./js/vendor/LICENSE-fflate.txt",
 "./js/vendor/LICENSE-htm.txt",
 "./js/vendor/LICENSE-preact.txt",
 "./js/vendor/anthropic/VERSION",
 "./js/vendor/anthropic/anthropic-ai_sdk-1.2.0_internal_node.browser.mjs",
 "./js/vendor/anthropic/anthropic-ai_sdk-1.2.0_tools_agent-toolset_node.browser.mjs",
 "./js/vendor/anthropic/fast-sha256-1.3.0.mjs",
 "./js/vendor/anthropic/opentelemetry_api-1.10.0.mjs",
 "./js/vendor/anthropic/sdk.mjs",
 "./js/vendor/anthropic/stablelib_base64-1.0.1.mjs",
 "./js/vendor/anthropic/standardwebhooks-1.1.1.mjs",
 "./js/vendor/fflate.mjs",
 "./js/vendor/hooks.mjs",
 "./js/vendor/htm.mjs",
 "./js/vendor/preact.mjs",
 "./manifest.webmanifest"
];
const PRECACHE_DATA = [
 "./data/de/books/catalog.json",
 "./data/de/course.json",
 "./data/de/grammar.json",
 "./data/de/lexicon.json",
 "./data/de/sentences.json",
 "./data/de/texts.json",
 "./data/it/books/catalog.json",
 "./data/it/course.json",
 "./data/it/grammar.json",
 "./data/it/lexicon.json",
 "./data/it/sentences.json",
 "./data/it/texts.json"
];

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
