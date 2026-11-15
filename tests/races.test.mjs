// Backend edge cases found in review: a login racing a password change, a write racing an account
// deletion, the Kuwait month window for payment marks, and editing an installment without moving its schedule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, ensureIndexes, userOwner } from '../lib/store.js';
import { createAuth } from '../lib/auth.js';
import { handleRpc } from '../lib/rpc.js';
import { createMemoryDb } from '../lib/memorydb.js';

const DAY = 24 * 60 * 60 * 1000;
const GUEST = '11111111-2222-4333-8444-555555555555';

async function setup(start = Date.UTC(2026, 10, 15, 9, 0, 0)) {
  let t = start;
  const clock = { now: () => new Date((t += 1)), advance: (ms) => { t += ms; } };
  const db = createMemoryDb();
  await ensureIndexes(db);
  const store = createStore(db, { now: clock.now });
  const auth = createAuth(db, { now: clock.now, scryptCost: 1024 });
  const call = async (fn, args = {}, { session = null, ip = '10.0.0.1' } = {}) => {
    let cookie;
    const result = await handleRpc({ fn, args }, {
      store, auth, sessionToken: session, ip, setSession: (tok) => { cookie = tok; },
    });
    return { result, cookie };
  };
  return { db, store, auth, clock, call };
}

const row = (extra = {}) => ({
  p_provider: 'تابي', p_title: '', p_monthly: 10, p_due_day: 20, p_remaining: 3, p_first_due: '2026-11-20', ...extra,
});

test('a login that verified the OLD password while it was being changed gets no working session', async () => {
  const { db, auth } = await setup();
  const victim = await auth.signup('v@x.com', 'old-password', '10.0.0.1');
  const sessions = db.collection('sessions');
  const realInsert = sessions.insertOne;
  let fired = false;
  // The attacker's login has already checked 'old-password'; the victim's change lands before its session insert.
  sessions.insertOne = async function hooked(doc) {
    if (!fired) {
      fired = true;
      await auth.changePassword(victim.user.id, victim.token, 'old-password', 'new-password', '10.0.0.2');
    }
    return realInsert.call(this, doc);
  };
  let attacker;
  try {
    attacker = await auth.login('v@x.com', 'old-password', '10.0.0.9').catch((err) => err);
  } finally {
    sessions.insertOne = realInsert;
  }
  assert.ok(fired, 'the hook ran');
  assert.ok(attacker instanceof Error && attacker.message === 'invalid credentials', 'the racing login is refused');
  assert.equal(await sessions.countDocuments({ userId: victim.user.id }), 1, 'only the victim\'s own session is left');
  assert.equal((await auth.sessionUser(victim.token))?.email, 'v@x.com', 'the victim stays signed in');
  assert.equal((await auth.login('v@x.com', 'new-password', '10.0.0.1')).user.email, 'v@x.com');
});

test('a write from another device that races account deletion leaves no rows behind', async () => {
  const { db, call } = await setup();
  const a = await call('auth_signup', { email: 'del@x.com', password: 'password-del' });
  const b = await call('auth_login', { email: 'del@x.com', password: 'password-del' });
  const user = await db.collection('users').findOne({ email: 'del@x.com' });
  const owner = userOwner(user._id);
  const installments = db.collection('installments');
  const realCount = installments.countDocuments;
  let fired = false;
  // Device B's aqsati_add is past sessionUser and its cap check when device A deletes the account.
  installments.countDocuments = async function hooked(filter) {
    const n = await realCount.call(this, filter);
    if (!fired) {
      fired = true;
      const out = await call('auth_delete_account', { password: 'password-del' }, { session: a.cookie });
      assert.equal(out.result.user, null);
    }
    return n;
  };
  let err;
  try {
    err = await call('aqsati_add', { p_token: GUEST, ...row() }, { session: b.cookie }).catch((e) => e);
  } finally {
    installments.countDocuments = realCount;
  }
  assert.ok(fired, 'the hook ran');
  assert.equal(err?.message, 'not logged in');
  assert.equal(await db.collection('users').findOne({ _id: user._id }), null);
  for (const name of ['installments', 'payments']) {
    assert.equal(await db.collection(name).countDocuments({ token: owner }), 0, `${name} of the deleted account`);
  }
  assert.equal(await db.collection('profiles').findOne({ _id: owner }), null);
});

test('mark paid uses the Kuwait month: 01:00 on 1 Dec in Kuwait (22:00 UTC) allows January, whatever the server TZ', async () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Kuwait', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      const db = createMemoryDb();
      await ensureIndexes(db);
      const store = createStore(db, { now: () => new Date('2026-11-30T22:00:00Z') });
      const s = await store.add(GUEST, {
        provider: 'تابي', title: '', monthly: 5, dueDay: 20, remaining: 3, firstDue: '2026-12-20',
      });
      const id = s.installments[0].id;
      const out = await store.markPaid(GUEST, id, '2027-01', true);
      assert.deepEqual(out.payments.map((p) => p.month), ['2027-01'], tz);
      await assert.rejects(store.markPaid(GUEST, id, '2027-02', true), { message: 'invalid month' }, tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test('editing an installment can keep its stored first due date even when it is long past', async () => {
  const { call, clock } = await setup();
  const { cookie } = await call('auth_signup', { email: 'edit@x.com', password: 'password-ok' });
  const me = { session: cookie }; // the app requires an account for data
  const s = await call('aqsati_add', row({ p_due_day: 14, p_first_due: '2026-11-14' }), me);
  const id = s.result.installments[0].id;
  await call('aqsati_mark_paid', { p_id: id, p_month: '2026-11', p_paid: true }, me);
  clock.advance(10 * DAY); // now 25 Nov: 2026-11-14 is 11 days back
  const out = await call('aqsati_update', {
    p_id: id, ...row({ p_title: 'new title', p_due_day: 14, p_first_due: '2026-11-14' }),
  }, me);
  const i = out.result.installments[0];
  assert.deepEqual([i.title, i.first_due_date, i.remaining_count], ['new title', '2026-11-14', 3]);
  assert.deepEqual(out.result.payments.map((p) => p.month), ['2026-11'], 'the November mark is kept');
  // Any OTHER old date is still refused.
  await assert.rejects(
    call('aqsati_update', { p_id: id, ...row({ p_due_day: 14, p_first_due: '2026-11-13' }) }, me),
    { message: 'invalid first due date' },
  );
  // A new installment can't borrow an old date either.
  await assert.rejects(
    call('aqsati_add', row({ p_first_due: '2026-11-14' }), me),
    { message: 'invalid first due date' },
  );
});
