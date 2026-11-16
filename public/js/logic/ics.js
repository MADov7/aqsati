// أقساطي — iCalendar (RFC 5545) export of the remaining installment dates, for iPhone / Android / Google / Outlook.
// Pure (no DOM): CRLF line endings, lines folded at 75 octets without splitting a UTF-8 character,
// all-day events (DTSTART;VALUE=DATE), a stable UID per installment + month, and a reminder one day before.

import { fmtKWD, nthDueDate, monthKey, paidKeys, round3 } from '../../calc.js';
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
 * Every remaining payment (due today or later): [{ inst, k, n, total, date, month, amount }], by date.
 * skipPaid: leave out months already marked paid in `payments`.
 */
export function remainingOccurrences(installments, { today, payments = [], skipPaid = true } = {}) {
  const set = paidKeys(payments);
  const out = [];
  for (const inst of installments || []) {
    const total = Math.max(0, Number(inst.remaining_count) || 0);
    for (let k = 0; k < total; k += 1) {
      const date = nthDueDate(inst, k);
      if (date < today) continue;
      const month = monthKey(date);
      if (skipPaid && set.has(`${inst.id}|${month}`)) continue;
      out.push({ inst, k, n: k + 1, total, date, month, amount: round3(Number(inst.monthly_amount)) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
}

const defaultSummary = (ev) => `قسط ${ev.inst.provider} — ${fmtKWD(ev.amount)}`;
const defaultDescription = (ev) => `${ev.inst.title ? `${ev.inst.title}\n` : ''}الدفعة ${ev.n} من ${ev.total} · اقصادي`;
const defaultAlarm = (ev) => `باچر موعد قسط ${ev.inst.provider} — ${fmtKWD(ev.amount)}`;

/**
 * The whole .ics file as a string.
 * options: { today (required), now = new Date(), payments, skipPaid = true, calName,
 *            summary(ev), description(ev), alarm(ev) } — the text builders default to Arabic:
 *            SUMMARY «قسط <provider> — <amount> د.ك».
 */
export function buildICS(installments, options = {}) {
  const {
    today,
    now = new Date(),
    payments = [],
    skipPaid = true,
    calName = 'اقصادي',
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
  lines.push('END:VCALENDAR');
  return `${lines.map((l) => foldLine(l)).join('\r\n')}\r\n`;
}
