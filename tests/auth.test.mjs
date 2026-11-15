import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, ensureIndexes } from '../lib/store.js';
import {
  createAuth, hashPassword, verifyPassword, sha256hex, MAX_FAILS_PER_EMAIL, MAX_FAILS_PER_IP, ATTEMPT_WINDOW_MS,
} from '../lib/auth.js';
import rpcHandler, { handleRpc, parseCookies, sessionCookie, isSameOrigin } from '../lib/rpc.js';
import { createMemoryDb } from '../lib/memorydb.js';

const DAY = 24 * 60 * 60 * 1000;
const GUEST = '11111111-2222-4333-8444-555555555555';
const GUEST2 = '22222222-2222-4333-8444-555555555555';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

// A fresh in-memory app with a controllable clock (each now() call moves 1 ms so createdAt stays ordered).
async function setup({ scryptCost } = {}) {
  let t = Date.UTC(2026, 10, 15, 9, 0, 0);
  const clock = { now: () => new Date((t += 1)), advance: (ms) => { t += ms; } };
  const db = createMemoryDb();
  await ensureIndexes(db);
  const store = createStore(db, { now: clock.now });
  const auth = createAuth(db, { now: clock.now, ...(scryptCost ? { scryptCost } : {}) });
  // One RPC call. `cookie` is undefined (untouched), a token (set) or null (cleared).
  const call = async (fn, args = {}, { session = null, ip = '10.0.0.1' } = {}) => {
    let cookie;
    const result = await handleRpc({ fn, args }, {
      store, auth, sessionToken: session, ip, setSession: (tok) => { cookie = tok; },
    });
    return { result, cookie };
  };
  // Same, for calls expected to fail: → { error, cookie } (the cookie may be cleared on the way out).
  const fail = async (fn, args = {}, { session = null, ip = '10.0.0.1' } = {}) => {
    let cookie;
    try {
      await handleRpc({ fn, args }, { store, auth, sessionToken: session, ip, setSession: (tok) => { cookie = tok; } });
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
// The same installment in the shape lib/store.js takes. Guests can no longer write through the RPC, so "old guest
// data" (saved before the app required an account) is seeded straight into the database with the store.
const guestRow = (provider) => ({ provider, title: '', monthly: 10, dueDay: 20, remaining: 3, firstDue: '2026-11-20' });
const SIGNED_OUT = { profile: null, installments: [], payments: [], user: null };
const pairs = (payments) => payments.map((p) => [p.installment_id, p.month]);

test('signup sets a session cookie and answers STATE with the user', async () => {
  const { call, db } = await setup();
  const { result, cookie } = await call('auth_signup', { email: '  Soud@Example.COM ', password: 'correct horse', p_token: GUEST });
  assert.match(cookie, TOKEN_SHAPE);
  assert.deepEqual(result, { profile: null, installments: [], payments: [], user: { email: 'soud@example.com' } });

  const user = await db.collection('users').findOne({ email: 'soud@example.com' });
  assert.match(user.passwordHash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(Buffer.from(user.passwordHash.split('$')[5], 'base64').length, 64);
  assert.ok(!user.passwordHash.includes('correct horse'));

  const session = await db.collection('sessions').findOne({ _id: sha256hex(cookie) });
  assert.equal(session.userId, user._id);
  assert.equal(session.expiresAt - session.createdAt, 30 * DAY);
  assert.equal(await db.collection('sessions').findOne({ _id: cookie }), null, 'the raw cookie token is never stored');

  const state = await call('aqsati_state', { p_token: GUEST2 }, { session: cookie });
  assert.deepEqual(state.result.user, { email: 'soud@example.com' });
  assert.equal(state.cookie, undefined, 'a valid session cookie is left alone');
});

test('duplicate email → email taken (trim + case-insensitive), also when the unique index catches a race', async () => {
  const { call, db } = await setup();
  await call('auth_signup', { email: 'dup@x.com', password: 'password-1' });
  await assert.rejects(call('auth_signup', { email: '  DUP@X.com', password: 'password-2' }), { message: 'email taken', status: 400 });
  assert.equal(await db.collection('users').countDocuments({}), 1);

  const users = db.collection('users');
  const realFindOne = users.findOne;
  users.findOne = async () => null; // pretend two signups passed the pre-check at the same moment
  try {
    await assert.rejects(call('auth_signup', { email: 'dup@x.com', password: 'password-3' }), { message: 'email taken' });
  } finally {
    users.findOne = realFindOne;
  }
  assert.equal(await users.countDocuments({ email: 'dup@x.com' }), 1);
});

test('weak password is rejected (8..200 characters, strings only)', async () => {
  const { call, db } = await setup();
  for (const password of ['1234567', 'x'.repeat(201), 12345678, undefined, null, ['password-ok'], { $gt: '' }]) {
    await assert.rejects(call('auth_signup', { email: 'w@x.com', password }), { message: 'weak password' }, String(password));
  }
  assert.equal(await db.collection('users').countDocuments({}), 0);
  assert.match((await call('auth_signup', { email: 'w8@x.com', password: '12345678' })).cookie, TOKEN_SHAPE);
  assert.match((await call('auth_signup', { email: 'w200@x.com', password: 'y'.repeat(200) })).cookie, TOKEN_SHAPE);
});

test('invalid email is rejected on signup and login', async () => {
  const { call } = await setup();
  const bad = ['', '   ', 'abc', 'a@b', '@x.com', 'a@', 'a b@x.com', 'a@x..com', 'a@@x.com', 'a@x.com\u0000',
    `${'x'.repeat(250)}@x.com`, null, 42, { $ne: '' }, ['a@x.com']];
  for (const email of bad) {
    await assert.rejects(call('auth_signup', { email, password: 'password-ok' }), { message: 'invalid email' }, String(email));
    await assert.rejects(call('auth_login', { email, password: 'password-ok' }), { message: 'invalid email' }, String(email));
  }
});

test('login: right password → session, wrong password → invalid credentials', async () => {
  const { call, auth } = await setup();
  const first = await call('auth_signup', { email: 'l@x.com', password: 'password-1' });
  const ok = await call('auth_login', { email: ' L@X.com ', password: 'password-1' });
  assert.match(ok.cookie, TOKEN_SHAPE);
  assert.notEqual(ok.cookie, first.cookie);
  assert.deepEqual(ok.result.user, { email: 'l@x.com' });
  assert.deepEqual(await auth.sessionUser(first.cookie), await auth.sessionUser(ok.cookie), 'two devices, two sessions');

  for (const password of ['password-2', 'PASSWORD-1', '', 'x'.repeat(201), null, { $ne: 'x' }]) {
    await assert.rejects(call('auth_login', { email: 'l@x.com', password }), { message: 'invalid credentials', status: 400 }, String(password));
  }
});

test('login never reveals whether an email has an account', async () => {
  const { call, db } = await setup();
  await call('auth_signup', { email: 'real@x.com', password: 'password-1' });
  const failure = async (email) => {
    try {
      await call('auth_login', { email, password: 'wrong-password' });
    } catch (err) {
      return { name: err.name, message: err.message, status: err.status };
    }
    throw new Error('login should fail');
  };
  assert.deepEqual(await failure('real@x.com'), await failure('ghost@x.com'));
  const attempts = db.collection('login_attempts');
  assert.equal((await attempts.findOne({ _id: 'e:real@x.com' })).count, 1);
  assert.equal((await attempts.findOne({ _id: 'e:ghost@x.com' })).count, 1, 'a missing account is counted the same way');
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
  assert.equal(await verifyPassword('pw', 'scrypt$3$8$1$AAAAAAAAAAA=$AAAAAAAAAAAAAAAAAAAAAA=='), false, 'bad cost is refused');
  assert.equal(await verifyPassword('pw-1', await hashPassword('pw-1', 1024)), true);
});

test(`rate limit: after ${MAX_FAILS_PER_EMAIL} bad logins for an email → 429 (from any IP) until the window ends`, async () => {
  const { call, clock, db } = await setup();
  await call('auth_signup', { email: 'r@x.com', password: 'right-password' });
  for (let i = 0; i < MAX_FAILS_PER_EMAIL; i++) {
    await assert.rejects(call('auth_login', { email: 'r@x.com', password: 'wrong-password' }, { ip: `10.1.0.${i}` }),
      { message: 'invalid credentials' });
  }
  await assert.rejects(call('auth_login', { email: 'r@x.com', password: 'right-password' }, { ip: '10.9.9.9' }),
    { message: 'too many attempts', status: 429 });
  // another account from the same IPs is not affected
  await call('auth_signup', { email: 'other@x.com', password: 'other-password' }, { ip: '10.9.9.9' });
  assert.ok((await call('auth_login', { email: 'other@x.com', password: 'other-password' }, { ip: '10.1.0.1' })).cookie);

  clock.advance(ATTEMPT_WINDOW_MS + 1000); // the TTL doc may still exist — the code checks expiresAt itself
  assert.ok(await db.collection('login_attempts').findOne({ _id: 'e:r@x.com' }));
  assert.match((await call('auth_login', { email: 'r@x.com', password: 'right-password' })).cookie, TOKEN_SHAPE);
  assert.equal(await db.collection('login_attempts').findOne({ _id: 'e:r@x.com' }), null, 'success resets the email counter');

  // a failure after the window starts a fresh count
  await assert.rejects(call('auth_login', { email: 'r@x.com', password: 'nope-nope' }), { message: 'invalid credentials' });
  assert.equal((await db.collection('login_attempts').findOne({ _id: 'e:r@x.com' })).count, 1);
});

test(`rate limit: ${MAX_FAILS_PER_IP} failed logins + signups from one IP → 429 for that IP only`, async () => {
  const { call } = await setup({ scryptCost: 1024 }); // cheap hashes: this test signs up 20 accounts
  const ip = '203.0.113.7';
  for (let i = 0; i < 20; i++) await call('auth_signup', { email: `s${i}@x.com`, password: 'password-ok' }, { ip });
  for (let i = 0; i < MAX_FAILS_PER_IP - 20; i++) {
    await assert.rejects(call('auth_login', { email: `nobody${i}@x.com`, password: 'password-ok' }, { ip }), { message: 'invalid credentials' });
  }
  await assert.rejects(call('auth_signup', { email: 'late@x.com', password: 'password-ok' }, { ip }), { message: 'too many attempts', status: 429 });
  await assert.rejects(call('auth_login', { email: 's1@x.com', password: 'password-ok' }, { ip }), { status: 429 });
  assert.match((await call('auth_login', { email: 's1@x.com', password: 'password-ok' }, { ip: '198.51.100.1' })).cookie, TOKEN_SHAPE);
});

// Settles every promise and tallies the outcome by message ('ok' for a success).
async function tally(promises) {
  const out = {};
  for (const r of await Promise.allSettled(promises)) {
    const key = r.status === 'fulfilled' ? 'ok' : r.reason?.message;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

test('rate limit holds under a parallel burst of bad logins for one email', async () => {
  const { call, auth } = await setup();
  await call('auth_signup', { email: 'burst@x.com', password: 'right-password' }, { ip: '10.7.0.1' });
  const burst = Array.from({ length: 20 }, (_, i) =>
    auth.login('burst@x.com', 'wrong-password', `10.8.0.${i}`)); // different IPs: only the email limit applies
  const seen = await tally(burst);
  assert.ok((seen['invalid credentials'] || 0) <= MAX_FAILS_PER_EMAIL, JSON.stringify(seen));
  assert.ok((seen['invalid credentials'] || 0) >= 1, JSON.stringify(seen));
  assert.equal((seen['invalid credentials'] || 0) + (seen['too many attempts'] || 0), 20, JSON.stringify(seen));
  await assert.rejects(auth.login('burst@x.com', 'right-password', '10.9.0.1'), { message: 'too many attempts', status: 429 },
    'even the right password waits for the window to end');
});

test('rate limit holds under a parallel burst from one IP (logins and signups)', async () => {
  const { auth } = await setup({ scryptCost: 1024 });
  const logins = await tally(Array.from({ length: 50 }, (_, i) => auth.login(`ghost${i}@x.com`, 'password-ok', '198.18.0.1')));
  assert.ok((logins['invalid credentials'] || 0) <= MAX_FAILS_PER_IP, JSON.stringify(logins));
  assert.equal((logins['invalid credentials'] || 0) + (logins['too many attempts'] || 0), 50, JSON.stringify(logins));

  const signups = await tally(Array.from({ length: 40 }, (_, i) => auth.signup(`new${i}@x.com`, 'password-ok', '198.18.0.2')));
  assert.ok((signups.ok || 0) <= MAX_FAILS_PER_IP, JSON.stringify(signups));
  assert.ok((signups.ok || 0) >= 1, JSON.stringify(signups));
  assert.equal((signups.ok || 0) + (signups['too many attempts'] || 0), 40, JSON.stringify(signups));
});

test('a correct login gives its IP attempt back (real users do not use up the IP budget)', async () => {
  const { call, db } = await setup({ scryptCost: 1024 });
  const ip = '192.0.2.50';
  await call('auth_signup', { email: 'daily@x.com', password: 'password-ok' }, { ip: '192.0.2.1' });
  for (let i = 0; i < MAX_FAILS_PER_IP + 5; i++) {
    assert.ok((await call('auth_login', { email: 'daily@x.com', password: 'password-ok' }, { ip })).cookie);
  }
  assert.equal((await db.collection('login_attempts').findOne({ _id: `i:${ip}` })).count, 0);
});

test('memorydb findOneAndUpdate: upsert + $inc gives each parallel caller its own count', async () => {
  const col = createMemoryDb().collection('c');
  const counts = await Promise.all(Array.from({ length: 10 }, () =>
    col.findOneAndUpdate({ _id: 'k' }, { $inc: { n: 1 }, $setOnInsert: { at: 1 } }, { upsert: true, returnDocument: 'after' })));
  assert.deepEqual(counts.map((d) => d.n).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(await col.findOne({ _id: 'k' }), { _id: 'k', n: 10, at: 1 });
  assert.deepEqual(await col.findOneAndUpdate({ _id: 'k' }, { $inc: { n: 1 } }), { _id: 'k', n: 10, at: 1 }, 'before by default');
  assert.equal(await col.findOneAndUpdate({ _id: 'missing' }, { $inc: { n: 1 } }, { returnDocument: 'after' }), null);
});

test('logout clears the cookie even when deleting the session fails', async () => {
  const { store } = await setup();
  let cookie;
  const realError = console.error;
  console.error = () => {};
  try {
    const result = await handleRpc({ fn: 'auth_logout', args: {} }, {
      store,
      auth: { logout: async () => { throw new Error('db down'); } },
      sessionToken: 'x'.repeat(43),
      setSession: (tok) => { cookie = tok; },
    });
    assert.deepEqual(result, { profile: null, installments: [], payments: [], user: null });
    assert.equal(cookie, null);
  } finally {
    console.error = realError;
  }
});

test('HTTP: logout clears the cookie without MONGODB_URI (no database needed)', { skip: Boolean(process.env.MONGODB_URI) }, async () => {
  const saved = process.env.AQSATI_MEMORY_DB;
  const realError = console.error;
  delete process.env.AQSATI_MEMORY_DB;
  console.error = () => {};
  try {
    const res = await hit({ headers: { cookie: `aqsati_session=${'a'.repeat(43)}` }, body: { fn: 'auth_logout', args: {} } });
    assert.deepEqual([res.statusCode, res.body], [200, { profile: null, installments: [], payments: [], user: null }]);
    assert.equal(res.headers['set-cookie'], 'aqsati_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  } finally {
    console.error = realError;
    if (saved !== undefined) process.env.AQSATI_MEMORY_DB = saved;
  }
});

test('session expiry is enforced in code (TTL deletion is lazy)', async () => {
  const { call, clock, auth, db } = await setup();
  const { cookie } = await call('auth_signup', { email: 'e@x.com', password: 'password-ok' });
  await call('aqsati_save', { p_salary: 700, p_safe_limit: 40 }, { session: cookie });

  clock.advance(29 * DAY);
  assert.deepEqual((await call('aqsati_state', { p_token: GUEST }, { session: cookie })).result.user, { email: 'e@x.com' });

  clock.advance(DAY + 1000);
  assert.equal(await db.collection('sessions').countDocuments({}), 1, 'the expired session doc still exists');
  const after = await call('aqsati_state', { p_token: GUEST }, { session: cookie });
  assert.deepEqual(after.result, SIGNED_OUT, 'falls back to the signed-out STATE, like a guest');
  assert.equal(after.cookie, null, 'the stale cookie is cleared');
  assert.equal(await auth.sessionUser(cookie), null);
  assert.equal(await db.collection('sessions').countDocuments({}), 0, 'and the expired doc is removed');

  const back = await call('auth_login', { email: 'e@x.com', password: 'password-ok' });
  assert.deepEqual(back.result.profile, { salary: 700, safe_limit: 40, salary_day: null }, 'the account data is still there');
});

test('logout deletes the session and clears the cookie', async () => {
  const { call, auth } = await setup();
  const phone = await call('auth_signup', { email: 'o@x.com', password: 'password-ok' });
  const laptop = await call('auth_login', { email: 'o@x.com', password: 'password-ok' });

  const out = await call('auth_logout', { p_token: GUEST }, { session: phone.cookie });
  assert.deepEqual(out.result, { profile: null, installments: [], payments: [], user: null });
  assert.equal(out.cookie, null);
  assert.equal(await auth.sessionUser(phone.cookie), null);
  const reused = await call('aqsati_state', { p_token: GUEST }, { session: phone.cookie });
  assert.equal(reused.result.user, null, 'the old cookie no longer works');
  assert.equal((await auth.sessionUser(laptop.cookie))?.email, 'o@x.com', 'other devices stay signed in');

  const anon = await call('auth_logout', {});
  assert.deepEqual(anon.result, { profile: null, installments: [], payments: [], user: null }, 'logout without a session is harmless');
});

test('signup/login moves the guest data into the account (profile only if the account has none)', async () => {
  const { call, store } = await setup();
  // Old guest data, saved by this browser before the app required an account.
  await store.save(GUEST, { salary: 1000, safeLimit: 35 });
  await store.add(GUEST, guestRow('تابي'));
  await store.add(GUEST, guestRow('تمارا'));

  const signup = await call('auth_signup', { email: 'm@x.com', password: 'password-ok', p_token: GUEST });
  assert.deepEqual(signup.result.profile, { salary: 1000, safe_limit: 35, salary_day: null });
  assert.deepEqual(signup.result.installments.map((i) => i.provider), ['تابي', 'تمارا']);
  assert.deepEqual(await store.state(GUEST), { profile: null, installments: [], payments: [] }, 'nothing left under the guest key');

  // Another browser with old guest data then logs in to the same account.
  await store.save(GUEST2, { salary: 500, safeLimit: 20 });
  await store.add(GUEST2, guestRow('ديما'));
  const login = await call('auth_login', { email: 'm@x.com', password: 'password-ok', p_token: GUEST2 });
  assert.deepEqual(login.result.profile, { salary: 1000, safe_limit: 35, salary_day: null }, 'the account profile wins');
  assert.deepEqual(login.result.installments.map((i) => i.provider), ['تابي', 'تمارا', 'ديما']);
  const left = await store.state(GUEST2);
  assert.deepEqual(left.profile, { salary: 500, safe_limit: 20, salary_day: null }, 'the guest profile is not moved');
  assert.deepEqual(left.installments, []);

  const again = await call('auth_login', { email: 'm@x.com', password: 'password-ok', p_token: 'not-a-uuid' });
  assert.equal(again.result.installments.length, 3, 'a bad guest token is ignored');
});

test('guest merge never takes the account past 50 installments (oldest move first)', async () => {
  const { call, store } = await setup();
  const { cookie } = await call('auth_signup', { email: 'cap@x.com', password: 'password-ok' });
  for (let i = 0; i < 48; i++) await call('aqsati_add', { p_token: GUEST, ...inst(`acc${i}`) }, { session: cookie });
  assert.deepEqual(await store.state(GUEST), { profile: null, installments: [], payments: [] }, 'with a session, p_token is ignored');

  for (const name of ['old', 'mid', 'new']) await store.add(GUEST2, guestRow(name)); // old guest data, oldest first
  const login = await call('auth_login', { email: 'cap@x.com', password: 'password-ok', p_token: GUEST2 });
  assert.equal(login.result.installments.length, 50);
  assert.deepEqual(login.result.installments.slice(-2).map((i) => i.provider), ['old', 'mid']);
  assert.deepEqual((await store.state(GUEST2)).installments.map((i) => i.provider), ['new'], 'what does not fit stays with the guest');
  await assert.rejects(call('aqsati_add', { ...inst('one more') }, { session: login.cookie }), { message: 'too many installments' });
});

test('another user cannot see, edit or remove my data', async () => {
  const { call, db } = await setup();
  const a = await call('auth_signup', { email: 'a@x.com', password: 'password-a' });
  const b = await call('auth_signup', { email: 'b@x.com', password: 'password-b' });
  const added = await call('aqsati_add', { p_token: GUEST, ...inst('تابي') }, { session: a.cookie });
  const id = added.result.installments[0].id;
  await call('aqsati_save', { p_salary: 900, p_safe_limit: 40 }, { session: a.cookie });

  const seenByB = await call('aqsati_state', { p_token: GUEST }, { session: b.cookie });
  assert.deepEqual(seenByB.result, { profile: null, installments: [], payments: [], user: { email: 'b@x.com' } });
  const edited = await call('aqsati_update', { p_token: GUEST, p_id: id, ...inst('hacked') }, { session: b.cookie });
  assert.deepEqual(edited.result.installments, [], 'B only ever gets B\'s own STATE back');
  await call('aqsati_remove', { p_token: GUEST, p_id: id }, { session: b.cookie });
  for (const [fn, args] of [['aqsati_update', { p_token: GUEST, p_id: id, ...inst('hacked') }], ['aqsati_remove', { p_token: GUEST, p_id: id }]]) {
    await assert.rejects(call(fn, args), { message: 'not logged in', status: 400 }, `${fn} as a guest`);
  }

  const mine = await call('aqsati_state', {}, { session: a.cookie });
  assert.deepEqual(mine.result.installments.map((i) => i.provider), ['تابي']);
  assert.deepEqual(mine.result.profile, { salary: 900, safe_limit: 40, salary_day: null });
  assert.deepEqual((await call('aqsati_state', { p_token: GUEST })).result, SIGNED_OUT);

  const owner = await db.collection('users').findOne({ email: 'a@x.com' });
  const accountKey = `u:${owner._id}`;
  assert.deepEqual((await call('aqsati_state', { p_token: accountKey })).result, SIGNED_OUT,
    'an account key sent as a guest token reads nothing');
  await assert.rejects(call('aqsati_remove', { p_token: accountKey, p_id: id }), { message: 'not logged in' },
    'and removes nothing');
  assert.deepEqual((await call('aqsati_state', {}, { session: a.cookie })).result.installments.map((i) => i.id), [id]);
  const garbage = await call('aqsati_state', { p_token: GUEST }, { session: 'forged-or-garbage' });
  assert.equal(garbage.result.user, null, 'a forged cookie is not a session');
  assert.equal(garbage.cookie, null);
});

// ---------- the app requires an account: what a visitor without a live session gets ----------

const WRITES = ['aqsati_save', 'aqsati_add', 'aqsati_update', 'aqsati_remove', 'aqsati_mark_paid'];
// Well-formed arguments for every write, so the only thing wrong with a guest's call is the missing session.
const writeArgs = (id) => ({
  aqsati_save: { p_token: GUEST, p_salary: 900, p_safe_limit: 40, p_salary_day: 25 },
  aqsati_add: { p_token: GUEST, ...inst('تابي') },
  aqsati_update: { p_token: GUEST, p_id: id, ...inst('hacked') },
  aqsati_remove: { p_token: GUEST, p_id: id },
  aqsati_mark_paid: { p_token: GUEST, p_id: id, p_month: '2026-11', p_paid: true },
});
// Every row of the data collections, to prove that a refused call wrote nothing.
async function snapshot(db) {
  const out = {};
  for (const name of ['profiles', 'installments', 'payments']) {
    out[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  }
  return out;
}

test('a guest (no session) gets the signed-out STATE from aqsati_state — no error, and old guest data stays hidden and untouched', async () => {
  const { call, store, auth, db } = await setup();
  assert.deepEqual(await call('aqsati_state', {}), { result: SIGNED_OUT, cookie: undefined }, 'no cookie is set or cleared');
  assert.deepEqual(await handleRpc({ fn: 'aqsati_state' }, { store, auth }), SIGNED_OUT, 'no args and no setSession are fine too');

  // Old guest data (saved before accounts were required) is not shown to a guest read…
  await store.save(GUEST, { salary: 1000, safeLimit: 35, salaryDay: 27 });
  const id = (await store.add(GUEST, guestRow('تابي'))).installments[0].id;
  await store.markPaid(GUEST, id, '2026-11', true);
  const before = await snapshot(db);
  for (const args of [{ p_token: GUEST }, { p_token: GUEST.toUpperCase() }, { p_token: 'not-a-uuid' }, { p_token: { $ne: null } }, {}]) {
    const read = await call('aqsati_state', args);
    assert.deepEqual([read.result, read.cookie], [SIGNED_OUT, undefined], JSON.stringify(args));
  }
  assert.deepEqual(await snapshot(db), before, 'reading as a guest changes nothing');

  // …and is all still there for the account that signs up from this browser.
  const su = await call('auth_signup', { email: 'keep@x.com', password: 'password-ok', p_token: GUEST });
  assert.deepEqual(su.result.profile, { salary: 1000, safe_limit: 35, salary_day: 27 });
  assert.deepEqual(su.result.installments.map((i) => i.id), [id]);
  assert.deepEqual(pairs(su.result.payments), [[id, '2026-11']]);
});

test("a guest (no session) calling any write gets 400 'not logged in' — whatever the arguments — and nothing is written", async () => {
  const { fail, store, db } = await setup();
  // An old guest installment + profile: if a guest write got through, it would change these.
  await store.save(GUEST, { salary: 500, safeLimit: 20 });
  const id = (await store.add(GUEST, guestRow('تابي'))).installments[0].id;
  const before = await snapshot(db);
  const args = writeArgs(id);
  for (const fn of WRITES) {
    const r = await fail(fn, args[fn]);
    assert.deepEqual([r.error.name, r.error.message, r.error.status, r.cookie], ['InputError', 'not logged in', 400, undefined], fn);
    // The login check comes first: no token, a bad token or bad input all get the same answer (no validation hints).
    for (const extra of [{ p_token: undefined }, { p_token: `u:${id}` }, { p_id: 'abc', p_month: '1999-01', p_salary: -1, p_provider: { $gt: '' } }]) {
      assert.equal((await fail(fn, { ...args[fn], ...extra })).error.message, 'not logged in', `${fn} ${JSON.stringify(extra)}`);
    }
    assert.equal((await fail(fn, {})).error.message, 'not logged in', `${fn} with no args`);
  }
  assert.deepEqual(await snapshot(db), before, 'nothing was written');
});

test('an expired, logged-out or forged cookie behaves like a guest (and the browser is told to drop it)', async () => {
  const { call, fail, clock, db } = await setup();
  const live = await call('auth_signup', { email: 'dead@x.com', password: 'password-ok' });
  await call('aqsati_save', { p_salary: 700, p_safe_limit: 40 }, { session: live.cookie });
  const id = (await call('aqsati_add', inst('تابي'), { session: live.cookie })).result.installments[0].id;
  await call('aqsati_mark_paid', { p_id: id, p_month: '2026-11', p_paid: true }, { session: live.cookie });
  const loggedOut = (await call('auth_login', { email: 'dead@x.com', password: 'password-ok' })).cookie;
  await call('auth_logout', {}, { session: loggedOut });
  const before = await snapshot(db);
  const args = writeArgs(id); // aimed at the account's own installment

  const actsAsGuest = async (session, label) => {
    const read = await call('aqsati_state', { p_token: GUEST }, { session });
    assert.deepEqual([read.result, read.cookie], [SIGNED_OUT, null], `${label}: aqsati_state → signed-out STATE, cookie cleared`);
    for (const fn of WRITES) {
      const r = await fail(fn, args[fn], { session });
      assert.deepEqual([r.error.message, r.error.status, r.cookie], ['not logged in', 400, null], `${label}: ${fn}`);
    }
  };
  await actsAsGuest(loggedOut, 'logged-out cookie');
  await actsAsGuest('forged-or-garbage', 'forged cookie');
  await actsAsGuest('x'.repeat(43), 'well-formed but unknown cookie');
  assert.deepEqual(await snapshot(db), before, 'none of them wrote anything');
  assert.deepEqual((await call('aqsati_state', {}, { session: live.cookie })).result.user, { email: 'dead@x.com' }, 'the live session still works');

  clock.advance(30 * DAY + 1000); // the first session is now past its 30 days
  await actsAsGuest(live.cookie, 'expired cookie');
  assert.deepEqual(await snapshot(db), before, 'the expired cookie wrote nothing either');

  const back = await call('auth_login', { email: 'dead@x.com', password: 'password-ok' });
  assert.deepEqual(back.result.profile, { salary: 700, safe_limit: 40, salary_day: null }, 'the account data is untouched');
  assert.deepEqual(back.result.installments.map((i) => [i.id, i.provider]), [[id, 'تابي']]);
  assert.deepEqual(pairs(back.result.payments), [[id, '2026-11']]);
});

// ---------- HTTP layer: lib/rpc.js default export with fake req/res ----------

function fakeReq({ method = 'POST', headers = {}, body } = {}) {
  const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method,
    headers: { host: 'localhost:3000', 'content-type': 'application/json', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    async* [Symbol.asyncIterator]() {
      if (raw) yield Buffer.from(raw);
    },
  };
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b === undefined ? undefined : JSON.parse(b); },
  };
}

async function hit(opts) {
  const res = fakeRes();
  await rpcHandler(fakeReq(opts), res);
  return res;
}

const cookieValue = (setCookie) => /^aqsati_session=([^;]*)/.exec(setCookie || '')?.[1];

test('HTTP: a cross-site Origin gets 403 bad origin', async () => {
  const body = { fn: 'aqsati_state', args: { p_token: GUEST } };
  for (const headers of [
    { origin: 'https://evil.example' },
    { origin: 'http://localhost:3001' },
    { origin: 'null' },
    { origin: 'not a url' },
    { origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example.attacker' },
  ]) {
    const res = await hit({ headers, body });
    assert.equal(res.statusCode, 403, JSON.stringify(headers));
    assert.deepEqual(res.body, { message: 'bad origin' });
  }
  assert.equal(isSameOrigin({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } }), true);
  assert.equal(isSameOrigin({ headers: { host: 'localhost:3000' } }), true, 'no Origin (non-browser) is allowed');
  assert.equal(isSameOrigin({
    headers: { host: 'internal:8080', 'x-forwarded-host': 'aqsati-three.vercel.app', origin: 'https://aqsati-three.vercel.app' },
  }), true, 'behind a proxy the forwarded host counts');
  assert.equal(isSameOrigin({ headers: { host: 'a.example:443', origin: 'https://a.example', 'sec-fetch-site': 'same-origin' } }), true);
});

test('HTTP: method, content type and body checks', async () => {
  let res = await hit({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  res = await hit({ headers: { 'content-type': 'text/plain' }, body: { fn: 'aqsati_state', args: { p_token: GUEST } } });
  assert.equal(res.statusCode, 415);
  res = await hit({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'fn=auth_logout' });
  assert.equal(res.statusCode, 415, 'a cross-site HTML form cannot post here');
  res = await hit({ body: '{not json' });
  assert.deepEqual([res.statusCode, res.body], [400, { message: 'invalid json' }]);
  res = await hit({ body: JSON.stringify({ fn: 'x', pad: 'z'.repeat(9000) }) });
  assert.deepEqual([res.statusCode, res.body], [400, { message: 'body too large' }]);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('HTTP: without MONGODB_URI (and no memory mode) → 500 config', { skip: Boolean(process.env.MONGODB_URI) }, async () => {
  const saved = process.env.AQSATI_MEMORY_DB;
  delete process.env.AQSATI_MEMORY_DB;
  try {
    const res = await hit({ body: { fn: 'aqsati_state', args: { p_token: GUEST } } });
    assert.deepEqual([res.statusCode, res.body], [500, { message: 'config' }]);
  } finally {
    if (saved !== undefined) process.env.AQSATI_MEMORY_DB = saved;
  }
});

// Runs fn(warnings) against the HTTP handler in memory mode. The in-memory database lives for the whole process,
// so every memory-mode test in this file shares it: each one uses its own emails.
async function withMemoryMode(fn) {
  const savedEnv = process.env.AQSATI_MEMORY_DB;
  const savedVercel = process.env.VERCEL;
  const realWarn = console.warn;
  const warnings = [];
  process.env.AQSATI_MEMORY_DB = '1';
  delete process.env.VERCEL;
  console.warn = (...a) => warnings.push(a.join(' '));
  try {
    await fn(warnings);
  } finally {
    console.warn = realWarn;
    if (savedEnv === undefined) delete process.env.AQSATI_MEMORY_DB;
    else process.env.AQSATI_MEMORY_DB = savedEnv;
    if (savedVercel !== undefined) process.env.VERCEL = savedVercel;
  }
}

test('HTTP (memory mode): signup cookie → state → logout, end to end', () => withMemoryMode(async (warnings) => {
  const origin = { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' };
  let res = await hit({ headers: origin, body: { fn: 'aqsati_state', args: { p_token: GUEST } } });
  assert.deepEqual([res.statusCode, res.body, res.headers['set-cookie']], [200, SIGNED_OUT, undefined], 'a visitor reads the signed-out STATE');
  assert.ok(warnings.some((w) => /memory mode/i.test(w)), 'memory mode logs a clear warning');
  res = await hit({ headers: origin, body: { fn: 'aqsati_save', args: { p_token: GUEST, p_salary: 650, p_safe_limit: 40 } } });
  assert.deepEqual([res.statusCode, res.body], [400, { message: 'not logged in' }], 'but cannot save as a guest');

  res = await hit({ headers: origin, body: { fn: 'auth_signup', args: { email: 'http@x.com', password: 'password-ok', p_token: GUEST } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { profile: null, installments: [], payments: [], user: { email: 'http@x.com' } }, 'the refused guest save left nothing to merge');
  const setCookie = res.headers['set-cookie'];
  assert.match(setCookie, /^aqsati_session=[A-Za-z0-9_-]{43}; HttpOnly; Path=\/; SameSite=Lax; Max-Age=2592000$/);
  const token = cookieValue(setCookie);

  res = await hit({ headers: { ...origin, cookie: `aqsati_session=${token}` }, body: { fn: 'aqsati_save', args: { p_token: GUEST2, p_salary: 650, p_safe_limit: 40 } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { profile: { salary: 650, safe_limit: 40, salary_day: null }, installments: [], payments: [], user: { email: 'http@x.com' } });
  assert.equal(res.headers['set-cookie'], undefined);

  res = await hit({ headers: { cookie: `theme=dark; aqsati_session=${token}` }, body: { fn: 'aqsati_state', args: { p_token: GUEST2 } } });
  assert.deepEqual(res.body.user, { email: 'http@x.com' });
  assert.deepEqual(res.body.profile, { salary: 650, safe_limit: 40, salary_day: null });
  assert.equal(res.headers['set-cookie'], undefined);

  // sendBeacon on pagehide: same origin, Blob type application/json, session cookie → still accepted.
  res = await hit({ headers: { ...origin, cookie: `aqsati_session=${token}`, 'content-type': 'application/json' }, body: { fn: 'aqsati_remove', args: { p_id: GUEST } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user, { email: 'http@x.com' });

  res = await hit({ headers: { cookie: `aqsati_session=${token}` }, body: { fn: 'auth_login', args: { email: 'http@x.com', password: 'bad-password' } } });
  assert.deepEqual([res.statusCode, res.body], [400, { message: 'invalid credentials' }]);

  res = await hit({ headers: { cookie: `aqsati_session=${token}`, 'x-forwarded-proto': 'https' }, body: { fn: 'auth_logout', args: {} } });
  assert.deepEqual(res.body, SIGNED_OUT);
  assert.equal(res.headers['set-cookie'], 'aqsati_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure');

  res = await hit({ headers: { cookie: `aqsati_session=${token}` }, body: { fn: 'aqsati_state', args: { p_token: GUEST2 } } });
  assert.deepEqual([res.statusCode, res.body], [200, SIGNED_OUT], 'the logged-out cookie is dead');
  assert.match(res.headers['set-cookie'], /Max-Age=0/, 'and the browser is told to drop it');
  res = await hit({ headers: { ...origin, cookie: `aqsati_session=${token}` }, body: { fn: 'aqsati_remove', args: { p_id: GUEST } } });
  assert.deepEqual([res.statusCode, res.body], [400, { message: 'not logged in' }], 'a dead cookie cannot write');
  assert.match(res.headers['set-cookie'], /Max-Age=0/);

  res = await hit({ headers: { 'x-forwarded-proto': 'https' }, body: { fn: 'auth_login', args: { email: 'http@x.com', password: 'password-ok' } } });
  assert.match(res.headers['set-cookie'], /; Secure$/, 'HTTPS → Secure cookie');
  assert.deepEqual(res.body.profile, { salary: 650, safe_limit: 40, salary_day: null }, 'the account data survived the logout');
}));

test("HTTP (memory mode): a guest or a dead cookie gets 200 + signed-out STATE from aqsati_state and 400 'not logged in' from every write", () => withMemoryMode(async () => {
  const origin = { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' };
  const args = writeArgs(GUEST2); // any well-formed installment id
  const actsAsGuest = async (cookieHeader, label) => {
    const headers = cookieHeader ? { ...origin, cookie: cookieHeader } : origin;
    const dropped = cookieHeader ? 'aqsati_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' : undefined;
    let res = await hit({ headers, body: { fn: 'aqsati_state', args: { p_token: GUEST } } });
    assert.deepEqual([res.statusCode, res.body, res.headers['set-cookie']], [200, SIGNED_OUT, dropped], `${label}: aqsati_state`);
    for (const fn of WRITES) {
      res = await hit({ headers, body: { fn, args: args[fn] } });
      assert.deepEqual([res.statusCode, res.body, res.headers['set-cookie']], [400, { message: 'not logged in' }, dropped], `${label}: ${fn}`);
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  };

  await actsAsGuest(null, 'guest');
  // Signing up from this browser brings nothing along: none of those guest writes were stored.
  let res = await hit({ headers: origin, body: { fn: 'auth_signup', args: { email: 'http-guest@x.com', password: 'password-ok', p_token: GUEST } } });
  assert.deepEqual([res.statusCode, res.body], [200, { profile: null, installments: [], payments: [], user: { email: 'http-guest@x.com' } }]);
  const token = cookieValue(res.headers['set-cookie']);

  res = await hit({ headers: { ...origin, cookie: `aqsati_session=${token}` }, body: { fn: 'aqsati_save', args: { p_salary: 900, p_safe_limit: 30 } } });
  assert.deepEqual([res.statusCode, res.body.user], [200, { email: 'http-guest@x.com' }], 'the same call works once signed in');
  res = await hit({ headers: { cookie: `aqsati_session=${token}` }, body: { fn: 'auth_logout', args: {} } });
  assert.equal(res.statusCode, 200);

  await actsAsGuest(`aqsati_session=${token}`, 'logged-out cookie');
  await actsAsGuest(`aqsati_session=${'z'.repeat(43)}`, 'unknown cookie');

  res = await hit({ headers: origin, body: { fn: 'auth_login', args: { email: 'http-guest@x.com', password: 'password-ok' } } });
  assert.deepEqual(res.body.profile, { salary: 900, safe_limit: 30, salary_day: null }, 'the dead-cookie writes changed nothing');
}));

test('cookie helpers', () => {
  const c = parseCookies('a=1; aqsati_session=first; aqsati_session=second; junk; =x; q="quoted"; pct=%E0%A4%A; sp=a%20b');
  assert.equal(c.a, '1');
  assert.equal(c.aqsati_session, 'first', 'first value wins');
  assert.equal(c.q, 'quoted');
  assert.equal(c.pct, '%E0%A4%A', 'bad escapes are kept raw, not thrown');
  assert.equal(c.sp, 'a b');
  assert.equal(c.junk, undefined);
  assert.deepEqual({ ...parseCookies(undefined) }, {});
  assert.deepEqual({ ...parseCookies('x'.repeat(9000)) }, {});
  assert.equal(parseCookies('__proto__=1').__proto__, '1', 'no prototype pollution');
  assert.equal(sessionCookie('tok', false), 'aqsati_session=tok; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000');
  assert.equal(sessionCookie(null, true), 'aqsati_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure');
});
