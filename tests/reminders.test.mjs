import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, ensureIndexes, userOwner } from '../lib/store.js';
import { handleRpc } from '../lib/rpc.js';
import { createMemoryDb } from '../lib/memorydb.js';
import { createReminders, kuwaitToday, reminderEmail } from '../lib/reminders.js';
import { mailConfig, buildMessage, parseAddress } from '../lib/mailer.js';

const NOW = new Date('2026-11-16T05:00:00Z'); // 08:00 in Kuwait → today 2026-11-16, tomorrow 17
const UID = '0f8e7a3c-1b2d-4c5e-9f6a-7b8c9d0e1f2a';
const CFG = () => ({ kind: 'smtp' });

async function setup({ config = CFG, send } = {}) {
  const db = createMemoryDb();
  await ensureIndexes(db);
  let clock = NOW;
  const now = () => clock;
  const store = createStore(db, { now });
  const mails = [];
  const rem = createReminders(db, { store, now, config, send: send || (async (m) => { mails.push(m); }) });
  await db.collection('users').insertOne({ _id: UID, email: 'sara@example.test', passwordHash: 'x', createdAt: NOW });
  const user = { id: UID, email: 'sara@example.test' };
  const owner = userOwner(UID);
  return { db, store, rem, mails, user, owner, setClock: (d) => { clock = d; } };
}

test('kuwaitToday uses UTC+3', () => {
  assert.equal(kuwaitToday(new Date('2026-11-16T20:59:00Z')), '2026-11-16');
  assert.equal(kuwaitToday(new Date('2026-11-16T21:00:00Z')), '2026-11-17');
});

test('runDaily emails tomorrow\'s unpaid installments once, to the account email', async () => {
  const { rem, store, mails, user, owner } = await setup();
  await store.add(owner, { provider: 'تابي', title: 'آيفون', monthly: '45.5', dueDay: 17, remaining: 3, firstDue: '2026-11-17' });
  await store.add(owner, { provider: 'تمارا', title: '', monthly: 20, dueDay: 25, remaining: 2, firstDue: '2026-11-25' }); // not tomorrow
  await rem.set(user, true);
  const r1 = await rem.runDaily();
  assert.deepEqual({ users: r1.users, emails: r1.emails, failed: r1.failed, today: r1.today }, { users: 1, emails: 1, failed: 0, today: '2026-11-16' });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'sara@example.test');
  assert.match(mails[0].subject, /باچر قسط تابي 45\.500 د\.ك/);
  assert.match(mails[0].html, /آيفون/);
  assert.doesNotMatch(mails[0].html, /تمارا/);
  const r2 = await rem.runDaily(); // same day again (cron retry): nothing new
  assert.equal(r2.emails, 0);
  assert.equal(mails.length, 1);
});

test('no email when reminders are off, the payment is marked paid, or email is not configured', async () => {
  const a = await setup();
  await a.store.add(a.owner, { provider: 'تابي', title: '', monthly: 10, dueDay: 17, remaining: 3, firstDue: '2026-11-17' });
  assert.equal((await a.rem.runDaily()).emails, 0); // off by default
  await a.rem.set(a.user, true);
  const id = (await a.store.state(a.owner)).installments[0].id;
  await a.store.markPaid(a.owner, id, '2026-11', true);
  assert.equal((await a.rem.runDaily()).emails, 0);
  assert.equal(a.mails.length, 0);

  const b = await setup({ config: () => null });
  await b.store.add(b.owner, { provider: 'تابي', title: '', monthly: 10, dueDay: 17, remaining: 3, firstDue: '2026-11-17' });
  await b.rem.set(b.user, true);
  const out = await b.rem.runDaily();
  assert.equal(out.configured, false);
  assert.equal(b.mails.length, 0);
});

test('a failed send is retried on the next run', async () => {
  let fail = true;
  const sent = [];
  const s = await setup({ send: async (m) => { if (fail) throw new Error('smtp down'); sent.push(m); } });
  await s.store.add(s.owner, { provider: 'تابي', title: '', monthly: 10, dueDay: 17, remaining: 3, firstDue: '2026-11-17' });
  await s.rem.set(s.user, true);
  assert.equal((await s.rem.runDaily()).failed, 1);
  fail = false;
  assert.equal((await s.rem.runDaily()).emails, 1);
  assert.equal(sent.length, 1);
});

test('a deleted account is skipped and its preference dropped', async () => {
  const s = await setup();
  await s.rem.set(s.user, true);
  await s.db.collection('users').deleteOne({ _id: UID });
  await s.rem.runDaily();
  assert.equal(await s.db.collection('email_reminders').findOne({ _id: UID }), null);
});

test('get / set / test with a one-minute cooldown', async () => {
  const s = await setup();
  assert.deepEqual(await s.rem.get(s.user), { on: false, configured: true, email: 'sara@example.test' });
  assert.equal((await s.rem.set(s.user, true)).on, true);
  await assert.rejects(s.rem.set(s.user, 'yes'), /invalid value/);
  assert.equal((await s.rem.test(s.user)).sent, true);
  assert.match(s.mails[0].subject, /شغّال/);
  await assert.rejects(s.rem.test(s.user), (e) => e.status === 429);
  s.setClock(new Date(NOW.getTime() + 61000));
  assert.equal((await s.rem.test(s.user)).sent, true);
  const off = await setup({ config: () => null });
  await assert.rejects(off.rem.test(off.user), (e) => e.status === 503);
});

test('email RPCs need a signed-in account', async () => {
  const s = await setup();
  const auth = { sessionUser: async (t) => (t === 'good' ? s.user : null) };
  await assert.rejects(handleRpc({ fn: 'email_reminders_get' }, { store: s.store, auth, reminders: s.rem }), /not logged in/);
  const r = await handleRpc({ fn: 'email_reminders_set', args: { on: true } }, { store: s.store, auth, reminders: s.rem, sessionToken: 'good' });
  assert.equal(r.on, true);
});

test('reminderEmail sums several dues; mailer helpers', () => {
  const dues = [
    { id: 'a', key: 'a|2026-11-17', date: '2026-11-17', when: 'tomorrow', provider: 'تابي', title: '', amount: 10, open: false, last: false },
    { id: 'b', key: 'b|2026-11-17', date: '2026-11-17', when: 'tomorrow', provider: 'تمارا', title: '<b>x</b>', amount: 5.5, open: false, last: true },
  ];
  const m = reminderEmail(dues);
  assert.match(m.subject, /2 أقساط بمجموع 15\.500 د\.ك/);
  assert.doesNotMatch(m.html, /<b>x<\/b>/); // escaped
  assert.equal(mailConfig({}), null);
  assert.equal(mailConfig({ SMTP_USER: 'a@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' }).pass, 'abcdefghijklmnop');
  assert.equal(mailConfig({ RESEND_API_KEY: 'k' }).kind, 'resend');
  assert.deepEqual(parseAddress('اقصادي <a@b.co>'), { name: 'اقصادي', address: 'a@b.co' });
  const msg = buildMessage({ from: 'اقصادي <a@b.co>', to: 'x@y.co', subject: 'تجربة', text: 't', html: '<p>h</p>' });
  assert.match(msg, /^From: =\?UTF-8\?B\?/m);
  assert.match(msg, /^Subject: =\?UTF-8\?B\?/m);
  assert.throws(() => buildMessage({ from: 'a@b.co', to: 'x@y.co\r\nBcc: z@z.co', subject: 's', text: '', html: '' }), /line break/);
});
