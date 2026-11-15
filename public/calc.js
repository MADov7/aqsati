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
 */
export function installmentStatus(inst, today) {
  const total = Number(inst.remaining_count);
  let paid = 0;
  while (paid < total && nthDueDate(inst, paid) < today) paid += 1;
  const remaining = total - paid;
  const monthly = Number(inst.monthly_amount);
  const nextDue = remaining > 0 ? nthDueDate(inst, paid) : null;
  return {
    monthly,
    remaining,
    active: remaining > 0,
    nextDue,
    lastDue: nthDueDate(inst, total - 1),
    daysLeft: nextDue ? daysBetween(today, nextDue) : null,
    remainingTotal: round3(monthly * remaining),
  };
}

export function levelFor(ratio, safeLimit) {
  if (ratio == null) return 'none';
  if (ratio > safeLimit + 1e-9) return 'over';
  if (ratio >= safeLimit * 0.75) return 'warn';
  return 'ok';
}

/** Everything the month dashboard shows. */
export function monthSummary(installments, salary, safeLimit, today) {
  const items = installments.map((inst) => ({ ...inst, ...installmentStatus(inst, today) }));
  const active = items
    .filter((i) => i.active)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : b.monthly - a.monthly));
  const finished = items.filter((i) => !i.active);
  const month = today.slice(0, 7);
  const sum = (list, pick) => round3(list.reduce((s, i) => s + pick(i), 0));
  const monthlyTotal = sum(active, (i) => i.monthly);
  const hasSalary = Number(salary) > 0;
  const ratio = hasSalary ? (monthlyTotal / salary) * 100 : null;
  return {
    active,
    finished,
    monthlyTotal,
    leftThisMonth: sum(active.filter((i) => i.nextDue.slice(0, 7) === month), (i) => i.monthly),
    totalDebt: sum(active, (i) => i.remainingTotal),
    ratio,
    level: levelFor(ratio, safeLimit),
    freeAfter: hasSalary ? round3(salary - monthlyTotal) : null,
    limitAmount: hasSalary ? round3((salary * safeLimit) / 100) : null,
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

export function validateInstallmentInput(raw) {
  const errors = {};
  const provider = String(raw.provider ?? '').trim();
  const title = String(raw.title ?? '').trim();
  const monthly = round3(parseAmount(raw.monthly));
  const dueDay = parseWhole(raw.dueDay);
  const remaining = parseWhole(raw.remaining);
  if (!provider || provider.length > 40) errors.provider = 'اكتب اسم الجهة';
  if (title.length > 80) errors.title = 'خله أقصر من 80 حرف';
  if (!(monthly > 0) || monthly >= 1e6) errors.monthly = 'حط مبلغ صحيح أكبر من صفر';
  if (!(dueDay >= 1 && dueDay <= 31)) errors.dueDay = 'يوم من 1 إلى 31';
  if (!(remaining >= 1 && remaining <= 360)) errors.remaining = 'عدد من 1 إلى 360';
  return { ok: Object.keys(errors).length === 0, errors, value: { provider, title, monthly: round3(monthly), dueDay, remaining } };
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

/** Which payment (k, 0-based) of the installment falls in month 'YYYY-MM', or -1 if none. */
export function paymentIndexIn(inst, key) {
  const k = monthsBetween(monthKey(inst.first_due_date), key);
  return k >= 0 && k < Number(inst.remaining_count) ? k : -1;
}

/** The installment's due date inside month 'YYYY-MM', or null when it has no payment that month. */
export function dueInMonth(inst, key) {
  const k = paymentIndexIn(inst, key);
  return k < 0 ? null : nthDueDate(inst, k);
}

/** Every payment of one installment: [{ k, date, month }], oldest first. */
export function scheduleFor(inst) {
  const total = Math.max(0, Number(inst.remaining_count) || 0);
  const out = [];
  for (let k = 0; k < total; k += 1) {
    const date = nthDueDate(inst, k);
    out.push({ k, date, month: monthKey(date) });
  }
  return out;
}

/** All payments due in month 'YYYY-MM' across installments: [{ inst, k, date, amount }], by date. */
export function dueEventsInMonth(installments, key) {
  const events = [];
  for (const inst of installments || []) {
    const k = paymentIndexIn(inst, key);
    if (k >= 0) events.push({ inst, k, date: nthDueDate(inst, k), amount: round3(Number(inst.monthly_amount)) });
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
