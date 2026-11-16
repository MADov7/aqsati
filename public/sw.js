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

const VERSION = 'aqsati-v10-2026-11-16-optional-remaining';
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

// ---------- installment reminders («نبهني قبل موعد القسط») ----------
// periodicsync 'aqsati-dues' (installed PWA on Chrome / Android, ~every 12 h): load STATE with the session cookie and
// show a notification for each installment due tomorrow (or today) that isn't marked paid — never the same one twice.
// notificationclick: focus /installments (or open it).
// Settings + dedupe keys come from the page's mirror in Cache Storage (the worker can't read localStorage).
// A classic worker can't import modules, so the helpers below are a COPY of the pure part of
// public/js/logic/notify.js — tests/notify.test.mjs runs both on the same fixtures and fails if they ever disagree.

const NTF_TAG = 'aqsati-dues';
const NTF_CACHE = 'aqsati_notify'; // not 'aqsati-…': activate never deletes it on a VERSION bump
const NTF_URL = '/__aqsati_notify';
const NTF_PAGE = '/installments';
const NTF_MODES = ['before', 'day'];
const NTF_SHOWN_RE = /^[^|]{1,100}\|\d{4}-\d{2}-\d{2}$/;
const NTF_PROVIDER_EN = { 'تابي': 'Tabby', 'تمارا': 'Tamara', 'ديما': 'Deema', 'قرض بنك': 'Bank loan', 'بطاقة ائتمانية': 'Credit card', 'أخرى': 'Other' };
const ntfMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const ntfDayAr = new Intl.DateTimeFormat('ar-KW-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const ntfDayEn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function ntfRound3(x) { return Math.round((x + Number.EPSILON) * 1000) / 1000; }
function ntfIso(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function ntfParse(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return { y, m, d }; }
function ntfAddDays(iso, n) {
  const { y, m, d } = ntfParse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ntfIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function ntfToday(now = new Date()) { return ntfIso(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
function ntfMonthsBetween(a, b) {
  const [ay, am] = String(a).split('-').map(Number);
  const [by, bm] = String(b).split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}
function ntfNthDue(inst, k) {
  const { y, m } = ntfParse(inst.first_due_date);
  const t = y * 12 + (m - 1) + k;
  const ty = Math.floor(t / 12);
  const tm = (t % 12) + 1;
  const dim = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return ntfIso(ty, tm, Math.min(Number(inst.due_day), dim));
}
function ntfOpen(inst) { return inst?.remaining_mode === 'open'; }
function ntfCount(inst) { return ntfOpen(inst) ? Infinity : Math.max(0, Number(inst?.remaining_count) || 0); }
function ntfAmount(inst, k) {
  const m = ntfRound3(Number(inst?.monthly_amount) || 0);
  if (ntfOpen(inst)) return m;
  if (k === ntfCount(inst) - 1) {
    const l = ntfRound3(Number(inst.last_amount));
    if (l > 0 && l < m) return l;
  }
  return m;
}
function ntfPaymentOn(inst, date) {
  const k = ntfMonthsBetween(String(inst.first_due_date).slice(0, 7), date.slice(0, 7));
  if (!(k >= 0) || k >= ntfCount(inst)) return -1;
  return ntfNthDue(inst, k) === date ? k : -1;
}

function ntfNormalize(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  const o = v && typeof v === 'object' ? v : {};
  return {
    on: o.on === true,
    mode: NTF_MODES.includes(o.mode) ? o.mode : 'before',
    shown: Array.isArray(o.shown) ? o.shown.filter((k) => typeof k === 'string' && NTF_SHOWN_RE.test(k)).slice(-200) : [],
  };
}

function ntfDues(state, today, mode) {
  const m = NTF_MODES.includes(mode) ? mode : 'before';
  const date = m === 'day' ? today : ntfAddDays(today, 1);
  const month = date.slice(0, 7);
  const paid = new Set((state?.payments || []).map((p) => `${p.installment_id}|${p.month}`));
  const out = [];
  for (const inst of Array.isArray(state?.installments) ? state.installments : []) {
    if (!inst || typeof inst !== 'object' || inst.id == null || !inst.first_due_date) continue;
    const k = ntfPaymentOn(inst, date);
    if (k < 0 || paid.has(`${inst.id}|${month}`)) continue;
    const open = ntfOpen(inst);
    out.push({
      id: String(inst.id),
      key: `${inst.id}|${date}`,
      date,
      month,
      k,
      when: m === 'day' ? 'today' : 'tomorrow',
      provider: String(inst.provider ?? ''),
      title: String(inst.title ?? '').trim(),
      amount: ntfAmount(inst, k),
      open,
      last: !open && k === ntfCount(inst) - 1,
    });
  }
  return out.sort((a, b) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function ntfNotification(due, lang) {
  const en = lang === 'en';
  const today = due.when === 'today';
  const day = ntfParse(due.date);
  const asDate = new Date(Date.UTC(day.y, day.m - 1, day.d));
  const money = ntfMoney.format(ntfRound3(due.amount));
  let title;
  let body;
  if (en) {
    const provider = NTF_PROVIDER_EN[due.provider] || due.provider;
    title = `${provider} installment due ${today ? 'today' : 'tomorrow'}: KWD ${money} — don't forget`;
    body = [due.title, `Due ${ntfDayEn.format(asDate)}${due.last ? ' — the last payment!' : ''}`].filter(Boolean).join(' · ')
      + '. Paid already? Mark it “Paid ✓” in Aqsati.';
  } else {
    title = `${today ? 'اليوم' : 'باچر'} قسط ${due.provider} ${money} د.ك — لا تنسى`;
    body = [due.title, `يستحق ${ntfDayAr.format(asDate)}${due.last ? ' — وهذي آخر دفعة!' : ''}`].filter(Boolean).join(' · ')
      + '. إذا دفعته علّمه «دفعت ✓» بأقساطي.';
  }
  return {
    title,
    options: {
      body,
      tag: `aqsati-due-${due.key}`,
      lang: en ? 'en' : 'ar',
      dir: en ? 'ltr' : 'rtl',
      icon: '/icons/icon-192.png',
      data: { url: NTF_PAGE, key: due.key },
    },
  };
}

function ntfPending(state, today, settings, lang) {
  const s = ntfNormalize(settings);
  if (!s.on) return [];
  const shown = new Set(s.shown);
  return ntfDues(state, today, s.mode).filter((d) => !shown.has(d.key)).map((d) => ({ key: d.key, ...ntfNotification(d, lang) }));
}

function ntfRemember(shown, keys, today) {
  const floor = ntfAddDays(today, -45);
  const all = [...new Set([...(Array.isArray(shown) ? shown : []), ...(Array.isArray(keys) ? keys : [])])];
  return all.filter((k) => typeof k === 'string' && NTF_SHOWN_RE.test(k) && k.slice(-10) >= floor).slice(-200);
}

async function ntfCheckDues() {
  const cache = await caches.open(NTF_CACHE);
  const saved = await cache.match(NTF_URL);
  const raw = saved ? await saved.json().catch(() => null) : null;
  const settings = ntfNormalize(raw);
  if (!settings.on) return;
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;
  const res = await fetch('/api/rpc', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'aqsati_state', args: {} }),
  });
  if (!res.ok) return;
  const state = await res.json().catch(() => null);
  if (!state?.user) return; // signed out: nothing to remind
  const today = ntfToday();
  const lang = raw?.lang === 'en' ? 'en' : 'ar';
  const shown = [];
  for (const n of ntfPending(state, today, settings, lang)) {
    try {
      await self.registration.showNotification(n.title, n.options);
      shown.push(n.key);
    } catch {
      // permission revoked meanwhile
    }
  }
  if (!shown.length) return;
  // re-read: the page may have changed the settings while we were fetching
  const latest = await cache.match(NTF_URL);
  const now = (latest ? await latest.json().catch(() => null) : null) || raw || {};
  const next = { ...now, shown: ntfRemember(ntfNormalize(now).shown, [...settings.shown, ...shown], today) };
  await cache.put(NTF_URL, new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== NTF_TAG) return;
  event.waitUntil(ntfCheckDues().catch(() => {}));
});

async function ntfOpenPage(path) {
  const target = new URL(path, self.location.origin);
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const same = wins.find((c) => new URL(c.url).pathname === target.pathname);
  if (same) return same.focus();
  const any = wins.find((c) => new URL(c.url).origin === target.origin);
  if (any) {
    try {
      const focused = await any.focus();
      const moved = await (focused || any).navigate(target.href);
      if (moved) return moved;
    } catch {
      // an uncontrolled window can't be navigated from here: open a new one
    }
  }
  return self.clients.openWindow(target.href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  const path = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : NTF_PAGE;
  event.waitUntil(ntfOpenPage(path).catch(() => {}));
});
