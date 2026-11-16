// أقساطي — pure calculation helpers (no DOM, no network). Shared by the page and the tests.
// Dates are plain 'YYYY-MM-DD' strings in the user's local calendar, so time zones never shift a due day.

export const PROVIDERS = ['تابي', 'تمارا', 'ديما', 'قرض بنك', 'بطاقة ائتمانية', 'أخرى'];
export const DEFAULT_SAFE_LIMIT = 40;

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** "١٢٥٫٥" / "1,250.750" / "12,5" → number; anything else → NaN. */
export function parseAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  if (typeof input !== 'string') return NaN;
  let s = input.trim().replace(EASTERN_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  s = s.replace(/٫/g, '.').replace(/[٬،\s]/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (!s.includes('.') && (s.match(/,/g) || []).length === 1) s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function parseWhole(input) {
  const n = parseAmount(input);
  return Number.isInteger(n) ? n : NaN;
}

export const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;

// ---------- what the user knows about "what's left" (three modes) ----------
//   'count'  — n payments of monthly_amount (the default; old documents have no remaining_mode)
//   'amount' — a total still to pay: n − 1 full payments + one final payment (last_amount when it is partial)
//   'open'   — no end date: a real monthly payment every month (remaining_count null)

export const REMAINING_MODES = ['count', 'amount', 'open'];
export const MAX_PAYMENTS = 360;

// money in fils (integer thousandths of a KWD) so sums never drift
const fils = (x) => Math.round(Number(x) * 1000);
const kwd = (f) => round3(f / 1000);

/** The installment's mode; anything missing or unknown is 'count' (old documents). */
export function remainingMode(inst) {
  return ['amount', 'open'].includes(inst?.remaining_mode) ? inst.remaining_mode : 'count';
}

export const isOpenEnded = (inst) => remainingMode(inst) === 'open';

/** Payments in the plan from first_due_date (Infinity for open-ended). */
export function planCount(inst) {
  return isOpenEnded(inst) ? Infinity : Math.max(0, Number(inst?.remaining_count) || 0);
}

/** Amount of the k-th payment (k = 0 is first_due_date): the monthly amount, or last_amount for a partial final one. */
export function paymentAmount(inst, k) {
  const m = round3(Number(inst?.monthly_amount) || 0);
  if (isOpenEnded(inst)) return m;
  if (k === planCount(inst) - 1) {
    const l = round3(Number(inst.last_amount));
    if (l > 0 && l < m) return l;
  }
  return m;
}

/** Everything the plan costs from first_due_date on (null for open-ended). */
export function planTotal(inst) {
  if (isOpenEnded(inst)) return null;
  const n = planCount(inst);
  if (n === 0) return 0;
  return kwd(fils(Number(inst.monthly_amount) || 0) * (n - 1) + fils(paymentAmount(inst, n - 1)));
}

/**
 * A total still to pay split into monthly payments: { count, last, lastAmount } or null.
 * count = ceil(total / monthly); last = the final payment (0 < last ≤ monthly);
 * lastAmount = last when it is partial (< monthly), else null. Takes numbers — parse user text first.
 * The server uses this very function, so the editor's hint always matches what gets saved.
 */
export function splitAmount(total, monthly) {
  const T = fils(total);
  const M = fils(monthly);
  if (!(Number.isFinite(T) && Number.isFinite(M) && T > 0 && M > 0)) return null;
  let count = Math.ceil(T / M);
  // integer-exact ceil (only while the numbers are exact integers; absurd totals just keep the estimate)
  if (Number.isSafeInteger(T) && Number.isSafeInteger(M) && Number.isSafeInteger(M * count)) {
    while (count > 1 && M * (count - 1) >= T) count -= 1;
    while (M * count < T) count += 1;
  }
  const lastF = T - M * (count - 1);
  return { count, last: kwd(lastF), lastAmount: lastF < M ? kwd(lastF) : null };
}

// ---------- dates ----------

export function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

export function todayISO(now = new Date()) {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function shiftMonth(y, m, k) {
  const t = y * 12 + (m - 1) + k;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

/** The due date in a given month; day 31 becomes the month's last day. */
export function dueDateIn(y, m, dueDay) {
  return isoDate(y, m, Math.min(dueDay, daysInMonth(y, m)));
}

/** Next payment on or after today for a monthly due day. */
export function firstDueDate(dueDay, today) {
  const { y, m } = parseISO(today);
  const thisMonth = dueDateIn(y, m, dueDay);
  if (thisMonth >= today) return thisMonth;
  const next = shiftMonth(y, m, 1);
  return dueDateIn(next.y, next.m, dueDay);
}

/** k-th payment date (k = 0 is first_due_date). */
export function nthDueDate(inst, k) {
  const { y, m } = parseISO(inst.first_due_date);
  const t = shiftMonth(y, m, k);
  return dueDateIn(t.y, t.m, Number(inst.due_day));
}

export function daysBetween(fromIso, toIso) {
  const a = parseISO(fromIso);
  const b = parseISO(toIso);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/**
 * Where an installment stands today. A payment counts as done once its due date has passed,
 * so "remaining" goes down by itself every month without the user editing anything.
 * → { monthly, mode, open, count, paidCount, remaining, active, nextDue, nextAmount, lastDue, lastAmount,
 *     daysLeft, remainingTotal }. Open-ended: count / remaining / lastDue / lastAmount / remainingTotal are null
 *     and it is always active (its next due date is computed directly, no loop over the years).
 */
export function installmentStatus(inst, today) {
  const monthly = Number(inst.monthly_amount);
  const mode = remainingMode(inst);
  if (mode === 'open') {
    let k0 = Math.max(0, monthsBetween(monthKey(inst.first_due_date), monthKey(today)));
    if (nthDueDate(inst, k0) < today) k0 += 1;
    const nextDue = nthDueDate(inst, k0);
    return {
      monthly,
      mode,
      open: true,
      count: null,
      paidCount: k0,
      remaining: null,
      active: true,
      nextDue,
      nextAmount: paymentAmount(inst, k0),
      lastDue: null,
      lastAmount: null,
      daysLeft: daysBetween(today, nextDue),
      remainingTotal: null,
    };
  }
  const count = planCount(inst);
  let paid = 0;
  while (paid < count && nthDueDate(inst, paid) < today) paid += 1;
  const remaining = count - paid;
  const nextDue = remaining > 0 ? nthDueDate(inst, paid) : null;
  const lastAmount = paymentAmount(inst, count - 1);
  return {
    monthly,
    mode,
    open: false,
    count,
    paidCount: paid,
    remaining,
    active: remaining > 0,
    nextDue,
    nextAmount: remaining > 0 ? paymentAmount(inst, paid) : null,
    lastDue: nthDueDate(inst, count - 1),
    lastAmount,
    daysLeft: nextDue ? daysBetween(today, nextDue) : null,
    // the partial final payment (mode 'amount') is the last one; for mode 'count' this is monthly × remaining
    remainingTotal: remaining > 0 ? kwd(fils(monthly) * (remaining - 1) + fils(lastAmount)) : 0,
  };
}

export function levelFor(ratio, safeLimit) {
  if (ratio == null) return 'none';
  if (ratio > safeLimit + 1e-9) return 'over';
  if (ratio >= safeLimit * 0.75) return 'warn';
  return 'ok';
}

/**
 * Everything the month dashboard shows. Open-ended installments are always active and count every month in
 * monthlyTotal / ratio (the regular commitment: a partial final payment still counts as the full monthly here),
 * but never in totalDebt. leftThisMonth uses each next payment's real amount.
 */
export function monthSummary(installments, salary, safeLimit, today) {
  const items = installments.map((inst) => ({ ...inst, ...installmentStatus(inst, today) }));
  const active = items
    .filter((i) => i.active)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : b.monthly - a.monthly));
  const finished = items.filter((i) => !i.active);
  const openActive = active.filter((i) => i.open);
  const month = today.slice(0, 7);
  const sum = (list, pick) => round3(list.reduce((s, i) => s + pick(i), 0));
  const monthlyTotal = sum(active, (i) => i.monthly);
  const hasSalary = Number(salary) > 0;
  const ratio = hasSalary ? (monthlyTotal / salary) * 100 : null;
  return {
    active,
    finished,
    monthlyTotal,
    leftThisMonth: sum(active.filter((i) => i.nextDue.slice(0, 7) === month), (i) => i.nextAmount),
    totalDebt: sum(active.filter((i) => !i.open), (i) => i.remainingTotal),
    ratio,
    level: levelFor(ratio, safeLimit),
    freeAfter: hasSalary ? round3(salary - monthlyTotal) : null,
    limitAmount: hasSalary ? round3((salary * safeLimit) / 100) : null,
    openCount: openActive.length,
    openMonthly: sum(openActive, (i) => i.monthly),
    finiteCount: active.length - openActive.length,
  };
}

/** «أقدر أشتريه؟» — what a new purchase on installments does to the salary ratio. */
export function affordability({ price, count, salary, safeLimit, currentMonthly }) {
  const newMonthly = round3(price / count);
  const newTotal = round3(currentMonthly + newMonthly);
  const limitAmount = round3((salary * safeLimit) / 100);
  const headroom = round3(limitAmount - currentMonthly);
  const ok = newTotal <= limitAmount;
  let minSafeCount = null;
  if (!ok && headroom > 0) {
    let n = Math.max(1, Math.ceil(price / headroom - 1e-9));
    while (round3(price / n) > headroom) n += 1;
    minSafeCount = n;
  }
  return {
    newMonthly,
    newTotal,
    currentRatio: (currentMonthly / salary) * 100,
    newRatio: (newTotal / salary) * 100,
    limitAmount,
    headroom,
    ok,
    overBy: ok ? 0 : round3(newTotal - limitAmount),
    minSafeCount,
    alreadyOver: headroom <= 0,
  };
}

// ---------- validation (Arabic messages shown under the fields) ----------

export function validateProfileInput(raw) {
  const errors = {};
  // validate the rounded values — that's what gets saved
  const salary = round3(parseAmount(raw.salary));
  const limit = parseAmount(raw.limit);
  if (!(salary > 0) || salary >= 1e6) errors.salary = 'حط راتب صحيح أكبر من صفر';
  if (!(limit >= 1 && limit <= 100)) errors.limit = 'نسبة من 1 إلى 100';
  const value = { salary: round3(salary), limit: Math.round(limit * 100) / 100 };
  if (raw.salaryDay !== undefined) {
    const day = validateSalaryDay(raw.salaryDay);
    if (!day.ok) errors.salaryDay = day.error;
    value.salaryDay = day.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
}

/** Salary day of the month: empty → null (not set), otherwise a whole day 1..31. */
export function validateSalaryDay(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { ok: true, error: null, value: null };
  const day = parseWhole(raw);
  if (!(day >= 1 && day <= 31)) return { ok: false, error: 'يوم من 1 إلى 31', value: null };
  return { ok: true, error: null, value: day };
}

/**
 * raw = { provider, title, monthly, dueDay, remainingMode?, remaining?, amountLeft? } (strings from the form).
 * remainingMode: missing / null → 'count' (old clients). Only the field of the chosen mode is read:
 *   'count' → remaining (1..360) · 'amount' → amountLeft (KWD, split with splitAmount, ≤ 360 payments) · 'open' → nothing.
 * value = { provider, title, monthly, dueDay, remainingMode, remaining, amountLeft, lastAmount } (always this shape).
 */
export function validateInstallmentInput(raw) {
  const errors = {};
  const provider = String(raw.provider ?? '').trim();
  const title = String(raw.title ?? '').trim();
  const monthly = round3(parseAmount(raw.monthly));
  const dueDay = parseWhole(raw.dueDay);
  const mode = raw.remainingMode == null ? 'count' : raw.remainingMode;
  const validMode = REMAINING_MODES.includes(mode);
  if (!provider || provider.length > 40) errors.provider = 'اكتب اسم الجهة';
  if (title.length > 80) errors.title = 'خله أقصر من 80 حرف';
  if (!(monthly > 0) || monthly >= 1e6) errors.monthly = 'حط مبلغ صحيح أكبر من صفر';
  if (!(dueDay >= 1 && dueDay <= 31)) errors.dueDay = 'يوم من 1 إلى 31';
  if (!validMode) errors.remainingMode = 'اختار وش تعرف عن الباقي';
  let remaining = null;
  let amountLeft = null;
  let lastAmount = null;
  if (mode === 'count') {
    remaining = parseWhole(raw.remaining);
    if (!(remaining >= 1 && remaining <= MAX_PAYMENTS)) errors.remaining = 'عدد من 1 إلى 360';
  } else if (mode === 'amount') {
    // split the ROUNDED numbers — that's what gets saved (and what the editor's hint shows)
    amountLeft = round3(parseAmount(raw.amountLeft));
    const inRange = amountLeft > 0 && amountLeft < 1e9;
    const split = inRange && !errors.monthly ? splitAmount(amountLeft, monthly) : null;
    if (!inRange || (split && split.count > MAX_PAYMENTS)) errors.amountLeft = 'حط مبلغ أكبر من صفر، وما يطلع أكثر من 360 قسط';
    remaining = split ? split.count : null;
    lastAmount = split ? split.lastAmount : null;
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { provider, title, monthly: round3(monthly), dueDay, remainingMode: mode, remaining, amountLeft, lastAmount },
  };
}

export function validateCheckInput(raw) {
  const errors = {};
  const price = round3(parseAmount(raw.price));
  const count = parseWhole(raw.count);
  if (!(price > 0) || price >= 1e7) errors.price = 'حط سعر صحيح أكبر من صفر';
  if (!(count >= 1 && count <= 360)) errors.count = 'عدد من 1 إلى 360';
  return { ok: Object.keys(errors).length === 0, errors, value: { price: round3(price), count } };
}

// ---------- formatting ----------

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const dayFmt = new Intl.DateTimeFormat('ar-KW-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('ar-KW-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const asUTC = (iso) => {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d));
};

export const fmtKWD = (x) => `${money.format(round3(x))} د.ك`;
export const fmtPct = (x) => `${(Math.round(x * 10) / 10).toLocaleString('en-US')}%`;
export const fmtDay = (iso) => dayFmt.format(asUTC(iso));
export const fmtMonth = (iso) => monthFmt.format(asUTC(iso));

export function fmtDaysLeft(n) {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'باچر';
  if (n === 2) return 'بعد يومين';
  if (n <= 10) return `بعد ${n} أيام`;
  return `بعد ${n} يوم`;
}

export function fmtCount(n) {
  if (n === 1) return 'قسط واحد';
  if (n === 2) return 'قسطين';
  if (n <= 10) return `${n} أقساط`;
  return `${n} قسط`;
}

// ---------- months, schedules and payments (shared by the calendar, insights and report pages) ----------

/** 'YYYY-MM-DD' → 'YYYY-MM'. */
export const monthKey = (iso) => String(iso).slice(0, 7);

/** 'YYYY-MM' moved by k months (k may be negative). */
export function shiftMonthKey(key, k) {
  const [y, m] = String(key).split('-').map(Number);
  const t = shiftMonth(y, m, k);
  return `${t.y}-${String(t.m).padStart(2, '0')}`;
}

/** Whole months from month key a to month key b (b - a). */
export function monthsBetween(a, b) {
  const [ay, am] = String(a).split('-').map(Number);
  const [by, bm] = String(b).split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

/** Which payment (k, 0-based) of the installment falls in month 'YYYY-MM', or -1 if none (open-ended: every month). */
export function paymentIndexIn(inst, key) {
  const k = monthsBetween(monthKey(inst.first_due_date), key);
  return k >= 0 && (isOpenEnded(inst) || k < planCount(inst)) ? k : -1;
}

/** The installment's due date inside month 'YYYY-MM', or null when it has no payment that month. */
export function dueInMonth(inst, key) {
  const k = paymentIndexIn(inst, key);
  return k < 0 ? null : nthDueDate(inst, k);
}

/**
 * Payments of one installment: [{ k, date, month, amount }], oldest first.
 * At most `limit` entries (open-ended ones have no end, so they give exactly `limit`).
 */
export function scheduleFor(inst, { limit = MAX_PAYMENTS } = {}) {
  const cap = Number(limit);
  const total = Math.min(planCount(inst), Number.isFinite(cap) ? Math.max(0, cap) : MAX_PAYMENTS);
  const out = [];
  for (let k = 0; k < total; k += 1) {
    const date = nthDueDate(inst, k);
    out.push({ k, date, month: monthKey(date), amount: paymentAmount(inst, k) });
  }
  return out;
}

/**
 * All payments due in month 'YYYY-MM' across installments: [{ inst, k, date, amount, last, open }], by date.
 * amount is that payment's real amount (a partial final payment uses last_amount); last = the plan's final
 * payment (never for open-ended).
 */
export function dueEventsInMonth(installments, key) {
  const events = [];
  for (const inst of installments || []) {
    const k = paymentIndexIn(inst, key);
    if (k < 0) continue;
    const open = isOpenEnded(inst);
    events.push({ inst, k, date: nthDueDate(inst, k), amount: paymentAmount(inst, k), last: !open && k === planCount(inst) - 1, open });
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
}

/** Set of 'installmentId|YYYY-MM' keys from STATE.payments, for quick look-ups. */
export function paidKeys(payments) {
  return new Set((payments || []).map((p) => `${p.installment_id}|${p.month}`));
}

/** Was this installment marked paid for month 'YYYY-MM'? payments may be the array or a paidKeys() set. */
export function isPaid(payments, installmentId, key) {
  const set = payments instanceof Set ? payments : paidKeys(payments);
  return set.has(`${installmentId}|${key}`);
}

/** The next salary date on or after today for a salary day (31 → the month's last day); null when unset. */
export function nextSalaryDate(salaryDay, today) {
  const day = Number(salaryDay);
  if (!(Number.isInteger(day) && day >= 1 && day <= 31)) return null;
  return firstDueDate(day, today);
}

// ---------- English formatting (the Arabic ones above stay the default) ----------

const dayFmtEn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmtEn = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('ar-KW-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateFmtEn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const fmtKWDEn = (x) => `KWD ${money.format(round3(x))}`;
export const fmtDayEn = (iso) => dayFmtEn.format(asUTC(iso));
export const fmtMonthEn = (iso) => monthFmtEn.format(asUTC(iso));
export const fmtDate = (iso) => dateFmt.format(asUTC(iso));
export const fmtDateEn = (iso) => dateFmtEn.format(asUTC(iso));

export function fmtDaysLeftEn(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

export function fmtCountEn(n) {
  return n === 1 ? '1 installment' : `${n} installments`;
}

/** n days late (n >= 1), Kuwaiti wording: «متأخر يوم» / «متأخر يومين» / «متأخر 3 أيام» / «متأخر 12 يوم». */
export function fmtOverdue(n) {
  if (n === 1) return 'متأخر يوم';
  if (n === 2) return 'متأخر يومين';
  if (n <= 10) return `متأخر ${n} أيام`;
  return `متأخر ${n} يوم`;
}

export function fmtOverdueEn(n) {
  return n === 1 ? '1 day overdue' : `${n} days overdue`;
}
