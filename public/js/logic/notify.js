// اقصادي — installment reminder notifications («نبهني قبل موعد القسط»).
//
// Pure part (no DOM, no storage; the tests run it in Node):
//   duesToNotify(state, today, mode)          → payments that fall on the reminder's target day and are not marked paid
//                                              mode 'before' (default) = due tomorrow · 'day' = due today
//   notificationFor(due, lang)                → { title, options } for registration.showNotification (AR / EN)
//   pendingNotifications(state, today, settings, lang) → the ones not shown yet (dedupe key '<id>|<YYYY-MM-DD>');
//                                              «قبل بيوم» also catches up a reminder missed the day before, on the due day
//   rememberShown(shown, keys, today)         → the dedupe list with the new keys, old dates dropped
//   nextReminder(state, today, mode, days, shown) → the next day a reminder would go out (skipping ones already shown)
//   activeFor(settings, state)                → on, and switched on by THIS signed-in account (owner = its email)
//
// Browser part (safe to import anywhere: nothing runs until a function is called):
//   remindDues(store)    → app + installments pages: shows what is due when STATE loads / changes and whenever the page
//                          comes back to the front (a tab or installed app resumed on a later day)
//   enableNotify(mode, owner) / disableNotify() / setNotifyMode(mode) / sendTestNotification() → «التنبيهات» in /account
//
// Settings live in localStorage 'aqsati_notify' = { on, mode: 'before' | 'day', shown: ['<id>|<date>', …], owner }.
// owner = the email of the account that switched them on: another account signing in on the same browser gets nothing
// (settings saved without an owner count as off).
// The service worker can't read localStorage, so the same object (+ lang) is mirrored into Cache Storage
// (cache 'aqsati_notify' — not 'aqsati-…', so VERSION bumps never delete it — key /__aqsati_notify). The worker's
// background check (Periodic Background Sync 'aqsati-dues', installed PWA on Chrome / Android) reads it, shows the same
// notifications and writes the keys it showed back, so a later page load never repeats them.
// public/sw.js carries a copy of the pure part (a classic worker can't import modules); tests/notify.test.mjs runs
// both copies on the same fixtures and fails if they ever disagree.

import {
  isOpenEnded, planCount, paymentAmount, nthDueDate, monthKey, monthsBetween, paidKeys, parseISO, isoDate, todayISO,
  fmtKWD, fmtKWDEn, fmtDay, fmtDayEn,
} from '../../calc.js';
import { getLang } from '../i18n.js';

export const NOTIFY_KEY = 'aqsati_notify';
export const NOTIFY_MODES = ['before', 'day'];
export const DEFAULT_NOTIFY_MODE = 'before';
export const SYNC_TAG = 'aqsati-dues';
export const SYNC_INTERVAL = 12 * 60 * 60 * 1000; // ~12 h (the browser decides the real rhythm)
export const MIRROR_CACHE = 'aqsati_notify';
export const MIRROR_URL = '/__aqsati_notify';
export const NOTIFY_URL = '/installments';
const KEEP_DAYS = 45; // dedupe keys older than this are dropped
const MAX_SHOWN = 200;
const SHOWN_RE = /^[^|]{1,100}\|\d{4}-\d{2}-\d{2}$/;

// ---------- pure ----------

/** The account a setting belongs to: its email, trimmed + lower-case ('' when there is none). */
export function ownerKey(email) {
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
}

/** Any stored value (object or JSON string) → { on, mode, shown } (+ owner when one was saved). */
export function normalizeSettings(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  const o = v && typeof v === 'object' ? v : {};
  const out = {
    on: o.on === true,
    mode: NOTIFY_MODES.includes(o.mode) ? o.mode : DEFAULT_NOTIFY_MODE,
    shown: Array.isArray(o.shown) ? o.shown.filter((k) => typeof k === 'string' && SHOWN_RE.test(k)).slice(-MAX_SHOWN) : [],
  };
  const owner = ownerKey(o.owner);
  if (owner) out.owner = owner;
  return out;
}

/** Reminders are on for THIS account: switched on, saved with an owner, and the signed-in user is that owner. */
export function activeFor(settings, state) {
  const s = normalizeSettings(settings);
  return s.on && Boolean(s.owner) && ownerKey(state?.user?.email) === s.owner;
}

/** 'YYYY-MM-DD' moved by n days. */
export function addDays(iso, n) {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const modeOr = (mode) => (NOTIFY_MODES.includes(mode) ? mode : DEFAULT_NOTIFY_MODE);

/** The due date a reminder sent today is about: tomorrow ('before') or today ('day'). */
export const targetDate = (today, mode) => (modeOr(mode) === 'day' ? today : addDays(today, 1));

/** Which payment (k) of the installment falls exactly on `date`, or -1 (open-ended plans have one every month). */
export function paymentOn(inst, date) {
  const k = monthsBetween(monthKey(inst.first_due_date), monthKey(date));
  if (!(k >= 0) || k >= planCount(inst)) return -1;
  return nthDueDate(inst, k) === date ? k : -1;
}

/**
 * Payments due on the reminder's target day that are not marked paid for that month, biggest first:
 * [{ id, key, date, month, k, when, provider, title, amount, open, last }]
 * amount is that payment's own amount (a partial final payment shows its real amount).
 */
export function duesToNotify(state, today, mode = DEFAULT_NOTIFY_MODE) {
  const m = modeOr(mode);
  const date = targetDate(today, m);
  const month = monthKey(date);
  const paid = paidKeys(state?.payments);
  const out = [];
  for (const inst of Array.isArray(state?.installments) ? state.installments : []) {
    if (!inst || typeof inst !== 'object' || inst.id == null || !inst.first_due_date) continue;
    const k = paymentOn(inst, date);
    if (k < 0 || paid.has(`${inst.id}|${month}`)) continue;
    const open = isOpenEnded(inst);
    out.push({
      id: String(inst.id),
      key: `${inst.id}|${date}`,
      date,
      month,
      k,
      when: m === 'day' ? 'today' : 'tomorrow',
      provider: String(inst.provider ?? ''),
      title: String(inst.title ?? '').trim(),
      amount: paymentAmount(inst, k),
      open,
      last: !open && k === planCount(inst) - 1,
    });
  }
  return out.sort((a, b) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const PROVIDER_EN = {
  'تابي': 'Tabby',
  'تمارا': 'Tamara',
  'ديما': 'Deema',
  'قرض بنك': 'Bank loan',
  'بطاقة ائتمانية': 'Credit card',
  'أخرى': 'Other',
};

/** One due → { title, options } (Kuwaiti Arabic or English). */
export function notificationFor(due, lang = 'ar') {
  const en = lang === 'en';
  const today = due.when === 'today';
  let title;
  let body;
  if (en) {
    const provider = PROVIDER_EN[due.provider] || due.provider;
    title = `${provider} installment due ${today ? 'today' : 'tomorrow'}: ${fmtKWDEn(due.amount)} — don't forget`;
    body = [due.title, `Due ${fmtDayEn(due.date)}${due.last ? ' — the last payment!' : ''}`].filter(Boolean).join(' · ')
      + '. Paid already? Mark it “Paid ✓” in Aqsati.';
  } else {
    title = `${today ? 'اليوم' : 'باچر'} قسط ${due.provider} ${fmtKWD(due.amount)} — لا تنسى`;
    body = [due.title, `يستحق ${fmtDay(due.date)}${due.last ? ' — وهذي آخر دفعة!' : ''}`].filter(Boolean).join(' · ')
      + '. إذا دفعته علّمه «دفعت ✓» باقصادي.';
  }
  return {
    title,
    options: {
      body,
      tag: `aqsati-due-${due.key}`,
      lang: en ? 'en' : 'ar',
      dir: en ? 'ltr' : 'rtl',
      icon: '/icons/icon-192.png',
      data: { url: NOTIFY_URL, key: due.key },
    },
  };
}

/**
 * What still has to be shown now: [{ key, title, options }] — nothing when switched off, saved for another account,
 * or already shown. «قبل بيوم» also returns today's dues («اليوم قسط …») first: when no check ran the day before
 * (app not opened, background sync late), the due day itself still reminds. The '<id>|<date>' key is the same, so a
 * reminder already sent the day before is never repeated.
 */
export function pendingNotifications(state, today, settings, lang = 'ar') {
  const s = normalizeSettings(settings);
  if (!s.on) return [];
  if (s.owner && ownerKey(state?.user?.email) !== s.owner) return [];
  const shown = new Set(s.shown);
  const dues = s.mode === 'day'
    ? duesToNotify(state, today, 'day')
    : [...duesToNotify(state, today, 'day'), ...duesToNotify(state, today, 'before')];
  return dues
    .filter((d) => !shown.has(d.key))
    .map((d) => ({ key: d.key, ...notificationFor(d, lang) }));
}

/** The dedupe list plus `keys`, without duplicates and without dates older than KEEP_DAYS. */
export function rememberShown(shown, keys, today) {
  const floor = addDays(today, -KEEP_DAYS);
  const all = [...new Set([...(Array.isArray(shown) ? shown : []), ...(Array.isArray(keys) ? keys : [])])];
  return all.filter((k) => typeof k === 'string' && SHOWN_RE.test(k) && k.slice(-10) >= floor).slice(-MAX_SHOWN);
}

/**
 * The next day (today or later, within `days`) a reminder would go out: { date, dues } or null. Reminders already
 * shown (`shown` = the dedupe keys) are skipped on every day — a key is '<id>|<due date>', so one sent today, or under
 * the other mode, is never promised again.
 */
export function nextReminder(state, today, mode = DEFAULT_NOTIFY_MODE, days = 62, shown = []) {
  if (!Array.isArray(state?.installments) || !state.installments.length) return null;
  const skip = new Set(Array.isArray(shown) ? shown : []);
  for (let i = 0; i <= days; i += 1) {
    const date = addDays(today, i);
    const dues = duesToNotify(state, date, mode).filter((d) => !skip.has(d.key));
    if (dues.length) return { date, dues };
  }
  return null;
}

// ---------- browser ----------

function readLocal() {
  try { return normalizeSettings(localStorage.getItem(NOTIFY_KEY)); } catch { return normalizeSettings(null); }
}

function writeLocal(s) {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(normalizeSettings(s))); } catch { /* storage blocked */ }
}

/** The saved settings: { on, mode, shown, owner? }. */
export const getNotifySettings = readLocal;

async function readMirror() {
  try {
    const cache = await caches.open(MIRROR_CACHE);
    const res = await cache.match(MIRROR_URL);
    return res ? normalizeSettings(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Write the worker's copy. Its dedupe keys are MERGED, never replaced: the worker adds the ones it showed, and a
 * writer holding an older local list (language switch, mode switch, on / off) must not drop them — or the same
 * reminder could show twice. The merged list is kept locally too (on / mode re-read, so a toggle made in another
 * tab meanwhile is not undone). → the merged settings.
 */
async function writeMirror(s, lang = getLang(), today = todayISO()) {
  const mine = normalizeSettings(s);
  const cur = await readMirror();
  const merged = { ...mine, shown: rememberShown(cur?.shown, mine.shown, today) };
  try {
    const cache = await caches.open(MIRROR_CACHE);
    const body = JSON.stringify({ ...merged, lang: lang === 'en' ? 'en' : 'ar' });
    await cache.put(MIRROR_URL, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // no Cache Storage: the page-side reminders still work
  }
  writeLocal({ ...readLocal(), shown: merged.shown });
  return merged;
}

/** Keep the worker's copy in step (language changed, …). */
export function refreshMirror() {
  return writeMirror(readLocal());
}

/** 'granted' | 'denied' | 'default' | 'unsupported' (no Notification API, e.g. iPhone Safari outside an installed app). */
export function notifySupport() {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

async function swRegistration(ms = 6000) {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (reg?.active) return reg;
    return await Promise.race([navigator.serviceWorker.ready, new Promise((r) => { setTimeout(() => r(null), ms); })]);
  } catch {
    return null;
  }
}

/** Show each notification through the service worker (a page notification if there is no worker). → keys shown. */
async function show(list) {
  if (!list.length) return [];
  const reg = await swRegistration();
  const done = [];
  for (const n of list) {
    try {
      if (reg?.showNotification) {
        await reg.showNotification(n.title, n.options);
      } else {
        const note = new Notification(n.title, n.options);
        note.addEventListener('click', () => { window.focus(); location.assign(NOTIFY_URL); });
      }
      done.push(n.key);
    } catch {
      // permission revoked meanwhile / page notifications not allowed (Android): skip it
    }
  }
  return done;
}

/** 'on' (background reminders registered) | 'not-installed' | 'unsupported'. Registers when allowed. */
export async function ensureBackgroundSync() {
  const reg = await swRegistration(3000);
  if (!reg || !('periodicSync' in reg)) return 'unsupported';
  try {
    const p = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (p.state !== 'granted') return 'not-installed';
    await reg.periodicSync.register(SYNC_TAG, { minInterval: SYNC_INTERVAL });
    return 'on';
  } catch {
    return 'unsupported';
  }
}

async function stopBackgroundSync() {
  try {
    const reg = await swRegistration(1500);
    await reg?.periodicSync?.unregister(SYNC_TAG);
  } catch {
    // nothing registered
  }
}

/**
 * Show the reminders due now (switched on + permission granted + signed in). Returns the keys shown.
 * Keys the background worker already showed are merged first, so nothing is ever shown twice.
 */
export async function checkDues(state, { today = todayISO(), lang = getLang() } = {}) {
  const s = readLocal();
  if (!activeFor(s, state) || notifySupport() !== 'granted') return [];
  const mirror = await readMirror();
  const known = rememberShown(s.shown, mirror?.shown, today);
  const shown = await show(pendingNotifications(state, today, { ...s, shown: known }, lang));
  const fresh = readLocal(); // another tab may have switched it off meanwhile
  const next = { ...fresh, shown: rememberShown(fresh.shown, [...known, ...shown], today) };
  writeLocal(next);
  await writeMirror(next, lang, today);
  if (next.on) ensureBackgroundSync().catch(() => {});
  return shown;
}

const started = new WeakSet();

/**
 * Signed-in pages (app + installments): show the reminders due now — when STATE loads or changes, and again each time
 * the page comes back to the front, so a tab or installed app (iOS has no background sync) resumed on a later day
 * still reminds. Settings and permission are read on every check (switched on in another tab ⇒ no reload needed),
 * and checks never overlap: two at once could both pass the dedupe before either writes its keys.
 * opts are for tests: today() → 'YYYY-MM-DD', wait = debounce in ms.
 */
export function remindDues(store, { today = todayISO, wait = 250 } = {}) {
  if (!store || started.has(store)) return;
  started.add(store);
  let checking = null;
  let lastDay = '';
  let lastState = null;
  let timer = 0;
  const run = () => {
    timer = 0;
    const st = store.state;
    if (!store.loaded || !activeFor(readLocal(), st) || notifySupport() !== 'granted') return;
    const day = today();
    if (day === lastDay && st === lastState) return; // nothing new since the last check
    if (checking) { // one at a time
      timer = setTimeout(run, wait);
      return;
    }
    lastDay = day;
    lastState = st;
    checking = checkDues(st, { today: day }).catch(() => {}).finally(() => { checking = null; });
  };
  const soon = () => { // bursts of store.set (load + an action) ⇒ one check
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  };
  store.subscribe(soon);
  // directly, not only through a STATE reload: core.js reloads after 60 s and not at all offline
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(); });
  soon();
}

/**
 * Switch reminders on for the signed-in account (owner = its email): asks for permission first.
 * → { ok: true, background } | { ok: false, reason }
 */
export async function enableNotify(mode, owner) {
  if (notifySupport() === 'unsupported') return { ok: false, reason: 'unsupported' };
  let perm = Notification.permission;
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
  }
  if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
  const cur = readLocal();
  const next = { ...cur, on: true, mode: NOTIFY_MODES.includes(mode) ? mode : cur.mode, owner: ownerKey(owner) || cur.owner };
  writeLocal(next);
  await writeMirror(next);
  return { ok: true, background: await ensureBackgroundSync() };
}

export async function disableNotify() {
  const next = { ...readLocal(), on: false };
  writeLocal(next);
  await writeMirror(next);
  await stopBackgroundSync();
}

export async function setNotifyMode(mode) {
  const next = { ...readLocal(), mode: modeOr(mode) };
  writeLocal(next);
  await writeMirror(next);
  return next;
}

/** A sample notification so the user sees what a reminder looks like. → true when shown. */
export async function sendTestNotification(lang = getLang()) {
  if (notifySupport() !== 'granted') return false;
  const en = lang === 'en';
  const done = await show([{
    key: 'test',
    title: en ? 'Aqsati reminders are on ✓' : 'تنبيهات اقصادي شغّالة ✓',
    options: {
      body: en
        ? 'This is how a reminder looks before an installment is due.'
        : 'كذا بيوصلك التذكير قبل موعد القسط.',
      tag: 'aqsati-test',
      lang: en ? 'en' : 'ar',
      dir: en ? 'ltr' : 'rtl',
      icon: '/icons/icon-192.png',
      data: { url: NOTIFY_URL },
    },
  }]);
  return done.length > 0;
}
