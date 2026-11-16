// Installment reminder notifications: which payments get a reminder, the AR/EN text, dedupe, and the service
// worker's copy of the same logic (periodicsync + notificationclick), run in a vm with stubbed browser APIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  duesToNotify, notificationFor, pendingNotifications, rememberShown, normalizeSettings, nextReminder, addDays,
  targetDate, paymentOn, NOTIFY_MODES, DEFAULT_NOTIFY_MODE, SYNC_TAG, MIRROR_CACHE, MIRROR_URL,
} from '../public/js/logic/notify.js';

const TODAY = '2026-11-16';
const inst = (id, provider, title, monthly, dueDay, remaining, first, extra = {}) => ({
  id, provider, title, monthly_amount: monthly, due_day: dueDay, remaining_count: remaining, first_due_date: first,
  remaining_mode: 'count', last_amount: null, ...extra,
});
const TABBY = inst('A', 'تابي', 'جوال', 45.5, 17, 6, '2026-11-17'); // due tomorrow (Nov 17 → Apr 17 2027)
const TAMARA = inst('B', 'تمارا', '', 30, 16, 4, '2026-10-16'); // due today (Oct 16 → Jan 16 2027)
const PART = inst('P', 'تابي', 'لابتوب', 25, 25, 7, '2026-11-25', { remaining_mode: 'amount', last_amount: 12.5 });
const OPEN = inst('O', 'بطاقة ائتمانية', '', 40, 10, null, '2026-09-10', { remaining_mode: 'open' });
const END31 = inst('E', 'قرض بنك', 'سيارة', 180, 31, 12, '2026-10-31');
const DONE = inst('D', 'ديما', '', 20, 17, 2, '2026-08-17'); // Aug + Sep only
const LATER = inst('L', 'تمارا', '', 15, 17, 3, '2026-12-17'); // starts next month
const ALL = [TABBY, TAMARA, PART, OPEN, END31, DONE, LATER];
const state = (installments, payments = []) => ({ profile: null, installments, payments, user: { email: 'x@y.z' } });
const pay = (id, month) => ({ installment_id: id, month, paid_at: `${month}-01T09:00:00Z` });
const ids = (list) => list.map((d) => d.id);

test('addDays / targetDate cross month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(targetDate(TODAY, 'before'), '2026-11-17');
  assert.equal(targetDate(TODAY, 'day'), TODAY);
  assert.equal(targetDate(TODAY, 'weird'), '2026-11-17');
  assert.deepEqual(NOTIFY_MODES, ['before', 'day']);
  assert.equal(DEFAULT_NOTIFY_MODE, 'before');
  assert.equal(SYNC_TAG, 'aqsati-dues');
});

test('duesToNotify «قبل بيوم»: only payments due tomorrow, with the real details', () => {
  const dues = duesToNotify(state(ALL), TODAY, 'before');
  assert.deepEqual(ids(dues), ['A']);
  assert.deepEqual(dues[0], {
    id: 'A', key: 'A|2026-11-17', date: '2026-11-17', month: '2026-11', k: 0, when: 'tomorrow',
    provider: 'تابي', title: 'جوال', amount: 45.5, open: false, last: false,
  });
  assert.deepEqual(ids(duesToNotify(state(ALL), TODAY)), ['A'], 'default mode is the day before');
});

test('duesToNotify «يوم القسط»: only payments due today', () => {
  const dues = duesToNotify(state(ALL), TODAY, 'day');
  assert.deepEqual(ids(dues), ['B']);
  assert.equal(dues[0].when, 'today');
  assert.equal(dues[0].k, 1);
  assert.equal(dues[0].key, 'B|2026-11-16');
});

test('a month marked paid gets no reminder; another month paid does not matter', () => {
  assert.deepEqual(duesToNotify(state(ALL, [pay('A', '2026-11')]), TODAY, 'before'), []);
  assert.deepEqual(ids(duesToNotify(state(ALL, [pay('A', '2026-12'), pay('B', '2026-11')]), TODAY, 'before')), ['A']);
  assert.deepEqual(duesToNotify(state(ALL, [pay('B', '2026-11')]), TODAY, 'day'), []);
});

test('finished plans and plans that have not started yet get nothing', () => {
  assert.deepEqual(duesToNotify(state([DONE, LATER]), TODAY, 'before'), []);
  assert.deepEqual(ids(duesToNotify(state([DONE, LATER]), '2026-12-16', 'before')), ['L']);
  assert.deepEqual(duesToNotify(state([TABBY]), '2027-05-16', 'before'), [], 'after the last payment');
});

test('the last payment is flagged, and a partial final payment uses its own amount', () => {
  const last = duesToNotify(state([TABBY]), '2027-04-16', 'before');
  assert.equal(last[0].k, 5);
  assert.equal(last[0].last, true);
  assert.equal(last[0].amount, 45.5);
  const part = duesToNotify(state([PART]), '2027-05-24', 'before');
  assert.equal(part[0].amount, 12.5);
  assert.equal(part[0].last, true);
  assert.equal(duesToNotify(state([PART]), '2027-04-24', 'before')[0].amount, 25);
});

test('open-ended plans remind every month, never as «last», never before their first due date', () => {
  const far = duesToNotify(state([OPEN]), '2031-03-09', 'before');
  assert.deepEqual(far.map(({ id, date, amount, open, last }) => ({ id, date, amount, open, last })),
    [{ id: 'O', date: '2031-03-10', amount: 40, open: true, last: false }]);
  assert.deepEqual(duesToNotify(state([OPEN]), '2026-08-09', 'before'), []);
  assert.equal(duesToNotify(state([OPEN]), '2026-09-10', 'day').length, 1);
});

test('due day 31 lands on the last day of short months', () => {
  assert.equal(duesToNotify(state([END31]), '2026-11-29', 'before')[0].date, '2026-11-30');
  assert.equal(duesToNotify(state([END31]), '2027-02-27', 'before')[0].date, '2027-02-28');
  assert.deepEqual(duesToNotify(state([END31]), '2026-11-30', 'before'), [], 'Dec 1 is not a due date');
  assert.equal(paymentOn(END31, '2026-12-31'), 2);
  assert.equal(paymentOn(END31, '2026-12-30'), -1);
});

test('several on the same day: biggest first; junk input is ignored safely', () => {
  const twin = inst('Z', 'تمارا', '', 99, 17, 3, '2026-11-17');
  assert.deepEqual(ids(duesToNotify(state([TABBY, twin]), TODAY, 'before')), ['Z', 'A']);
  for (const bad of [null, undefined, {}, { installments: 'x' }, { installments: [null, 1, { provider: 'x' }] }]) {
    assert.deepEqual(duesToNotify(bad, TODAY, 'before'), []);
  }
});

test('notificationFor — Kuwaiti Arabic, the day before', () => {
  const n = notificationFor(duesToNotify(state(ALL), TODAY, 'before')[0], 'ar');
  assert.equal(n.title, 'باچر قسط تابي 45.500 د.ك — لا تنسى');
  assert.equal(n.options.body, 'جوال · يستحق 17 نوفمبر. إذا دفعته علّمه «دفعت ✓» باقصادي.');
  assert.deepEqual(
    { tag: n.options.tag, lang: n.options.lang, dir: n.options.dir, data: n.options.data },
    { tag: 'aqsati-due-A|2026-11-17', lang: 'ar', dir: 'rtl', data: { url: '/installments', key: 'A|2026-11-17' } },
  );
  assert.equal(n.options.icon, '/icons/icon-192.png');
});

test('notificationFor — English, on the day, and the last payment', () => {
  const n = notificationFor(duesToNotify(state(ALL), TODAY, 'day')[0], 'en');
  assert.equal(n.title, "Tamara installment due today: KWD 30.000 — don't forget");
  assert.equal(n.options.body, 'Due 16 Nov. Paid already? Mark it “Paid ✓” in Aqsati.');
  assert.equal(n.options.dir, 'ltr');
  assert.equal(n.options.lang, 'en');
  const lastAr = notificationFor(duesToNotify(state([PART]), '2027-05-25', 'day')[0], 'ar');
  assert.equal(lastAr.title, 'اليوم قسط تابي 12.500 د.ك — لا تنسى');
  assert.match(lastAr.options.body, /^لابتوب · يستحق 25 مايو — وهذي آخر دفعة!/);
  const lastEn = notificationFor(duesToNotify(state([PART]), '2027-05-24', 'before')[0], 'en');
  assert.match(lastEn.options.body, /^لابتوب · Due 25 May — the last payment!/);
  const custom = notificationFor({ ...duesToNotify(state([TABBY]), TODAY)[0], provider: 'مطعم' }, 'en');
  assert.match(custom.title, /^مطعم installment due tomorrow/, 'unknown providers keep their own name');
});

test('pendingNotifications: off → nothing; on → once per installment + date (dedupe)', () => {
  const st = state(ALL);
  assert.deepEqual(pendingNotifications(st, TODAY, { on: false }), []);
  assert.deepEqual(pendingNotifications(st, TODAY, null), []);
  const first = pendingNotifications(st, TODAY, { on: true, mode: 'before', shown: [] }, 'ar');
  assert.deepEqual(first.map((n) => n.key), ['A|2026-11-17']);
  assert.equal(first[0].title, 'باچر قسط تابي 45.500 د.ك — لا تنسى');
  const shown = rememberShown([], first.map((n) => n.key), TODAY);
  assert.deepEqual(pendingNotifications(st, TODAY, { on: true, mode: 'before', shown }), [], 'reload: not again');
  assert.deepEqual(pendingNotifications(st, TODAY, JSON.stringify({ on: true, shown })), [], 'JSON string settings');
  // same installment, next month → a new reminder
  assert.deepEqual(pendingNotifications(st, '2026-12-16', { on: true, shown }).map((n) => n.key), ['A|2026-12-17', 'L|2026-12-17']);
  // switching to «يوم القسط» on the due day itself is a different key for B
  assert.deepEqual(pendingNotifications(st, TODAY, { on: true, mode: 'day', shown }).map((n) => n.key), ['B|2026-11-16']);
});

test('rememberShown merges, dedupes, drops dates older than 45 days and junk', () => {
  const out = rememberShown(['A|2026-09-01', 'A|2026-11-17', 'bad', 7], ['A|2026-11-17', 'B|2026-11-16'], TODAY);
  assert.deepEqual(out, ['A|2026-11-17', 'B|2026-11-16']);
  assert.deepEqual(rememberShown(undefined, undefined, TODAY), []);
  const many = Array.from({ length: 260 }, (_, i) => `x${i}|2026-11-16`);
  const capped = rememberShown(many, [], TODAY);
  assert.equal(capped.length, 200);
  assert.equal(capped.at(-1), 'x259|2026-11-16', 'keeps the newest');
});

test('normalizeSettings: defaults, JSON strings, bad values', () => {
  assert.deepEqual(normalizeSettings(null), { on: false, mode: 'before', shown: [] });
  assert.deepEqual(normalizeSettings('{oops'), { on: false, mode: 'before', shown: [] });
  assert.deepEqual(normalizeSettings('{"on":true,"mode":"day","shown":["A|2026-11-17"]}'), { on: true, mode: 'day', shown: ['A|2026-11-17'] });
  assert.deepEqual(normalizeSettings({ on: 'yes', mode: 'later', shown: 'A' }), { on: false, mode: 'before', shown: [] });
});

test('nextReminder: the next day a reminder would go out', () => {
  const r = nextReminder(state(ALL), TODAY, 'before');
  assert.equal(r.date, TODAY);
  assert.deepEqual(ids(r.dues), ['A']);
  const paidA = nextReminder(state(ALL, [pay('A', '2026-11')]), TODAY, 'before');
  assert.equal(paidA.date, '2026-11-24', 'PART due Nov 25 → reminder Nov 24');
  assert.equal(nextReminder(state(ALL, [pay('A', '2026-11')]), TODAY, 'day').date, TODAY, 'B is due today');
  assert.equal(nextReminder(state(ALL, [pay('A', '2026-11'), pay('B', '2026-11')]), TODAY, 'day').date, '2026-11-25');
  assert.equal(nextReminder(state([]), TODAY), null);
  assert.equal(nextReminder(state([DONE]), TODAY), null);
});

// ---------- the service worker's copy ----------

const SW_CODE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

/** Load public/sw.js in a vm with stubbed browser APIs. */
function loadWorker({ stateBody, permission = 'granted', windows = [] } = {}) {
  const listeners = {};
  const store = new Map(); // Cache Storage: cacheName → Map(url → body text)
  const shown = [];
  const calls = { fetch: [], focus: [], navigate: [], openWindow: [] };
  const cacheFor = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async (key) => (m.has(String(key)) ? new Response(m.get(String(key))) : undefined),
      put: async (key, res) => { m.set(String(key), await res.text()); },
    };
  };
  const self = {
    location: { hostname: 'aqsati.test', origin: 'https://aqsati.test' },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: {
      matchAll: async () => windows.map((w) => ({
        url: w.url,
        focus: async () => { calls.focus.push(w.url); return null; },
        navigate: async (href) => { calls.navigate.push(href); return { url: href }; },
      })),
      openWindow: async (href) => { calls.openWindow.push(href); return { url: href }; },
    },
    skipWaiting: () => {},
  };
  const ctx = vm.createContext({
    self,
    caches: { open: async (name) => cacheFor(name), keys: async () => [...store.keys()], delete: async () => true, match: async () => undefined },
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      return new Response(JSON.stringify(stateBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    Notification: { permission },
    Response,
    URL,
    console,
  });
  vm.runInContext(SW_CODE, ctx, { filename: 'sw.js' });
  const fire = async (type, event) => {
    const waits = [];
    for (const fn of listeners[type] || []) fn({ ...event, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  const plain = (x) => JSON.parse(JSON.stringify(x)); // values from the vm realm → plain objects for deepEqual
  return { ctx, listeners, store, shown, calls, fire, plain, cache: cacheFor };
}

test('sw.js copy agrees with notify.js on every fixture, date, mode and language', () => {
  const { ctx, plain } = loadWorker();
  for (const fn of ['ntfDues', 'ntfNotification', 'ntfPending', 'ntfRemember', 'ntfNormalize']) {
    assert.equal(typeof ctx[fn], 'function', `sw.js defines ${fn}`);
  }
  const payments = [pay('A', '2026-12'), pay('O', '2027-01'), pay('P', '2027-03')];
  const states = [state(ALL), state(ALL, payments), state([]), {}, null];
  let compared = 0;
  for (const st of states) {
    for (let i = -40; i < 220; i += 1) {
      const today = addDays(TODAY, i);
      for (const mode of ['before', 'day', 'x']) {
        const mine = duesToNotify(st, today, mode);
        assert.deepEqual(plain(ctx.ntfDues(st, today, mode)), mine, `dues ${today} ${mode}`);
        for (const d of mine) {
          for (const lang of ['ar', 'en']) {
            assert.deepEqual(plain(ctx.ntfNotification(d, lang)), notificationFor(d, lang), `text ${d.key} ${lang}`);
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared > 100, `compared ${compared} notifications`);
  const settings = { on: true, mode: 'day', shown: ['B|2026-11-16'] };
  assert.deepEqual(plain(ctx.ntfPending(state(ALL), '2027-01-16', settings, 'en')), pendingNotifications(state(ALL), '2027-01-16', settings, 'en'));
  assert.deepEqual(plain(ctx.ntfRemember(['A|2026-09-01', 'A|2026-11-17'], ['B|2026-11-16'], TODAY)), rememberShown(['A|2026-09-01', 'A|2026-11-17'], ['B|2026-11-16'], TODAY));
  for (const raw of [null, '{x', '{"on":true,"mode":"day"}', { on: true, mode: 'q', shown: ['A|2026-11-17', 'no'] }]) {
    assert.deepEqual(plain(ctx.ntfNormalize(raw)), normalizeSettings(raw));
  }
  assert.equal(MIRROR_CACHE, 'aqsati_notify');
  assert.ok(!MIRROR_CACHE.startsWith('aqsati-'), 'the mirror survives VERSION bumps (activate deletes aqsati-* caches)');
  assert.match(SW_CODE, new RegExp(`NTF_CACHE = '${MIRROR_CACHE}'`));
  assert.match(SW_CODE, new RegExp(`NTF_URL = '${MIRROR_URL}'`));
  assert.match(SW_CODE, new RegExp(`NTF_TAG = '${SYNC_TAG}'`));
});

/** The worker's clock is the real one, so the background test uses an installment due tomorrow from now. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('periodicsync «aqsati-dues»: one notification for the installment due tomorrow, never twice', async () => {
  const today = localToday();
  const tomorrow = addDays(today, 1);
  const due = inst('T1', 'تابي', 'جوال', 45.5, Number(tomorrow.slice(8)), 3, tomorrow);
  const notYet = inst('T2', 'تمارا', '', 20, Number(addDays(today, 5).slice(8)), 3, addDays(today, 5));
  const w = loadWorker({ stateBody: state([due, notYet]) });
  await w.cache('aqsati_notify').put('/__aqsati_notify', new Response(JSON.stringify({ on: true, mode: 'before', shown: [], lang: 'ar' })));

  await w.fire('periodicsync', { tag: 'aqsati-dues' });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'باچر قسط تابي 45.500 د.ك — لا تنسى');
  assert.equal(w.shown[0].options.tag, `aqsati-due-T1|${tomorrow}`);
  assert.equal(w.calls.fetch.length, 1);
  const { url, init } = w.calls.fetch[0];
  assert.equal(url, '/api/rpc');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'include');
  assert.deepEqual(JSON.parse(init.body), { fn: 'aqsati_state', args: {} });
  const saved = JSON.parse(w.store.get('aqsati_notify').get('/__aqsati_notify'));
  assert.deepEqual(saved.shown, [`T1|${tomorrow}`], 'the shown key is written back for the page to see');
  assert.equal(saved.lang, 'ar');

  await w.fire('periodicsync', { tag: 'aqsati-dues' });
  assert.equal(w.shown.length, 1, 'the next background run does not repeat it');
  await w.fire('periodicsync', { tag: 'something-else' });
  assert.equal(w.calls.fetch.length, 2, 'other tags are ignored');
});

test('periodicsync shows nothing when switched off, without permission, or signed out', async () => {
  const today = localToday();
  const tomorrow = addDays(today, 1);
  const due = inst('T1', 'تابي', '', 45.5, Number(tomorrow.slice(8)), 3, tomorrow);
  const cases = [
    { settings: { on: false }, opts: { stateBody: state([due]) } },
    { settings: null, opts: { stateBody: state([due]) } },
    { settings: { on: true }, opts: { stateBody: state([due]), permission: 'denied' } },
    { settings: { on: true }, opts: { stateBody: { ...state([due]), user: null } } },
    { settings: { on: true, mode: 'day' }, opts: { stateBody: state([due]) } },
  ];
  for (const { settings, opts } of cases) {
    const w = loadWorker(opts);
    if (settings) await w.cache('aqsati_notify').put('/__aqsati_notify', new Response(JSON.stringify(settings)));
    await w.fire('periodicsync', { tag: 'aqsati-dues' });
    assert.equal(w.shown.length, 0, JSON.stringify({ settings, permission: opts.permission, user: opts.stateBody.user }));
  }
  // English mirror → English text
  const en = loadWorker({ stateBody: state([due]) });
  await en.cache('aqsati_notify').put('/__aqsati_notify', new Response(JSON.stringify({ on: true, lang: 'en' })));
  await en.fire('periodicsync', { tag: 'aqsati-dues' });
  assert.equal(en.shown[0].title, "Tabby installment due tomorrow: KWD 45.500 — don't forget");
});

test('notificationclick focuses /installments, or moves another window there, or opens it', async () => {
  const click = (data) => ({ notification: { data, close() { this.closed = true; } } });

  const onPage = loadWorker({ windows: [{ url: 'https://aqsati.test/app' }, { url: 'https://aqsati.test/installments' }] });
  const ev = click({ url: '/installments' });
  await onPage.fire('notificationclick', ev);
  assert.deepEqual(onPage.calls.focus, ['https://aqsati.test/installments']);
  assert.deepEqual(onPage.calls.navigate, []);
  assert.deepEqual(onPage.calls.openWindow, []);

  const other = loadWorker({ windows: [{ url: 'https://aqsati.test/app' }] });
  await other.fire('notificationclick', click({ url: '/installments' }));
  assert.deepEqual(other.calls.focus, ['https://aqsati.test/app']);
  assert.deepEqual(other.calls.navigate, ['https://aqsati.test/installments']);
  assert.deepEqual(other.calls.openWindow, []);

  const none = loadWorker({ windows: [] });
  await none.fire('notificationclick', click({ url: '//evil.example/x' }));
  assert.deepEqual(none.calls.openWindow, ['https://aqsati.test/installments'], 'only same-origin paths');
});
