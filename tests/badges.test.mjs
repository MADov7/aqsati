// Achievement badges: which ones unlock for a given STATE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBadges, newlyUnlocked, badgeText, BADGE_IDS } from '../public/js/logic/badges.js';

const TODAY = '2026-11-15';
const inst = (id, monthly, dueDay, remaining, first) => ({
  id, provider: 'تمارا', title: '', monthly_amount: monthly, due_day: dueDay, remaining_count: remaining, first_due_date: first,
});
const A = inst('a', 50, 10, 12, '2026-08-10');
const B = inst('b', 30, 20, 6, '2026-09-20');
const DONE = inst('done', 40, 1, 3, '2026-05-01'); // last payment 2026-07-01
const pay = (id, month, at = `${month}-28T12:00:00`) => ({ installment_id: id, month, paid_at: at });
const map = (list) => Object.fromEntries(list.map((b) => [b.id, b]));

test('badges: a brand-new user has everything locked, in display order', () => {
  const list = computeBadges({ installments: [], payments: [], profile: null }, TODAY);
  assert.deepEqual(list.map((b) => b.id), BADGE_IDS);
  assert.ok(list.every((b) => b.unlocked === false));
  assert.deepEqual(map(list).planner.progress, { value: 0, target: 2 });
});

test('badges: active, careful user', () => {
  const payments = [
    pay('a', '2026-08', '2026-08-05T10:00:00'), // before the 10th → early bird
    pay('a', '2026-09'), pay('b', '2026-09'), pay('a', '2026-10'), pay('b', '2026-10'),
  ];
  const b = map(computeBadges({ installments: [A, B], payments, profile: { salary: 1000, safe_limit: 40, salary_day: 25 } }, TODAY));
  assert.equal(b.first_add.unlocked, true);
  assert.equal(b.planner.unlocked, true);
  assert.equal(b.under_limit.unlocked, true); // 80 / 1000 = 8%
  assert.equal(b.early_bird.unlocked, true);
  assert.equal(b.streak3.unlocked, true);
  assert.equal(b.paid_month.unlocked, false);
  assert.deepEqual(b.paid_month.progress, { value: 0, target: 2 });
  assert.equal(b.first_finish.unlocked, false);
  assert.equal(b.debt_free.unlocked, false);
});

test('badges: over the limit, no payday, paying late', () => {
  const b = map(computeBadges({
    installments: [A, B],
    payments: [pay('a', '2026-10', '2026-10-25T10:00:00')],
    profile: { salary: 150, safe_limit: 40, salary_day: null },
  }, TODAY));
  assert.equal(b.under_limit.unlocked, false); // 80 / 150 = 53%
  assert.equal(b.planner.unlocked, false);
  assert.deepEqual(b.planner.progress, { value: 1, target: 2 });
  assert.equal(b.early_bird.unlocked, false);
  assert.deepEqual(b.streak3.progress, { value: 0, target: 3 });
});

test('badges: a finished plan unlocks «first finish»; nothing active → debt free', () => {
  const both = map(computeBadges({ installments: [A, DONE], payments: [], profile: null }, TODAY));
  assert.equal(both.first_finish.unlocked, true);
  assert.equal(both.debt_free.unlocked, false);
  const onlyDone = map(computeBadges({ installments: [DONE], payments: [], profile: null }, TODAY));
  assert.equal(onlyDone.debt_free.unlocked, true);
  assert.equal(onlyDone.under_limit.unlocked, false); // needs a salary and something active
});

test('badges: this month fully marked paid', () => {
  const b = map(computeBadges({ installments: [A, B], payments: [pay('a', '2026-11'), pay('b', '2026-11')], profile: null }, TODAY));
  assert.equal(b.paid_month.unlocked, true);
  assert.deepEqual(b.paid_month.progress, { value: 2, target: 2 });
});

test('newlyUnlocked: only ids that were not unlocked before', () => {
  const list = computeBadges({ installments: [A], payments: [], profile: { salary: 900, safe_limit: 40, salary_day: 1 } }, TODAY);
  assert.deepEqual(newlyUnlocked(['first_add'], list), ['planner', 'under_limit']);
  assert.deepEqual(newlyUnlocked(null, []), []);
});

test('badgeText: Arabic and English wording for every badge', () => {
  for (const id of BADGE_IDS) {
    const ar = badgeText(id, 'ar');
    const en = badgeText(id, 'en');
    assert.ok(ar.title && ar.desc && ar.hint, id);
    assert.ok(en.title && en.desc && en.hint, id);
    assert.match(ar.title, /[؀-ۿ]/);
    assert.doesNotMatch(en.title, /[؀-ۿ]/);
  }
  assert.equal(badgeText('streak3', 'fr').title, badgeText('streak3', 'ar').title);
});

test('badges: an open-ended installment never finishes, so it blocks «debt free» and «first finish»', () => {
  const OPEN = { id: 'o', provider: 'بطاقة ائتمانية', title: '', monthly_amount: 40, due_day: 10, remaining_count: null, remaining_mode: 'open', last_amount: null, first_due_date: '2026-03-10' };
  const b = map(computeBadges({ installments: [OPEN], payments: [], profile: { salary: 1000, safe_limit: 40, salary_day: 25 } }, TODAY));
  assert.equal(b.debt_free.unlocked, false);
  assert.equal(b.first_finish.unlocked, false);
  assert.equal(b.first_add.unlocked, true);
  assert.equal(b.under_limit.unlocked, true); // 40 / 1000 counts every month
  assert.deepEqual(b.paid_month.progress, { value: 0, target: 1 }, 'due this month too');
  const withDone = map(computeBadges({ installments: [OPEN, DONE], payments: [], profile: null }, TODAY));
  assert.equal(withDone.first_finish.unlocked, true);
  assert.equal(withDone.debt_free.unlocked, false);
});
