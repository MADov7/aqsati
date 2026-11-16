import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  utf8Length, escapeText, foldLine, unfold, icsDate, icsStamp, eventUid, remainingOccurrences, buildICS,
} from '../public/js/logic/ics.js';

const NOW = new Date(Date.UTC(2026, 10, 15, 8, 30, 5));
const LAPTOP = { id: 'L1', provider: 'تابي', title: 'لابتوب, مع الشاحن; والشنطة', monthly_amount: 25, due_day: 31, remaining_count: 4, first_due_date: '2026-11-30' };
const LOAN = { id: 'B1', provider: 'قرض بنك', title: '', monthly_amount: 180.5, due_day: 29, remaining_count: 3, first_due_date: '2027-12-29' };

/** Unfold and split into content lines. */
const contentLines = (text) => unfold(text).split('\r\n').filter(Boolean);
const events = (text) => {
  const out = [];
  let cur = null;
  for (const line of contentLines(text)) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { out.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(':');
      const key = line.slice(0, i);
      if (!(key in cur)) cur[key] = line.slice(i + 1);
    }
  }
  return out;
};

test('utf8Length counts octets', () => {
  assert.equal(utf8Length('abc'), 3);
  assert.equal(utf8Length('ق'), 2);
  assert.equal(utf8Length('—'), 3);
  assert.equal(utf8Length('😀'), 4);
});

test('escapeText escapes backslash, semicolon, comma and newlines', () => {
  assert.equal(escapeText('a,b;c\\d\ne\r\nf'), 'a\\,b\\;c\\\\d\\ne\\nf');
  assert.equal(escapeText(null), '');
});

test('foldLine: every physical line ≤ 75 octets, never splits a character, unfolds back exactly', () => {
  const long = `SUMMARY:${'قسط تابي — '.repeat(12)}😀😀😀 end`;
  const folded = foldLine(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  for (const [i, line] of lines.entries()) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line ${i} is ${Buffer.byteLength(line, 'utf8')} octets`);
    if (i > 0) assert.equal(line[0], ' ');
    assert.ok(!line.includes('�'));
    assert.equal(Buffer.from(line, 'utf8').toString('utf8'), line);
  }
  assert.equal(unfold(folded), long);
  assert.equal(foldLine('SHORT:ok'), 'SHORT:ok');
  const exact = `X:${'a'.repeat(73)}`;
  assert.equal(foldLine(exact), exact);
  assert.equal(foldLine(`${exact}b`).split('\r\n').length, 2);
});

test('dates, stamps and stable UIDs', () => {
  assert.equal(icsDate('2027-02-28'), '20270228');
  assert.equal(icsStamp(NOW), '20261115T083005Z');
  assert.equal(eventUid('L1', '2026-11'), 'L1-202611@aqsati');
  assert.equal(eventUid('a b/c', '2027-01'), 'a-b-c-202701@aqsati');
});

test('remainingOccurrences: only today and later, short months clamped, paid months skipped', () => {
  const occ = remainingOccurrences([LAPTOP], { today: '2026-11-15' });
  assert.deepEqual(occ.map((o) => o.date), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  const later = remainingOccurrences([LAPTOP], { today: '2026-12-01' });
  assert.deepEqual(later.map((o) => o.date), ['2026-12-31', '2027-01-31', '2027-02-28']);
  const paid = remainingOccurrences([LAPTOP], { today: '2026-11-15', payments: [{ installment_id: 'L1', month: '2026-12' }] });
  assert.deepEqual(paid.map((o) => o.month), ['2026-11', '2027-01', '2027-02']);
  const all = remainingOccurrences([LAPTOP], { today: '2026-11-15', payments: [{ installment_id: 'L1', month: '2026-12' }], skipPaid: false });
  assert.equal(all.length, 4);
  // leap year: due day 29 → Feb 29 2028
  assert.deepEqual(remainingOccurrences([LOAN], { today: '2026-11-15' }).map((o) => o.date), ['2027-12-29', '2028-01-29', '2028-02-29']);
});

test('buildICS: valid RFC 5545 calendar with CRLF, folding and one VEVENT per remaining payment', () => {
  const text = buildICS([LAPTOP, LOAN], { today: '2026-11-15', now: NOW });
  // CRLF only, ends with CRLF
  assert.ok(text.endsWith('\r\n'));
  assert.ok(!/\r(?!\n)|(?<!\r)\n/.test(text), 'bare CR or LF found');
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);

  const lines = contentLines(text);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('VERSION:2.0'));
  assert.ok(lines.some((l) => l.startsWith('PRODID:')));

  const evs = events(text);
  assert.equal(evs.length, 7);
  assert.equal(new Set(evs.map((e) => e.UID)).size, 7);
  const first = evs[0];
  assert.equal(first.UID, 'L1-202611@aqsati');
  assert.equal(first.DTSTAMP, '20261115T083005Z');
  assert.equal(first['DTSTART;VALUE=DATE'], '20261130');
  assert.equal(first['DTEND;VALUE=DATE'], '20261201');
  assert.equal(first.SUMMARY, 'قسط تابي — 25.000 د.ك');
  assert.ok(first.DESCRIPTION.includes('لابتوب\\, مع الشاحن\\; والشنطة\\n'));
  assert.ok(first.DESCRIPTION.includes('الدفعة 1 من 4'));
  // year and month boundaries for DTEND
  const dec = evs.find((e) => e['DTSTART;VALUE=DATE'] === '20261231');
  assert.equal(dec['DTEND;VALUE=DATE'], '20270101');
  const feb = evs.find((e) => e['DTSTART;VALUE=DATE'] === '20270228');
  assert.equal(feb['DTEND;VALUE=DATE'], '20270301');
  const leap = evs.find((e) => e['DTSTART;VALUE=DATE'] === '20280229');
  assert.equal(leap['DTEND;VALUE=DATE'], '20280301');
  assert.equal(leap.SUMMARY, 'قسط قرض بنك — 180.500 د.ك');

  // one display alarm, one day before, per event
  assert.equal(lines.filter((l) => l === 'BEGIN:VALARM').length, 7);
  assert.equal(lines.filter((l) => l === 'TRIGGER:-P1D').length, 7);
  assert.equal(lines.filter((l) => l === 'ACTION:DISPLAY').length, 7);

  // the same data gives the same UIDs (re-import updates instead of duplicating)
  const again = events(buildICS([LAPTOP, LOAN], { today: '2026-11-15', now: new Date() }));
  assert.deepEqual(again.map((e) => e.UID), evs.map((e) => e.UID));
});

test('buildICS: custom (English) text builders and an empty calendar', () => {
  const text = buildICS([LAPTOP], {
    today: '2026-11-15',
    now: NOW,
    calName: 'Aqsati',
    summary: (ev) => `Tabby installment — KWD ${ev.amount.toFixed(3)}`,
  });
  assert.equal(events(text)[0].SUMMARY, 'Tabby installment — KWD 25.000');
  assert.ok(contentLines(text).includes('X-WR-CALNAME:Aqsati'));
  const empty = buildICS([], { today: '2026-11-15', now: NOW });
  assert.equal(events(empty).length, 0);
  assert.ok(empty.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(empty.endsWith('END:VCALENDAR\r\n'));
});

// ---------- remaining modes: open-ended → one RRULE series; amount → the final VEVENT uses the last amount ----------

import { rruleFor, openSeries } from '../public/js/logic/ics.js';

const OPEN = { id: 'O', provider: 'بطاقة ائتمانية', title: '', monthly_amount: 40, due_day: 10, remaining_count: null, remaining_mode: 'open', last_amount: null, first_due_date: '2026-09-10' };
const OPEN31 = { ...OPEN, id: 'O31', title: 'بطاقة, الراتب', due_day: 31, first_due_date: '2026-10-31' };
const PART = { id: 'P', provider: 'تابي', title: 'لابتوب', monthly_amount: 25, due_day: 25, remaining_count: 7, remaining_mode: 'amount', last_amount: 12.5, first_due_date: '2026-11-25' };

test('rruleFor: every month on the due day, never skipping short months, never COUNT/UNTIL', () => {
  assert.equal(rruleFor(1), 'FREQ=MONTHLY;BYMONTHDAY=1');
  assert.equal(rruleFor(28), 'FREQ=MONTHLY;BYMONTHDAY=28');
  assert.equal(rruleFor(29), 'FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1');
  assert.equal(rruleFor(30), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
  assert.equal(rruleFor(31), 'FREQ=MONTHLY;BYMONTHDAY=-1');
  assert.equal(rruleFor('10'), 'FREQ=MONTHLY;BYMONTHDAY=10');
});

test('remainingOccurrences: finite plans only; the final payment carries its partial amount', () => {
  const occ = remainingOccurrences([PART], { today: '2026-11-15' });
  assert.equal(occ.length, 7);
  assert.deepEqual([occ.at(-1).date, occ.at(-1).amount, occ.at(-1).last, occ.at(-1).open, occ.at(-1).n, occ.at(-1).total], ['2027-05-25', 12.5, true, false, 7, 7]);
  assert.deepEqual([occ[0].amount, occ[0].last], [25, false]);
  assert.deepEqual(remainingOccurrences([OPEN], { today: '2026-11-15' }), []);
  assert.equal(remainingOccurrences([LAPTOP, OPEN], { today: '2026-11-15' }).length, 4);
});

test('openSeries: the first due on/after today, skipping months marked paid (later paid months → EXDATE)', () => {
  const [s] = openSeries([OPEN], { today: '2026-11-15' });
  assert.deepEqual([s.start, s.date, s.month, s.dueDay, s.amount, s.open, s.n, s.total, s.last, s.rrule], [
    '2026-12-10', '2026-12-10', '2026-12', 10, 40, true, null, null, false, 'FREQ=MONTHLY;BYMONTHDAY=10',
  ]);
  assert.deepEqual(s.exdates, []);
  const dec = [{ installment_id: 'O', month: '2026-12' }];
  assert.equal(openSeries([OPEN], { today: '2026-11-15', payments: dec })[0].start, '2027-01-10');
  const early = openSeries([OPEN], { today: '2026-11-05', payments: dec })[0];
  assert.deepEqual([early.start, early.exdates], ['2026-11-10', ['2026-12-10']]);
  const kept = openSeries([OPEN], { today: '2026-11-05', payments: dec, skipPaid: false })[0];
  assert.deepEqual([kept.start, kept.exdates], ['2026-11-10', []]);
  // past paid months and other installments' marks never become EXDATEs
  const mixed = openSeries([OPEN], { today: '2026-11-15', payments: [{ installment_id: 'O', month: '2026-10' }, { installment_id: 'X', month: '2027-02' }, { installment_id: 'O', month: 'bad' }] })[0];
  assert.deepEqual([mixed.start, mixed.exdates], ['2026-12-10', []]);
  assert.deepEqual(openSeries([LAPTOP, PART], { today: '2026-11-15' }), []);
  assert.deepEqual(openSeries([OPEN31], { today: '2027-02-01' })[0].start, '2027-02-28');
});

test('buildICS: an open-ended installment is ONE recurring VEVENT with no COUNT/UNTIL', () => {
  const text = buildICS([OPEN31], { today: '2026-11-15', now: NOW });
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.ok(!/\r(?!\n)|(?<!\r)\n/.test(text), 'bare CR or LF found');
  const evs = events(text);
  assert.equal(evs.length, 1);
  const [ev] = evs;
  assert.equal(ev.UID, 'O31-open@aqsati');
  assert.equal(ev.RRULE, 'FREQ=MONTHLY;BYMONTHDAY=-1');
  assert.equal(ev['DTSTART;VALUE=DATE'], '20261130');
  assert.equal(ev['DTEND;VALUE=DATE'], '20261201');
  assert.equal(ev.SUMMARY, 'قسط بطاقة ائتمانية — 40.000 د.ك');
  assert.ok(ev.DESCRIPTION.includes('بطاقة\\, الراتب\\n'));
  assert.ok(ev.DESCRIPTION.includes('قسط شهري بدون تاريخ نهاية'));
  assert.ok(!text.includes('COUNT='));
  assert.ok(!text.includes('UNTIL='));
  assert.ok(!text.includes('EXDATE'));
  const lines = contentLines(text);
  assert.equal(lines.filter((l) => l === 'BEGIN:VALARM').length, 1);
  assert.equal(lines.filter((l) => l === 'TRIGGER:-P1D').length, 1);

  const ex = buildICS([OPEN], { today: '2026-11-05', now: NOW, payments: [{ installment_id: 'O', month: '2026-12' }, { installment_id: 'O', month: '2027-03' }] });
  assert.ok(contentLines(ex).includes('EXDATE;VALUE=DATE:20261210,20270310'));
  assert.equal(events(ex)[0]['DTSTART;VALUE=DATE'], '20261110');

  // finite VEVENTs first, then the series; custom builders receive ev.open
  const mixed = buildICS([LAPTOP, OPEN], {
    today: '2026-11-15',
    now: NOW,
    description: (e) => (e.open ? 'Monthly, no end date' : `Payment ${e.n} of ${e.total}`),
  });
  const mevs = events(mixed);
  assert.equal(mevs.length, 5);
  assert.equal(mevs.at(-1).UID, 'O-open@aqsati');
  assert.equal(mevs.at(-1).DESCRIPTION, 'Monthly\\, no end date');
  assert.equal(mevs[0].DESCRIPTION, 'Payment 1 of 4');
});

test('buildICS: the final payment of an amount plan shows its partial amount and «آخر دفعة»', () => {
  const evs = events(buildICS([PART], { today: '2026-11-15', now: NOW }));
  assert.equal(evs.length, 7);
  const last = evs.at(-1);
  assert.equal(last.SUMMARY, 'قسط تابي — 12.500 د.ك');
  assert.ok(last.DESCRIPTION.includes('الدفعة 7 من 7'));
  assert.ok(last.DESCRIPTION.includes('آخر دفعة'));
  assert.ok(last.DESCRIPTION.includes('(12.500 د.ك)'));
  assert.ok(!evs[0].DESCRIPTION.includes('آخر دفعة'));
  // a full final payment (mode 1) says «آخر دفعة» without an amount
  const lap = events(buildICS([LAPTOP], { today: '2026-11-15', now: NOW })).at(-1);
  assert.ok(lap.DESCRIPTION.includes('الدفعة 4 من 4 — آخر دفعة · اقصادي'));
});
