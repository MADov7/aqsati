import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, InputError } from '../lib/store.js';
import { handleRpc } from '../lib/rpc.js';

// Minimal in-memory stand-in for the MongoDB collections the store uses.
function fakeDb() {
  const data = { profiles: new Map(), installments: new Map() };
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => doc[k] === v);
  const collection = (name) => {
    const rows = data[name];
    return {
      async findOne(filter) {
        return [...rows.values()].find((d) => matches(d, filter)) ?? null;
      },
      find(filter) {
        let list = [...rows.values()].filter((d) => matches(d, filter));
        return {
          sort() {
            list = list.sort((a, b) => a.createdAt - b.createdAt);
            return this;
          },
          async toArray() { return list.map((d) => ({ ...d })); },
        };
      },
      async updateOne(filter, update, opts) {
        const found = [...rows.values()].find((d) => matches(d, filter));
        if (found) Object.assign(found, update.$set);
        else if (opts?.upsert) rows.set(filter._id, { ...filter, ...update.$setOnInsert, ...update.$set });
      },
      async insertOne(doc) { rows.set(doc._id, { ...doc }); },
      async countDocuments(filter) { return [...rows.values()].filter((d) => matches(d, filter)).length; },
      async deleteOne(filter) {
        const found = [...rows.values()].find((d) => matches(d, filter));
        if (found) rows.delete(found._id);
      },
    };
  };
  return { collection, data };
}

const TOKEN = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
let clock = Date.UTC(2026, 10, 15, 9, 0, 0);
const now = () => new Date((clock += 1000));

test('state of a new token is empty', async () => {
  const store = createStore(fakeDb(), { now });
  assert.deepEqual(await store.state(TOKEN), { profile: null, installments: [] });
});

test('save, add, list in order, remove — and tokens never see each other', async () => {
  const db = fakeDb();
  const store = createStore(db, { now });
  let s = await store.save(TOKEN, { salary: 1200, safeLimit: 40 });
  assert.deepEqual(s.profile, { salary: 1200, safe_limit: 40 });

  s = await store.add(TOKEN, { provider: ' تابي ', title: 'آيفون', monthly: '45.5', dueDay: 25, remaining: 3, firstDue: '2026-11-25' });
  s = await store.add(TOKEN, { provider: 'قرض بنك', title: '', monthly: 250, dueDay: 1, remaining: 24, firstDue: '2026-12-01' });
  assert.equal(s.installments.length, 2);
  assert.equal(s.installments[0].provider, 'تابي');
  assert.equal(s.installments[0].monthly_amount, 45.5);
  assert.equal(s.installments[1].first_due_date, '2026-12-01');

  assert.deepEqual(await store.state(OTHER), { profile: null, installments: [] });
  await store.remove(OTHER, s.installments[0].id);
  assert.equal((await store.state(TOKEN)).installments.length, 2, 'another token cannot remove my rows');

  s = await store.remove(TOKEN, s.installments[0].id);
  assert.deepEqual(s.installments.map((i) => i.provider), ['قرض بنك']);

  s = await store.save(TOKEN, { salary: '1500', safeLimit: '35' });
  assert.deepEqual(s.profile, { salary: 1500, safe_limit: 35 });
  assert.equal(db.data.profiles.size, 1);
});

test('bad input is rejected with InputError', async () => {
  const store = createStore(fakeDb(), { now });
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
});

test('at most 50 installments per token', async () => {
  const store = createStore(fakeDb(), { now });
  const row = { provider: 'تابي', title: '', monthly: 1, dueDay: 20, remaining: 1, firstDue: '2026-11-20' };
  for (let i = 0; i < 50; i++) await store.add(TOKEN, row);
  await assert.rejects(store.add(TOKEN, row), /too many installments/);
});

test('update changes my installment only', async () => {
  const store = createStore(fakeDb(), { now });
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

test('handleRpc maps the page calls to the store', async () => {
  const store = createStore(fakeDb(), { now });
  await handleRpc({ fn: 'aqsati_save', args: { p_token: TOKEN, p_salary: 800, p_safe_limit: 40 } }, store);
  const s = await handleRpc({
    fn: 'aqsati_add',
    args: { p_token: TOKEN, p_provider: 'تمارا', p_title: '', p_monthly: 20, p_due_day: 16, p_remaining: 2, p_first_due: '2026-11-16' },
  }, store);
  assert.equal(s.installments.length, 1);
  await assert.rejects(handleRpc({ fn: 'drop_everything', args: {} }, store), /unknown function/);
  await assert.rejects(handleRpc(null, store), /unknown function/);
});
