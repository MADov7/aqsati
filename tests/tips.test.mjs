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

// ---------- remaining modes: open-ended (no end date) and amount with a partial final payment ----------

const OPEN = { id: 'o', provider: 'بطاقة ائتمانية', title: '', monthly_amount: 40, due_day: 10, remaining_count: null, remaining_mode: 'open', last_amount: null, first_due_date: '2026-09-10' };
const PART = { id: 'p', provider: 'تابي', title: 'لابتوب', monthly_amount: 25, due_day: 25, remaining_count: 7, remaining_mode: 'amount', last_amount: 12.5, first_due_date: '2026-11-25' };

test('tips: over the limit with only open-ended installments → overOpen (no end date to wait for)', () => {
  const tips = buildTips({ installments: [OPEN], payments: [], profile: profile(50), today: TODAY });
  assert.equal(tips[0].id, 'overOpen');
  assert.equal(tips[0].tone, 'over');
  assert.match(tips[0].body, /20\.000 د\.ك/); // 40 vs limit 20
  assert.equal(tips[0].action.href, '/check#whatif');
  // with a finite installment the classic «over» (until it ends) is used
  const mixed = buildTips({ installments: [OPEN, SHORT], payments: [], profile: profile(50), today: TODAY });
  assert.equal(mixed[0].id, 'over');
  assert.match(mixed[0].body, /ديما/);
});

test('tips: «closest» ignores open-ended installments, «biggest» never names a smaller plan; an openEnded info tip is added', () => {
  const tips = buildTips({ installments: [OPEN, SHORT], payments: [], profile: profile(3000, 1), today: TODAY }, { max: 10 });
  const closest = tips.find((t) => t.id === 'closest');
  assert.ok(closest);
  assert.match(closest.body, /ديما/);
  const open = tips.find((t) => t.id === 'openEnded');
  assert.ok(open);
  assert.equal(open.tone, 'info');
  assert.match(open.body, /40\.000 د\.ك/);
  assert.match(open.body, /عليه/);
  assert.equal(open.action.href, '/installments');
  // «biggest» compares ALL active plans: when the open-ended one is the biggest, no tip (it would name a smaller plan
  // as «أكبر حمل عليك», which is false); a bigger finite plan is named with its share of the whole monthly total;
  // a tie prefers the finite plan (so the result never depends on array order)
  const bigOf = (list) => buildTips({ installments: list, payments: [], profile: profile(5000, 1), today: TODAY }, { max: 10 }).find((t) => t.id === 'biggest');
  assert.equal(bigOf([OPEN, { ...B, monthly_amount: 30 }]), undefined);
  const big = bigOf([OPEN, { ...B, monthly_amount: 50 }]);
  assert.ok(big);
  assert.match(big.body, /قرض بنك/);
  assert.match(big.body, /55\.6%/); // 50 / 90
  for (const list of [[OPEN, { ...B, monthly_amount: 40 }], [{ ...B, monthly_amount: 40 }, OPEN]]) {
    const tie = bigOf(list);
    assert.ok(tie);
    assert.match(tie.body, /قرض بنك/);
    assert.match(tie.body, /50%/); // 40 / 80
  }
  const two = buildTips({ installments: [OPEN, { ...OPEN, id: 'o2' }], payments: [], profile: profile(3000, 1), today: TODAY }, { max: 10 });
  assert.match(two.find((t) => t.id === 'openEnded').body, /قسطين/);
  assert.match(two.find((t) => t.id === 'openEnded').body, /عليها/);
});

test('tips: an open-only user with a comfortable ratio never crashes and gets good + openEnded', () => {
  let tips;
  assert.doesNotThrow(() => {
    tips = buildTips({ installments: [OPEN], payments: [], profile: profile(1000), today: TODAY }, { max: 10 });
  });
  const got = ids(tips);
  for (const id of ['closest', 'biggest', 'over', 'overOpen', 'free']) assert.ok(!got.includes(id), id);
  assert.ok(got.includes('good'));
  assert.ok(got.includes('openEnded'));
  // the debt-free tip never shows while an open-ended installment runs
  const doneAndOpen = buildTips({ installments: [inst('d', 'تمارا', 40, 1, 3, '2026-05-01'), OPEN], payments: [], profile: profile(1000), today: TODAY }, { max: 10 });
  assert.ok(!ids(doneAndOpen).includes('free'));
});

test('tips: English overOpen / openEnded', () => {
  const tips = buildTips({ installments: [OPEN], payments: [], profile: profile(50), today: TODAY }, { lang: 'en', max: 10 });
  const over = tips.find((t) => t.id === 'overOpen');
  const open = tips.find((t) => t.id === 'openEnded');
  assert.ok(over && open);
  for (const t of [over, open]) assert.doesNotMatch(`${t.title} ${t.body} ${t.action.label}`, ARABIC);
  assert.match(over.body, /KWD 20\.000/);
  assert.match(open.body, /1 installment with no end date \(KWD 40\.000 a month\)/);
  assert.match(open.body, /edit it /);
  assert.ok(TIP_IDS.includes('overOpen') && TIP_IDS.includes('openEnded'));
});

test('duesBeforeSalary: open-ended due every month; the partial final payment uses its amount', () => {
  const d = duesBeforeSalary([OPEN, PART], [], 28, '2027-05-01');
  assert.deepEqual(d.items.map((i) => [i.inst.id, i.date, i.amount]), [['o', '2027-05-10', 40], ['p', '2027-05-25', 12.5]]);
  assert.equal(d.count, 2);
  assert.equal(d.total, 52.5);
  const ancient = duesBeforeSalary([{ ...OPEN, first_due_date: '1990-01-10' }], [], 12, TODAY);
  assert.deepEqual(ancient.items.map((i) => i.date), ['2026-12-10']);
});
