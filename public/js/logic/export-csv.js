// اقصادي — CSV export (pure: no DOM, no network). /account builds the file, the page only downloads it.
// Excel-friendly: UTF-8 with a BOM (so Arabic shows correctly), CRLF line endings, RFC 4180 quoting,
// and user text that starts like a formula (= + - @) is neutralised with a leading apostrophe.

import { installmentStatus, round3 } from '../../calc.js';

export const BOM = '﻿';

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV field. Strings may be user text → formula guard; numbers are written as-is. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value !== 'number' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows (array of arrays) → CSV text. bom: start with U+FEFF (default true). */
export function toCSV(rows, { bom = true } = {}) {
  const body = (rows || []).map((row) => (row || []).map(csvCell).join(',')).join('\r\n');
  return (bom ? BOM : '') + body + '\r\n';
}

/** Money as a plain «45.500» (3 decimals, no thousands separator, no currency) so spreadsheets read a number. */
export const csvMoney = (x) => round3(Number(x) || 0).toFixed(3);

/**
 * The installments table with each installment's paid months.
 * state: STATE ({ installments, payments }); today: 'YYYY-MM-DD'.
 * opts.headers: 14 column titles (already translated); opts.provider(name) → display name;
 * opts.status: { active, done, open } labels (merged over the English defaults);
 * opts.modes: { count, amount, open } labels for «Entered as» (merged over the English defaults);
 * opts.sep: separator between paid months (default ' ; ').
 * Columns 13–14 («Entered as», «Last payment») were appended so the first 12 keep their positions.
 * Open-ended rows leave last due / total / left / amount left / last payment empty.
 */
export function installmentRows(state, today, opts = {}) {
  const {
    headers = [
      'Provider', 'Description', 'Monthly (KWD)', 'Due day', 'First due date', 'Last due date',
      'Total payments', 'Payments left', 'Amount left (KWD)', 'Status', 'Months marked paid', 'Paid months count',
      'Entered as', 'Last payment (KWD)',
    ],
    provider = (name) => name,
    sep = ' ; ',
  } = opts;
  const status = { active: 'Active', done: 'Finished', open: 'Open-ended', ...(opts.status || {}) };
  const modes = { count: 'Payments left', amount: 'Amount left', open: 'Open-ended', ...(opts.modes || {}) };

  const paidBy = new Map();
  for (const p of state?.payments || []) {
    if (!p || typeof p.installment_id !== 'string' || !/^\d{4}-\d{2}$/.test(String(p.month))) continue;
    if (!paidBy.has(p.installment_id)) paidBy.set(p.installment_id, new Set());
    paidBy.get(p.installment_id).add(String(p.month));
  }

  const list = [...(state?.installments || [])].filter((i) => i && i.first_due_date);
  list.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));

  const rows = [headers];
  for (const inst of list) {
    const st = installmentStatus(inst, today);
    const months = [...(paidBy.get(inst.id) || [])].sort();
    const head = [
      provider(String(inst.provider ?? '')),
      String(inst.title ?? ''),
      csvMoney(inst.monthly_amount),
      Number(inst.due_day),
      String(inst.first_due_date).slice(0, 10),
    ];
    if (st.open) {
      rows.push([...head, '', '', '', '', status.open, months.join(sep), months.length, modes.open, '']);
      continue;
    }
    rows.push([
      ...head,
      st.lastDue,
      st.count,
      st.remaining,
      csvMoney(st.remainingTotal),
      st.active ? status.active : status.done,
      months.join(sep),
      months.length,
      modes[st.mode],
      csvMoney(st.lastAmount),
    ]);
  }
  return rows;
}

/** «aqsati-2026-11-15.csv» */
export function exportFilename(today) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(today)) ? String(today) : 'export';
  return `aqsati-${day}.csv`;
}
