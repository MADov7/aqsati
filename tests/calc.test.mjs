import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, parseWhole, firstDueDate, nthDueDate, installmentStatus, monthSummary,
  affordability, levelFor, validateInstallmentInput, validateProfileInput, validateCheckInput,
  fmtKWD, fmtDaysLeft, fmtCount, daysBetween,
} from '../public/calc.js';

test('parseAmount understands Arabic digits, separators and junk', () => {
  assert.equal(parseAmount('125'), 125);
  assert.equal(parseAmount('١٢٥٫٥'), 125.5);
  assert.equal(parseAmount('۱۲'), 12);
  assert.equal(parseAmount('1,250.750'), 1250.75);
  assert.equal(parseAmount('1،250'), 1250);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount(' 40 '), 40);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('-5')));
  assert.ok(Number.isNaN(parseAmount('1.2.3')));
  assert.equal(parseWhole('٤'), 4);
  assert.ok(Number.isNaN(parseWhole('4.5')));
});

test('firstDueDate picks this month or next, clamping short months', () => {
  assert.equal(firstDueDate(25, '2026-11-11'), '2026-11-25');
  assert.equal(firstDueDate(11, '2026-11-11'), '2026-11-11');
  assert.equal(firstDueDate(5, '2026-11-11'), '2026-12-05');
  assert.equal(firstDueDate(31, '2026-11-11'), '2026-11-30');
  assert.equal(firstDueDate(30, '2027-01-31'), '2027-02-28');
  assert.equal(firstDueDate(1, '2026-12-15'), '2027-01-01');
});

test('nthDueDate keeps the due day after a short month', () => {
  const inst = { first_due_date: '2027-01-31', due_day: 31 };
  assert.equal(nthDueDate(inst, 0), '2027-01-31');
  assert.equal(nthDueDate(inst, 1), '2027-02-28');
  assert.equal(nthDueDate(inst, 2), '2027-03-31');
  assert.equal(nthDueDate(inst, 12), '2028-01-31');
});

test('installmentStatus counts down as due dates pass', () => {
  const inst = { first_due_date: '2026-11-25', due_day: 25, remaining_count: 3, monthly_amount: '50.000' };
  let s = installmentStatus(inst, '2026-11-11');
  assert.equal(s.remaining, 3);
  assert.equal(s.nextDue, '2026-11-25');
  assert.equal(s.daysLeft, 14);
  assert.equal(s.lastDue, '2027-01-25');
  assert.equal(s.remainingTotal, 150);
  s = installmentStatus(inst, '2026-11-25');
  assert.equal(s.remaining, 3, 'due today is still unpaid');
  s = installmentStatus(inst, '2026-11-26');
  assert.equal(s.remaining, 2);
  assert.equal(s.nextDue, '2026-12-25');
  s = installmentStatus(inst, '2027-01-26');
  assert.equal(s.remaining, 0);
  assert.equal(s.active, false);
  assert.equal(s.nextDue, null);
});

test('monthSummary totals, ratio, ordering and this-month amount', () => {
  const list = [
    { id: 'a', provider: 'تابي', first_due_date: '2026-12-05', due_day: 5, remaining_count: 4, monthly_amount: 30 },
    { id: 'b', provider: 'قرض بنك', first_due_date: '2026-11-20', due_day: 20, remaining_count: 24, monthly_amount: 250.5 },
    { id: 'c', provider: 'تمارا', first_due_date: '2026-11-12', due_day: 12, remaining_count: 1, monthly_amount: 19.25 },
  ];
  const s = monthSummary(list, 1000, 40, '2026-11-11');
  assert.deepEqual(s.active.map((i) => i.id), ['c', 'b', 'a']);
  assert.equal(s.monthlyTotal, 299.75);
  assert.equal(s.leftThisMonth, 269.75);
  assert.equal(s.totalDebt, round(30 * 4 + 250.5 * 24 + 19.25));
  assert.ok(Math.abs(s.ratio - 29.975) < 1e-9);
  assert.equal(s.level, 'ok');
  assert.equal(s.freeAfter, 700.25);
  assert.equal(s.limitAmount, 400);

  const later = monthSummary(list, 1000, 40, '2026-11-13');
  assert.deepEqual(later.finished.map((i) => i.id), ['c']);
  assert.equal(later.monthlyTotal, 280.5);

  const noSalary = monthSummary(list, 0, 40, '2026-11-11');
  assert.equal(noSalary.ratio, null);
  assert.equal(noSalary.level, 'none');
  assert.equal(noSalary.freeAfter, null);
});

function round(x) { return Math.round(x * 1000) / 1000; }

test('levelFor thresholds', () => {
  assert.equal(levelFor(null, 40), 'none');
  assert.equal(levelFor(10, 40), 'ok');
  assert.equal(levelFor(30, 40), 'warn');
  assert.equal(levelFor(40, 40), 'warn');
  assert.equal(levelFor(40.01, 40), 'over');
});

test('affordability: fits within the limit', () => {
  const r = affordability({ price: 400, count: 4, salary: 1000, safeLimit: 40, currentMonthly: 200 });
  assert.equal(r.newMonthly, 100);
  assert.equal(r.newTotal, 300);
  assert.equal(r.ok, true);
  assert.equal(r.overBy, 0);
  assert.equal(r.newRatio, 30);
  assert.equal(r.minSafeCount, null);
});

test('affordability: over the limit suggests a safe number of installments', () => {
  const r = affordability({ price: 900, count: 3, salary: 1000, safeLimit: 40, currentMonthly: 250 });
  assert.equal(r.ok, false);
  assert.equal(r.newMonthly, 300);
  assert.equal(r.overBy, 150);
  assert.equal(r.headroom, 150);
  assert.equal(r.minSafeCount, 6);
  assert.ok(900 / r.minSafeCount <= r.headroom);
  assert.ok(900 / (r.minSafeCount - 1) > r.headroom);
});

test('affordability: exactly at the limit is allowed; already over has no safe count', () => {
  assert.equal(affordability({ price: 600, count: 3, salary: 1000, safeLimit: 40, currentMonthly: 200 }).ok, true);
  const r = affordability({ price: 100, count: 2, salary: 1000, safeLimit: 40, currentMonthly: 450 });
  assert.equal(r.ok, false);
  assert.equal(r.alreadyOver, true);
  assert.equal(r.minSafeCount, null);
});

test('affordability: awkward decimals still give a valid safe count', () => {
  const r = affordability({ price: 0.7, count: 1, salary: 1, safeLimit: 7, currentMonthly: 0 });
  assert.equal(r.ok, false);
  assert.ok(round(0.7 / r.minSafeCount) <= r.headroom);
});

test('validators return Arabic errors and clean values', () => {
  const bad = validateInstallmentInput({ provider: ' ', monthly: '0', dueDay: '32', remaining: '0' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['dueDay', 'monthly', 'provider', 'remaining']);
  const good = validateInstallmentInput({ provider: ' تابي ', title: 'آيفون', monthly: '٣٣٫٣٣٣٤', dueDay: '٢٥', remaining: '4' });
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { provider: 'تابي', title: 'آيفون', monthly: 33.333, dueDay: 25, remaining: 4 });

  assert.equal(validateProfileInput({ salary: '1200', limit: '40' }).ok, true);
  assert.equal(validateProfileInput({ salary: '0', limit: '40' }).ok, false);
  assert.equal(validateProfileInput({ salary: '1200', limit: '150' }).ok, false);
  assert.equal(validateCheckInput({ price: '350', count: '4' }).ok, true);
  assert.equal(validateCheckInput({ price: '350', count: '0' }).ok, false);
});

test('formatting helpers', () => {
  assert.equal(fmtKWD(1250.5), '1,250.500 د.ك');
  assert.equal(fmtDaysLeft(0), 'اليوم');
  assert.equal(fmtDaysLeft(1), 'باچر');
  assert.equal(fmtDaysLeft(5), 'بعد 5 أيام');
  assert.equal(fmtDaysLeft(14), 'بعد 14 يوم');
  assert.equal(fmtCount(1), 'قسط واحد');
  assert.equal(fmtCount(2), 'قسطين');
  assert.equal(fmtCount(4), '4 أقساط');
  assert.equal(fmtCount(24), '24 قسط');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});
