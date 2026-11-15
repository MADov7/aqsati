// أقساطي — pure schedule helpers for the calendar, insights and report pages (no DOM, no network).
// Dates are plain 'YYYY-MM-DD' strings and months 'YYYY-MM' in the user's local calendar (same rules as calc.js).

import {
  PROVIDERS, round3, isoDate, parseISO, daysInMonth, nthDueDate, installmentStatus,
  monthKey, shiftMonthKey, monthsBetween, dueEventsInMonth, paidKeys,
} from '../../calc.js';

// ---------- provider colours (categorical slot follows the entity, never its rank) ----------

/** Number of categorical colour slots (.c-0 … .c-7 in the page CSS). */
export const COLOR_SLOTS = 8;

/** Colour slot for a provider: the six known providers keep fixed slots 0–5; any other name gets 6 or 7 (stable hash). */
export function providerColor(name) {
  const n = String(name ?? '').trim();
  const known = PROVIDERS.indexOf(n);
  if (known >= 0) return known;
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 6 + (h % 2);
}

// ---------- month grid ----------

/** Day of week of an ISO date: 0 = Sunday … 6 = Saturday (time-zone proof). */
export function weekdayOf(iso) {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The seven weekdays in display order for a week that starts on weekStart (6 = Saturday, 0 = Sunday). */
export function weekdayOrder(weekStart = 6) {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}

/** 'YYYY-MM-DD' moved by n days. */
export function addDays(iso, n) {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Calendar grid for month 'YYYY-MM': whole weeks (4–6) starting on weekStart.
 * Days from the neighbouring months fill the first / last week (inMonth: false).
 */
export function monthGrid(key, weekStart = 6) {
  const [y, m] = String(key).split('-').map(Number);
  const first = isoDate(y, m, 1);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const dim = daysInMonth(y, m);
  const days = [];
  for (let i = lead; i > 0; i -= 1) {
    const iso = addDays(first, -i);
    days.push({ iso, day: parseISO(iso).d, inMonth: false, weekday: weekdayOf(iso) });
  }
  for (let d = 1; d <= dim; d += 1) {
    const iso = isoDate(y, m, d);
    days.push({ iso, day: d, inMonth: true, weekday: weekdayOf(iso) });
  }
  let next = isoDate(y, m, dim);
  while (days.length % 7) {
    next = addDays(next, 1);
    days.push({ iso: next, day: parseISO(next).d, inMonth: false, weekday: weekdayOf(next) });
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { key: `${y}-${String(m).padStart(2, '0')}`, weekStart, weekdays: weekdayOrder(weekStart), days, weeks };
}

// ---------- the month's dues ----------

/** 'paid' (marked) | 'past' (date gone, not marked) | 'today' | 'upcoming'. */
export function eventStatus(date, paid, today) {
  if (paid) return 'paid';
  if (date < today) return 'past';
  if (date === today) return 'today';
  return 'upcoming';
}

/** Every payment due in month 'YYYY-MM' with its paid state: sorted by date, then bigger amounts first. */
export function monthEvents(installments, key, payments, today) {
  const set = payments instanceof Set ? payments : paidKeys(payments);
  return dueEventsInMonth(installments, key).map(({ inst, k, date, amount }) => {
    const total = Number(inst.remaining_count);
    const paid = set.has(`${inst.id}|${key}`);
    return {
      id: inst.id,
      inst,
      k,
      n: k + 1,
      total,
      last: k === total - 1,
      date,
      month: key,
      amount,
      provider: String(inst.provider ?? ''),
      title: String(inst.title ?? ''),
      color: providerColor(inst.provider),
      paid,
      status: eventStatus(date, paid, today),
    };
  });
}

/** Map of 'YYYY-MM-DD' → that day's events (keeps the given order). */
export function eventsByDay(events) {
  const map = new Map();
  for (const ev of events) {
    if (!map.has(ev.date)) map.set(ev.date, []);
    map.get(ev.date).push(ev);
  }
  return map;
}

/** Totals for a list of events (one month). */
export function monthTotals(events) {
  const sum = (list) => round3(list.reduce((s, e) => s + e.amount, 0));
  const paid = events.filter((e) => e.paid);
  const past = events.filter((e) => e.status === 'past');
  const ahead = events.filter((e) => e.status === 'today' || e.status === 'upcoming');
  const total = sum(events);
  const paidAmount = sum(paid);
  return {
    count: events.length,
    total,
    paid: paidAmount,
    paidCount: paid.length,
    unpaid: round3(total - paidAmount),
    past: sum(past),
    pastCount: past.length,
    ahead: sum(ahead),
    aheadCount: ahead.length,
    paidPct: total > 0 ? (paidAmount / total) * 100 : 0,
  };
}

// ---------- the next months ----------

/** Total due in each of `months` months from fromKey: [{ key, total, count, ending: [provider…] }]. */
export function timeline(installments, fromKey, months = 12) {
  const out = [];
  for (let i = 0; i < months; i += 1) {
    const key = shiftMonthKey(fromKey, i);
    const events = dueEventsInMonth(installments, key);
    out.push({
      key,
      total: round3(events.reduce((s, e) => s + e.amount, 0)),
      count: events.length,
      ending: events.filter((e) => e.k === Number(e.inst.remaining_count) - 1).map((e) => String(e.inst.provider ?? '')),
    });
  }
  return out;
}

/** Where all debts stand today: totals, the debt-free date and how many months still have a payment. */
export function remainingSummary(installments, today) {
  let totalDebt = 0;
  let monthly = 0;
  let activeCount = 0;
  let debtFreeDate = null;
  let lastInstallment = null;
  const months = new Set();
  for (const inst of installments || []) {
    const s = installmentStatus(inst, today);
    if (!s.active) continue;
    activeCount += 1;
    totalDebt += s.remainingTotal;
    monthly += s.monthly;
    if (!debtFreeDate || s.lastDue > debtFreeDate) {
      debtFreeDate = s.lastDue;
      lastInstallment = inst;
    }
    const total = Number(inst.remaining_count);
    for (let k = total - s.remaining; k < total; k += 1) months.add(monthKey(nthDueDate(inst, k)));
  }
  return {
    activeCount,
    totalDebt: round3(totalDebt),
    monthly: round3(monthly),
    debtFreeDate,
    lastInstallment,
    monthsLeft: months.size,
  };
}

/** Whole-number percentages that always add up to exactly 100 (largest remainder). */
export function roundPercents(values) {
  const total = values.reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  if (!(total > 0)) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, Number(v) || 0) / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; left > 0 && j < order.length; j += 1, left -= 1) out[order[j][1]] += 1;
  return out;
}

/**
 * Active installments grouped by provider. measure: 'monthly' (what you pay each month) or 'debt' (what is left).
 * → [{ provider, value, pct, count, color }] biggest first.
 */
export function byProvider(installments, today, measure = 'monthly') {
  const groups = new Map();
  for (const inst of installments || []) {
    const s = installmentStatus(inst, today);
    if (!s.active) continue;
    const name = String(inst.provider ?? '').trim();
    const g = groups.get(name) || { provider: name, value: 0, count: 0, color: providerColor(name) };
    g.value += measure === 'debt' ? s.remainingTotal : s.monthly;
    g.count += 1;
    groups.set(name, g);
  }
  const list = [...groups.values()]
    .map((g) => ({ ...g, value: round3(g.value) }))
    .sort((a, b) => b.value - a.value || a.provider.localeCompare(b.provider));
  const pcts = roundPercents(list.map((g) => g.value));
  return list.map((g, i) => ({ ...g, pct: pcts[i] }));
}

// ---------- monthly report ----------

/** Months the report can show: from the earliest schedule month (at most `back` months ago) to `ahead` months ahead. */
export function reportMonths(installments, today, back = 24, ahead = 12) {
  const now = monthKey(today);
  let start = now;
  for (const inst of installments || []) {
    const k = monthKey(inst.first_due_date || today);
    if (k < start) start = k;
  }
  const floor = shiftMonthKey(now, -back);
  if (start < floor) start = floor;
  const out = [];
  for (let k = start; monthsBetween(k, shiftMonthKey(now, ahead)) >= 0; k = shiftMonthKey(k, 1)) out.push(k);
  return out;
}

/**
 * Short advice lines for a month (the page translates the keys).
 * input: { level, totals (monthTotals), nextTotal, ending: [provider…], hasEvents }
 * → [{ key, n?, amount?, names? }] most useful first.
 */
export function reportTips({ level = 'none', totals = null, nextTotal = 0, ending = [], hasEvents = true } = {}) {
  const tips = [];
  if (!hasEvents || !totals || totals.count === 0) {
    tips.push({ key: 'tip.free' });
    return tips;
  }
  if (totals.pastCount > 0) tips.push({ key: 'tip.past', n: totals.pastCount, amount: totals.past });
  if (ending.length) tips.push({ key: 'tip.ending', names: [...new Set(ending)] });
  const diff = round3(nextTotal - totals.total);
  if (diff < 0) tips.push({ key: 'tip.drop', amount: -diff });
  else if (diff > 0) tips.push({ key: 'tip.rise', amount: diff });
  if (level === 'over') tips.push({ key: 'tip.over' });
  else if (level === 'warn') tips.push({ key: 'tip.warn' });
  else if (level === 'ok') tips.push({ key: 'tip.ok' });
  else tips.push({ key: 'tip.salary' });
  return tips;
}

/** One CSV cell: quoted when needed; text that a spreadsheet would run as a formula gets a leading apostrophe. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows (arrays) → CSV text with CRLF line endings (RFC 4180). Add a BOM when saving for Excel. */
export function toCSV(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
