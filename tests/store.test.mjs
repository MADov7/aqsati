import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, InputError, userOwner } from '../lib/store.js';
import { createAuth } from '../lib/auth.js';
import { handleRpc } from '../lib/rpc.js';
import { createMemoryDb } from '../lib/memorydb.js';

const TOKEN = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const ACCOUNT = userOwner('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
let clock = Date.UTC(2026, 10, 15, 9, 0, 0);
const now = () => new Date((clock += 1000));

test('state of a new token is empty', async () => {
  const store = createStore(createMemoryDb(), { now });
  assert.deepEqual(await store.state(TOKEN), { profile: null, installments: [], payments: [] });
});

test('save, add, list in order, remove — and tokens never see each other', async () => {
  const db = createMemoryDb();
  const store = createStore(db, { now });
  let s = await store.save(TOKEN, { salary: 1200, safeLimit: 40 });
  assert.deepEqual(s.profile, { salary: 1200, safe_limit: 40, salary_day: null });

  s = await store.add(TOKEN, { provider: ' تابي ', title: 'آيفون', monthly: '45.5', dueDay: 25, remaining: 3, firstDue: '2026-11-25' });
  s = await store.add(TOKEN, { provider: 'قرض بنك', title: '', monthly: 250, dueDay: 1, remaining: 24, firstDue: '2026-12-01' });
  assert.equal(s.installments.length, 2);
  assert.equal(s.installments[0].provider, 'تابي');
  assert.equal(s.installments[0].monthly_amount, 45.5);
  assert.equal(s.installments[1].first_due_date, '2026-12-01');

  assert.deepEqual(await store.state(OTHER), { profile: null, installments: [], payments: [] });
  await store.remove(OTHER, s.installments[0].id);
  assert.equal((await store.state(TOKEN)).installments.length, 2, 'another token cannot remove my rows');

  s = await store.remove(TOKEN, s.installments[0].id);
  assert.deepEqual(s.installments.map((i) => i.provider), ['قرض بنك']);

  s = await store.save(TOKEN, { salary: '1500', safeLimit: '35' });
  assert.deepEqual(s.profile, { salary: 1500, safe_limit: 35, salary_day: null });
  assert.equal(await db.collection('profiles').countDocuments({}), 1);
});

test('bad input is rejected with InputError', async () => {
  const store = createStore(createMemoryDb(), { now });
  await assert.rejects(store.state('not-a-uuid'), InputError);
  await assert.rejects(store.save(TOKEN, { salary: 0, safeLimit: 40 }), /invalid salary/);
  await assert.rejects(store.save(TOKEN, { salary: 900, safeLimit: 150 }), /invalid safe limit/);
  const ok = { provider: 'تابي', title: '', monthly: 10, dueDay: 5, remaining: 2, firstDue: '2026-12-05' };
  await assert.rejects(store.add(TOKEN, { ...ok, monthly: -1 }), /invalid monthly/);
  await assert.rejects(store.add(TOKEN, { ...ok, dueDay: 40 }), /invalid dueDay/);
  await assert.rejects(store.add(TOKEN, { ...ok, firstDue: '2030-01-01' }), /invalid first due date/);
  await assert.rejects(store.add(TOKEN, { ...ok, firstDue: '2026-02-30' }), /invalid first due date/);
  await assert.rejects(store.add(TOKEN, { ...ok, provider: { $gt: '' } }), InputError);
  await assert.rejects(store.remove(TOKEN, { $ne: null }), InputError);
  await assert.rejects(store.state({ $ne: null }), /token required/);
});

test('owner keys: guest uuid v4 or u:<uuid v4>, nothing else', async () => {
  const store = createStore(createMemoryDb(), { now });
  await store.save(ACCOUNT, { salary: 900, safeLimit: 40 });
  assert.deepEqual((await store.state(ACCOUNT)).profile, { salary: 900, safe_limit: 40, salary_day: null });
  assert.deepEqual((await store.state(ACCOUNT.toUpperCase().replace('U:', 'u:'))).profile, { salary: 900, safe_limit: 40, salary_day: null });
  assert.deepEqual(await store.state(TOKEN), { profile: null, installments: [], payments: [] }, 'guest and account keys are separate');
  for (const bad of ['u:', 'u:not-a-uuid', 'x:' + TOKEN, `u:u:${TOKEN}`, '11111111-2222-1333-8444-555555555555', '', null, 42]) {
    await assert.rejects(store.state(bad), /token required/, String(bad));
  }
});

test('at most 50 installments per token', async () => {
  const store = createStore(createMemoryDb(), { now });
  const row = { provider: 'تابي', title: '', monthly: 1, dueDay: 20, remaining: 1, firstDue: '2026-11-20' };
  for (let i = 0; i < 50; i++) await store.add(TOKEN, row);
  await assert.rejects(store.add(TOKEN, row), /too many installments/);
});

test('update changes my installment only', async () => {
  const store = createStore(createMemoryDb(), { now });
  let s = await store.add(TOKEN, { provider: 'تابي', title: 'آيفون', monthly: 45.5, dueDay: 25, remaining: 3, firstDue: '2026-11-25' });
  const id = s.installments[0].id;
  await store.update(OTHER, id, { provider: 'x', title: '', monthly: 1, dueDay: 1, remaining: 1, firstDue: '2026-12-01' });
  assert.equal((await store.state(TOKEN)).installments[0].provider, 'تابي', 'another token cannot edit my rows');
  s = await store.update(TOKEN, id, { provider: 'تمارا', title: 'لابتوب', monthly: '60', dueDay: 28, remaining: 5, firstDue: '2026-11-28' });
  assert.deepEqual(
    [s.installments[0].provider, s.installments[0].title, s.installments[0].monthly_amount, s.installments[0].remaining_count],
    ['تمارا', 'لابتوب', 60, 5],
  );
  await assert.rejects(store.update(TOKEN, id, { provider: 'تمارا', title: '', monthly: 0, dueDay: 28, remaining: 5, firstDue: '2026-11-28' }), /invalid monthly/);
});

test('mergeGuest ignores bad guest tokens and non-account owners', async () => {
  const store = createStore(createMemoryDb(), { now });
  await store.add(TOKEN, { provider: 'تابي', title: '', monthly: 5, dueDay: 20, remaining: 2, firstDue: '2026-11-20' });
  assert.deepEqual(await store.mergeGuest('nope', ACCOUNT), { installments: 0, payments: 0, profile: false });
  assert.deepEqual(await store.mergeGuest(ACCOUNT, ACCOUNT), { installments: 0, payments: 0, profile: false });
  assert.deepEqual(await store.mergeGuest(TOKEN, OTHER), { installments: 0, payments: 0, profile: false }, 'guest → guest never merges');
  assert.equal((await store.state(TOKEN)).installments.length, 1);
});

test('handleRpc maps the page calls to the store', async () => {
  const db = createMemoryDb();
  const store = createStore(db, { now });
  const auth = createAuth(db, { now, scryptCost: 1024 });
  let session;
  const signedUp = await handleRpc({ fn: 'auth_signup', args: { email: 'map@x.com', password: 'password-ok' } },
    { store, auth, setSession: (tok) => { session = tok; } });
  assert.deepEqual(signedUp.user, { email: 'map@x.com' });
  const owner = userOwner((await db.collection('users').findOne({ email: 'map@x.com' }))._id);

  // Signed in: the data calls run on the account's own key (p_token is ignored).
  const ctx = { store, auth, sessionToken: session };
  await handleRpc({ fn: 'aqsati_save', args: { p_token: TOKEN, p_salary: 800, p_safe_limit: 40 } }, ctx);
  const s = await handleRpc({
    fn: 'aqsati_add',
    args: { p_token: TOKEN, p_provider: 'تمارا', p_title: '', p_monthly: 20, p_due_day: 16, p_remaining: 2, p_first_due: '2026-11-16' },
  }, ctx);
  assert.equal(s.installments.length, 1);
  assert.deepEqual(s.user, { email: 'map@x.com' });
  assert.deepEqual(s.profile, { salary: 800, safe_limit: 40, salary_day: null });
  assert.deepEqual(await store.state(owner), { profile: s.profile, installments: s.installments, payments: [] }, 'stored under u:<id>');
  assert.deepEqual(await store.state(TOKEN), { profile: null, installments: [], payments: [] }, 'nothing under the p_token');
  await assert.rejects(handleRpc({ fn: 'drop_everything', args: {} }, ctx), /unknown function/);
  await assert.rejects(handleRpc(null, ctx), /unknown function/);

  // A guest: only the empty signed-out STATE, and no writes.
  const guest = { store, auth };
  const signedOut = { profile: null, installments: [], payments: [], user: null };
  assert.deepEqual(await handleRpc({ fn: 'aqsati_state', args: { p_token: TOKEN } }, guest), signedOut, 'guests have no user and no data');
  assert.deepEqual(await handleRpc({ fn: 'aqsati_state', args: { p_token: owner } }, guest), signedOut,
    'a guest cannot claim an account key through p_token');
  await assert.rejects(handleRpc({ fn: 'aqsati_save', args: { p_token: owner, p_salary: 900, p_safe_limit: 30 } }, guest),
    { message: 'not logged in', status: 400 });
  await assert.rejects(handleRpc({ fn: 'drop_everything', args: {} }, guest), /unknown function/);
  assert.deepEqual((await store.state(owner)).profile, { salary: 800, safe_limit: 40, salary_day: null }, 'the account is untouched');
});

// ---------- lib/memorydb.js ----------

test('memorydb: duplicate _id and unique indexes throw code 11000', async () => {
  const db = createMemoryDb();
  const users = db.collection('users');
  await users.createIndex({ email: 1 }, { unique: true });
  await users.insertOne({ _id: 'a', email: 'x@y.co' });
  await assert.rejects(users.insertOne({ _id: 'a', email: 'other@y.co' }), (e) => e.code === 11000);
  await assert.rejects(users.insertOne({ _id: 'b', email: 'x@y.co' }), (e) => e.code === 11000);
  await assert.rejects(users.updateOne({ _id: 'c' }, { $set: { email: 'x@y.co' } }, { upsert: true }), (e) => e.code === 11000);
  await users.insertOne({ _id: 'b', email: 'z@y.co' });
  await assert.rejects(users.updateOne({ _id: 'b' }, { $set: { email: 'x@y.co' } }), (e) => e.code === 11000);
  assert.equal(await users.countDocuments({}), 2);
  await assert.rejects(db.collection('dups').insertOne({ _id: 1, k: 1 }).then(() => db.collection('dups').insertOne({ _id: 2, k: 1 }))
    .then(() => db.collection('dups').createIndex({ k: 1 }, { unique: true })), (e) => e.code === 11000,
  'cannot build a unique index over duplicates');
});

test('memorydb: filters, sort, limit, update operators and counts', async () => {
  const c = createMemoryDb().collection('t');
  const d = (n) => new Date(Date.UTC(2026, 0, n));
  await c.insertOne({ _id: 'a', g: 1, n: 5, at: d(3) });
  await c.insertOne({ _id: 'b', g: 1, n: 1, at: d(1) });
  await c.insertOne({ _id: 'c', g: 2, n: 9, at: d(2) });
  const ids = async (filter, sort = { _id: 1 }) => (await c.find(filter).sort(sort).toArray()).map((x) => x._id);

  assert.deepEqual(await ids({ _id: { $in: ['a', 'c', 'zz'] } }), ['a', 'c']);
  assert.deepEqual(await ids({ n: { $lt: 5 } }), ['b']);
  assert.deepEqual(await ids({ n: { $lte: 5 } }), ['a', 'b']);
  assert.deepEqual(await ids({ n: { $gt: 1, $lt: 9 } }), ['a']);
  assert.deepEqual(await ids({ at: { $gte: d(2) } }), ['a', 'c']);
  assert.deepEqual(await ids({ at: d(1) }), ['b'], 'dates compare by value');
  assert.deepEqual(await ids({ n: { $gt: '1' } }), [], 'no cross-type comparisons');
  assert.deepEqual(await ids({ missing: null }), ['a', 'b', 'c'], 'null matches a missing field');
  assert.deepEqual(await ids({}, { g: 1, at: -1 }), ['a', 'b', 'c']);
  assert.deepEqual(await ids({}, { at: 1 }), ['b', 'c', 'a']);
  assert.deepEqual((await c.find({}).sort({ n: -1 }).limit(2).toArray()).map((x) => x._id), ['c', 'a']);
  assert.equal(await c.countDocuments({ g: 1 }), 2);

  let r = await c.updateOne({ _id: 'a' }, { $inc: { n: 2 }, $setOnInsert: { ignored: true } });
  assert.deepEqual([r.matchedCount, r.modifiedCount], [1, 1]);
  assert.equal((await c.findOne({ _id: 'a' })).n, 7);
  assert.equal((await c.findOne({ _id: 'a' })).ignored, undefined, '$setOnInsert only applies on insert');
  r = await c.updateOne({ _id: 'new', g: 3 }, { $set: { n: 1 }, $setOnInsert: { fresh: true } }, { upsert: true });
  assert.deepEqual([r.matchedCount, r.upsertedCount, r.upsertedId], [0, 1, 'new']);
  assert.deepEqual(await c.findOne({ _id: 'new' }), { _id: 'new', g: 3, n: 1, fresh: true });
  r = await c.updateOne({ _id: 'nobody' }, { $set: { n: 1 } });
  assert.deepEqual([r.matchedCount, r.upsertedCount], [0, 0]);

  r = await c.updateMany({ g: 1 }, { $set: { g: 4 } });
  assert.deepEqual([r.matchedCount, r.modifiedCount], [2, 2]);
  assert.equal(await c.countDocuments({ g: 4 }), 2);

  const copy = await c.findOne({ _id: 'b' });
  copy.n = 999;
  assert.equal((await c.findOne({ _id: 'b' })).n, 1, 'results are copies');
  assert.ok((await c.findOne({ _id: 'b' })).at instanceof Date, 'dates survive the copy');

  assert.equal((await c.deleteOne({ g: 4 })).deletedCount, 1);
  assert.equal((await c.deleteMany({ g: { $in: [2, 3, 4] } })).deletedCount, 3);
  assert.equal(await c.countDocuments({}), 0);
  assert.equal(await c.findOne({ _id: 'a' }), null);
  assert.throws(() => c.find({ $where: 'x' }), /unsupported/);
  await assert.rejects(c.updateOne({ _id: 'x' }, { $push: { a: 1 } }, { upsert: true }), /unsupported update/);
});
