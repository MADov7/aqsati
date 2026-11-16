// أقساطي — payoff plan (pure). Two orderings and an extra-payment simulator.
//
//   أسرع راحة  ('relief') = the smallest remaining total first → whole installments close sooner
//   أكبر أثر   ('impact') = the highest monthly amount first   → the biggest monthly payment disappears first
//
// Every month each active installment takes its normal payment; the extra amount (plus, with `rollover`,
// the monthly amounts of installments that already finished) goes to the first installment in the chosen order.
// Money is counted in fils (1/1000 KWD) as integers, so nothing drifts.

import { installmentStatus, monthKey, shiftMonthKey, monthsBetween, dueDateIn, round3 } from '../../calc.js';

export const STRATEGIES = ['relief', 'impact'];

const fils = (x) => Math.round((Number(x) || 0) * 1000);
const kwd = (f) => round3(f / 1000);
const MAX_MONTHS = 600;

/** Active installments as debts: [{ id, provider, title, monthly, remaining, remainingTotal, nextDue, lastDue, dueDay }]. */
export function activeDebts(installments, today) {
  const out = [];
  for (const inst of installments || []) {
    const s = installmentStatus(inst, today);
    if (!s.active) continue;
    out.push({
      id: inst.id,
      provider: String(inst.provider ?? ''),
      title: String(inst.title ?? ''),
      monthly: s.monthly,
      remaining: s.remaining,
      remainingTotal: s.remainingTotal,
      nextDue: s.nextDue,
      lastDue: s.lastDue,
      dueDay: Number(inst.due_day),
    });
  }
  return out;
}

const byId = (a, b) => String(a.id).localeCompare(String(b.id));

/** The debts in the order the extra money goes to them. */
export function orderDebts(debts, strategy = 'relief') {
  const list = [...debts];
  if (strategy === 'impact') {
    return list.sort((a, b) => b.monthly - a.monthly || a.remainingTotal - b.remainingTotal || byId(a, b));
  }
  return list.sort((a, b) => a.remainingTotal - b.remainingTotal || a.remaining - b.remaining || b.monthly - a.monthly || byId(a, b));
}

const dueIn = (key, dueDay) => {
  const [y, m] = key.split('-').map(Number);
  return dueDateIn(y, m, dueDay);
};

/**
 * Simulate a plan.
 * options: { today, extra = 0 (KWD per month), strategy = 'relief' | 'impact', rollover = false }
 * → null when nothing is left to pay, otherwise
 *   { strategy, extra, rollover, startKey, totalDebt,
 *     debts: [{ …debt, order, finishKey, finishDate, naturalKey, naturalDate, monthsSaved }] (in plan order),
 *     debtFreeKey, debtFreeDate, naturalKey, naturalDate, monthsSaved, monthsToFree, naturalMonthsToFree,
 *     schedule: [{ key, amount }] (what leaves your pocket each month under the plan) }
 */
export function simulatePlan(installments, { today, extra = 0, strategy = 'relief', rollover = false } = {}) {
  const debts = activeDebts(installments, today);
  if (!debts.length) return null;
  const startKey = monthKey(today);
  const strat = STRATEGIES.includes(strategy) ? strategy : 'relief';
  const order = orderDebts(debts, strat);
  const state = order.map((d, i) => ({
    d,
    order: i + 1,
    balance: fils(d.remainingTotal),
    monthly: fils(d.monthly),
    fromKey: monthKey(d.nextDue),
    finishKey: null,
  }));
  const extraFils = Math.max(0, fils(extra));
  let freed = 0;
  const schedule = [];
  let key = startKey;
  for (let guard = 0; guard < MAX_MONTHS && state.some((s) => s.balance > 0); guard += 1, key = shiftMonthKey(key, 1)) {
    let spent = 0;
    const finished = [];
    // 1) the normal monthly payments
    for (const s of state) {
      if (s.balance <= 0 || key < s.fromKey) continue;
      const pay = Math.min(s.monthly, s.balance);
      s.balance -= pay;
      spent += pay;
      if (s.balance === 0) {
        s.finishKey = key;
        finished.push(s);
      }
    }
    // 2) the extra money (+ freed monthly amounts with rollover) goes down the order
    let pool = extraFils + (rollover ? freed : 0);
    for (const s of state) {
      if (pool <= 0) break;
      // only installments already running this month (not one whose first/next due is later) — else its
      // finish date would land before its next due date, i.e. in the past
      if (s.balance <= 0 || key < s.fromKey) continue;
      const pay = Math.min(pool, s.balance);
      s.balance -= pay;
      pool -= pay;
      spent += pay;
      if (s.balance === 0) {
        s.finishKey = key;
        finished.push(s);
      }
    }
    // 3) what finished this month frees its monthly amount from next month on
    for (const s of finished) freed += s.monthly;
    schedule.push({ key, amount: kwd(spent) });
  }

  const planDebts = state.map((s) => {
    const naturalKey = monthKey(s.d.lastDue);
    const finishKey = s.finishKey || naturalKey;
    return {
      ...s.d,
      order: s.order,
      finishKey,
      finishDate: dueIn(finishKey, s.d.dueDay),
      naturalKey,
      naturalDate: s.d.lastDue,
      monthsSaved: Math.max(0, monthsBetween(finishKey, naturalKey)),
    };
  });
  const latest = (list, pick) => list.reduce((best, d) => (!best || pick(d) > pick(best) ? d : best), null);
  const planLast = latest(planDebts, (d) => d.finishDate);
  const naturalLast = latest(planDebts, (d) => d.naturalDate);
  return {
    strategy: strat,
    extra: kwd(extraFils),
    rollover: Boolean(rollover),
    startKey,
    totalDebt: kwd(state.reduce((s, x) => s + fils(x.d.remainingTotal), 0)),
    debts: planDebts,
    debtFreeKey: planLast.finishKey,
    debtFreeDate: planLast.finishDate,
    naturalKey: naturalLast.naturalKey,
    naturalDate: naturalLast.naturalDate,
    monthsSaved: Math.max(0, monthsBetween(planLast.finishKey, naturalLast.naturalKey)),
    monthsToFree: monthsBetween(startKey, planLast.finishKey) + 1,
    naturalMonthsToFree: monthsBetween(startKey, naturalLast.naturalKey) + 1,
    schedule,
  };
}
