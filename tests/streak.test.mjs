// Payment streak: consecutive months where every installment due that month was marked paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak, monthStatus, STREAK_WINDOW } from '../public/js/logic/streak.js';

const TODAY = '2026-11-15';
const inst = (id, monthly, dueDay, remaining, first) => ({
  id, provider: 'تابي', title: '', monthly_amount: monthly, due_day: dueDay, remaining_count: remaining, first_due_date: first,
});
const A = inst('a', 50, 10, 12, '2026-08-10'); // Aug 2026 → Jul 2027
const B = inst('b', 30, 20, 6, '2026-09-20'); // Sep 2026 → Feb 2027
const pay = (id, month) => ({ installment_id: id, month, paid_at: `${month}-01T09:00:00` });

test('streak: no installments → zero, this month has nothing due', () => {
  const s = computeStreak([], [], TODAY);
  assert.equal(s.current, 0);
  assert.equal(s.best, 0);
  assert.deepEqual(s.thisMonth, { month: '2026-11', due: 0, paid: 0, complete: false });
  assert.equal(s.months.length, STREAK_WINDOW);
  assert.equal(s.months.at(-1).current, true);
});

test('streak: three complete months; the current month in progress does not break it', () => {
  const payments = [pay('a', '2026-08'), pay('a', '2026-09'), pay('b', '2026-09'), pay('a', '2026-10'), pay('b', '2026-10')];
  const s = computeStreak([A, B], payments, TODAY);
  assert.equal(s.current, 3);
  assert.equal(s.best, 3);
  assert.deepEqual(s.thisMonth, { month: '2026-11', due: 2, paid: 0, complete: false });
});

test('streak: completing this month extends it', () => {
  const payments = ['2026-08', '2026-09', '2026-10', '2026-11'].flatMap((m) => [pay('a', m), ...(m >= '2026-09' ? [pay('b', m)] : [])]);
  const s = computeStreak([A, B], payments, TODAY);
  assert.equal(s.current, 4);
  assert.equal(s.best, 4);
  assert.equal(s.thisMonth.complete, true);
});

test('streak: a past month with one unpaid installment breaks the run', () => {
  const payments = [pay('a', '2026-08'), pay('a', '2026-09'), pay('a', '2026-10'), pay('b', '2026-10')]; // Sep: b missing
  const s = computeStreak([A, B], payments, TODAY);
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
});

test('streak: best remembers an older, longer run', () => {
  const C = inst('c', 20, 5, 12, '2026-01-05');
  const payments = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map((m) => pay('c', m)).concat([pay('c', '2026-10')]);
  const s = computeStreak([C], payments, TODAY);
  assert.equal(s.best, 5);
  assert.equal(s.current, 1); // Oct only (Jun–Sep unpaid), Nov in progress
});

test('streak: an empty month before the first installment ends the walk', () => {
  const s = computeStreak([A], [pay('a', '2026-08'), pay('a', '2026-09'), pay('a', '2026-10'), pay('a', '2026-11')], TODAY);
  assert.equal(s.current, 4);
  const jul = s.months.find((m) => m.month === '2026-07');
  assert.deepEqual([jul.due, jul.complete], [0, false]);
});

test('monthStatus: counts due and paid for one month (array or Set of keys)', () => {
  const payments = [pay('a', '2026-10')];
  assert.deepEqual(monthStatus([A, B], payments, '2026-10'), { month: '2026-10', due: 2, paid: 1, complete: false });
  assert.deepEqual(monthStatus([A, B], new Set(['a|2026-10', 'b|2026-10']), '2026-10').complete, true);
  assert.equal(monthStatus([A, B], [], '2027-03').due, 1); // B finished in Feb
});

test('streak: an open-ended installment is due every month from its first due date', () => {
  const OPEN = { id: 'o', provider: 'بطاقة ائتمانية', title: '', monthly_amount: 40, due_day: 10, remaining_count: null, remaining_mode: 'open', last_amount: null, first_due_date: '2026-09-10' };
  const s = computeStreak([OPEN], [pay('o', '2026-09'), pay('o', '2026-10'), pay('o', '2026-11')], TODAY);
  assert.equal(s.current, 3);
  assert.equal(s.best, 3);
  assert.equal(s.thisMonth.due, 1);
  assert.equal(s.thisMonth.complete, true);
  assert.equal(s.months.find((m) => m.month === '2026-08').due, 0);
  assert.equal(monthStatus([OPEN], [], '2031-01').due, 1, 'no end');
});
