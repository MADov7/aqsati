import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  providerColor, weekdayOf, weekdayOrder, addDays, monthGrid, eventStatus, monthEvents, eventsByDay, monthTotals,
  timeline, remainingSummary, roundPercents, byProvider, reportMonths, reportTips, csvCell, toCSV,
} from '../public/js/logic/schedule.js';

const A = { id: 'A', provider: 'تابي', title: 'جوال', monthly_amount: 50, due_day: 20, remaining_count: 3, first_due_date: '2026-11-20' };
const B = { id: 'B', provider: 'قرض بنك', title: 'سيارة', monthly_amount: 200, due_day: 25, remaining_count: 12, first_due_date: '2026-11-25' };
const C = { id: 'C', provider: 'تمارا', title: '', monthly_amount: 30, due_day: 5, remaining_count: 6, first_due_date: '2026-12-05' };
const LAST = { id: 'L', provider: 'ديما', title: 'لابتوب', monthly_amount: 40, due_day: 31, remaining_count: 4, first_due_date: '2026-11-30' };
const ALL = [A, B, C];

test('providerColor keeps fixed slots for known providers and a stable 6/7 slot for others', () => {
  assert.equal(providerColor('تابي'), 0);
  assert.equal(providerColor('تمارا'), 1);
  assert.equal(providerColor('أخرى'), 5);
  const z = providerColor('زين');
  assert.ok(z === 6 || z === 7);
  assert.equal(providerColor('زين'), z);
  assert.ok([6, 7].includes(providerColor('')));
});

test('weekdays, week order and day arithmetic', () => {
  assert.equal(weekdayOf('2026-11-01'), 0); // Sunday
  assert.equal(weekdayOf('2026-11-14'), 6); // Saturday
  assert.deepEqual(weekdayOrder(6), [6, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(weekdayOrder(0), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
});

test('monthGrid: Saturday start (Arabic) and Sunday start (English)', () => {
  const sat = monthGrid('2026-11', 6);
  assert.equal(sat.days[0].iso, '2026-10-31');
  assert.equal(sat.days[0].inMonth, false);
  assert.equal(sat.days[1].iso, '2026-11-01');
  assert.equal(sat.weeks.length, 5);
  assert.ok(sat.weeks.every((w) => w.length === 7));
  assert.ok(sat.weeks.every((w) => w[0].weekday === 6));
  assert.equal(sat.days.filter((d) => d.inMonth).length, 30);
  assert.equal(sat.days.at(-1).iso, '2026-12-04');

  const sun = monthGrid('2026-11', 0);
  assert.equal(sun.days[0].iso, '2026-11-01');
  assert.equal(sun.days.at(-1).iso, '2026-12-05');

  // February 2026 starts on a Sunday and has 28 days → exactly four weeks
  assert.equal(monthGrid('2026-02', 0).weeks.length, 4);
  // leap February
  assert.equal(monthGrid('2028-02', 6).days.filter((d) => d.inMonth).length, 29);
});

test('eventStatus', () => {
  assert.equal(eventStatus('2026-11-01', true, '2026-11-15'), 'paid');
  assert.equal(eventStatus('2026-11-01', false, '2026-11-15'), 'past');
  assert.equal(eventStatus('2026-11-15', false, '2026-11-15'), 'today');
  assert.equal(eventStatus('2026-11-20', false, '2026-11-15'), 'upcoming');
});

test('monthEvents uses payments for the paid state and clamps short months', () => {
  const today = '2026-11-21';
  const ev = monthEvents(ALL, '2026-11', [{ installment_id: 'A', month: '2026-11' }], today);
  assert.deepEqual(ev.map((e) => [e.id, e.date, e.status]), [['A', '2026-11-20', 'paid'], ['B', '2026-11-25', 'upcoming']]);
  assert.equal(ev[0].n, 1);
  assert.equal(ev[0].total, 3);
  assert.equal(ev[0].color, 0);

  const unpaid = monthEvents(ALL, '2026-11', [], today);
  assert.equal(unpaid[0].status, 'past');

  // due day 31 → Feb 28 in 2027, last payment flagged
  const feb = monthEvents([LAST], '2027-02', [], today);
  assert.equal(feb.length, 1);
  assert.equal(feb[0].date, '2027-02-28');
  assert.equal(feb[0].last, true);
  assert.equal(monthEvents([LAST], '2027-03', [], today).length, 0);
});

test('eventsByDay and monthTotals', () => {
  const today = '2026-11-21';
  const ev = monthEvents([...ALL, { ...B, id: 'B2', monthly_amount: 10 }], '2026-11', [{ installment_id: 'A', month: '2026-11' }], today);
  const byDay = eventsByDay(ev);
  assert.equal(byDay.get('2026-11-25').length, 2);
  assert.equal(byDay.get('2026-11-20').length, 1);
  const totals = monthTotals(ev);
  assert.equal(totals.count, 3);
  assert.equal(totals.total, 260);
  assert.equal(totals.paid, 50);
  assert.equal(totals.unpaid, 210);
  assert.equal(totals.ahead, 210);
  assert.equal(totals.pastCount, 0);
  const none = monthTotals([]);
  assert.equal(none.total, 0);
  assert.equal(none.paidPct, 0);
});

test('timeline: totals per month and which installments end', () => {
  const tl = timeline(ALL, '2026-11', 12);
  assert.equal(tl.length, 12);
  assert.deepEqual(tl.slice(0, 4).map((m) => [m.key, m.total, m.count]), [
    ['2026-11', 250, 2], ['2026-12', 280, 3], ['2027-01', 280, 3], ['2027-02', 230, 2],
  ]);
  assert.deepEqual(tl[2].ending, ['تابي']);
  assert.equal(tl[11].key, '2027-10');
  assert.deepEqual(tl[11].ending, ['قرض بنك']);
});

test('remainingSummary: debt, monthly, debt-free date and months left', () => {
  const s = remainingSummary(ALL, '2026-11-15');
  assert.equal(s.activeCount, 3);
  assert.equal(s.totalDebt, 2730);
  assert.equal(s.monthly, 280);
  assert.equal(s.debtFreeDate, '2027-10-25');
  assert.equal(s.lastInstallment.id, 'B');
  assert.equal(s.monthsLeft, 12);
  const later = remainingSummary(ALL, '2026-11-21'); // A's November payment has passed
  assert.equal(later.totalDebt, 2680);
  const none = remainingSummary([], '2026-11-15');
  assert.equal(none.debtFreeDate, null);
  assert.equal(none.monthsLeft, 0);
});

test('roundPercents always adds up to 100', () => {
  assert.deepEqual(roundPercents([200, 50, 30]), [71, 18, 11]);
  assert.deepEqual(roundPercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(roundPercents([0, 0]), [0, 0]);
  assert.equal(roundPercents([3.3, 7.1, 9.9, 1]).reduce((a, b) => a + b, 0), 100);
});

test('byProvider groups active installments by monthly or by remaining debt', () => {
  const monthly = byProvider([...ALL, { ...C, id: 'C2', monthly_amount: 20 }], '2026-11-15', 'monthly');
  assert.deepEqual(monthly.map((g) => [g.provider, g.value, g.count]), [['قرض بنك', 200, 1], ['تابي', 50, 1], ['تمارا', 50, 2]]);
  assert.equal(monthly.reduce((s, g) => s + g.pct, 0), 100);
  assert.equal(monthly[0].color, 3);
  const debt = byProvider(ALL, '2026-11-15', 'debt');
  assert.deepEqual(debt.map((g) => g.value), [2400, 180, 150]);
});

test('reportMonths covers the schedule history (capped) up to the months ahead', () => {
  const months = reportMonths(ALL, '2026-11-15', 24, 12);
  assert.equal(months[0], '2026-11');
  assert.equal(months.at(-1), '2027-11');
  assert.equal(months.length, 13);
  const old = reportMonths([{ ...A, first_due_date: '2023-01-20' }], '2026-11-15', 24, 2);
  assert.equal(old[0], '2024-11');
  assert.equal(old.at(-1), '2027-01');
});

test('reportTips picks the most useful advice', () => {
  const totals = { count: 2, total: 250, pastCount: 1, past: 50 };
  const tips = reportTips({ level: 'warn', totals, nextTotal: 200, ending: ['تابي', 'تابي'] });
  assert.deepEqual(tips.map((t) => t.key), ['tip.past', 'tip.ending', 'tip.drop', 'tip.warn']);
  assert.deepEqual(tips[1].names, ['تابي']);
  assert.equal(tips[2].amount, 50);
  assert.deepEqual(reportTips({ totals: { count: 0 } }).map((t) => t.key), ['tip.free']);
  assert.deepEqual(reportTips({ level: 'none', totals: { count: 1, total: 10, pastCount: 0 }, nextTotal: 30 }).map((t) => t.key), ['tip.rise', 'tip.salary']);
});

test('CSV: quoting, CRLF and formula-injection guard', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('x"y'), '"x""y"');
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('-خصم'), "'-خصم");
  assert.equal(csvCell(3.5), '3.5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('سطر\nثاني'), '"سطر\nثاني"');
  assert.equal(toCSV([['التاريخ', 'المبلغ'], ['2026-11-20', '50.000']]), 'التاريخ,المبلغ\r\n2026-11-20,50.000\r\n');
});

// ---------- remaining modes: open-ended (no end date) and amount with a partial final payment ----------

import { debtFreeCountdown } from '../public/js/logic/schedule.js';

const OPEN = { id: 'O', provider: 'بطاقة ائتمانية', title: '', monthly_amount: 40, due_day: 10, remaining_count: null, remaining_mode: 'open', last_amount: null, first_due_date: '2026-09-10' };
const PART = { id: 'P', provider: 'تابي', title: 'لابتوب', monthly_amount: 25, due_day: 25, remaining_count: 7, remaining_mode: 'amount', last_amount: 12.5, first_due_date: '2026-11-25' };

test('monthEvents: open-ended every month (no total, never last); the partial final payment carries its amount', () => {
  const today = '2026-11-15';
  const far = monthEvents([OPEN], '2030-01', [], today);
  assert.equal(far.length, 1);
  assert.deepEqual([far[0].total, far[0].last, far[0].open, far[0].amount, far[0].n, far[0].date], [null, false, true, 40, 41, '2030-01-10']);
  const may = monthEvents([PART], '2027-05', [], today);
  assert.deepEqual([may[0].amount, may[0].last, may[0].open, may[0].total, may[0].n], [12.5, true, false, 7, 7]);
  assert.deepEqual(monthEvents([PART], '2027-04', [], today).map((e) => [e.amount, e.last]), [[25, false]]);
  assert.equal(monthEvents([OPEN], '2026-08', [], today).length, 0, 'nothing before the first due date');
  assert.equal(monthTotals(monthEvents([PART, OPEN], '2027-05', [], today)).total, 52.5);
});

test('timeline: open-ended in every month, never ending', () => {
  const tl = timeline([...ALL, OPEN], '2026-11', 12);
  assert.deepEqual(tl.slice(0, 4).map((m) => [m.key, m.total, m.count]), [
    ['2026-11', 290, 3], ['2026-12', 320, 4], ['2027-01', 320, 4], ['2027-02', 270, 3],
  ]);
  assert.deepEqual(tl[2].ending, ['تابي']);
  assert.ok(tl.every((m) => !m.ending.includes('بطاقة ائتمانية')));
  const part = timeline([PART], '2027-04', 3);
  assert.deepEqual(part.map((m) => [m.key, m.total, m.ending]), [['2027-04', 25, []], ['2027-05', 12.5, ['تابي']], ['2027-06', 0, []]]);
});

test('remainingSummary: open-ended counted monthly, never in debt or the debt-free date', () => {
  const s = remainingSummary([...ALL, OPEN], '2026-11-15');
  assert.deepEqual(
    [s.activeCount, s.finiteCount, s.openCount, s.openMonthly, s.totalDebt, s.monthly, s.debtFreeDate, s.monthsLeft, s.lastInstallment.id],
    [4, 3, 1, 40, 2730, 320, '2027-10-25', 12, 'B'],
  );
  const only = remainingSummary([OPEN], '2026-11-15');
  assert.deepEqual(
    [only.activeCount, only.finiteCount, only.openCount, only.totalDebt, only.monthly, only.debtFreeDate, only.lastInstallment, only.monthsLeft],
    [1, 0, 1, 0, 40, null, null, 0],
  );
  const part = remainingSummary([PART], '2027-04-26');
  assert.deepEqual([part.totalDebt, part.monthsLeft, part.debtFreeDate], [12.5, 1, '2027-05-25']);
  const none = remainingSummary([], '2026-11-15');
  assert.deepEqual([none.finiteCount, none.openCount, none.openMonthly], [0, 0, 0]);
});

test('byProvider: open-ended in «monthly», not in «debt»', () => {
  const monthly = byProvider([...ALL, OPEN], '2026-11-15', 'monthly');
  assert.deepEqual(monthly.find((g) => g.provider === 'بطاقة ائتمانية'), { provider: 'بطاقة ائتمانية', value: 40, count: 1, color: 4, pct: 12 });
  assert.equal(monthly.reduce((s, g) => s + g.pct, 0), 100);
  const debt = byProvider([...ALL, OPEN], '2026-11-15', 'debt');
  assert.ok(!debt.some((g) => g.provider === 'بطاقة ائتمانية'));
  assert.deepEqual(debt.map((g) => g.value), [2400, 180, 150]);
  assert.deepEqual(byProvider([OPEN], '2026-11-15', 'debt'), []);
  assert.deepEqual(byProvider([PART], '2026-11-15', 'debt').map((g) => g.value), [162.5]);
});

test('debtFreeCountdown: finite installments only, open-ended counted aside', () => {
  const f = debtFreeCountdown(ALL, '2026-11-15');
  assert.deepEqual(
    [f.total, f.paid, f.pct, f.last, f.left, f.monthsLeft, f.finiteCount, f.activeCount, f.openCount, f.openMonthly],
    [2730, 0, 0, '2027-10-25', 21, 11, 3, 3, 0, 0],
  );
  const later = debtFreeCountdown(ALL, '2026-11-21');
  assert.deepEqual([later.paid, later.left], [50, 20]);
  assert.ok(Math.abs(later.pct - (50 / 2730) * 100) < 1e-9);
  const withOpen = debtFreeCountdown([...ALL, OPEN], '2026-11-15');
  assert.deepEqual(
    [withOpen.total, withOpen.paid, withOpen.last, withOpen.left, withOpen.monthsLeft, withOpen.finiteCount, withOpen.activeCount, withOpen.openCount, withOpen.openMonthly],
    [2730, 0, '2027-10-25', 21, 11, 3, 3, 1, 40],
  );
  const only = debtFreeCountdown([OPEN], '2026-11-15');
  assert.deepEqual([only.last, only.activeCount, only.finiteCount, only.openCount, only.total, only.pct, only.monthsLeft], [null, 0, 0, 1, 0, 0, 0]);
  assert.equal(debtFreeCountdown([PART], '2026-11-15').total, 162.5);
  const partLate = debtFreeCountdown([PART], '2027-05-01');
  assert.deepEqual([partLate.paid, partLate.left], [150, 1]);
  // a finished plan counts as fully paid
  const done = debtFreeCountdown([{ ...A, first_due_date: '2026-05-20' }], '2026-11-15');
  assert.deepEqual([done.total, done.paid, done.pct, done.activeCount, done.finiteCount, done.last], [150, 150, 100, 0, 1, null]);
  assert.deepEqual(debtFreeCountdown([], '2026-11-15'), {
    finiteCount: 0, activeCount: 0, total: 0, paid: 0, pct: 0, last: null, left: 0, monthsLeft: 0, openCount: 0, openMonthly: 0,
  });
});
