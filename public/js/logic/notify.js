// أقساطي — installment reminder notifications («نبهني قبل موعد القسط»).
//
// Pure part (no DOM, no storage; the tests run it in Node):
//   duesToNotify(state, today, mode)          → payments that fall on the reminder's target day and are not marked paid
//                                              mode 'before' (default) = due tomorrow · 'day' = due today
//   notificationFor(due, lang)                → { title, options } for registration.showNotification (AR / EN)
//   pendingNotifications(state, today, settings, lang) → the ones not shown yet (dedupe key '<id>|<YYYY-MM-DD>')
//   rememberShown(shown, keys, today)         → the dedupe list with the new keys, old dates dropped
//   nextReminder(state, today, mode)          → the next day a reminder would go out: { date, dues } | null
//
// Browser part (safe to import anywhere: nothing runs until a function is called):
//   remindDues(store)    → once per page load, when signed in and switched on: shows what is due (app + installments pages)
//   enableNotify(mode) / disableNotify() / setNotifyMode(mode) / sendTestNotification() → the «التنبيهات» card in /account
//
// Settings live in localStorage 'aqsati_notify' = { on, mode: 'before' | 'day', shown: ['<id>|<date>', …] }.
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

/** Any stored value (object or JSON string) → { on, mode, shown }. */
export function normalizeSettings(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  const o = v && typeof v === 'object' ? v : {};
  return {
    on: o.on === true,
    mode: NOTIFY_MODES.includes(o.mode) ? o.mode : DEFAULT_NOTIFY_MODE,
    shown: Array.isArray(o.shown) ? o.shown.filter((k) => typeof k === 'string' && SHOWN_RE.test(k)).slice(-MAX_SHOWN) : [],
  };
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
      data: { url: NOTIFY_URL, key: due.key },
    },
  };
}

/** What still has to be shown now: [{ key, title, options }] — nothing when switched off or already shown. */
export function pendingNotifications(state, today, settings, lang = 'ar') {
  const s = normalizeSettings(settings);
  if (!s.on) return [];
  const shown = new Set(s.shown);
  return duesToNotify(state, today, s.mode)
    .filter((d) => !shown.has(d.key))
    .map((d) => ({ key: d.key, ...notificationFor(d, lang) }));
}

/** The dedupe list plus `keys`, without duplicates and without dates older than KEEP_DAYS. */
export function rememberShown(shown, keys, today) {
  const floor = addDays(today, -KEEP_DAYS);
  const all = [...new Set([...(Array.isArray(shown) ? shown : []), ...(Array.isArray(keys) ? keys : [])])];
  return all.filter((k) => typeof k === 'string' && SHOWN_RE.test(k) && k.slice(-10) >= floor).slice(-MAX_SHOWN);
}

/** The next day (today or later, within `days`) a reminder would go out: { date, dues } or null. */
export function nextReminder(state, today, mode = DEFAULT_NOTIFY_MODE, days = 62) {
  if (!Array.isArray(state?.installments) || !state.installments.length) return null;
  for (let i = 0; i <= days; i += 1) {
    const date = addDays(today, i);
    const dues = duesToNotify(state, date, mode);
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

/** The saved settings: { on, mode, shown }. */
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

async function writeMirror(s, lang = getLang()) {
  try {
    const cache = await caches.open(MIRROR_CACHE);
    const body = JSON.stringify({ ...normalizeSettings(s), lang: lang === 'en' ? 'en' : 'ar' });
    await cache.put(MIRROR_URL, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // no Cache Storage: the page-side reminders still work
  }
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
  if (!s.on || notifySupport() !== 'granted' || !state?.user) return [];
  const mirror = await readMirror();
  const known = rememberShown(s.shown, mirror?.shown, today);
  const shown = await show(pendingNotifications(state, today, { ...s, shown: known }, lang));
  const fresh = readLocal(); // another tab may have switched it off meanwhile
  const next = { ...fresh, shown: rememberShown(fresh.shown, [...known, ...shown], today) };
  writeLocal(next);
  await writeMirror(next, lang);
  if (next.on) ensureBackgroundSync().catch(() => {});
  return shown;
}

let reminded = false;

/** One call per signed-in page: when STATE is loaded, show the reminders due now (once per page load). */
export function remindDues(store) {
  if (reminded || !store || !readLocal().on || notifySupport() !== 'granted') return;
  let off = () => {};
  const go = (st) => {
    if (reminded || !store.loaded || !st?.user) return;
    reminded = true;
    off();
    checkDues(st).catch(() => {});
  };
  off = store.subscribe(go);
  go(store.state);
}

/** Switch reminders on: asks for permission first. → { ok: true, background } | { ok: false, reason } */
export async function enableNotify(mode) {
  if (notifySupport() === 'unsupported') return { ok: false, reason: 'unsupported' };
  let perm = Notification.permission;
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
  }
  if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
  const cur = readLocal();
  const next = { ...cur, on: true, mode: NOTIFY_MODES.includes(mode) ? mode : cur.mode };
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
    title: en ? 'Aqsati reminders are on ✓' : 'تنبيهات أقساطي شغّالة ✓',
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
