// أقساطي — payment streak: consecutive months in which EVERY installment due that month was marked paid («دفعت ✓»).
// Pure (no DOM). Months are 'YYYY-MM'; payments come from STATE.payments (the last 24 months).
//
//   computeStreak(installments, payments, today) → {
//     current,      // streak ending this month (or last month while this month is still in progress)
//     best,         // longest run inside the window (>= current)
//     thisMonth,    // { month, due, paid, complete }
//     months,       // [{ month, due, paid, complete, current }] oldest → newest (the whole window)
//   }
// A month with nothing due neither counts nor breaks the walk while it is the current month; an older
// empty month ends the streak (there is nothing to be consistent about before the first installment).

import { monthKey, shiftMonthKey, paymentIndexIn, paidKeys } from '../../calc.js';

export const STREAK_WINDOW = 24;

/** One month: how many installments were due and how many of those were marked paid. */
export function monthStatus(installments, paid, key) {
  const set = paid instanceof Set ? paid : paidKeys(paid);
  let due = 0;
  let done = 0;
  for (const inst of installments || []) {
    if (paymentIndexIn(inst, key) < 0) continue;
    due += 1;
    if (set.has(`${inst.id}|${key}`)) done += 1;
  }
  return { month: key, due, paid: done, complete: due > 0 && done === due };
}

export function computeStreak(installments, payments, today, { window = STREAK_WINDOW } = {}) {
  const set = paidKeys(payments);
  const cur = monthKey(today);
  const months = [];
  for (let k = window - 1; k >= 0; k -= 1) {
    const key = shiftMonthKey(cur, -k);
    months.push({ ...monthStatus(installments, set, key), current: k === 0 });
  }

  // current streak: walk back from this month
  let current = 0;
  for (let i = months.length - 1; i >= 0; i -= 1) {
    const m = months[i];
    if (m.complete) {
      current += 1;
      continue;
    }
    if (m.current) continue; // this month is still in progress: it neither counts nor breaks
    break;
  }

  // best run anywhere in the window
  let best = 0;
  let run = 0;
  for (const m of months) {
    if (m.complete) {
      run += 1;
      best = Math.max(best, run);
    } else if (!m.current) {
      run = 0;
    }
  }
  best = Math.max(best, current);

  const last = months[months.length - 1];
  return {
    current,
    best,
    thisMonth: { month: last.month, due: last.due, paid: last.paid, complete: last.complete },
    months,
  };
}
