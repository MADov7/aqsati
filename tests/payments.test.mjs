// Backend: salary day, payment marks (aqsati_mark_paid), cascade on remove, guest merge of payments,
// auth_change_password and auth_delete_account — incl. cross-owner isolation and 'not logged in' paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, ensureIndexes, userOwner, isDuplicateKey, PAYMENT_MONTHS_BACK, PAYMENT_MONTHS_AHEAD,
} from '../lib/store.js';
import { createAuth, sha256hex, MAX_FAILS_PER_EMAIL, ATTEMPT_WINDOW_MS } from '../lib/auth.js';
import rpcHandler, { handleRpc } from '../lib/rpc.js';
import { createMemoryDb } from '../lib/memorydb.js';
import { firstDueDate, todayISO } from '../public/calc.js';

const DAY = 24 * 60 * 60 * 1000;
const GUEST = '11111111-2222-4333-8444-555555555555';
const GUEST2 = '22222222-2222-4333-8444-555555555555';
const MISSING_ID = '33333333-2222-4333-8444-555555555555';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EMPTY = { profile: null, installments: [], payments: [] };

// A fresh in-memory app; the clock starts on 15 Nov 2026 (so "this month" is 2026-11) and moves 1 ms per call.
async function setup() {
  let t = Date.UTC(2026, 10, 15, 9, 0, 0);
  const clock = { now: () => new Date((t += 1)), advance: (ms) => { t += ms; } };
  const db = createMemoryDb();
  await ensureIndexes(db);
  const store = createStore(db, { now: clock.now });
  const auth = createAuth(db, { now: clock.now, scryptCost: 1024 }); // cheap hashes keep the suite fast
  // One RPC call → { result, cookie }; cookie is undefined (untouched), a token (set) or null (cleared).
  const call = async (fn, args = {}, { session = null, ip = '10.0.0.1' } = {}) => {
    let cookie;
    const result = await handleRpc({ fn, args }, {
      store, auth, sessionToken: session, ip, setSession: (tok) => { cookie = tok; },
    });
    return { result, cookie };
  };
  // Same, for calls expected to fail: → { error, cookie }.
  const fail = async (fn, args = {}, opts = {}) => {
    let cookie;
    try {
      await handleRpc({ fn, args }, {
        store, auth, sessionToken: opts.session ?? null, ip: opts.ip ?? '10.0.0.1', setSession: (tok) => { cookie = tok; },
      });
    } catch (error) {
      return { error, cookie };
    }
    throw new Error(`${fn} should have failed`);
  };
  return { db, store, auth, clock, call, fail };
}

const inst = (provider) => ({
  p_provider: provider, p_title: '', p_monthly: 10, p_due_day: 20, p_remaining: 3, p_first_due: '2026-11-20',
});
const pairs = (payments) => payments.map((p) => [p.installment_id, p.month]);
const months = (payments) => payments.map((p) => p.month);

// ---------- salary day ----------

test('salary_day: saved, cleared, kept when not sent', async () => {
  const { call } = await setup();
  const save = async (extra) => (await call('aqsati_save', { p_token: GUEST, p_salary: 1200, p_safe_limit: 40, ...extra })).result;

  assert.deepEqual((await save({})).profile, { salary: 1200, safe_limit: 40, salary_day: null }, 'no salary day yet');
  assert.equal((await save({ p_salary_day: 25 })).profile.salary_day, 25);
  const kept = (await call('aqsati_save', { p_token: GUEST, p_salary: 1300, p_safe_limit: 35 })).result;
  assert.deepEqual(kept.profile, { salary: 1300, safe_limit: 35, salary_day: 25 }, 'not sent → the stored day is kept');

  for (const [input, want] of [['١', 1], [' 31 ', 31], ['٢٧', 27], [28, 28], ['7', 7]]) {
    assert.equal((await save({ p_salary_day: input })).profile.salary_day, want, JSON.stringify(input));
  }
  assert.equal((await save({ p_salary_day: null })).profile.salary_day, null, 'null clears it');
  await save({ p_salary_day: 10 });
  assert.equal((await save({ p_salary_day: '  ' })).profile.salary_day, null, 'an empty field clears it');
});

test('salary_day: anything but a whole day 1..31 → invalid salary day, and nothing is saved', async () => {
  const { call, store } = await setup();
  await call('aqsati_save', { p_token: GUEST, p_salary: 900, p_safe_limit: 40, p_salary_day: 5 });
  for (const bad of [0, 32, -1, 1.5, '1.5', 'abc', '15th', '1e1', Infinity, NaN, true, false, { $gt: 0 }, [5], {}]) {
    await assert.rejects(call('aqsati_save', { p_token: GUEST, p_salary: 2000, p_safe_limit: 50, p_salary_day: bad }),
      { message: 'invalid salary day', status: 400 }, String(bad));
  }
  assert.deepEqual((await store.state(GUEST)).profile, { salary: 900, safe_limit: 40, salary_day: 5 });
  await assert.rejects(call('aqsati_save', { p_token: GUEST, p_salary: 0, p_safe_limit: 40, p_salary_day: 5 }), { message: 'invalid salary' });
});

// ---------- aqsati_mark_paid ----------

test('mark paid: mark, mark again (idempotent), unmark — STATE.payments', async () => {
  const { call, db } = await setup();
  const added = (await call('aqsati_add', { p_token: GUEST, ...inst('تابي') })).result;
  assert.deepEqual(added.payments, []);
  const id = added.installments[0].id;
  const mark = async (month, paid, token = GUEST, pid = id) =>
    (await call('aqsati_mark_paid', { p_token: token, p_id: pid, p_month: month, p_paid: paid })).result;

  let s = await mark('2026-11', true);
  assert.equal(s.user, null);
  assert.equal(s.payments.length, 1);
  const [row] = s.payments;
  assert.deepEqual(Object.keys(row).sort(), ['installment_id', 'month', 'paid_at']);
  assert.deepEqual([row.installment_id, row.month], [id, '2026-11']);
  assert.match(row.paid_at, ISO_TIME);

  s = await mark('2026-11', true);
  assert.deepEqual(s.payments, [row], 'marking twice keeps one row and the first paid_at');
  const payments = db.collection('payments');
  assert.equal(await payments.countDocuments({}), 1);
  assert.deepEqual(
    await payments.findOne({}),
    { _id: `${GUEST}|${id}|2026-11`, token: GUEST, installmentId: id, month: '2026-11', paidAt: new Date(row.paid_at) },
  );

  s = await mark('2026-10', true, GUEST.toUpperCase(), id.toUpperCase());
  assert.deepEqual(months(s.payments), ['2026-10', '2026-11'], 'upper-case ids are normalised; sorted by month');

  s = await mark('2026-11', false);
  assert.deepEqual(months(s.payments), ['2026-10']);
  s = await mark('2026-11', false);
  assert.deepEqual(months(s.payments), ['2026-10'], 'unmarking twice is harmless');
  assert.equal(await payments.countDocuments({}), 1);
});

test('mark paid validates the month window, the id and the paid flag', async () => {
  const { call, db } = await setup();
  const id = (await call('aqsati_add', { p_token: GUEST, ...inst('تمارا') })).result.installments[0].id;
  const mark = (extra) => call('aqsati_mark_paid', { p_token: GUEST, p_id: id, p_month: '2026-11', p_paid: true, ...extra });

  assert.equal(PAYMENT_MONTHS_BACK, 24);
  assert.equal(PAYMENT_MONTHS_AHEAD, 1);
  // today is 2026-11: 24 months back = 2024-11, 1 month ahead = 2026-12
  for (const ok of ['2024-11', '2026-12', '2025-06']) await mark({ p_month: ok });
  for (const p_month of ['2024-10', '2027-01', '2030-01', '1999-12']) {
    await assert.rejects(mark({ p_month }), { message: 'invalid month', status: 400 }, p_month);
  }
  for (const p_month of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', '2026/11', ' 2026-11', '٢٠٢٦-١١',
    202611, null, undefined, { $gte: '' }, ['2026-11'], true]) {
    await assert.rejects(mark({ p_month }), { message: 'invalid month' }, JSON.stringify(p_month));
  }
  for (const p_id of [undefined, null, '', 'abc', 42, { $ne: null }, [id], `${id}x`, `u:${id}`, '33333333-2222-1333-8444-555555555555']) {
    await assert.rejects(mark({ p_id }), { message: 'token and id required' }, JSON.stringify(p_id));
  }
  for (const p_paid of ['true', 1, 0, null, undefined, {}, [], 'yes']) {
    await assert.rejects(mark({ p_paid }), { message: 'invalid paid' }, JSON.stringify(p_paid));
  }
  await assert.rejects(mark({ p_token: undefined }), { message: 'token required' });
  await assert.rejects(mark({ p_token: { $ne: null } }), { message: 'token required' });
  assert.equal(await db.collection('payments').countDocuments({}), 3, 'only the three valid marks were written');
});

test('mark paid only touches MY installments — other accounts and guests change nothing', async () => {
  const { call, db, fail } = await setup();
  const a = await call('auth_signup', { email: 'pa@x.com', password: 'password-a' });
  const b = await call('auth_signup', { email: 'pb@x.com', password: 'password-b' });
  const mine = (await call('aqsati_add', inst('تابي'), { session: a.cookie })).result.installments[0].id;
  await call('aqsati_mark_paid', { p_id: mine, p_month: '2026-11', p_paid: true }, { session: a.cookie });

  const bInst = (await call('aqsati_add', inst('ديما'), { session: b.cookie })).result.installments[0].id;
  await call('aqsati_mark_paid', { p_id: bInst, p_month: '2026-11', p_paid: true }, { session: b.cookie });

  for (const who of [{ session: b.cookie }, {}]) { // another account, then a guest
    const args = { p_token: GUEST, p_id: mine, p_month: '2026-10', p_paid: true };
    const out = (await call('aqsati_mark_paid', args, who)).result;
    assert.ok(out.payments.every((p) => p.installment_id !== mine), 'my rows never show up for them');
    await call('aqsati_mark_paid', { ...args, p_month: '2026-11', p_paid: false }, who);
  }
  await call('aqsati_mark_paid', { p_id: MISSING_ID, p_month: '2026-11', p_paid: true }, { session: a.cookie });

  const seenByA = (await call('aqsati_state', {}, { session: a.cookie })).result;
  assert.deepEqual(pairs(seenByA.payments), [[mine, '2026-11']], 'my mark survived; no foreign or ghost marks');
  const seenByB = (await call('aqsati_state', {}, { session: b.cookie })).result;
  assert.deepEqual(pairs(seenByB.payments), [[bInst, '2026-11']]);
  assert.deepEqual((await call('aqsati_state', { p_token: GUEST })).result, { ...EMPTY, user: null });
  assert.equal(await db.collection('payments').countDocuments({}), 2);

  const owner = await db.collection('users').findOne({ email: 'pa@x.com' });
  const { error } = await fail('aqsati_mark_paid', { p_token: `u:${owner._id}`, p_id: mine, p_month: '2026-11', p_paid: false });
  assert.equal(error.message, 'token required', 'a guest cannot claim an account key');
  assert.equal(await db.collection('payments').countDocuments({}), 2);
});

test('STATE lists only the last 24 months of payments', async () => {
  const { call, db, clock } = await setup();
  const id = (await call('aqsati_add', { p_token: GUEST, ...inst('تابي') })).result.installments[0].id;
  for (const month of ['2024-11', '2026-11', '2026-12']) {
    await call('aqsati_mark_paid', { p_token: GUEST, p_id: id, p_month: month, p_paid: true });
  }
  // a very old row (e.g. written long ago) is stored but never listed
  await db.collection('payments').insertOne({ _id: `${GUEST}|${id}|2024-01`, token: GUEST, installmentId: id, month: '2024-01', paidAt: new Date() });

  assert.deepEqual(months((await call('aqsati_state', { p_token: GUEST })).result.payments), ['2024-11', '2026-11', '2026-12']);
  clock.advance(40 * DAY); // → 25 Dec 2026: 2024-11 is now 25 months back
  assert.deepEqual(months((await call('aqsati_state', { p_token: GUEST })).result.payments), ['2026-11', '2026-12']);
  await assert.rejects(call('aqsati_mark_paid', { p_token: GUEST, p_id: id, p_month: '2024-11', p_paid: false }), { message: 'invalid month' });
  await call('aqsati_mark_paid', { p_token: GUEST, p_id: id, p_month: '2027-01', p_paid: true });
  assert.deepEqual(months((await call('aqsati_state', { p_token: GUEST })).result.payments), ['2026-11', '2026-12', '2027-01']);
});

test('mark paid racing a remove of the same installment leaves no orphan row', async () => {
  const { store, db } = await setup();
  const row = { provider: 'تابي', title: '', monthly: 5, dueDay: 20, remaining: 2, firstDue: '2026-11-20' };
  const id = (await store.add(GUEST, row)).installments[0].id;
  const payments = db.collection('payments');
  const installments = db.collection('installments');
  // The installment disappears right after markPaid's ownership check (a parallel aqsati_remove).
  const realFindOne = installments.findOne;
  let calls = 0;
  installments.findOne = async (filter) => {
    const found = await realFindOne.call(installments, filter);
    if (++calls === 1) await store.remove(GUEST, id);
    return found;
  };
  try {
    const s = await store.markPaid(GUEST, id, '2026-11', true);
    assert.deepEqual([s.installments, s.payments], [[], []]);
  } finally {
    installments.findOne = realFindOne;
  }
  assert.equal(await payments.countDocuments({}), 0, 'the row written after the remove is cleaned up');
});

// ---------- aqsati_remove cascades ----------

test('removing an installment deletes its payments — only its own, and only by its owner', async () => {
  const { call, db } = await setup();
  const add = async (token, name) => (await call('aqsati_add', { p_token: token, ...inst(name) })).result.installments.at(-1).id;
  const mark = (token, id, month) => call('aqsati_mark_paid', { p_token: token, p_id: id, p_month: month, p_paid: true });
  const id1 = await add(GUEST, 'تابي');
  const id2 = await add(GUEST, 'تمارا');
  const id3 = await add(GUEST2, 'ديما');
  await mark(GUEST, id1, '2026-10');
  await mark(GUEST, id1, '2026-11');
  await mark(GUEST, id2, '2026-11');
  await mark(GUEST2, id3, '2026-11');
  const payments = db.collection('payments');

  await call('aqsati_remove', { p_token: GUEST2, p_id: id1 });
  assert.equal(await payments.countDocuments({ installmentId: id1 }), 2, 'another owner cannot wipe my marks');
  assert.equal((await call('aqsati_state', { p_token: GUEST })).result.installments.length, 2);

  const s = (await call('aqsati_remove', { p_token: GUEST, p_id: id1 })).result;
  assert.deepEqual(s.installments.map((i) => i.id), [id2]);
  assert.deepEqual(pairs(s.payments), [[id2, '2026-11']]);
  assert.equal(await payments.countDocuments({ installmentId: id1 }), 0);
  assert.equal(await payments.countDocuments({ token: GUEST2 }), 1, "other owners' marks stay");
});

// ---------- guest merge moves payments ----------

test('signup moves the guest payment marks (and salary day) into the account', async () => {
  const { call, db, store } = await setup();
  await call('aqsati_save', { p_token: GUEST, p_salary: 1000, p_safe_limit: 35, p_salary_day: 27 });
  const idA = (await call('aqsati_add', { p_token: GUEST, ...inst('تابي') })).result.installments[0].id;
  const idB = (await call('aqsati_add', { p_token: GUEST, ...inst('تمارا') })).result.installments[1].id;
  for (const [id, month] of [[idA, '2026-10'], [idA, '2026-11'], [idB, '2026-11']]) {
    await call('aqsati_mark_paid', { p_token: GUEST, p_id: id, p_month: month, p_paid: true });
  }
  const before = (await store.state(GUEST)).payments;

  const su = await call('auth_signup', { email: 'mv@x.com', password: 'password-ok', p_token: GUEST });
  assert.deepEqual(su.result.profile, { salary: 1000, safe_limit: 35, salary_day: 27 });
  assert.deepEqual(su.result.payments, before, 'same rows, same paid_at');
  assert.deepEqual(await store.state(GUEST), EMPTY, 'nothing left under the guest key');

  const payments = db.collection('payments');
  assert.equal(await payments.countDocuments({ token: GUEST }), 0);
  const user = await db.collection('users').findOne({ email: 'mv@x.com' });
  const owner = userOwner(user._id);
  const owned = await payments.find({ token: owner }).toArray();
  assert.equal(owned.length, 3);
  assert.ok(owned.every((d) => d._id === `${owner}|${d.installmentId}|${d.month}`), 'rows are re-keyed to the account');

  const after = await call('aqsati_mark_paid', { p_id: idA, p_month: '2026-11', p_paid: false }, { session: su.cookie });
  assert.deepEqual(pairs(after.result.payments), [[idA, '2026-10'], [idB, '2026-11']], 'the account can edit moved marks');
});

test('guest merge past the 50 cap: marks stay with the installments that stay', async () => {
  const { call, store } = await setup();
  const { cookie } = await call('auth_signup', { email: 'cap2@x.com', password: 'password-ok' });
  for (let i = 0; i < 49; i++) await call('aqsati_add', inst(`acc${i}`), { session: cookie });
  const old = (await call('aqsati_add', { p_token: GUEST2, ...inst('old') })).result.installments[0].id;
  const neu = (await call('aqsati_add', { p_token: GUEST2, ...inst('new') })).result.installments[1].id;
  for (const id of [old, neu]) await call('aqsati_mark_paid', { p_token: GUEST2, p_id: id, p_month: '2026-11', p_paid: true });

  const login = await call('auth_login', { email: 'cap2@x.com', password: 'password-ok', p_token: GUEST2 });
  assert.equal(login.result.installments.length, 50);
  assert.deepEqual(pairs(login.result.payments), [[old, '2026-11']]);
  const left = await store.state(GUEST2);
  assert.deepEqual(left.installments.map((i) => i.id), [neu]);
  assert.deepEqual(pairs(left.payments), [[neu, '2026-11']]);
});

test('merge skips rows the account already has and survives a parallel copy', async () => {
  let t = Date.UTC(2026, 10, 15, 9, 0, 0);
  const now = () => new Date((t += 1));
  const db = createMemoryDb();
  await ensureIndexes(db);
  const store = createStore(db, { now });
  const owner = userOwner('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  const payments = db.collection('payments');
  const row = { provider: 'تابي', title: '', monthly: 5, dueDay: 20, remaining: 2, firstDue: '2026-11-20' };

  const id = (await store.add(GUEST, row)).installments[0].id;
  await store.markPaid(GUEST, id, '2026-10', true);
  await store.markPaid(GUEST, id, '2026-11', true);
  // an earlier, half-finished merge already copied one row
  await payments.insertOne({ _id: `${owner}|${id}|2026-11`, token: owner, installmentId: id, month: '2026-11', paidAt: new Date(0) });
  assert.deepEqual(await store.mergeGuest(GUEST, owner), { installments: 1, payments: 2, profile: false });
  let s = await store.state(owner);
  assert.deepEqual(months(s.payments), ['2026-10', '2026-11']);
  assert.equal(s.payments[1].paid_at, new Date(0).toISOString(), 'the row it already had is kept as it was');
  assert.equal(await payments.countDocuments({ token: GUEST }), 0);

  // a parallel merge inserts a row between our existence check and our insert → duplicate key is tolerated
  const id2 = (await store.add(GUEST2, row)).installments[0].id;
  await store.markPaid(GUEST2, id2, '2026-09', true);
  await store.markPaid(GUEST2, id2, '2026-10', true);
  const realInsertMany = payments.insertMany;
  payments.insertMany = async (docs, opts) => {
    await payments.insertOne({ ...docs[0] });
    return realInsertMany.call(payments, docs, opts);
  };
  try {
    assert.deepEqual(await store.mergeGuest(GUEST2, owner), { installments: 1, payments: 2, profile: false });
  } finally {
    payments.insertMany = realInsertMany;
  }
  s = await store.state(owner);
  // STATE sorts by month, then installment id (ids are random uuids, so build the expected order the same way)
  const byMonthThenId = (a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : (a[1] < b[1] ? -1 : 1));
  const want = [[id2, '2026-09'], [id, '2026-10'], [id2, '2026-10'], [id, '2026-11']].sort(byMonthThenId);
  assert.deepEqual(pairs(s.payments), want);
  assert.equal(await payments.countDocuments({ token: GUEST2 }), 0);
});

// ---------- auth_change_password ----------

test("auth_change_password: no session / a dead cookie → 'not logged in' (and the dead cookie is cleared)", async () => {
  const { call, fail } = await setup();
  let r = await fail('auth_change_password', { current_password: 'x-password', new_password: 'new-password' });
  assert.deepEqual([r.error.message, r.error.status, r.cookie], ['not logged in', 400, undefined]);

  r = await fail('auth_change_password', { current_password: 'x-password', new_password: 'new-password' }, { session: 'forged-or-garbage' });
  assert.deepEqual([r.error.message, r.cookie], ['not logged in', null]);

  const { cookie } = await call('auth_signup', { email: 'gone@x.com', password: 'password-ok' });
  await call('auth_logout', {}, { session: cookie });
  r = await fail('auth_change_password', { current_password: 'password-ok', new_password: 'new-password' }, { session: cookie });
  assert.deepEqual([r.error.message, r.cookie], ['not logged in', null], 'a logged-out cookie is not a session');
  assert.ok((await call('auth_login', { email: 'gone@x.com', password: 'password-ok' })).cookie, 'the password did not change');
});

test('auth_change_password: wrong current → invalid credentials; weak new → weak password (no attempt used)', async () => {
  const { call, db } = await setup();
  const { cookie } = await call('auth_signup', { email: 'cp@x.com', password: 'old-password' });
  const change = (current_password, new_password) =>
    call('auth_change_password', { current_password, new_password }, { session: cookie });

  for (const current of ['wrong-password', null, { $ne: '' }, 'x'.repeat(201)]) {
    await assert.rejects(change(current, 'new-password'), { message: 'invalid credentials', status: 400 }, JSON.stringify(current));
  }
  const attempts = db.collection('login_attempts');
  assert.equal((await attempts.findOne({ _id: 'e:cp@x.com' })).count, 4, 'counted on the same email counter as login');

  for (const next of ['short', 'x'.repeat(201), 12345678, null, undefined, { $gt: '' }, ['new-password']]) {
    await assert.rejects(change('old-password', next), { message: 'weak password' }, JSON.stringify(next));
  }
  assert.equal((await attempts.findOne({ _id: 'e:cp@x.com' })).count, 4, 'a weak new password uses no attempt');
  assert.ok((await call('auth_login', { email: 'cp@x.com', password: 'old-password' })).cookie, 'nothing changed');
});

test('auth_change_password: keeps this session, signs out my other devices, swaps the password', async () => {
  const { call, auth, db } = await setup();
  const phone = await call('auth_signup', { email: 'ch@x.com', password: 'old-password' });
  const laptop = await call('auth_login', { email: 'ch@x.com', password: 'old-password' });
  const someoneElse = await call('auth_signup', { email: 'else@x.com', password: 'else-password' });
  await call('aqsati_save', { p_salary: 800, p_safe_limit: 40, p_salary_day: 26 }, { session: phone.cookie });
  const id = (await call('aqsati_add', inst('تابي'), { session: phone.cookie })).result.installments[0].id;
  await call('aqsati_mark_paid', { p_id: id, p_month: '2026-11', p_paid: true }, { session: phone.cookie });
  const oldHash = (await db.collection('users').findOne({ email: 'ch@x.com' })).passwordHash;

  const out = await call('auth_change_password', { current_password: 'old-password', new_password: 'new-password-1' }, { session: phone.cookie });
  assert.equal(out.cookie, undefined, 'the session cookie is left alone');
  assert.deepEqual(out.result.user, { email: 'ch@x.com' });
  assert.deepEqual(out.result.profile, { salary: 800, safe_limit: 40, salary_day: 26 });
  assert.equal(out.result.installments.length, 1);
  assert.deepEqual(pairs(out.result.payments), [[id, '2026-11']], 'answers the full STATE');

  assert.equal((await auth.sessionUser(phone.cookie))?.email, 'ch@x.com', 'this device stays signed in');
  assert.equal(await auth.sessionUser(laptop.cookie), null, 'other devices are signed out');
  assert.equal((await auth.sessionUser(someoneElse.cookie))?.email, 'else@x.com', "other users' sessions are untouched");

  const user = await db.collection('users').findOne({ email: 'ch@x.com' });
  assert.notEqual(user.passwordHash, oldHash);
  assert.match(user.passwordHash, /^scrypt\$/);
  assert.ok(!user.passwordHash.includes('new-password-1'));
  await assert.rejects(call('auth_login', { email: 'ch@x.com', password: 'old-password' }), { message: 'invalid credentials' });
  assert.match((await call('auth_login', { email: 'ch@x.com', password: 'new-password-1' })).cookie, TOKEN_SHAPE);
  assert.equal(await db.collection('sessions').countDocuments({ userId: user._id, _id: sha256hex(laptop.cookie) }), 0);
});

test('change password and delete account share the login rate limit for the email', async () => {
  const { call, clock } = await setup();
  const { cookie } = await call('auth_signup', { email: 'rl@x.com', password: 'right-password' });
  for (let i = 0; i < MAX_FAILS_PER_EMAIL; i++) {
    const ip = `10.2.0.${i}`;
    const attempt = i % 3 === 0
      ? call('auth_login', { email: 'rl@x.com', password: 'wrong-password' }, { ip })
      : i % 3 === 1
        ? call('auth_change_password', { current_password: 'wrong-password', new_password: 'new-password' }, { session: cookie, ip })
        : call('auth_delete_account', { password: 'wrong-password' }, { session: cookie, ip });
    await assert.rejects(attempt, { message: 'invalid credentials' }, String(i));
  }
  const tooMany = { message: 'too many attempts', status: 429 };
  await assert.rejects(call('auth_change_password', { current_password: 'right-password', new_password: 'new-password' }, { session: cookie }), tooMany);
  await assert.rejects(call('auth_delete_account', { password: 'right-password' }, { session: cookie }), tooMany);
  await assert.rejects(call('auth_login', { email: 'rl@x.com', password: 'right-password' }), tooMany);

  clock.advance(ATTEMPT_WINDOW_MS + 1000);
  const ok = await call('auth_change_password', { current_password: 'right-password', new_password: 'new-password' }, { session: cookie });
  assert.deepEqual(ok.result.user, { email: 'rl@x.com' });
});

// ---------- auth_delete_account ----------

test("auth_delete_account: needs a session ('not logged in') and the right password", async () => {
  const { call, fail, db, auth } = await setup();
  let r = await fail('auth_delete_account', { password: 'password-ok' });
  assert.deepEqual([r.error.message, r.error.status, r.cookie], ['not logged in', 400, undefined]);
  r = await fail('auth_delete_account', { password: 'password-ok' }, { session: 'x'.repeat(43) });
  assert.deepEqual([r.error.message, r.cookie], ['not logged in', null]);

  const { cookie } = await call('auth_signup', { email: 'keepme@x.com', password: 'password-ok' });
  await call('aqsati_add', inst('تابي'), { session: cookie });
  for (const password of ['wrong-password', undefined, 12345678, { $ne: '' }]) {
    r = await fail('auth_delete_account', { password }, { session: cookie });
    assert.deepEqual([r.error.message, r.cookie], ['invalid credentials', undefined], JSON.stringify(password));
  }
  assert.ok(await db.collection('users').findOne({ email: 'keepme@x.com' }), 'the account is still there');
  assert.equal((await auth.sessionUser(cookie))?.email, 'keepme@x.com', 'and still signed in');
  assert.equal((await call('aqsati_state', {}, { session: cookie })).result.installments.length, 1, 'with its data');
});

test('auth_delete_account: deletes the user, every session and all their data — nobody else\'s', async () => {
  const { call, auth, db, store } = await setup();
  const a = await call('auth_signup', { email: 'del@x.com', password: 'password-del' });
  const a2 = await call('auth_login', { email: 'del@x.com', password: 'password-del' });
  const b = await call('auth_signup', { email: 'keep@x.com', password: 'password-keep' });
  const fill = async (opts, token) => {
    await call('aqsati_save', { p_token: token, p_salary: 900, p_safe_limit: 40, p_salary_day: 1 }, opts);
    const id = (await call('aqsati_add', { p_token: token, ...inst('تابي') }, opts)).result.installments[0].id;
    await call('aqsati_add', { p_token: token, ...inst('تمارا') }, opts);
    await call('aqsati_mark_paid', { p_token: token, p_id: id, p_month: '2026-11', p_paid: true }, opts);
  };
  await fill({ session: a.cookie });
  await fill({ session: b.cookie });
  await fill({}, GUEST);
  const aUser = await db.collection('users').findOne({ email: 'del@x.com' });
  const owner = userOwner(aUser._id);

  const out = await call('auth_delete_account', { password: 'password-del' }, { session: a.cookie });
  assert.deepEqual(out.result, { profile: null, installments: [], payments: [], user: null });
  assert.equal(out.cookie, null, 'the cookie is cleared');

  assert.equal(await db.collection('users').findOne({ email: 'del@x.com' }), null);
  assert.equal(await auth.sessionUser(a.cookie), null);
  assert.equal(await auth.sessionUser(a2.cookie), null, 'every device is signed out');
  assert.equal(await db.collection('sessions').countDocuments({ userId: aUser._id }), 0);
  assert.deepEqual(await store.state(owner), EMPTY);
  for (const name of ['installments', 'payments']) {
    assert.equal(await db.collection(name).countDocuments({ token: owner }), 0, name);
  }
  assert.equal(await db.collection('profiles').findOne({ _id: owner }), null);

  const bState = (await call('aqsati_state', {}, { session: b.cookie })).result;
  assert.deepEqual([bState.installments.length, bState.payments.length, bState.profile.salary_day], [2, 1, 1], 'other accounts keep everything');
  const gState = await store.state(GUEST);
  assert.deepEqual([gState.installments.length, gState.payments.length], [2, 1], 'guests keep everything');

  const dead = await call('aqsati_state', { p_token: GUEST2 }, { session: a.cookie });
  assert.deepEqual([dead.result.user, dead.cookie], [null, null], 'the old cookie is dead and gets cleared');
  await assert.rejects(call('auth_login', { email: 'del@x.com', password: 'password-del' }), { message: 'invalid credentials' });
  const again = await call('auth_signup', { email: 'del@x.com', password: 'another-password' });
  assert.deepEqual(again.result, { ...EMPTY, user: { email: 'del@x.com' } }, 'the email can start fresh');
});

// ---------- HTTP layer (memory mode) ----------

function fakeReq({ headers = {}, body } = {}) {
  const raw = JSON.stringify(body);
  return {
    method: 'POST',
    headers: { host: 'localhost:3000', 'content-type': 'application/json', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    async* [Symbol.asyncIterator]() { yield Buffer.from(raw); },
  };
}

async function hit(opts) {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b === undefined ? undefined : JSON.parse(b); },
  };
  await rpcHandler(fakeReq(opts), res);
  return res;
}

test('HTTP (memory mode): mark paid → change password → delete account', async () => {
  const savedEnv = process.env.AQSATI_MEMORY_DB;
  const savedVercel = process.env.VERCEL;
  const realWarn = console.warn;
  process.env.AQSATI_MEMORY_DB = '1';
  delete process.env.VERCEL;
  console.warn = () => {};
  try {
    let res = await hit({ body: { fn: 'auth_change_password', args: { current_password: 'a-password', new_password: 'b-password' } } });
    assert.deepEqual([res.statusCode, res.body], [400, { message: 'not logged in' }]);
    res = await hit({ body: { fn: 'auth_delete_account', args: { password: 'a-password' } } });
    assert.deepEqual([res.statusCode, res.body], [400, { message: 'not logged in' }]);

    res = await hit({ body: { fn: 'auth_signup', args: { email: 'http-pay@x.com', password: 'a-password' } } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.payments, []);
    const token = /^aqsati_session=([^;]*)/.exec(res.headers['set-cookie'])[1];
    const cookie = { cookie: `aqsati_session=${token}` };

    // this test runs on the real clock, so "today" and "this month" come from it
    const today = todayISO();
    const thisMonth = today.slice(0, 7);
    res = await hit({ headers: cookie, body: { fn: 'aqsati_add', args: { ...inst('تابي'), p_first_due: firstDueDate(20, today) } } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const id = res.body.installments[0].id;
    res = await hit({ headers: cookie, body: { fn: 'aqsati_mark_paid', args: { p_id: id, p_month: thisMonth, p_paid: true } } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.payments.map((p) => [p.installment_id, p.month]), [[id, thisMonth]]);
    res = await hit({ headers: cookie, body: { fn: 'aqsati_mark_paid', args: { p_id: id, p_month: '2026-13', p_paid: true } } });
    assert.deepEqual([res.statusCode, res.body], [400, { message: 'invalid month' }]);

    res = await hit({ headers: cookie, body: { fn: 'auth_change_password', args: { current_password: 'nope-nope', new_password: 'b-password' } } });
    assert.deepEqual([res.statusCode, res.body], [400, { message: 'invalid credentials' }]);
    res = await hit({ headers: cookie, body: { fn: 'auth_change_password', args: { current_password: 'a-password', new_password: 'b-password' } } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.user, { email: 'http-pay@x.com' });
    assert.equal(res.headers['set-cookie'], undefined, 'the session cookie stays');

    res = await hit({ headers: { ...cookie, 'x-forwarded-proto': 'https' }, body: { fn: 'auth_delete_account', args: { password: 'b-password' } } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { profile: null, installments: [], payments: [], user: null });
    assert.equal(res.headers['set-cookie'], 'aqsati_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure');

    res = await hit({ headers: cookie, body: { fn: 'auth_delete_account', args: { password: 'b-password' } } });
    assert.deepEqual([res.statusCode, res.body], [400, { message: 'not logged in' }]);
    assert.match(res.headers['set-cookie'], /Max-Age=0/);

    res = await hit({ body: { fn: 'auth_logout', args: {} } });
    assert.deepEqual(res.body, { profile: null, installments: [], payments: [], user: null });
  } finally {
    console.warn = realWarn;
    if (savedEnv === undefined) delete process.env.AQSATI_MEMORY_DB;
    else process.env.AQSATI_MEMORY_DB = savedEnv;
    if (savedVercel !== undefined) process.env.VERCEL = savedVercel;
  }
});

// ---------- helpers: indexes, duplicate detection, memorydb.insertMany ----------

test('ensureIndexes adds the payments and sessions.userId indexes', async () => {
  const made = [];
  const fakeDb = { collection: (name) => ({ createIndex: async (spec, opts) => { made.push([name, spec, opts]); } }) };
  await ensureIndexes(fakeDb);
  assert.ok(made.some(([n, s]) => n === 'payments' && JSON.stringify(s) === '{"token":1,"month":1}'));
  assert.ok(made.some(([n, s]) => n === 'sessions' && JSON.stringify(s) === '{"userId":1}'));
  assert.ok(made.some(([n, s, o]) => n === 'users' && o?.unique), 'existing indexes are still there');
});

test('isDuplicateKey recognises E11000 and all-duplicate bulk errors only', () => {
  assert.equal(isDuplicateKey({ code: 11000 }), true);
  assert.equal(isDuplicateKey({ writeErrors: [{ code: 11000 }, { code: 11000 }] }), true);
  assert.equal(isDuplicateKey({ writeErrors: [{ code: 11000 }, { code: 121 }] }), false);
  assert.equal(isDuplicateKey({ writeErrors: [] }), false);
  assert.equal(isDuplicateKey(new Error('boom')), false);
  assert.equal(isDuplicateKey(undefined), false);
});

test('memorydb insertMany: ordered stops at the first duplicate, unordered inserts the rest', async () => {
  const c = createMemoryDb().collection('p');
  assert.deepEqual(await c.insertMany([{ _id: 'a' }, { _id: 'b' }]), { acknowledged: true, insertedCount: 2, insertedIds: { 0: 'a', 1: 'b' } });

  await assert.rejects(c.insertMany([{ _id: 'c' }, { _id: 'a' }, { _id: 'd' }]), (e) =>
    e.code === 11000 && e.insertedCount === 1 && e.writeErrors.length === 1 && e.writeErrors[0].index === 1);
  assert.equal(await c.findOne({ _id: 'd' }), null, 'ordered: nothing after the duplicate');

  await assert.rejects(c.insertMany([{ _id: 'b' }, { _id: 'e' }, { _id: 'a' }, { _id: 'f' }], { ordered: false }), (e) =>
    e.code === 11000 && e.insertedCount === 2 && e.writeErrors.map((w) => w.index).join() === '0,2');
  assert.deepEqual((await c.find({}).sort({ _id: 1 }).toArray()).map((d) => d._id), ['a', 'b', 'c', 'e', 'f']);

  const docs = [{ _id: 'g', n: 1 }];
  await c.insertMany(docs);
  docs[0].n = 2;
  assert.equal((await c.findOne({ _id: 'g' })).n, 1, 'stored copies, not the caller objects');
  await assert.rejects(c.insertMany([]), /non-empty array/);
  await assert.rejects(c.insertMany([1]), /non-empty array/);
});
