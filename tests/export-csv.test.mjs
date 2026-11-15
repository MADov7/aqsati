import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOM, csvCell, toCSV, csvMoney, installmentRows, exportFilename } from '../public/js/logic/export-csv.js';

test('csvCell quotes commas, quotes and new lines (RFC 4180)', () => {
  assert.equal(csvCell('تابي'), 'تابي');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(12), '12');
  assert.equal(csvCell(NaN), '');
});

test('csvCell neutralises text that looks like a spreadsheet formula', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+966'), "'+966");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell(-2), '-2'); // real numbers are left alone
});

test('toCSV starts with a BOM (Excel shows Arabic) and uses CRLF', () => {
  const text = toCSV([['a', 'b'], ['ج', 'د']]);
  assert.equal(text[0], BOM);
  assert.equal(text, `${BOM}a,b\r\nج,د\r\n`);
  assert.equal(toCSV([['x']], { bom: false }), 'x\r\n');
});

test('csvMoney writes plain numbers with 3 decimals', () => {
  assert.equal(csvMoney(45.5), '45.500');
  assert.equal(csvMoney('1250.1234'), '1250.123');
  assert.equal(csvMoney(undefined), '0.000');
});

const STATE = {
  profile: { salary: 1200, safe_limit: 40, salary_day: 25 },
  installments: [
    { id: 'b', provider: 'تمارا', title: 'جوال', monthly_amount: 45.5, due_day: 5, remaining_count: 4, first_due_date: '2026-10-05', created_at: '2026-10-01T10:00:00Z' },
    { id: 'a', provider: 'قرض بنك', title: '=cmd', monthly_amount: 180, due_day: 28, remaining_count: 2, first_due_date: '2026-08-28', created_at: '2026-08-01T10:00:00Z' },
  ],
  payments: [
    { installment_id: 'b', month: '2026-11', paid_at: '2026-11-04T09:00:00Z' },
    { installment_id: 'b', month: '2026-10', paid_at: '2026-10-05T09:00:00Z' },
    { installment_id: 'b', month: '2026-10', paid_at: '2026-10-05T09:00:00Z' }, // duplicate ignored
    { installment_id: 'a', month: 'bad', paid_at: 'x' }, // malformed ignored
  ],
  user: null,
};

test('installmentRows: header + one row per installment, oldest first, with paid months', () => {
  const rows = installmentRows(STATE, '2026-11-15', {
    provider: (n) => (n === 'تمارا' ? 'Tamara' : n === 'قرض بنك' ? 'Bank loan' : n),
    status: { active: 'Active', done: 'Finished' },
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].length, 12);
  // the bank loan was created first; its 2 payments (Aug 28, Sep 28) have both passed → finished
  assert.deepEqual(rows[1], ['Bank loan', '=cmd', '180.000', 28, '2026-08-28', '2026-09-28', 2, 0, '0.000', 'Finished', '', 0]);
  // Tamara: Oct 5 and Nov 5 passed → 2 of 4 left (Dec 5, Jan 5)
  assert.deepEqual(rows[2], ['Tamara', 'جوال', '45.500', 5, '2026-10-05', '2027-01-05', 4, 2, '91.000', 'Active', '2026-10 ; 2026-11', 2]);
  // and the formula guard applies once written
  assert.ok(toCSV(rows).includes(",'=cmd,"));
});

test('installmentRows works on an empty state and with custom headers', () => {
  assert.deepEqual(installmentRows({ installments: [], payments: [] }, '2026-11-15', { headers: ['h'] }), [['h']]);
  assert.deepEqual(installmentRows(null, '2026-11-15', { headers: ['h'] }), [['h']]);
});

test('exportFilename uses the date', () => {
  assert.equal(exportFilename('2026-11-15'), 'aqsati-2026-11-15.csv');
  assert.equal(exportFilename('nope'), 'aqsati-export.csv');
});
