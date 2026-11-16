// أقساطي — shared core for every page: identity + rpc, the STATE store and its actions, header + mobile tab bar,
// theme, i18n, toast / banner / dialogs, language-aware formatting and the service worker.
// Pages import ONLY from here (plus /calc.js for pure math and ./fx.js for effects).
// CSP-safe: no inline styles or handlers; styles change through the CSSOM only; user text goes in via textContent / esc().

import * as C from '../calc.js';
import * as FX from './fx.js';
import { t, registerStrings, getLang, setLang, applyI18n, applyLangToDocument, hasString, isRTL } from './i18n.js';

export { t, registerStrings, getLang, setLang, applyI18n, isRTL };
export { FX as fx };

// ---------- tiny DOM helpers ----------

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for innerHTML templates. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// ---------- storage (private windows / blocked storage must never break a page) ----------

function store_(area) {
  return {
    get(key) {
      try { return window[area].getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window[area].setItem(key, value); } catch { /* memory only */ }
    },
    remove(key) {
      try { window[area].removeItem(key); } catch { /* nothing to do */ }
    },
  };
}
const local = store_('localStorage');
const session = store_('sessionStorage');

const TOKEN_KEY = 'aqsati_token';
const THEME_KEY = 'aqsati_theme';
const FLASH_KEY = 'aqsati_flash';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ---------- identity: a random guest token per browser; an account (HttpOnly cookie session) when logged in ----------

let token = null; // in-memory copy, used only when storage is blocked

/** The browser's guest token (uuid v4). Read from storage each time: another tab may have switched it. */
export function getToken() {
  const saved = local.get(TOKEN_KEY);
  if (saved && UUID_RE.test(saved)) return (token = saved);
  if (!token || !UUID_RE.test(token)) token = uuid();
  local.set(TOKEN_KEY, token);
  return token;
}

/** A fresh, empty guest identity for this browser (after logout / account deletion). */
export function resetToken() {
  token = uuid();
  local.set(TOKEN_KEY, token);
  return token;
}

// ---------- our server: POST /api/rpc { fn, args } (the session cookie rides along by itself) ----------

function rpcError(code, status = 0) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

/** Call a server function. Adds p_token automatically. Throws Error(code) with .code and .status. */
export async function rpc(fn, args = {}) {
  let res;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn, args: { p_token: getToken(), ...args } }),
    });
  } catch {
    throw rpcError(navigator.onLine === false ? 'offline' : 'network');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw rpcError(body?.message || `http_${res.status}`, res.status);
  return body;
}

/** A server error (or a code string) as a friendly sentence in the current language. */
export function errorText(err) {
  const code = typeof err === 'string' ? err : err?.code || err?.message;
  if (code && hasString(`err.${code}`)) return t(`err.${code}`);
  if (navigator.onLine === false) return t('err.offline');
  return t('err.generic');
}

// ---------- STATE store ----------
// STATE = { profile: { salary, safe_limit, salary_day } | null, installments: [...], payments: [...], user: { email } | null }

const emptyState = () => ({ profile: null, installments: [], payments: [], user: null });
let STATE = emptyState();
let loaded = false;
let version = 0;
let lastLoadAt = 0;
let inflight = null;
const listeners = new Set();

function normalize(next) {
  const p = next?.profile;
  let profile = null;
  if (p && typeof p === 'object') {
    const day = p.salary_day === null || p.salary_day === undefined ? null : Number(p.salary_day);
    profile = {
      salary: Number(p.salary) || 0,
      safe_limit: Number(p.safe_limit ?? C.DEFAULT_SAFE_LIMIT) || C.DEFAULT_SAFE_LIMIT,
      salary_day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    };
  }
  const installments = Array.isArray(next?.installments) ? next.installments.filter((i) => i && typeof i === 'object') : [];
  const payments = Array.isArray(next?.payments)
    ? next.payments.filter((x) => x && typeof x.installment_id === 'string' && /^\d{4}-\d{2}$/.test(String(x.month)))
    : [];
  const user = next?.user && typeof next.user.email === 'string' ? { email: next.user.email } : null;
  return { profile, installments, payments, user };
}

let channel = null;
try {
  channel = 'BroadcastChannel' in window ? new BroadcastChannel('aqsati') : null;
} catch {
  channel = null;
}
/** Tell other open tabs that the data changed (they reload it). */
function broadcast() {
  try { channel?.postMessage({ type: 'sync', at: Date.now() }); } catch { /* ignore */ }
}

export const store = {
  /** The current STATE (treat as read-only; change it through the actions). */
  get state() { return STATE; },
  /** true once STATE came from the server at least once. */
  get loaded() { return loaded; },

  /** Fetch STATE from the server (concurrent calls share one request). */
  load() {
    if (inflight) return inflight;
    const at = version;
    inflight = rpc('aqsati_state')
      .then((s) => {
        lastLoadAt = Date.now();
        // an action finished while we were waiting → its STATE is newer than ours
        return version === at ? store.set(s) : STATE;
      })
      .finally(() => { inflight = null; });
    return inflight;
  },

  /** Listen for STATE changes. Returns an unsubscribe function. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Replace STATE and notify subscribers. */
  set(next) {
    STATE = normalize(next);
    loaded = true;
    version += 1;
    for (const fn of [...listeners]) {
      try { fn(STATE); } catch (err) { console.error('store subscriber failed:', err); }
    }
    return STATE;
  },
};

async function mutate(fn, args) {
  const next = await rpc(fn, args);
  const st = store.set(next);
  broadcast();
  return st;
}

/** Save salary / safe limit / salary day. Missing fields keep their current value. */
export function saveProfile({ salary, safeLimit, salaryDay } = {}) {
  const args = {
    p_salary: salary ?? STATE.profile?.salary,
    p_safe_limit: safeLimit ?? STATE.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT,
  };
  if (salaryDay !== undefined) args.p_salary_day = salaryDay === '' ? null : salaryDay;
  return mutate('aqsati_save', args);
}

function installmentArgs(input = {}) {
  const dueDay = Number(input.dueDay ?? input.due_day);
  return {
    p_provider: input.provider,
    p_title: input.title ?? '',
    p_monthly: input.monthly,
    p_due_day: dueDay,
    p_remaining: input.remaining,
    p_first_due: input.firstDue || C.firstDueDate(dueDay, C.todayISO()),
  };
}

/** input = { provider, title, monthly, dueDay, remaining } (validate with calc.validateInstallmentInput first). */
export const addInstallment = (input) => mutate('aqsati_add', installmentArgs(input));
export const updateInstallment = (id, input) => mutate('aqsati_update', { p_id: id, ...installmentArgs(input) });
export const removeInstallment = (id) => mutate('aqsati_remove', { p_id: id });

/** Mark one month of an installment paid / unpaid. Optimistic: the UI updates at once and rolls back on error. */
export async function markPaid(id, month, paid = true) {
  const before = STATE.payments;
  const key = `${id}|${month}`;
  const others = before.filter((x) => `${x.installment_id}|${x.month}` !== key);
  store.set({ ...STATE, payments: paid ? [...others, { installment_id: id, month, paid_at: new Date().toISOString() }] : others });
  try {
    return await mutate('aqsati_mark_paid', { p_id: id, p_month: month, p_paid: Boolean(paid) });
  } catch (err) {
    store.set({ ...STATE, payments: before });
    throw err;
  }
}

/** Accounts. The guest's data moves into the account on signup / login (the server merges it). */
export const signup = (email, password) => mutate('auth_signup', { email, password });
export const login = (email, password) => mutate('auth_login', { email, password });

/** Log out, then continue as a brand-new empty guest. */
export async function logout() {
  await rpc('auth_logout', {});
  resetToken();
  let next = emptyState();
  try { next = await rpc('aqsati_state'); } catch { /* stays empty; next load fixes it */ }
  const st = store.set(next);
  broadcast();
  return st;
}

export const changePassword = (current, next) => mutate('auth_change_password', { current_password: current, new_password: next });

/** Delete the account and everything in it, then continue as a new empty guest. */
export async function deleteAccount(password) {
  const next = await rpc('auth_delete_account', { password });
  resetToken();
  const st = store.set(next);
  broadcast();
  return st;
}

Object.assign(store, {
  saveProfile, addInstallment, updateInstallment, removeInstallment, markPaid,
  signup, login, logout, changePassword, deleteAccount,
});

// ---------- formatting (language-aware) ----------

const PROVIDER_EN = {
  'تابي': 'Tabby',
  'تمارا': 'Tamara',
  'ديما': 'Deema',
  'قرض بنك': 'Bank loan',
  'بطاقة ائتمانية': 'Credit card',
  'أخرى': 'Other',
};
const en = () => getLang() === 'en';
const asDay = (iso) => (String(iso).length === 7 ? `${iso}-01` : String(iso));
const numFmt = new Map();

export const fmt = {
  /** 1250.5 → «1,250.500 د.ك» / «KWD 1,250.500» */
  money: (x) => (en() ? C.fmtKWDEn(Number(x) || 0) : C.fmtKWD(Number(x) || 0)),
  /** 37.25 → «37.3%» — in Arabic wrapped in LRI…PDI so the «%» never jumps to the other side («%37.3») */
  pct: (x) => (en() ? C.fmtPct(Number(x) || 0) : `⁦${C.fmtPct(Number(x) || 0)}⁩`),
  /** 'YYYY-MM-DD' → «5 نوفمبر» / «5 Nov» */
  day: (iso) => (en() ? C.fmtDayEn(iso) : C.fmtDay(iso)),
  /** 'YYYY-MM-DD' → «5 نوفمبر 2026» / «5 Nov 2026» */
  date: (iso) => (en() ? C.fmtDateEn(iso) : C.fmtDate(iso)),
  /** 'YYYY-MM' or 'YYYY-MM-DD' → «نوفمبر 2026» / «November 2026» */
  month: (iso) => (en() ? C.fmtMonthEn(asDay(iso)) : C.fmtMonth(asDay(iso))),
  /** 0 → «اليوم» / «today», 1 → «باچر» / «tomorrow», negative → overdue wording */
  daysLeft: (n) => (n < 0 ? fmt.overdue(-n) : en() ? C.fmtDaysLeftEn(n) : C.fmtDaysLeft(n)),
  overdue: (n) => (en() ? C.fmtOverdueEn(n) : C.fmtOverdue(n)),
  /** 3 → «3 أقساط» / «3 installments» */
  count: (n) => (en() ? C.fmtCountEn(n) : C.fmtCount(n)),
  /** plain number with Latin digits */
  num: (x, digits = 0) => {
    if (!numFmt.has(digits)) numFmt.set(digits, new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }));
    return numFmt.get(digits).format(Number(x) || 0);
  },
  /** provider name in the current language (stored names are Arabic) */
  provider: (name) => (en() ? PROVIDER_EN[name] || String(name ?? '') : String(name ?? '')),
};

// ---------- theme ----------

const THEMES = ['light', 'dark', 'system'];
const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

/** The saved preference: 'light' | 'dark' | 'system' (default). */
export function getTheme() {
  const v = local.get(THEME_KEY);
  return THEMES.includes(v) ? v : 'system';
}

/** What is actually shown right now: 'light' | 'dark'. */
export function resolvedTheme(mode = getTheme()) {
  return mode === 'system' ? (mqDark.matches ? 'dark' : 'light') : mode;
}

function applyTheme() {
  const shown = resolvedTheme();
  const root = document.documentElement;
  root.dataset.theme = shown;
  root.dataset.themeMode = getTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', shown === 'dark' ? '#07121f' : '#0f2a4a');
  renderThemeButton();
}

/** Switch theme ('system' follows the device). Saved per browser. Fires `themechange` on window. */
export function setTheme(mode) {
  local.set(THEME_KEY, THEMES.includes(mode) ? mode : 'system');
  applyTheme();
  window.dispatchEvent(new CustomEvent('themechange', { detail: { mode: getTheme(), theme: resolvedTheme() } }));
  return getTheme();
}

try {
  mqDark.addEventListener('change', () => { if (getTheme() === 'system') applyTheme(); });
} catch {
  // very old Safari: no live updates
}

// Apply as early as possible (module evaluation), so pages paint in the right theme and direction.
applyTheme();
applyLangToDocument();

// ---------- icons (inline SVG, stroke = currentColor) ----------

const svg = (body, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
export const ICONS = {
  home: svg('<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>'),
  gauge: svg('<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4.5-4.5"/><path d="M4 19.5h16"/>'),
  list: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  scale: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/><path d="M9 11.2l1.6 1.6L13.5 9.5"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
  doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
  user: svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chevron: svg('<path d="m7 10 5 5 5-5"/>', 'ico ico-chev'),
  logout: svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
  alert: svg('<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
};

// ---------- the logo: «اقصادى» with two gold coins as the dots of the final yaa ----------
// The word is outlined from IBM Plex Sans Arabic Bold (shaped exactly as the browser shapes «أقساطي», then the
// final yaa's two dots removed), so it looks identical in every browser, before the web font loads, and in
// favicons. The coins replace the yaa's dots, sized like the chosen concept (≈0.3em each) and set just under the letter.

const LOGO_VB = [317.4, 145]; // viewBox width / height; 100 units = 1em of the source font
const LOGO_PATH = 'M36.1 108.2Q28.1 108.2 21.8 106.4Q15.4 104.5 11 101Q6.6 97.4 4.3 92.4Q2 87.3 2 80.8Q2 76.3 3.3 70.7Q4.5 65 6.7 59.7L16.3 62.5Q14.3 66.8 13.2 71.2Q12 75.6 12 78.8Q12 85.1 17.3 88.6Q22.6 92 32.1 92L40.1 92Q50.4 92 56.5 89.1Q62.5 86.1 63.3 80.7L48 78.1Q38.8 76.6 34 72.3Q29.2 68 29.2 60.3Q29.2 55.2 31.1 50Q33 44.7 36.5 40.4Q39.9 36.1 44.7 33.4Q49.4 30.6 55.1 30.6Q61.4 30.6 66.2 33.9Q70.9 37.2 73.8 42.9L63.1 52.4Q61.6 49.8 58.9 47.7Q56.2 45.6 52.1 45.6Q49.6 45.6 47.3 46.6Q45 47.5 43.2 49.1Q41.4 50.6 40.3 52.6Q39.2 54.6 39.2 56.7Q39.2 59.5 42 61Q44.7 62.4 50.4 63.4L62.9 65.5Q68.6 66.5 71 69.8Q73.4 73 73.4 79.2Q73.4 86.1 70.9 91.5Q68.3 96.9 63.5 100.6Q58.7 104.3 51.8 106.3Q44.9 108.2 36.1 108.2ZM94.2 84.2Q87.2 84.2 83.5 80.7Q79.8 77.2 79.8 69.5L79.8 62.8L91.3 62.8L91.3 69.2L106.6 69.2Q113.3 69.2 113.3 64Q113.3 62.8 112.7 61.5Q112.1 60.1 110.8 58.4Q109.5 56.7 107.5 54.6Q105.4 52.5 102.4 49.7L92.5 40.5L102.7 29.5L110.8 37.5Q114.5 41.2 117.1 44.4Q119.7 47.6 121.3 50.7Q122.9 53.8 123.6 57.1Q124.3 60.3 124.3 64Q124.3 73.6 119.4 78.9Q114.5 84.2 105.6 84.2ZM153.7 84.2Q143.6 84.2 138.7 79.4Q133.8 74.6 133.8 63.8L133.8 10.2L145.8 10.2L145.8 61.8Q145.8 66.3 147.6 67.8Q149.4 69.2 153.8 69.2L156.8 69.2L156.8 81.2L153.8 84.2ZM246.2 84.2Q242.7 84.2 239.6 83.4Q236.4 82.5 233.6 80.2Q227.2 84.2 215.4 84.2L186.8 84.2Q178.8 84.2 174.7 81Q170.5 77.7 169.1 70.7L168.5 70.7Q167.1 77.7 163.7 81Q160.3 84.2 153.8 84.2L153.8 72.2L156.8 69.2L159.8 69.2Q167.8 69.2 167.8 62.2L167.8 55.9L178.8 55.9L178.8 62.2Q178.8 66.5 181.2 68.1L185.6 60.5Q189.1 54.4 192.8 50.1Q196.4 45.8 200.4 43.1Q204.4 40.4 208.9 39.2Q213.3 37.9 218.4 37.9Q230.2 37.9 236.1 44.4Q242 50.8 242 62.3Q242 66.1 241.3 68.9Q243.8 69.2 246.2 69.2L249.2 69.2L249.2 81.2ZM215.4 69.2Q220.2 69.2 223.4 68.9Q226.5 68.5 228.5 67.7Q230.4 66.8 231.2 65.3Q232 63.8 232 61.4Q232 57.1 229.2 55Q226.4 52.9 219.9 52.9L216.9 52.9Q212.4 52.9 209 53.3Q205.6 53.6 203 54.6Q200.4 55.6 198.3 57.4Q196.2 59.2 194.3 62.1L190 68.6L190.3 69.2ZM246.2 72.2L249.2 69.2L268.6 69.2Q272 69.2 274.9 68.8Q277.7 68.4 279.7 67.4Q281.6 66.4 282.7 64.7Q283.8 63 283.8 60.4L283.8 55.8L283.2 55.8Q280.3 63.7 269.9 63.7Q261.8 63.7 257.3 59.5Q252.7 55.2 252.7 47.7Q252.7 42.5 254.3 38.1Q255.8 33.6 258.6 30.4Q261.3 27.1 265.1 25.3Q268.8 23.4 273.2 23.4Q283 23.4 288.5 31.6Q293.9 39.8 293.9 54.4Q293.9 63.5 292.3 69.3Q290.7 75.1 287.6 78.4Q284.4 81.7 279.7 83Q274.9 84.2 268.6 84.2L246.2 84.2ZM273 50.7Q276.8 50.7 279.4 50.4Q282 50 283.6 49.2Q283 44.3 279.8 41.4Q276.5 38.4 271.9 38.4Q268 38.4 265.4 40.5Q262.7 42.5 262.7 45.7Q262.7 48.4 264.9 49.6Q267.1 50.7 270.9 50.7ZM280.1 15.4Q277.5 15.4 275.9 13.8Q274.2 12.2 274.2 8.7Q274.2 5.2 275.9 3.6Q277.5 2 280.1 2L282.1 2Q284.7 2 286.4 3.6Q288 5.2 288 8.7Q288 12.2 286.4 13.8Q284.7 15.4 282.1 15.4ZM264.3 15.4Q261.7 15.4 260.1 13.8Q258.4 12.2 258.4 8.7Q258.4 5.2 260.1 3.6Q261.7 2 264.3 2L266.3 2Q268.9 2 270.6 3.6Q272.2 5.2 272.2 8.7Q272.2 12.2 270.6 13.8Q268.9 15.4 266.3 15.4ZM303.4 10.2L315.4 10.2L315.4 84.2L303.4 84.2Z';
const LOGO_COINS = [[19.1, 128], [53.1, 128]];
const LOGO_COIN_R = 15;
const LOGO_TONES = { light: '#ffffff', dark: '#0f2a4a', auto: '#0f2a4a' };

/**
 * The أقساطي wordmark as an inline SVG string (CSP-safe: attributes only, no style="").
 *   size  — the word's font size in px (default 28): the SVG is size × 3.3 wide and size × 1.56 tall.
 *           CSS may resize it: set a height and keep width auto (`.wordmark` has the aspect-ratio).
 *   tone  — 'light': white word for navy / dark backgrounds (the header) · 'dark': navy word for light surfaces ·
 *           'auto': navy in the light theme, white in the dark theme, navy on paper. The coins are always gold.
 *   label — accessible name; default t('app.name') → «أقساطي» / "Aqsati". Pass false when the parent already
 *           names it (e.g. inside the header's home link): the SVG is then aria-hidden.
 *   cls   — extra class names.
 * Without JS imports: put <span data-logo="28" data-logo-tone="light"></span> in the page; initPage fills it.
 */
export function logoHTML({ size = 28, tone = 'light', label, cls = '' } = {}) {
  const tn = LOGO_TONES[tone] ? tone : 'light';
  const px = Math.max(8, Number(size) || 28);
  const w = Math.round((LOGO_VB[0] / 100) * px * 10) / 10;
  const h = Math.round((LOGO_VB[1] / 100) * px * 10) / 10;
  const name = label === false ? '' : String(label ?? t('app.name'));
  const a11y = name ? `role="img" aria-label="${esc(name)}"` : 'aria-hidden="true"';
  // the coins' darker inner ring only shows from ~32px up; smaller it would just muddy the gold
  const ring = px >= 32
    ? LOGO_COINS.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${(LOGO_COIN_R * 0.6).toFixed(2)}" fill="none" stroke="#c98a1c" stroke-width="${(LOGO_COIN_R * 0.17).toFixed(2)}"/>`).join('')
    : '';
  const coins = LOGO_COINS.map(([cx, cy]) => `<circle class="wm-coin" cx="${cx}" cy="${cy}" r="${LOGO_COIN_R}" fill="#f5b942"/>`).join('');
  return `<svg class="wordmark tone-${tn}${cls ? ` ${esc(cls)}` : ''}" viewBox="0 0 ${LOGO_VB[0]} ${LOGO_VB[1]}" width="${w}" height="${h}" ${a11y} focusable="false"><path class="wm-word" fill="${LOGO_TONES[tn]}" d="${LOGO_PATH}"/>${coins}${ring}</svg>`;
}

/** Fill every [data-logo] placeholder inside root (size = its value, tone = data-logo-tone, label off with data-logo-label="false"). */
export function mountLogos(root = document) {
  root.querySelectorAll('[data-logo]').forEach((el) => {
    const label = el.getAttribute('data-logo-label');
    el.innerHTML = logoHTML({
      size: Number(el.getAttribute('data-logo')) || 28,
      tone: el.getAttribute('data-logo-tone') || 'auto',
      label: label === 'false' ? false : label || undefined,
    });
  });
}

// ---------- toast + banner ----------

let toastTimer = 0;
let toastHideTimer = 0;

function ensureEl(id, cls, attrs) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.hidden = true;
    document.body.append(el);
  }
  el.classList.add(cls);
  for (const [k, v] of Object.entries(attrs)) if (!el.hasAttribute(k)) el.setAttribute(k, v);
  return el;
}
const toastEl = () => ensureEl('toast', 'toast', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
const bannerEl = () => ensureEl('banner', 'banner', { role: 'alert' });

/** Keyboard focus goes to <main> (a stable target) when the element holding it disappears. */
function focusMain() {
  const main = document.getElementById('main');
  if (!main) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus({ preventScroll: true });
}

function showToastBox(el, tone) {
  clearTimeout(toastHideTimer);
  el.classList.remove('is-out', 'pop', 'tone-ok', 'tone-error', 'tone-warn');
  if (tone) el.classList.add(`tone-${tone}`);
  el.hidden = false;
  void el.offsetWidth; // restart the slide-in
  el.classList.add('pop');
}

function hideToast(rescue = true) {
  const el = toastEl();
  clearTimeout(toastTimer);
  if (el.hidden) return;
  if (rescue && el.contains(document.activeElement)) focusMain();
  if (FX.reducedMotion()) {
    el.hidden = true;
    return;
  }
  el.classList.add('is-out');
  toastHideTimer = setTimeout(() => {
    el.hidden = true;
    el.classList.remove('is-out');
  }, 220);
}

/** A short message at the bottom. tone: '' | 'ok' | 'error' | 'warn'. */
export function toast(msg, tone = '') {
  const el = toastEl();
  if (el.contains(document.activeElement)) focusMain(); // its button is about to be replaced
  el.replaceChildren();
  const span = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = String(msg ?? '');
  el.append(span);
  showToastBox(el, tone);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 3200);
}

/** Toast with one action button (e.g. «تراجع»). The button gets focus when focus was lost (re-rendered away). */
export function toastAction(msg, label, onAction, ms = 5000) {
  const el = toastEl();
  el.replaceChildren();
  const span = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = String(msg ?? '');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-btn';
  b.textContent = String(label ?? '');
  b.addEventListener('click', () => {
    hideToast(false); // onAction decides where focus goes next
    try { onAction?.(); } catch (err) { console.error(err); }
  }, { once: true });
  const active = document.activeElement;
  const lostFocus = !active || active === document.body || !active.isConnected;
  el.append(span, b);
  showToastBox(el, '');
  if (lostFocus) b.focus({ preventScroll: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

/** A persistent message under the header (errors). Empty msg hides it. tone: 'error' (default) | 'info' | 'warn'. */
export function showBanner(msg, tone = 'error') {
  const el = bannerEl();
  if (!msg) {
    el.hidden = true;
    el.replaceChildren();
    delete el.dataset.kind;
    return;
  }
  el.classList.remove('tone-error', 'tone-info', 'tone-warn');
  el.classList.add(`tone-${tone}`);
  el.replaceChildren();
  const ico = document.createElement('span');
  ico.className = 'banner-ico';
  ico.innerHTML = tone === 'info' ? ICONS.info : ICONS.alert;
  const text = document.createElement('span');
  text.className = 'banner-msg';
  text.textContent = String(msg);
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'banner-x';
  x.setAttribute('aria-label', t('common.close'));
  x.innerHTML = ICONS.x;
  x.addEventListener('click', () => {
    showBanner('');
    focusMain();
  });
  el.append(ico, text, x);
  el.hidden = false;
}

/** Show a toast on the NEXT page load (e.g. right before a redirect). */
export function flash(msg, tone = '') {
  session.set(FLASH_KEY, JSON.stringify({ msg: String(msg), tone }));
}

function showFlash() {
  const raw = session.get(FLASH_KEY);
  if (!raw) return;
  session.remove(FLASH_KEY);
  try {
    const { msg, tone } = JSON.parse(raw);
    if (msg) toast(msg, tone || '');
  } catch {
    // ignore a broken flash
  }
}

/** A same-site path from ?next= (never another origin, never /login itself). */
export function safeNext(raw, fallback = '/app') {
  const v = String(raw ?? '');
  if (!/^\/(?![/\\])[^\s]*$/.test(v)) return fallback;
  if (/^\/login(?:\.html)?(?:[?#]|$)/.test(v)) return fallback;
  return v;
}

// ---------- dialogs (accessible modal, never window.confirm) ----------

let dialogSeq = 0;
let dialogOpen = false;

function openDialog(opts) {
  const { title, body = '', confirmLabel, cancelLabel, danger = false, input = null, onConfirm = null } = opts || {};
  return new Promise((resolve) => {
    const id = `dlg-${(dialogSeq += 1)}`;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal-backdrop" data-dismiss></div>
      <div class="modal-card" role="${danger ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}-t"${body ? ` aria-describedby="${id}-b"` : ''} tabindex="-1">
        <button type="button" class="icon-btn modal-x" data-dismiss aria-label="${esc(t('dialog.close'))}">${ICONS.x}</button>
        <div class="modal-head">
          <span class="modal-ico${danger ? ' is-danger' : ''}" aria-hidden="true">${danger ? ICONS.alert : ICONS.info}</span>
          <h2 class="modal-title" id="${id}-t"></h2>
          ${body ? `<p class="modal-body" id="${id}-b"></p>` : ''}
        </div>
        <form class="modal-form" novalidate>
          ${input ? `
          <div class="field">
            <label for="${id}-i"></label>
            <input id="${id}-i" name="value" aria-describedby="${id}-e">
            <span class="err" id="${id}-e" aria-live="polite"></span>
          </div>` : `<p class="err modal-err" id="${id}-e" aria-live="polite"></p>`}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-dismiss></button>
            <button type="submit" class="btn${danger ? ' btn-danger' : ''}"><span class="spinner" aria-hidden="true"></span><span class="btn-label"></span></button>
          </div>
        </form>
      </div>`;
    const card = wrap.querySelector('.modal-card');
    const form = wrap.querySelector('form');
    const field = input ? wrap.querySelector('input') : null;
    const errEl = wrap.querySelector(`#${id}-e`);
    const okBtn = wrap.querySelector('button[type="submit"]');
    const cancelBtn = wrap.querySelector('.modal-actions [data-dismiss]');
    wrap.querySelector('.modal-title').textContent = title || t('dialog.title');
    if (body) wrap.querySelector('.modal-body').textContent = body;
    okBtn.querySelector('.btn-label').textContent = confirmLabel || t('common.confirm');
    cancelBtn.textContent = cancelLabel || t('common.cancel');
    if (field) {
      wrap.querySelector('label').textContent = input.label || '';
      field.type = input.type || 'text';
      if (input.autocomplete) field.autocomplete = input.autocomplete;
      if (input.inputmode) field.inputMode = input.inputmode;
      if (input.placeholder) field.placeholder = input.placeholder;
      if (input.value !== undefined) field.value = String(input.value);
      if (input.dir) field.dir = input.dir;
      field.required = input.required !== false;
    }

    // Everything behind the dialog becomes inert (focus and screen readers stay inside).
    const madeInert = [];
    for (const el of document.body.children) {
      if (el === wrap || el.id === 'toast' || el.inert) continue;
      el.inert = true;
      madeInert.push(el);
    }
    document.documentElement.classList.add('modal-open');
    document.body.append(wrap);
    dialogOpen = true;
    let busy = false;
    let done = false;

    const close = (result) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      for (const el of madeInert) el.inert = false;
      wrap.remove();
      dialogOpen = !!document.querySelector('body > .modal');
      if (!dialogOpen) document.documentElement.classList.remove('modal-open');
      if (prevFocus?.isConnected && !prevFocus.closest('[hidden]')) prevFocus.focus({ preventScroll: true });
      else focusMain();
      resolve(result);
    };
    const cancelValue = input ? null : false;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!busy) close(cancelValue);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = $$('button, input, a[href], [tabindex]:not([tabindex="-1"])', card)
        .filter((el) => !el.disabled && el.getClientRects().length);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = items.indexOf(document.activeElement);
      if (at === -1) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && at === 0) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === items.length - 1) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    wrap.addEventListener('click', (e) => {
      if (busy) return;
      if (e.target instanceof Element && e.target.closest('[data-dismiss]')) close(cancelValue);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const value = field ? field.value : true;
      if (field) {
        const msg = input.validate ? input.validate(value) : (field.required && !String(value).length ? t('err.invalid input') : '');
        if (msg) {
          errEl.textContent = msg;
          field.setAttribute('aria-invalid', 'true');
          field.focus();
          return;
        }
      }
      if (onConfirm) {
        busy = true;
        okBtn.disabled = true;
        okBtn.classList.add('is-loading');
        okBtn.setAttribute('aria-busy', 'true');
        let problem;
        try {
          problem = await onConfirm(value);
        } catch (err) {
          problem = errorText(err);
        }
        busy = false;
        okBtn.disabled = false;
        okBtn.classList.remove('is-loading');
        okBtn.removeAttribute('aria-busy');
        if (typeof problem === 'string' && problem) {
          errEl.textContent = problem;
          if (field) {
            field.setAttribute('aria-invalid', 'true');
            field.select?.();
            field.focus();
          } else {
            okBtn.focus();
          }
          return;
        }
      }
      close(field ? value : true);
    });

    requestAnimationFrame(() => {
      if (field) field.focus();
      else (danger ? cancelBtn : okBtn).focus();
    });
  });
}

/**
 * Accessible confirm dialog → Promise<boolean>.
 * Optional onConfirm(): async work done while the dialog shows a spinner; return an error string to keep it open.
 */
export function confirmDialog({ title, body, confirmLabel, cancelLabel, danger = false, onConfirm } = {}) {
  return openDialog({ title, body, confirmLabel, cancelLabel, danger, onConfirm });
}

/**
 * Dialog with one input (e.g. «اكتب الباسوورد») → Promise<string | null> (null = cancelled).
 * label, type ('text' | 'password' | …), autocomplete, inputmode, placeholder, value, validate(value) → error string.
 */
export function promptDialog({ title, body, label, type = 'text', autocomplete, inputmode, placeholder, value, dir, validate, required = true, confirmLabel, cancelLabel, danger = false, onConfirm } = {}) {
  return openDialog({
    title, body, confirmLabel, cancelLabel, danger, onConfirm,
    input: { label, type, autocomplete, inputmode, placeholder, value, dir, validate, required },
  });
}

export const ui = { toast, toastAction, showBanner, errorText, fmt, confirmDialog, promptDialog, flash };

// ---------- header + mobile tab bar ----------

const PAGES = {
  home: { href: '/', label: 'nav.home', icon: 'home' },
  app: { href: '/app', label: 'nav.app', icon: 'gauge' },
  installments: { href: '/installments', label: 'nav.installments', icon: 'list', tab: 'nav.tabInstallments' },
  check: { href: '/check', label: 'nav.check', icon: 'scale' },
  calendar: { href: '/calendar', label: 'nav.calendar', icon: 'calendar' },
  insights: { href: '/insights', label: 'nav.insights', icon: 'chart' },
  report: { href: '/report', label: 'nav.report', icon: 'doc' },
  account: { href: '/account', label: 'nav.account', icon: 'user' },
};
const HEADER_NAV = ['app', 'installments', 'check', 'calendar', 'insights', 'report'];
const DRAWER_NAV = ['home', 'app', 'installments', 'check', 'calendar', 'insights', 'report', 'account'];
const TAB_NAV = ['app', 'installments', 'calendar', 'insights', 'account'];

const page = { active: '', requireAuth: false, title: '', started: false };

const current = (key) => (key === page.active ? ' aria-current="page"' : '');

function loginHref() {
  const here = location.pathname + location.search;
  return here === '/' || here.startsWith('/login') ? '/login' : `/login?next=${encodeURIComponent(here)}`;
}

function headerHTML() {
  const links = HEADER_NAV.map((k) => `<a class="nav-link" href="${PAGES[k].href}"${current(k)}>${ICONS[PAGES[k].icon]}<span>${esc(t(PAGES[k].label))}</span></a>`).join('');
  const drawer = DRAWER_NAV.map((k) => `<a class="drawer-link" href="${PAGES[k].href}"${current(k)}>${ICONS[PAGES[k].icon]}<span>${esc(t(PAGES[k].label))}</span></a>`).join('');
  const target = getLang() === 'ar' ? 'en' : 'ar';
  return `
    <div class="container header-in">
      <a class="brand" href="/" aria-label="${esc(t('brand.home'))}">${logoHTML({ size: 28, tone: 'light', label: false })}</a>
      <nav class="nav" aria-label="${esc(t('nav.label'))}">${links}</nav>
      <div class="header-tools">
        <button type="button" class="hdr-btn lang-btn" data-focus-key="lang" data-action="lang" lang="${target}" aria-label="${esc(t('lang.label'))}" title="${esc(t('lang.label'))}">${esc(t('lang.short'))}</button>
        <button type="button" class="hdr-btn theme-btn" data-focus-key="theme" data-action="theme" aria-pressed="false" aria-label="${esc(t('theme.toggle'))}" title="${esc(t('theme.toggle'))}">${ICONS.moon}${ICONS.sun}</button>
        <div class="auth-slot"></div>
        <button type="button" class="hdr-btn menu-btn" data-focus-key="menu" data-action="menu" aria-expanded="false" aria-controls="nav-drawer" aria-label="${esc(t('nav.openMenu'))}">${ICONS.menu}${ICONS.x}</button>
      </div>
    </div>
    <div class="drawer" id="nav-drawer" hidden>
      <nav class="container drawer-in" aria-label="${esc(t('nav.more'))}">${drawer}</nav>
    </div>`;
}

function authHTML() {
  const u = STATE.user;
  if (!u) {
    if (page.active === 'login') return '';
    return `<a class="btn btn-gold btn-sm hdr-login" href="${esc(loginHref())}" data-focus-key="login">${esc(t('auth.login'))}</a>`;
  }
  const letter = esc(([...u.email.trim()][0] || '?').toUpperCase());
  return `
    <div class="user-menu">
      <button type="button" class="user-btn" data-focus-key="user" data-action="user" aria-expanded="false" aria-controls="user-pop" aria-label="${esc(t('auth.menu', { email: u.email }))}">
        <span class="avatar" aria-hidden="true">${letter}</span>
        <span class="user-email" dir="ltr">${esc(u.email)}</span>
        ${ICONS.chevron}
      </button>
      <div class="menu" id="user-pop" hidden>
        <p class="menu-head"><small>${esc(t('auth.signedInAs'))}</small><b dir="ltr">${esc(u.email)}</b></p>
        <a class="menu-item" href="/account"${current('account')}>${ICONS.user}<span>${esc(t('auth.account'))}</span></a>
        <button type="button" class="menu-item is-danger" data-action="logout">${ICONS.logout}<span>${esc(t('auth.logout'))}</span></button>
      </div>
    </div>`;
}

function tabbarHTML() {
  return `<div class="tabbar-in">${TAB_NAV.map((k) => `
    <a class="tab" href="${PAGES[k].href}"${current(k)}><span class="tab-ico">${ICONS[PAGES[k].icon]}</span><span class="tab-label">${esc(t(PAGES[k].tab || PAGES[k].label))}</span></a>`).join('')}</div>`;
}

function renderThemeButton() {
  const btn = document.querySelector('#site-header .theme-btn');
  if (!btn) return;
  const dark = resolvedTheme() === 'dark';
  btn.setAttribute('aria-pressed', String(dark));
}

/** Re-render something while keeping keyboard focus on the "same" control (by data-focus-key). */
function keepFocus(container, render) {
  const active = document.activeElement;
  const key = active && container?.contains(active) ? active.getAttribute('data-focus-key') : null;
  render();
  if (key) container.querySelector(`[data-focus-key="${key}"]`)?.focus({ preventScroll: true });
}

function renderAuthSlot() {
  const header = document.getElementById('site-header');
  const slot = header?.querySelector('.auth-slot');
  if (!slot) return;
  keepFocus(header, () => { slot.innerHTML = authHTML(); });
}

function renderShell() {
  const header = document.getElementById('site-header');
  if (header) {
    header.classList.add('site-header');
    keepFocus(header, () => {
      header.innerHTML = headerHTML();
      header.querySelector('.auth-slot').innerHTML = authHTML();
    });
    renderThemeButton();
  }
  const tabbar = document.getElementById('tabbar');
  if (tabbar) {
    tabbar.classList.add('tabbar');
    tabbar.setAttribute('aria-label', t('nav.tabbar'));
    keepFocus(tabbar, () => { tabbar.innerHTML = tabbarHTML(); });
  }
  document.querySelectorAll('.skip-link').forEach((a) => {
    if (!a.hasAttribute('data-i18n') && !a.textContent.trim()) a.textContent = t('skip');
  });
  mountLogos(document); // [data-logo] placeholders (their accessible name follows the language)
}

function setPopup(btn, pop, open) {
  if (!btn || !pop) return;
  btn.setAttribute('aria-expanded', String(open));
  pop.hidden = !open;
  if (btn.classList.contains('menu-btn')) btn.setAttribute('aria-label', t(open ? 'nav.closeMenu' : 'nav.openMenu'));
}

function closePopups(except = null) {
  const header = document.getElementById('site-header');
  if (!header) return;
  const user = header.querySelector('.user-btn');
  const menu = header.querySelector('.menu-btn');
  if (user && except !== 'user') setPopup(user, header.querySelector('#user-pop'), false);
  if (menu && except !== 'menu') setPopup(menu, header.querySelector('#nav-drawer'), false);
}

async function doLogout(btn) {
  if (btn) btn.disabled = true;
  try {
    await logout();
  } catch (err) {
    toast(errorText(err), 'error');
    if (btn) btn.disabled = false;
    return;
  }
  if (page.requireAuth) {
    flash(t('auth.loggedOut'));
    location.assign('/');
    return;
  }
  closePopups();
  toast(t('auth.loggedOut'));
  document.querySelector('#site-header .hdr-login')?.focus({ preventScroll: true });
}

function bindShell() {
  const header = document.getElementById('site-header');
  if (!header) return;
  header.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'lang') {
      setLang(getLang() === 'ar' ? 'en' : 'ar');
    } else if (action === 'theme') {
      setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    } else if (action === 'user' || action === 'menu') {
      const pop = header.querySelector(action === 'user' ? '#user-pop' : '#nav-drawer');
      const open = target.getAttribute('aria-expanded') !== 'true';
      closePopups(action);
      setPopup(target, pop, open);
      if (open && action === 'user') pop.querySelector('.menu-item')?.focus({ preventScroll: true });
    } else if (action === 'logout') {
      doLogout(target);
    }
  });
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (!e.target.closest('.user-menu') && !e.target.closest('.menu-btn') && !e.target.closest('#nav-drawer')) closePopups();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || dialogOpen) return;
    const open = header.querySelector('[aria-expanded="true"]');
    if (!open) return;
    closePopups();
    open.focus({ preventScroll: true });
  });
  // Focus leaving the user menu closes it (keyboard users tabbing away).
  header.addEventListener('focusout', (e) => {
    const menu = header.querySelector('.user-menu');
    if (menu && !menu.contains(e.relatedTarget) && e.relatedTarget) closePopups('menu');
  });
}

function setTitle() {
  if (!page.title) return;
  const name = t('app.name');
  const text = hasString(page.title) ? t(page.title) : page.title;
  document.title = text === name ? name : `${text} · ${name}`;
}

// ---------- service worker (offline shell) ----------

function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let shown = false;
  // Only a NEW version installed over an already-active one is an update. The first install takes control
  // silently, even when it finishes activating (clients.claim) after the visitor has moved to another page.
  const watch = (reg, worker) => {
    if (!worker || !reg.active || reg.active === worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'activated' || shown) return;
      shown = true;
      toastAction(t('sw.update'), t('sw.reload'), () => location.reload(), 12000);
    });
  };
  const go = () => navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then((reg) => {
      watch(reg, reg.installing || reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg, reg.installing));
    })
    .catch(() => {});
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

// ---------- live sync: other tabs, other devices, connectivity ----------

function watchSync() {
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) applyTheme();
    if (e.key !== TOKEN_KEY && e.key !== null) return;
    token = null; // another tab logged out / switched guest → follow it
    store.load().catch(() => {});
  });
  channel?.addEventListener('message', (e) => {
    if (e.data?.type === 'sync') store.load().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && loaded && Date.now() - lastLoadAt > 60000) store.load().catch(() => {});
  });
  window.addEventListener('offline', () => {
    showBanner(t('net.offline'), 'info');
    bannerEl().dataset.kind = 'offline';
  });
  window.addEventListener('online', () => {
    if (bannerEl().dataset.kind === 'offline') showBanner('');
    toast(t('net.online'), 'ok');
    store.load().catch(() => {});
  });
}

// ---------- page boot ----------

/**
 * Boot a page: theme + language, header + tab bar, service worker, STATE, i18n, optional auth gate.
 * active: 'home' | 'login' | 'account' | 'app' | 'installments' | 'check' | 'calendar' | 'insights' | 'report'
 * title: an i18n key (or plain text) for <title>; requireAuth: send guests to /login?next=<path>.
 */
export async function initPage({ active = '', requireAuth = false, title = '' } = {}) {
  if (page.started) return;
  page.started = true;
  page.active = active;
  page.requireAuth = requireAuth;
  page.title = title;
  // lets CSS style per page (e.g. the landing's floating pill header: html[data-page="home"])
  if (active) document.documentElement.dataset.page = active;

  applyTheme();
  applyLangToDocument();
  toastEl();
  bannerEl();
  const main = document.getElementById('main');
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

  renderShell();
  bindShell();
  setTitle();
  applyI18n(document);
  document.documentElement.classList.add('i18n-ready'); // English <main> was hidden until now (base.css)
  registerSW();
  watchSync();

  store.subscribe(renderAuthSlot);
  window.addEventListener('langchange', () => {
    renderShell();
    setTitle();
  });

  FX.ripples();
  FX.tilt();
  FX.scrollFx({ bar: null });
  document.documentElement.classList.add('js-ready');
  if (main) main.classList.add('page-enter');

  let ok = true;
  try {
    await store.load();
  } catch (err) {
    ok = false;
    const offline = navigator.onLine === false || err?.code === 'offline';
    showBanner(offline ? t('net.offline') : errorText(err), offline ? 'info' : 'error');
    if (offline) bannerEl().dataset.kind = 'offline';
  }

  applyI18n(document);
  FX.reveal('.reveal');
  showFlash();

  if (requireAuth && ok && !STATE.user) {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
}
