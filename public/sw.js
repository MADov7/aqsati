// أقساطي — service worker: the app shell works offline; the API is never cached.
//
//   navigations (pages)     → network first, saved for offline; offline → the saved page (or the dashboard / home)
//   CSS / JS / manifest     → network first too (so fresh HTML never runs with stale JS after a deploy), cache offline
//   icons / images / fonts  → cache first
// Install precaches every page, the JS/CSS each page links to, AND every module those scripts import
// (followed recursively), so all pages boot offline — not just the ones without imports.
//   /api/*, non-GET, other origins (Google Fonts, three.js CDN) → not touched at all
//
// Bump VERSION on every deploy that changes the shell; old caches are deleted on activate.
// On localhost even icons and images are network first, so editing files never shows a stale copy.

const VERSION = 'aqsati-v6-2026-11-16-coins';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const PAGES = ['/', '/login', '/account', '/app', '/installments', '/check', '/calendar', '/insights', '/report'];
const ASSETS = [
  '/css/base.css',
  '/js/boot.js',
  '/js/core.js',
  '/js/i18n.js',
  '/js/fx.js',
  '/calc.js',
  '/js/logic/badges.js',
  '/js/logic/charts.js',
  '/js/logic/export-csv.js',
  '/js/logic/ics.js',
  '/js/logic/password-strength.js',
  '/js/logic/payoff.js',
  '/js/logic/schedule.js',
  '/js/logic/sms.js',
  '/js/logic/streak.js',
  '/js/logic/tips.js',
  '/js/logic/tour.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/favicon.svg',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const STATIC_RE = /\.(?:png|svg|ico|jpe?g|webp|avif|gif|woff2?)$/i;

/** Same-origin JS/CSS that a page links to (its page module + page CSS), found in the HTML. */
function linkedAssets(html) {
  const out = new Set();
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)="(\/[^"?#]+\.(?:js|css))"/gi;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return out;
}

/** Same-origin module specifiers a script imports (static `from '…'`, bare `import '…'`, dynamic `import('…')`). */
function importedModules(code, baseUrl) {
  const out = new Set();
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const spec = m[1];
    if (!/^(?:\.{1,2}\/|\/(?!\/))/.test(spec)) continue; // relative or root paths only (never the CDN)
    try {
      const url = new URL(spec, baseUrl);
      if (url.origin === self.location.origin) out.add(url.pathname);
    } catch {
      // not a URL
    }
  }
  return out;
}

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const queue = new Set(ASSETS);
  // One missing file must never break the install (a page may not exist yet), so each is cached on its own.
  await Promise.allSettled(PAGES.map(async (path) => {
    const res = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
    if (!res.ok || res.redirected) return;
    const text = await res.clone().text();
    for (const a of linkedAssets(text)) queue.add(a);
    await cache.put(path, res);
  }));
  // Fetch assets in waves; every fetched .js adds the modules it imports, until nothing new turns up.
  const done = new Set();
  let wave = [...queue];
  while (wave.length) {
    const found = new Set();
    await Promise.allSettled(wave.map(async (path) => {
      done.add(path);
      const res = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
      if (!res.ok) return;
      if (path.endsWith('.js')) {
        const code = await res.clone().text();
        for (const dep of importedModules(code, new URL(path, self.location.origin))) found.add(dep);
      }
      await cache.put(path, res);
    }));
    wave = [...found].filter((p) => !done.has(p));
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('aqsati-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/** A redirected response can't answer a navigation; copy it into a plain one. */
function clean(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

const pageKey = (url) => {
  let p = url.pathname.replace(/\.html$/, '');
  if (p === '/index') p = '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
};

function offlinePage() {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>أقساطي · بدون إنترنت</title><link rel="stylesheet" href="/css/base.css"></head>
<body><main id="main" class="container page"><div class="empty">
<img class="offline-logo" src="/icons/icon.svg" width="72" height="72" alt="أقساطي">
<h1 class="empty-title">أنت بدون إنترنت</h1>
<p class="empty-desc">هالصفحة ما انحفظت قبل. أول ما يرجع الإنترنت حدّث الصفحة.</p>
<p class="empty-desc" lang="en" dir="ltr">You're offline and this page wasn't saved yet. Reload once you're back online.</p>
<div class="empty-actions"><a class="btn" href="/app">لوحتي</a></div>
</div></main></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function networkFirstPage(request) {
  const url = new URL(request.url);
  const key = pageKey(url);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(key, copy)).catch(() => {});
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const hit = (await cache.match(key)) || (await caches.match(request, { ignoreSearch: true }))
      || (await cache.match('/app')) || (await cache.match('/'));
    return clean(hit) || offlinePage();
  }
}

// Same-origin JS / CSS / manifest: always the network copy when online (keyed by path in the shell cache,
// so the offline copy is the newest one seen); the cached copy only when the network fails.
async function networkFirst(request, event) {
  const key = new URL(request.url).pathname;
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      const save = caches.open(SHELL_CACHE).then((c) => c.put(key, copy)).catch(() => {});
      event?.waitUntil(save);
    }
    return res;
  } catch {
    const hit = (await caches.match(key)) || (await caches.match(request, { ignoreSearch: true }));
    return hit || Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Google Fonts, jsDelivr: the browser handles them
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return; // never cache the API or the worker

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (!DEV && STATIC_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request, event));
  }
});
