// Smart tips (rule-based) and the salary-day look-ahead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTips, duesBeforeSalary, TIP_IDS } from '../public/js/logic/tips.js';

const TODAY = '2026-11-15';
const inst = (id, provider, monthly, dueDay, remaining, first) => ({
  id, provider, title: '', monthly_amount: monthly, due_day: dueDay, remaining_count: remaining, first_due_date: first,
});
const A = inst('a', 'تابي', 150, 10, 12, '2026-08-10'); // due 10th (already passed this month)
const B = inst('b', 'قرض بنك', 100, 20, 24, '2026-11-20'); // due 20th
const SHORT = inst('s', 'ديما', 25, 28, 2, '2026-11-28'); // Nov + Dec, then done
const profile = (salary, salaryDay = null, safe = 40) => ({ salary, safe_limit: safe, salary_day: salaryDay });
const ids = (tips) => tips.map((t) => t.id);
const ARABIC = /[؀-ۿ]/;

test('tips: nothing yet → start + add salary', () => {
  const tips = buildTips({ installments: [], payments: [], profile: null, today: TODAY });
  assert.deepEqual(ids(tips), ['start', 'salary']);
  assert.equal(tips[0].action.href, '/installments?add=1');
});

test('tips: over the safe limit comes first, with the amount over', () => {
  const tips = buildTips({ installments: [A, B], payments: [], profile: profile(500), today: TODAY });
  assert.equal(tips[0].id, 'over');
  assert.equal(tips[0].tone, 'over');
  assert.match(tips[0].body, /50\.000 د\.ك/); // 250 vs limit 200
  assert.match(tips[0].body, /50%/);
  assert.ok(tips.length <= 3);
});

test('tips: close to the limit → warn with the headroom left', () => {
  const tips = buildTips({ installments: [B], payments: [], profile: profile(300, 1), today: TODAY });
  const warn = tips.find((t) => t.id === 'warn'); // 100 / 300 = 33% ≥ 30%
  assert.ok(warn);
  assert.match(warn.body, /20\.000 د\.ك/);
});

test('tips: comfortable user hears good news; the closest to finishing is named', () => {
  const tips = buildTips({ installments: [B, SHORT], payments: [], profile: profile(3000, 1), today: TODAY }, { max: 5 });
  assert.ok(ids(tips).includes('good'));
  const closest = tips.find((t) => t.id === 'closest');
  assert.ok(closest);
  assert.match(closest.body, /ديما/);
  assert.match(closest.body, /قسطين/);
});

test('tips: a payment that came due this month but is not marked paid', () => {
  const tips = buildTips({ installments: [A], payments: [], profile: profile(3000, 1), today: TODAY }, { max: 5 });
  assert.ok(ids(tips).includes('unmarked'));
  const marked = buildTips({ installments: [A], payments: [{ installment_id: 'a', month: '2026-11', paid_at: '2026-11-10T08:00:00' }], profile: profile(3000, 1), today: TODAY }, { max: 5 });
  assert.ok(!ids(marked).includes('unmarked'));
});

test('tips: salary day set → salary risk; not set → ask for it', () => {
  const risky = buildTips({ installments: [A, B], payments: [], profile: profile(3000, 25), today: TODAY }, { max: 6 });
  assert.ok(ids(risky).includes('salaryRisk'));
  const noDay = buildTips({ installments: [A, B], payments: [], profile: profile(3000), today: TODAY }, { max: 6 });
  assert.ok(ids(noDay).includes('salaryDay'));
  assert.ok(!ids(noDay).includes('salaryRisk'));
});

test('tips: biggest burden needs two or more installments', () => {
  const tips = buildTips({ installments: [A, B], payments: [], profile: profile(5000, 1), today: TODAY }, { max: 6 });
  const big = tips.find((t) => t.id === 'biggest');
  assert.ok(big);
  assert.match(big.body, /تابي/);
  assert.match(big.body, /60%/);
});

test('tips: everything finished → debt free first', () => {
  const done = inst('d', 'تمارا', 40, 1, 3, '2026-05-01');
  assert.equal(buildTips({ installments: [done], payments: [], profile: profile(800), today: TODAY })[0].id, 'free');
});

test('tips: English wording, max and exclude options', () => {
  const tips = buildTips({ installments: [A, B], payments: [], profile: profile(500, 25), today: TODAY }, { lang: 'en', max: 2, exclude: ['salaryRisk'] });
  assert.equal(tips.length, 2);
  assert.ok(!ids(tips).includes('salaryRisk'));
  for (const t of tips) {
    assert.doesNotMatch(`${t.title} ${t.body}`, ARABIC);
  }
  assert.match(tips[0].body, /KWD 50\.000/);
  assert.ok(TIP_IDS.length >= 10);
});

test('duesBeforeSalary: unpaid dues from today until (not incl.) payday', () => {
  const d = duesBeforeSalary([A, B, SHORT], [], 25, TODAY);
  assert.equal(d.salaryDate, '2026-11-25');
  assert.equal(d.daysToSalary, 10);
  assert.equal(d.salaryToday, false);
  assert.deepEqual(d.items.map((i) => [i.inst.id, i.date]), [['b', '2026-11-20']]);
  assert.equal(d.count, 1);
  assert.equal(d.total, 100);

  const paid = duesBeforeSalary([A, B, SHORT], [{ installment_id: 'b', month: '2026-11', paid_at: '2026-11-14T08:00:00' }], 25, TODAY);
  assert.equal(paid.count, 0);

  // payday already passed this month → the window runs to next month's payday
  const next = duesBeforeSalary([A, B, SHORT], [], 5, TODAY);
  assert.equal(next.salaryDate, '2026-12-05');
  assert.deepEqual(next.items.map((i) => i.inst.id), ['b', 's']);
  assert.equal(next.total, 125);
});

test('duesBeforeSalary: payday today or unset', () => {
  const today = duesBeforeSalary([A, B], [], 15, TODAY);
  assert.equal(today.salaryToday, true);
  assert.equal(today.count, 0);
  assert.equal(duesBeforeSalary([A], [], null, TODAY), null);
  assert.equal(duesBeforeSalary([A], [], 0, TODAY), null);
});
