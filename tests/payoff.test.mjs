import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, activeDebts, orderDebts, simulatePlan } from '../public/js/logic/payoff.js';

const TODAY = '2026-11-15';
const A = { id: 'A', provider: 'تابي', title: 'جوال', monthly_amount: 50, due_day: 20, remaining_count: 3, first_due_date: '2026-11-20' };
const B = { id: 'B', provider: 'قرض بنك', title: 'سيارة', monthly_amount: 200, due_day: 25, remaining_count: 12, first_due_date: '2026-11-25' };
const C = { id: 'C', provider: 'تمارا', title: '', monthly_amount: 30, due_day: 5, remaining_count: 6, first_due_date: '2026-12-05' };
const DONE = { id: 'D', provider: 'ديما', title: 'قديم', monthly_amount: 10, due_day: 1, remaining_count: 2, first_due_date: '2026-08-01' };
const ALL = [A, B, C, DONE];

test('activeDebts skips finished installments', () => {
  const debts = activeDebts(ALL, TODAY);
  assert.deepEqual(debts.map((d) => [d.id, d.remainingTotal, d.remaining, d.lastDue]), [
    ['A', 150, 3, '2027-01-20'], ['B', 2400, 12, '2027-10-25'], ['C', 180, 6, '2027-05-05'],
  ]);
  assert.deepEqual(STRATEGIES, ['relief', 'impact']);
});

test('orderDebts: relief = smallest remaining total first, impact = highest monthly first', () => {
  const debts = activeDebts(ALL, TODAY);
  assert.deepEqual(orderDebts(debts, 'relief').map((d) => d.id), ['A', 'C', 'B']);
  assert.deepEqual(orderDebts(debts, 'impact').map((d) => d.id), ['B', 'A', 'C']);
  // ties: same total → fewer months first
  const tie = [{ id: 'x', remainingTotal: 100, remaining: 4, monthly: 25 }, { id: 'y', remainingTotal: 100, remaining: 2, monthly: 50 }];
  assert.deepEqual(orderDebts(tie, 'relief').map((d) => d.id), ['y', 'x']);
});

test('no extra and no rollover = the natural schedule', () => {
  const plan = simulatePlan(ALL, { today: TODAY, extra: 0, strategy: 'relief' });
  assert.equal(plan.totalDebt, 2730);
  assert.equal(plan.debtFreeDate, '2027-10-25');
  assert.equal(plan.naturalDate, '2027-10-25');
  assert.equal(plan.monthsSaved, 0);
  assert.equal(plan.monthsToFree, 12);
  assert.equal(plan.naturalMonthsToFree, 12);
  for (const d of plan.debts) {
    assert.equal(d.finishKey, d.naturalKey);
    assert.equal(d.finishDate, d.naturalDate);
    assert.equal(d.monthsSaved, 0);
  }
  assert.deepEqual(plan.schedule.slice(0, 3).map((m) => [m.key, m.amount]), [['2026-11', 250], ['2026-12', 280], ['2027-01', 280]]);
  assert.equal(plan.schedule.length, 12);
});

test('relief + 100 KWD extra: the small debts close first and the whole plan ends 3 months early', () => {
  const plan = simulatePlan(ALL, { today: TODAY, extra: 100, strategy: 'relief' });
  const by = Object.fromEntries(plan.debts.map((d) => [d.id, d]));
  assert.deepEqual(plan.debts.map((d) => [d.id, d.order]), [['A', 1], ['C', 2], ['B', 3]]);
  assert.equal(by.A.finishKey, '2026-11');
  assert.equal(by.A.finishDate, '2026-11-20');
  assert.equal(by.A.monthsSaved, 2);
  assert.equal(by.C.finishKey, '2027-01');
  assert.equal(by.C.finishDate, '2027-01-05');
  assert.equal(by.C.monthsSaved, 4);
  assert.equal(by.B.finishKey, '2027-07');
  assert.equal(plan.debtFreeDate, '2027-07-25');
  assert.equal(plan.monthsSaved, 3);
  assert.equal(plan.monthsToFree, 9);
  assert.equal(plan.schedule[0].amount, 350);
  // every fils is paid, never more
  const paid = plan.schedule.reduce((s, m) => s + Math.round(m.amount * 1000), 0);
  assert.equal(paid, 2730 * 1000);
});

test('rollover sends the monthly amount of finished installments down the list', () => {
  const plan = simulatePlan(ALL, { today: TODAY, extra: 100, strategy: 'relief', rollover: true });
  const by = Object.fromEntries(plan.debts.map((d) => [d.id, d]));
  assert.equal(by.C.finishKey, '2026-12');
  assert.equal(plan.debtFreeKey, '2027-06');
  assert.equal(plan.monthsSaved, 4);
  // even with no extra, rollover alone can speed things up
  const free = simulatePlan(ALL, { today: TODAY, extra: 0, rollover: true });
  assert.ok(free.monthsSaved >= 1);
});

test('impact strategy targets the biggest monthly payment first', () => {
  const plan = simulatePlan(ALL, { today: TODAY, extra: 100, strategy: 'impact' });
  assert.equal(plan.strategy, 'impact');
  assert.equal(plan.debts[0].id, 'B');
  assert.equal(plan.debtFreeKey, '2027-06');
  const by = Object.fromEntries(plan.debts.map((d) => [d.id, d]));
  assert.equal(by.A.finishKey, '2027-01'); // keeps its own pace
  assert.equal(by.C.finishKey, '2027-05');
});

test('edge cases: nothing left, unknown strategy, huge extra', () => {
  assert.equal(simulatePlan([DONE], { today: TODAY }), null);
  assert.equal(simulatePlan([], { today: TODAY }), null);
  assert.equal(simulatePlan(ALL, { today: TODAY, strategy: 'nope' }).strategy, 'relief');
  const big = simulatePlan(ALL, { today: TODAY, extra: 1e6 });
  assert.equal(big.debtFreeKey, '2026-11');
  assert.equal(big.monthsToFree, 1);
  assert.equal(big.monthsSaved, 11);
});
