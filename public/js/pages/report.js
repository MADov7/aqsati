// أقساطي — التقرير الشهري: a printable monthly statement (month selector, brand header, KPIs, table of the
// month's dues with paid status, a small chart, tips, generated date). «حمّل PDF» = window.print() with the
// A4 print stylesheet; «تصدير CSV» = a UTF-8 (BOM) CSV that opens cleanly in Excel / Numbers / Sheets.

import { initPage, store, t, registerStrings, getLang, isRTL, fmt, esc, ICONS, toast, showBanner, errorText, logoHTML } from '../core.js';
import * as C from '../../calc.js';
import { monthEvents, monthTotals, timeline, reportMonths, reportTips, toCSV, providerColor, roundPercents } from '../logic/schedule.js';
import { columnChart, splitBar, bindTips, onWidth } from '../logic/charts.js';

registerStrings({
  ar: {
    'rep.kicker': 'التقرير الشهري',
    'rep.title': 'كشف أقساطك الشهري',
    'rep.desc': 'كشف مرتب لأي شهر: المجموع والمدفوع والباقي ونسبتها من راتبك — حمّله PDF أو صدّره CSV.',
    'rep.pdf': 'حمّل PDF',
    'rep.csv': 'تصدير CSV',
    'rep.month': 'الشهر',
    'rep.prev': 'الشهر اللي قبل',
    'rep.next': 'الشهر الجاي',
    'rep.printHint': 'بنافذة الطباعة اختار «حفظ كـ PDF».',
    'rep.sheetTitle': 'كشف أقساط {month}',
    'rep.issued': 'صادر في {date}',
    'rep.for': 'صاحب الكشف:',
    'rep.guest': 'حساب ضيف (هالمتصفح)',
    'rep.no': 'رقم الكشف {no}',
    'rep.kTotal': 'مجموع الشهر',
    'rep.kPaid': 'دفعت',
    'rep.kLeft': 'باقي',
    'rep.kRatio': 'من راتبك',
    'rep.kRatioNone': 'بدون راتب',
    'rep.kCount': '{count}',
    'rep.chartSplit': 'توزيع الشهر حسب الجهة',
    'rep.chartNext': 'الست شهور الجاية',
    'rep.chartNextDesc': 'مجموع الأقساط من {from} إلى {to}.',
    'rep.tableTitle': 'دفعات الشهر',
    'rep.thDate': 'التاريخ',
    'rep.thProvider': 'الجهة',
    'rep.thTitle': 'الوصف',
    'rep.thPayment': 'الدفعة',
    'rep.thAmount': 'المبلغ',
    'rep.thStatus': 'الحالة',
    'rep.total': 'المجموع',
    'rep.nOf': '{n} من {total}',
    'rep.stPaid': 'مدفوع ✓',
    'rep.stPast': 'فات موعده',
    'rep.stToday': 'اليوم',
    'rep.stUpcoming': 'باقي',
    'rep.noDues': 'ما عليك أقساط بهالشهر.',
    'rep.tips': 'نصايح الشهر',
    'rep.foot': 'هالكشف للمتابعة الشخصية من تطبيق أقساطي، ومو كشف حساب رسمي من البنك أو الجهة.',
    'rep.csvDone': 'نزل ملف CSV ✓',
    'rep.emptyTitle': 'ما فيه شي بالكشف للحين',
    'rep.emptyDesc': 'أضف أقساطك وبنطلع لك كشف شهري مرتب تقدر تحمّله PDF أو تصدّره CSV.',
    'rep.emptyCta': 'أضف أول قسط',
    'rep.loadErr': 'ما قدرنا نحمّل أقساطك.',
    'rep.csvHead': ['التاريخ', 'الجهة', 'الوصف', 'رقم الدفعة', 'المبلغ (د.ك)', 'الحالة'].join('|'),
    'tip.past': (v) => `عندك ${v.n === 1 ? 'دفعة وحدة' : v.n === 2 ? 'دفعتين' : v.n <= 10 ? `${v.n} دفعات` : `${v.n} دفعة`} فات موعدها وما تعلّمت مدفوعة (${v.amount}). إذا دفعتها، علّمها من التقويم عشان يضبط الكشف.`,
    'tip.ending': 'هالشهر آخر دفعة لـ {names} — والشهر الجاي يخف عليك.',
    'tip.drop': 'الشهر الجاي أقساطك تنزل {amount}.',
    'tip.rise': 'انتبه: الشهر الجاي أقساطك تزيد {amount}.',
    'tip.over': 'أقساطك فوق حدك الآمن — لا تقسّط شي جديد قبل لا يخلص قسط.',
    'tip.warn': 'قربت من حدك الآمن — فكّر مرتين قبل أي قسط جديد.',
    'tip.ok': 'وضعك مريح ✓ أقساطك تحت حدك الآمن.',
    'tip.salary': 'حط راتبك بصفحة «حسابي» عشان نقارن أقساطك براتبك.',
    'tip.free': 'ما عليك أقساط بهالشهر — فرصة تحوّش.',
  },
  en: {
    'rep.kicker': 'Monthly report',
    'rep.title': 'Your monthly statement',
    'rep.desc': 'A clean statement for any month: total, paid, still due and the share of your salary — save it as PDF or export CSV.',
    'rep.pdf': 'Save as PDF',
    'rep.csv': 'Export CSV',
    'rep.month': 'Month',
    'rep.prev': 'Previous month',
    'rep.next': 'Next month',
    'rep.printHint': 'In the print window choose “Save as PDF”.',
    'rep.sheetTitle': '{month} statement',
    'rep.issued': 'Issued {date}',
    'rep.for': 'Account:',
    'rep.guest': 'Guest (this browser)',
    'rep.no': 'Statement {no}',
    'rep.kTotal': 'Month total',
    'rep.kPaid': 'Paid',
    'rep.kLeft': 'Still due',
    'rep.kRatio': 'Of salary',
    'rep.kRatioNone': 'No salary set',
    'rep.kCount': '{count}',
    'rep.chartSplit': 'This month by provider',
    'rep.chartNext': 'Next six months',
    'rep.chartNextDesc': 'Installment totals from {from} to {to}.',
    'rep.tableTitle': 'Payments this month',
    'rep.thDate': 'Date',
    'rep.thProvider': 'Provider',
    'rep.thTitle': 'Description',
    'rep.thPayment': 'Payment',
    'rep.thAmount': 'Amount',
    'rep.thStatus': 'Status',
    'rep.total': 'Total',
    'rep.nOf': '{n} of {total}',
    'rep.stPaid': 'Paid ✓',
    'rep.stPast': 'Past due',
    'rep.stToday': 'Today',
    'rep.stUpcoming': 'Due',
    'rep.noDues': 'Nothing due this month.',
    'rep.tips': 'Tips for the month',
    'rep.foot': 'This statement is for personal tracking in Aqsati — it is not an official statement from a bank or provider.',
    'rep.csvDone': 'CSV downloaded ✓',
    'rep.emptyTitle': 'Nothing to report yet',
    'rep.emptyDesc': 'Add your installments and we will build a clean monthly statement you can save as PDF or export as CSV.',
    'rep.emptyCta': 'Add your first installment',
    'rep.loadErr': "We couldn't load your installments.",
    'rep.csvHead': ['Date', 'Provider', 'Description', 'Payment', 'Amount (KWD)', 'Status'].join('|'),
    'tip.past': (v) => `${v.n === 1 ? '1 payment is' : `${v.n} payments are`} past due and not marked paid (${v.amount}). If you paid, mark it in the calendar so the statement is right.`,
    'tip.ending': 'This month is the last payment for {names} — next month gets lighter.',
    'tip.drop': 'Next month your installments drop by {amount}.',
    'tip.rise': 'Heads up: next month your installments rise by {amount}.',
    'tip.over': 'You are over your safe limit — avoid new installments until one ends.',
    'tip.warn': 'You are close to your safe limit — think twice before any new installment.',
    'tip.ok': 'You are comfortable ✓ your installments are under your safe limit.',
    'tip.salary': 'Add your salary on the Account page to compare installments with it.',
    'tip.free': 'Nothing due this month — a good time to save.',
  },
});

const svg = (body, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const IC = {
  prev: svg('<path d="m15 6-6 6 6 6"/>', 'ico flip-rtl'),
  next: svg('<path d="m9 6 6 6-6 6"/>', 'ico flip-rtl'),
  bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>'),
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const view = { month: '', charts: [] };
const root = () => document.getElementById('rep-root');
const statusText = (s) => t({ paid: 'rep.stPaid', past: 'rep.stPast', today: 'rep.stToday' }[s] || 'rep.stUpcoming');
const statusTone = (s) => ({ paid: 'ok', past: 'warn', today: 'gold' }[s] || 'none');

function initialMonth() {
  try {
    const m = new URLSearchParams(location.search).get('m');
    if (m && MONTH_RE.test(m)) return m;
  } catch { /* ignore */ }
  return C.monthKey(C.todayISO());
}

function setMonth(key) {
  view.month = key;
  try {
    const url = new URL(location.href);
    if (key === C.monthKey(C.todayISO())) url.searchParams.delete('m');
    else url.searchParams.set('m', key);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}

/** Everything one month's statement shows. */
function buildReport(key) {
  const st = store.state;
  const today = C.todayISO();
  const events = monthEvents(st.installments, key, st.payments, today);
  const totals = monthTotals(events);
  const next = timeline(st.installments, key, 6);
  const salary = Number(st.profile?.salary) || 0;
  const safe = Number(st.profile?.safe_limit) || C.DEFAULT_SAFE_LIMIT;
  const ratio = salary > 0 ? (totals.total / salary) * 100 : null;
  const level = C.levelFor(ratio, safe);
  const tips = reportTips({
    level,
    totals,
    nextTotal: next[1]?.total ?? 0,
    ending: events.filter((e) => e.last).map((e) => e.provider),
    hasEvents: events.length > 0,
  });
  const groups = new Map();
  for (const e of events) {
    const g = groups.get(e.provider) || { provider: e.provider, value: 0, color: providerColor(e.provider) };
    g.value = C.round3(g.value + e.amount);
    groups.set(e.provider, g);
  }
  const split = [...groups.values()].sort((a, b) => b.value - a.value);
  const pcts = roundPercents(split.map((g) => g.value));
  split.forEach((g, i) => { g.pct = pcts[i]; });
  return { key, today, events, totals, next, salary, safe, ratio, level, tips, split };
}

function tipText(tip) {
  const vars = {
    n: tip.n,
    amount: tip.amount !== undefined ? fmt.money(tip.amount) : undefined,
    names: tip.names ? tip.names.map((n) => fmt.provider(n)).join(getLang() === 'ar' ? '، ' : ', ') : undefined,
  };
  return t(tip.key, vars);
}

// ---------- render ----------

function render() {
  const el = root();
  if (!el) return;
  view.charts.forEach((c) => c.disconnect());
  view.charts = [];
  el.removeAttribute('aria-busy');
  const pdfBtn = document.getElementById('rep-pdf');
  const csvBtn = document.getElementById('rep-csv');

  if (!store.loaded) {
    el.innerHTML = `<div class="empty"><strong>${esc(t('rep.loadErr'))}</strong><div class="empty-actions"><button type="button" class="btn" data-retry>${esc(t('common.retry'))}</button></div></div>`;
    pdfBtn.disabled = true;
    csvBtn.disabled = true;
    return;
  }
  const st = store.state;
  if (!st.installments.length) {
    el.innerHTML = emptyHTML();
    pdfBtn.disabled = true;
    csvBtn.disabled = true;
    return;
  }
  pdfBtn.disabled = false;
  csvBtn.disabled = false;

  const today = C.todayISO();
  const months = reportMonths(st.installments, today, 24, 12);
  if (!months.includes(view.month)) {
    months.push(view.month);
    months.sort();
  }
  const r = buildReport(view.month);
  const at = months.indexOf(view.month);

  const active = document.activeElement;
  const focusKey = active && el.contains(active) ? active.getAttribute('data-focus-key') : null;

  el.innerHTML = `
    <div class="rep-controls card solid">
      <label for="rep-month" class="field-label">${esc(t('rep.month'))}</label>
      <div class="rep-picker">
        <button type="button" class="icon-btn rep-nav" data-step="-1" data-focus-key="rep-prev" aria-label="${esc(t('rep.prev'))}"${at <= 0 ? ' disabled' : ''}>${IC.prev}</button>
        <select id="rep-month" data-focus-key="rep-month">
          ${months.map((k) => `<option value="${k}"${k === view.month ? ' selected' : ''}>${esc(fmt.month(k))}</option>`).join('')}
        </select>
        <button type="button" class="icon-btn rep-nav" data-step="1" data-focus-key="rep-next" aria-label="${esc(t('rep.next'))}"${at >= months.length - 1 ? ' disabled' : ''}>${IC.next}</button>
      </div>
      <p class="hint rep-print-hint">${esc(t('rep.printHint'))}</p>
    </div>
    ${sheetHTML(r)}`;

  // charts follow the sheet width (and print at a fixed A4-friendly width)
  const splitHost = el.querySelector('#rep-split .chart-host');
  const nextHost = el.querySelector('#rep-next .chart-host');
  bindTips(el.querySelector('#rep-split'));
  bindTips(el.querySelector('#rep-next'));
  if (splitHost) view.charts.push(onWidth(splitHost, (w) => drawSplit(splitHost, w, r)));
  if (nextHost) view.charts.push(onWidth(nextHost, (w) => drawNext(nextHost, w, r)));

  if (focusKey) el.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function sheetHTML(r) {
  const st = store.state;
  const who = st.user?.email || t('rep.guest');
  const no = `AQ-${r.key.replace('-', '')}`;
  const rows = r.events.map((e) => `
    <tr class="st-${e.status}">
      <td class="nowrap">${esc(fmt.day(e.date))}</td>
      <th scope="row"><span class="rep-prov"><span class="dot c-${e.color}" aria-hidden="true"></span>${esc(fmt.provider(e.provider))}</span></th>
      <td class="rep-desc" dir="auto">${esc(e.title || '—')}</td>
      <td class="num">${esc(t('rep.nOf', { n: e.n, total: e.total }))}</td>
      <td class="num">${esc(fmt.money(e.amount))}</td>
      <td><span class="chip chip-${statusTone(e.status)}">${esc(statusText(e.status))}</span></td>
    </tr>`).join('');
  return `
    <article class="sheet" aria-labelledby="sheet-title">
      <header class="sheet-head">
        <div class="sheet-brand">
          ${logoHTML({ size: 32, tone: 'auto' })}
          <small>${esc(t('app.tagline'))}</small>
        </div>
        <div class="sheet-meta">
          <h2 id="sheet-title">${esc(t('rep.sheetTitle', { month: fmt.month(r.key) }))}</h2>
          <p><span>${esc(t('rep.issued', { date: fmt.date(r.today) }))}</span><span>${esc(t('rep.no', { no }))}</span></p>
          <p class="sheet-who"><span>${esc(t('rep.for'))}</span><bdi>${esc(who)}</bdi></p>
        </div>
      </header>

      <section class="sheet-kpis" aria-label="${esc(t('rep.kTotal'))}">
        <div class="sk sk-main"><span>${esc(t('rep.kTotal'))}</span><strong class="num">${esc(fmt.money(r.totals.total))}</strong><small>${esc(fmt.count(r.totals.count))}</small></div>
        <div class="sk"><span>${esc(t('rep.kPaid'))}</span><strong class="num lvl-ok">${esc(fmt.money(r.totals.paid))}</strong><small>${esc(fmt.pct(r.totals.paidPct))}</small></div>
        <div class="sk"><span>${esc(t('rep.kLeft'))}</span><strong class="num">${esc(fmt.money(r.totals.unpaid))}</strong><small>${esc(r.totals.pastCount ? `${t('rep.stPast')}: ${fmt.money(r.totals.past)}` : ' ')}</small></div>
        <div class="sk"><span>${esc(t('rep.kRatio'))}</span><strong class="num${r.ratio === null ? '' : ` lvl-${r.level}`}">${esc(r.ratio === null ? '—' : fmt.pct(r.ratio))}</strong><small>${esc(r.ratio === null ? t('rep.kRatioNone') : t(`level.${r.level}`))}</small></div>
      </section>

      <section class="sheet-charts">
        <div class="sheet-chart" id="rep-split">
          <h3>${esc(t('rep.chartSplit'))}</h3>
          ${r.split.length ? `
          <div class="chart-host"></div>
          <ul class="rep-legend">${r.split.map((g) => `<li><span class="dot c-${g.color}" aria-hidden="true"></span>${esc(fmt.provider(g.provider))}<b class="num">${g.pct}%</b></li>`).join('')}</ul>`
    : `<p class="hint">${esc(t('rep.noDues'))}</p>`}
        </div>
        <div class="sheet-chart" id="rep-next">
          <h3>${esc(t('rep.chartNext'))}</h3>
          <div class="chart-host"></div>
        </div>
      </section>

      <section class="sheet-table" aria-labelledby="table-title">
        <h3 id="table-title">${esc(t('rep.tableTitle'))}</h3>
        <div class="table-wrap">
          <table class="table rep-table">
            <thead><tr>
              <th scope="col">${esc(t('rep.thDate'))}</th>
              <th scope="col">${esc(t('rep.thProvider'))}</th>
              <th scope="col">${esc(t('rep.thTitle'))}</th>
              <th scope="col" class="num">${esc(t('rep.thPayment'))}</th>
              <th scope="col" class="num">${esc(t('rep.thAmount'))}</th>
              <th scope="col">${esc(t('rep.thStatus'))}</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="rep-empty-row">${esc(t('rep.noDues'))}</td></tr>`}</tbody>
            ${r.events.length ? `<tfoot><tr><th scope="row" colspan="4">${esc(t('rep.total'))}</th><td class="num">${esc(fmt.money(r.totals.total))}</td><td></td></tr></tfoot>` : ''}
          </table>
        </div>
      </section>

      <section class="sheet-tips" aria-labelledby="tips-title">
        <h3 id="tips-title"><span class="tips-ico" aria-hidden="true">${IC.bulb}</span>${esc(t('rep.tips'))}</h3>
        <ul>${r.tips.slice(0, 3).map((tip) => `<li>${esc(tipText(tip))}</li>`).join('')}</ul>
      </section>

      <footer class="sheet-foot">
        <p>${esc(t('rep.foot'))}</p>
        <p class="num">${esc(t('app.name'))} · ${esc(fmt.date(r.today))}</p>
      </footer>
    </article>`;
}

function drawSplit(host, width, r) {
  host.innerHTML = splitBar({
    id: 'rsplit',
    width,
    height: 16,
    rtl: isRTL(),
    parts: r.split.map((g) => ({ value: g.value, color: g.color, tip: `${fmt.provider(g.provider)}\n${fmt.money(g.value)} · ${g.pct}%` })),
    title: t('rep.chartSplit'),
    desc: r.split.map((g) => `${fmt.provider(g.provider)} ${g.pct}%`).join(isRTL() ? '، ' : ', '),
  });
}

function drawNext(host, width, r, height = 190) {
  const salary = r.salary;
  const limit = salary > 0 ? C.round3((salary * r.safe) / 100) : null;
  const name = new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { month: getLang() === 'ar' ? 'long' : 'short', timeZone: 'UTC' });
  host.innerHTML = columnChart({
    id: 'rnext',
    width,
    height,
    rtl: isRTL(),
    data: r.next.map((m) => {
      const [y, mo] = m.key.split('-').map(Number);
      return {
        label: name.format(new Date(Date.UTC(y, mo - 1, 1))),
        value: m.total,
        tone: salary > 0 ? C.levelFor((m.total / salary) * 100, r.safe) : 'none',
        tip: `${fmt.month(m.key)}\n${fmt.money(m.total)} · ${fmt.count(m.count)}`,
      };
    }),
    limit,
    limitLabel: limit ? fmt.num(limit, 0) : '',
    fmtTick: (v) => fmt.num(v, 0),
    fmtValue: (v) => fmt.num(v, 1),
    valueAt: [0],
    title: t('rep.chartNext'),
    desc: t('rep.chartNextDesc', { from: fmt.month(r.next[0].key), to: fmt.month(r.next[r.next.length - 1].key) }),
  });
}

function emptyHTML() {
  return `
    <div class="empty rep-empty">
      <svg class="empty-art" viewBox="0 0 160 130" aria-hidden="true" focusable="false">
        <rect class="ill-soft" x="18" y="14" width="124" height="106" rx="20"/>
        <path class="ill-card" d="M46 22h50l22 22v70a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z"/>
        <path class="ill-fold" d="M96 22v16a6 6 0 0 0 6 6h16"/>
        <rect class="ill-navy" x="52" y="34" width="30" height="7" rx="3.5"/>
        <rect class="ill-line" x="52" y="54" width="56" height="6" rx="3"/>
        <rect class="ill-line" x="52" y="66" width="48" height="6" rx="3"/>
        <rect class="ill-line" x="52" y="78" width="56" height="6" rx="3"/>
        <rect class="ill-gold" x="52" y="94" width="28" height="9" rx="4.5"/>
        <circle class="ill-teal" cx="118" cy="100" r="14"/>
        <path class="ill-check" d="m112 100 4.5 4.5 8-9"/>
      </svg>
      <strong>${esc(t('rep.emptyTitle'))}</strong>
      <p>${esc(t('rep.emptyDesc'))}</p>
      <div class="empty-actions"><a class="btn btn-gold" href="/installments?add=1">${ICONS.plus}<span>${esc(t('rep.emptyCta'))}</span></a></div>
    </div>`;
}

// ---------- actions ----------

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportCSV() {
  const r = buildReport(view.month);
  const rows = [t('rep.csvHead').split('|')];
  for (const e of r.events) {
    // «1 من 6» / '1 of 6' — never '1/6', which Excel and Sheets turn into a date
    rows.push([e.date, fmt.provider(e.provider), e.title, t('rep.nOf', { n: e.n, total: e.total }), e.amount.toFixed(3), statusText(e.status)]);
  }
  rows.push(['', '', '', t('rep.total'), r.totals.total.toFixed(3), '']);
  download(`aqsati-report-${r.key}.csv`, `﻿${toCSV(rows)}`, 'text/csv;charset=utf-8');
  toast(t('rep.csvDone'), 'ok');
}

function printPDF() {
  const title = document.title;
  document.title = `aqsati-report-${view.month}`; // the suggested PDF file name
  const restore = () => { document.title = title; };
  window.addEventListener('afterprint', restore, { once: true });
  window.print();
  setTimeout(restore, 1500);
}

function bind() {
  const el = root();
  el.addEventListener('change', (e) => {
    if (e.target instanceof HTMLSelectElement && e.target.id === 'rep-month' && MONTH_RE.test(e.target.value)) {
      setMonth(e.target.value);
      render();
    }
  });
  el.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const step = target?.closest('[data-step]');
    if (step && !step.disabled) {
      const select = el.querySelector('#rep-month');
      const keys = [...select.options].map((o) => o.value);
      const next = keys[keys.indexOf(view.month) + Number(step.dataset.step)];
      if (next) {
        setMonth(next);
        render();
      }
      return;
    }
    if (target?.closest('[data-retry]')) store.load().then(() => { showBanner(''); render(); }, (err) => toast(errorText(err), 'error'));
  });
  document.getElementById('rep-pdf').addEventListener('click', printPDF);
  document.getElementById('rep-csv').addEventListener('click', exportCSV);
  // charts re-draw at a fixed width for paper, then back to the screen width
  // (A4 minus margins ≈ 700px; the two chart boxes share it, so draw at their printed size and text stays full size)
  const forPrint = (on) => {
    const hosts = document.querySelectorAll('#rep-root .chart-host');
    if (!hosts.length) return;
    const r = buildReport(view.month);
    for (const host of hosts) {
      const split = Boolean(host.closest('#rep-split'));
      const w = on ? (split ? 300 : 360) : Math.floor(host.clientWidth) || 600;
      if (split) drawSplit(host, w, r);
      else drawNext(host, w, r, on ? 160 : 190);
    }
  };
  window.addEventListener('beforeprint', () => forPrint(true));
  window.addEventListener('afterprint', () => forPrint(false));
}

// ---------- boot ----------

view.month = initialMonth();
bind();
await initPage({ active: 'report', requireAuth: true, title: 'nav.report' });
render();
store.subscribe(render);
window.addEventListener('langchange', render);
