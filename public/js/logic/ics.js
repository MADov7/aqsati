// أقساطي — iCalendar (RFC 5545) export of the remaining installment dates, for iPhone / Android / Google / Outlook.
// Pure (no DOM): CRLF line endings, lines folded at 75 octets without splitting a UTF-8 character,
// all-day events (DTSTART;VALUE=DATE), a stable UID per installment + month, and a reminder one day before.
// Finite plans get one VEVENT per remaining payment (the final one carries its real, possibly partial, amount);
// an open-ended installment (no end date) gets ONE recurring VEVENT: RRULE monthly with no COUNT / UNTIL,
// plus EXDATEs for future months already marked paid.

import {
  fmtKWD, nthDueDate, monthKey, paidKeys, round3, isOpenEnded, planCount, paymentAmount, installmentStatus,
  dueDateIn,
} from '../../calc.js';
import { addDays } from './schedule.js';

/** UTF-8 byte length of one code point. */
const cpBytes = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** UTF-8 byte length of a string. */
export function utf8Length(s) {
  let n = 0;
  for (const ch of String(s)) n += cpBytes(ch.codePointAt(0));
  return n;
}

/** Escape a TEXT value: backslash, semicolon, comma and line breaks (RFC 5545 §3.3.11). */
export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line so no physical line is longer than `limit` octets (RFC 5545 §3.1).
 * Continuation lines start with one space (which counts toward their 75 octets). Never splits a character.
 */
export function foldLine(line, limit = 75) {
  if (utf8Length(line) <= limit) return line;
  const parts = [];
  let cur = '';
  let bytes = 0;
  let max = limit;
  for (const ch of line) {
    const b = cpBytes(ch.codePointAt(0));
    if (bytes + b > max) {
      parts.push(cur);
      cur = '';
      bytes = 0;
      max = limit - 1; // the leading space takes one octet
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** Undo folding (for tests and debugging). */
export function unfold(text) {
  return String(text).replace(/\r\n[ \t]/g, '');
}

/** 'YYYY-MM-DD' → 'YYYYMMDD'. */
export const icsDate = (iso) => String(iso).slice(0, 10).replace(/-/g, '');

/** A Date → 'YYYYMMDDTHHMMSSZ' (UTC). */
export function icsStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/** Stable UID for one payment: the same installment + month always gives the same UID (re-imports update, never duplicate). */
export function eventUid(installmentId, month) {
  const id = String(installmentId ?? '').replace(/[^A-Za-z0-9-]/g, '-') || 'x';
  return `${id}-${String(month).replace('-', '')}@aqsati`;
}

/**
 * Every remaining payment of the FINITE installments (due today or later):
 * [{ inst, k, n, total, date, month, amount, last, open: false }], by date. amount is that payment's real amount
 * (the partial final payment of an 'amount' plan included). Open-ended installments are in openSeries() instead.
 * skipPaid: leave out months already marked paid in `payments`.
 */
export function remainingOccurrences(installments, { today, payments = [], skipPaid = true } = {}) {
  const set = paidKeys(payments);
  const out = [];
  for (const inst of installments || []) {
    if (isOpenEnded(inst)) continue;
    const total = planCount(inst);
    for (let k = 0; k < total; k += 1) {
      const date = nthDueDate(inst, k);
      if (date < today) continue;
      const month = monthKey(date);
      if (skipPaid && set.has(`${inst.id}|${month}`)) continue;
      out.push({ inst, k, n: k + 1, total, date, month, amount: paymentAmount(inst, k), last: k === total - 1, open: false });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
}

/**
 * RRULE for "every month on due day d" that never skips a month (RFC 5545 skips months without BYMONTHDAY=29..31):
 * d <= 28 -> BYMONTHDAY=d · 29 / 30 -> the last of 28..d in each month (BYSETPOS=-1) · 31 -> the month's last day (-1).
 * Same dates as dueDateIn(). Never COUNT / UNTIL: open-ended installments have no end.
 */
export function rruleFor(dueDay) {
  const d = Math.min(31, Math.max(1, Math.trunc(Number(dueDay)) || 1));
  if (d === 31) return 'FREQ=MONTHLY;BYMONTHDAY=-1';
  if (d >= 29) {
    const days = [];
    for (let x = 28; x <= d; x += 1) days.push(x);
    return `FREQ=MONTHLY;BYMONTHDAY=${days.join(',')};BYSETPOS=-1`;
  }
  return `FREQ=MONTHLY;BYMONTHDAY=${d}`;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MAX_PAID_SKIP = 24;

/**
 * One recurring series per active open-ended installment:
 * [{ inst, open: true, start, date, month, dueDay, amount, exdates, rrule, n: null, total: null, last: false }],
 * by start date, then bigger amounts first. start = the first due date on or after today (with skipPaid, months
 * already marked paid are skipped, at most 24); exdates (only with skipPaid) = due dates of later paid months.
 */
export function openSeries(installments, { today, payments = [], skipPaid = true } = {}) {
  const out = [];
  for (const inst of installments || []) {
    if (!isOpenEnded(inst)) continue;
    const paidMonths = new Set();
    for (const p of payments || []) {
      if (p && p.installment_id === inst.id && MONTH_RE.test(String(p.month))) paidMonths.add(String(p.month));
    }
    let k = installmentStatus(inst, today).paidCount;
    if (skipPaid) {
      for (let i = 0; i < MAX_PAID_SKIP && paidMonths.has(monthKey(nthDueDate(inst, k))); i += 1) k += 1;
    }
    const start = nthDueDate(inst, k);
    const dueDay = Number(inst.due_day);
    const exdates = skipPaid
      ? [...paidMonths]
        .map((m) => {
          const [y, mo] = m.split('-').map(Number);
          return dueDateIn(y, mo, dueDay);
        })
        .filter((d) => d > start)
        .sort()
      : [];
    out.push({
      inst,
      open: true,
      start,
      date: start,
      month: monthKey(start),
      dueDay,
      amount: paymentAmount(inst, k),
      exdates,
      rrule: rruleFor(dueDay),
      n: null,
      total: null,
      last: false,
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : b.amount - a.amount));
}

const defaultSummary = (ev) => `قسط ${ev.inst.provider} — ${fmtKWD(ev.amount)}`;
function defaultDescription(ev) {
  const title = ev.inst.title ? `${ev.inst.title}\n` : '';
  if (ev.open) return `${title}قسط شهري بدون تاريخ نهاية · أقساطي`;
  if (ev.last) {
    const partial = ev.amount < round3(Number(ev.inst.monthly_amount) || 0);
    return `${title}الدفعة ${ev.n} من ${ev.total} — آخر دفعة${partial ? ` (${fmtKWD(ev.amount)})` : ''} · أقساطي`;
  }
  return `${title}الدفعة ${ev.n} من ${ev.total} · أقساطي`;
}
const defaultAlarm = (ev) => `باچر موعد قسط ${ev.inst.provider} — ${fmtKWD(ev.amount)}`;

/**
 * The whole .ics file as a string.
 * options: { today (required), now = new Date(), payments, skipPaid = true, calName,
 *            summary(ev), description(ev), alarm(ev) } — the text builders default to Arabic:
 *            SUMMARY «قسط <provider> — <amount> د.ك». They receive a remainingOccurrences() item, or an
 *            openSeries() item for an open-ended installment (ev.open === true, n / total null).
 */
export function buildICS(installments, options = {}) {
  const {
    today,
    now = new Date(),
    payments = [],
    skipPaid = true,
    calName = 'أقساطي',
    summary = defaultSummary,
    description = defaultDescription,
    alarm = defaultAlarm,
  } = options;
  const stamp = icsStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aqsati//Aqsati Installments 1.0//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  for (const ev of remainingOccurrences(installments, { today, payments, skipPaid })) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${eventUid(ev.inst.id, ev.month)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(ev.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(ev.date, 1))}`,
      `SUMMARY:${escapeText(summary(ev))}`,
      `DESCRIPTION:${escapeText(description(ev))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P1D',
      `DESCRIPTION:${escapeText(alarm(ev))}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  for (const ev of openSeries(installments, { today, payments, skipPaid })) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${eventUid(ev.inst.id, 'open')}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(ev.start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(ev.start, 1))}`,
      `RRULE:${ev.rrule}`,
    );
    if (ev.exdates.length) lines.push(`EXDATE;VALUE=DATE:${ev.exdates.map(icsDate).join(',')}`);
    lines.push(
      `SUMMARY:${escapeText(summary(ev))}`,
      `DESCRIPTION:${escapeText(description(ev))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P1D',
      `DESCRIPTION:${escapeText(alarm(ev))}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map((l) => foldLine(l)).join('\r\n')}\r\n`;
}
