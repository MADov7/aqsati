// أقساطي — التحليل: KPIs, the 12-month commitment timeline («متى بتخف أقساطك؟») with the safe-limit line,
// a provider donut (monthly or remaining debt) and the payoff plan (two orderings + extra-payment simulator).
// Every chart is hand-built SVG with a text summary and a table alternative.

import { initPage, store, t, registerStrings, getLang, isRTL, fmt, esc, ICONS, fx, toast, showBanner, errorText } from '../core.js';
import * as C from '../../calc.js';
import { timeline, remainingSummary, byProvider, providerColor } from '../logic/schedule.js';
import { simulatePlan } from '../logic/payoff.js';
import { columnChart, rowChart, donutChart, bindTips, onWidth } from '../logic/charts.js';

const monthsAr = (n) => (n === 1 ? 'شهر واحد' : n === 2 ? 'شهرين' : n <= 10 ? `${n} شهور` : `${n} شهر`);
const monthsEn = (n) => (n === 1 ? '1 month' : `${n} months`);

registerStrings({
  ar: {
    'ins.kicker': 'التحليل',
    'ins.title': 'وين رايحة أقساطك؟',
    'ins.desc': 'متى بتخف أقساطك، مين ياخذ أكثر من راتبك، ومتى تخلص من كل ديونك — مع خطة سداد تقدر تجربها.',
    'ins.toPlan': 'جرّب خطة السداد',
    'ins.toReport': 'التقرير الشهري',
    'ins.months': (v) => monthsAr(v.n),
    'ins.kDebt': 'إجمالي الباقي عليك',
    'ins.kDebtSub': 'على {count}',
    'ins.kFree': 'تاريخ الخلاص',
    'ins.kFreeSub': 'آخر دفعة: {provider}',
    'ins.kLeft': 'باقي',
    'ins.kLeftSub': 'فيها دفعات لين تخلص',
    'ins.kMonthly': 'قسطك الشهري',
    'ins.kMonthlyOf': '{pct} من راتبك',
    'ins.kMonthlyNoSalary': 'حط راتبك عشان نحسب النسبة',
    'ins.tlTitle': 'متى بتخف أقساطك؟',
    'ins.tlHint': 'مجموع أقساطك بكل شهر خلال السنة الجاية.',
    'ins.tlNow': 'هالشهر عليك {now}، وبعد سنة ({month}) بيصير {later}.',
    'ins.tlDrop': 'أول ما تخف: {month} — ينزل قسطك {drop} لأنه يخلص {names}.',
    'ins.tlFlat': 'قسطك الشهري ثابت طول السنة الجاية.',
    'ins.tlBackUnder': 'ترجع تحت حدك الآمن من {month}.',
    'ins.tlAllUnder': 'كل الشهور تحت حدك الآمن ({limit}). ممتاز.',
    'ins.tlStillOver': 'كل الشهور الجاية فوق حدك الآمن ({limit}) — جرّب خطة السداد تحت.',
    'ins.tlNoSalary': 'حط راتبك بصفحة «حسابي» عشان نرسم خط حدك الآمن.',
    'ins.limit': 'حدك الآمن {amount}',
    'ins.lgOk': 'مريح',
    'ins.lgWarn': 'قريب من الحد',
    'ins.lgOver': 'فوق الحد',
    'ins.lgLimit': 'حدك الآمن',
    'ins.tip': '{month}\n{amount} · {count}',
    'ins.tipEnding': 'يخلص فيه: {names}',
    'ins.table': 'اعرض كجدول',
    'ins.thMonth': 'الشهر',
    'ins.thTotal': 'المجموع',
    'ins.thCount': 'عدد الأقساط',
    'ins.thRatio': 'من الراتب',
    'ins.thEnding': 'يخلص فيه',
    'ins.thProvider': 'الجهة',
    'ins.thShare': 'النسبة',
    'ins.thAmount': 'المبلغ',
    'ins.dnTitle': 'توزيع أقساطك حسب الجهة',
    'ins.dnHint': 'مين ياخذ النصيب الأكبر.',
    'ins.dnMonthly': 'بالشهر',
    'ins.dnDebt': 'من الباقي',
    'ins.dnMeasure': 'احسب التوزيع',
    'ins.dnCenterMonthly': 'كل شهر',
    'ins.dnCenterDebt': 'إجمالي الباقي',
    'ins.dnSummary': 'أكبر جهة: {provider} بـ {pct} ({amount}).',
    'ins.dnTip': '{provider}\n{amount} · {pct}',
    'ins.plTitle': 'خطة السداد',
    'ins.plHint': 'اختار طريقة ومبلغ إضافي تقدر عليه، ونحسب لك متى تخلص.',
    'ins.plStrategy': 'طريقة السداد',
    'ins.plRelief': 'أسرع راحة',
    'ins.plImpact': 'أكبر أثر',
    'ins.plReliefHint': 'يقفل الأقساط الأصغر أول — تشوف أقساط تخلص بسرعة وتحس بالإنجاز.',
    'ins.plImpactHint': 'يفك أكبر قسط شهري أول — راتبك يرتاح بأكبر مبلغ بأسرع وقت.',
    'ins.plExtra': 'مبلغ إضافي كل شهر',
    'ins.plExtraHint': 'يروح للقسط الأول بالترتيب، وبعده للي بعده.',
    'ins.plRollover': 'لما يخلص قسط، حوّل مبلغه الشهري للي بعده',
    'ins.plFreeBy': 'تخلص من كل أقساطك',
    'ins.plSaved': 'أسرع بـ {months}',
    'ins.plSame': 'نفس الموعد',
    'ins.plWithout': 'بدون خطة',
    'ins.plWith': 'مع الخطة',
    'ins.plBar': '{months} · {month}',
    'ins.plRolloverNote': 'حتى بدون مبلغ إضافي، تحويل مبلغ القسط اللي يخلص يوفر لك {months}.',
    'ins.plZeroNote': 'حرّك المؤشر وشوف كم شهر توفر.',
    'ins.plOrder': 'ترتيب السداد',
    'ins.plLeft': 'باقي {amount} · {monthly} بالشهر',
    'ins.plEarly': 'قبل بـ {months}',
    'ins.plOnTime': 'بموعده',
    'ins.plInstead': 'بدل {date}',
    'ins.emptyTitle': 'ما فيه شي نحلله للحين',
    'ins.emptyDesc': 'أضف أقساطك وبنرسم لك متى بتخف، مين ياخذ أكثر من راتبك، وخطة تخلصك منها أسرع.',
    'ins.doneTitle': 'خلصت كل أقساطك!',
    'ins.doneDesc': 'ما عليك أي دفعات باقية. قبل لا تقسّط شي جديد، افحصه بـ «أقدر أشتريه؟».',
    'ins.emptyCta': 'أضف قسط',
    'ins.checkCta': 'أقدر أشتريه؟',
    'ins.loadErr': 'ما قدرنا نحمّل أقساطك.',
  },
  en: {
    'ins.kicker': 'Insights',
    'ins.title': 'Where are your installments going?',
    'ins.desc': 'When your payments get lighter, who takes most of your salary and when you are debt-free — plus a payoff plan to try.',
    'ins.toPlan': 'Try the payoff plan',
    'ins.toReport': 'Monthly report',
    'ins.months': (v) => monthsEn(v.n),
    'ins.kDebt': 'Total left to pay',
    'ins.kDebtSub': 'across {count}',
    'ins.kFree': 'Debt-free date',
    'ins.kFreeSub': 'Last payment: {provider}',
    'ins.kLeft': 'Still to go',
    'ins.kLeftSub': 'with payments until you are done',
    'ins.kMonthly': 'Monthly payments',
    'ins.kMonthlyOf': '{pct} of your salary',
    'ins.kMonthlyNoSalary': 'Add your salary to see the ratio',
    'ins.tlTitle': 'When do your payments get lighter?',
    'ins.tlHint': 'Your installment total for each of the next 12 months.',
    'ins.tlNow': 'This month you pay {now}; in a year ({month}) it will be {later}.',
    'ins.tlDrop': 'First drop: {month} — down {drop} as {names} ends.',
    'ins.tlFlat': 'Your monthly total stays the same all year.',
    'ins.tlBackUnder': 'You are back under your safe limit from {month}.',
    'ins.tlAllUnder': 'Every month is under your safe limit ({limit}). Great.',
    'ins.tlStillOver': 'Every coming month is over your safe limit ({limit}) — try the payoff plan below.',
    'ins.tlNoSalary': 'Add your salary on the Account page to draw your safe-limit line.',
    'ins.limit': 'Safe limit {amount}',
    'ins.lgOk': 'Comfortable',
    'ins.lgWarn': 'Near the limit',
    'ins.lgOver': 'Over the limit',
    'ins.lgLimit': 'Safe limit',
    'ins.tip': '{month}\n{amount} · {count}',
    'ins.tipEnding': 'Ends: {names}',
    'ins.table': 'Show as a table',
    'ins.thMonth': 'Month',
    'ins.thTotal': 'Total',
    'ins.thCount': 'Installments',
    'ins.thRatio': 'Of salary',
    'ins.thEnding': 'Ending',
    'ins.thProvider': 'Provider',
    'ins.thShare': 'Share',
    'ins.thAmount': 'Amount',
    'ins.dnTitle': 'By provider',
    'ins.dnHint': 'Who takes the biggest share.',
    'ins.dnMonthly': 'Monthly',
    'ins.dnDebt': 'Remaining',
    'ins.dnMeasure': 'Split by',
    'ins.dnCenterMonthly': 'per month',
    'ins.dnCenterDebt': 'left in total',
    'ins.dnSummary': 'Biggest: {provider} with {pct} ({amount}).',
    'ins.dnTip': '{provider}\n{amount} · {pct}',
    'ins.plTitle': 'Payoff plan',
    'ins.plHint': 'Pick a strategy and an extra amount you can afford; we work out when you are done.',
    'ins.plStrategy': 'Strategy',
    'ins.plRelief': 'Quick wins',
    'ins.plImpact': 'Biggest relief',
    'ins.plReliefHint': 'Closes the smallest balances first — you see installments disappear fast.',
    'ins.plImpactHint': 'Clears the biggest monthly payment first — frees the most salary soonest.',
    'ins.plExtra': 'Extra each month',
    'ins.plExtraHint': 'Goes to the first installment in the order, then the next.',
    'ins.plRollover': 'When an installment ends, roll its monthly amount into the next',
    'ins.plFreeBy': 'Debt-free by',
    'ins.plSaved': '{months} sooner',
    'ins.plSame': 'Same date',
    'ins.plWithout': 'No plan',
    'ins.plWith': 'With plan',
    'ins.plBar': '{months} · {month}',
    'ins.plRolloverNote': 'Even with no extra, rolling finished payments over saves you {months}.',
    'ins.plZeroNote': 'Move the slider to see how many months you save.',
    'ins.plOrder': 'Payoff order',
    'ins.plLeft': '{amount} left · {monthly} a month',
    'ins.plEarly': '{months} early',
    'ins.plOnTime': 'On schedule',
    'ins.plInstead': 'instead of {date}',
    'ins.emptyTitle': 'Nothing to analyse yet',
    'ins.emptyDesc': 'Add your installments and we will chart when they get lighter, who takes most of your salary and a plan to finish sooner.',
    'ins.doneTitle': 'All installments paid off!',
    'ins.doneDesc': 'You have nothing left to pay. Before buying on installments again, check it with “Can I afford it?”.',
    'ins.emptyCta': 'Add an installment',
    'ins.checkCta': 'Can I afford it?',
    'ins.loadErr': "We couldn't load your installments.",
  },
});

// ---------- icons ----------

const svg = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const IC = {
  wallet: svg('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v4"/><rect x="4" y="9" width="16" height="10" rx="2.5"/><circle cx="16" cy="14" r="1.3"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  pie: svg('<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15z"/>'),
  trend: svg('<path d="M4 19h16"/><path d="m5 15 4-4 3 3 7-7"/><path d="M15 7h4v4"/>'),
  rocket: svg('<path d="M12 15c-1.5-1.5-3-3.2-3-6.5C9 5 12 3 12 3s3 2 3 5.5c0 3.3-1.5 5-3 6.5z"/><path d="M9 11.5 6 13l1 4 3-1.5M15 11.5l3 1.5-1 4-3-1.5M12 15v6"/>'),
};

// ---------- preferences (per viewer, convenience only) ----------

const PREF_KEY = 'aqsati_plan';
const prefs = { measure: 'monthly', strategy: 'relief', extra: 20, rollover: true };
try {
  const saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    if (['monthly', 'debt'].includes(saved.measure)) prefs.measure = saved.measure;
    if (['relief', 'impact'].includes(saved.strategy)) prefs.strategy = saved.strategy;
    if (Number.isFinite(saved.extra)) prefs.extra = Math.max(0, Math.min(200, Math.round(saved.extra / 5) * 5));
    if (typeof saved.rollover === 'boolean') prefs.rollover = saved.rollover;
  }
} catch { /* defaults */ }
const savePrefs = () => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* memory only */ }
};

// ---------- formatting helpers ----------

const monthName = (() => {
  const f = {
    ar: new Intl.DateTimeFormat('ar-KW-u-nu-latn', { month: 'long', timeZone: 'UTC' }),
    en: new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }),
  };
  return (key) => {
    const [y, m] = key.split('-').map(Number);
    return f[getLang()].format(new Date(Date.UTC(y, m - 1, 1)));
  };
})();
const yearOf = (key) => key.slice(0, 4);
const months = (n) => t('ins.months', { n });
const names = (list) => [...new Set(list)].map((n) => fmt.provider(n)).join(getLang() === 'ar' ? '، ' : ', ');
const tick = (v) => (v >= 10000 ? `${fmt.num(v / 1000, 1)}K` : fmt.num(v, 0));

const view = { counted: false, chart: null };
const root = () => document.getElementById('ins-root');

// ---------- render ----------

function render() {
  const el = root();
  if (!el) return;
  view.chart?.disconnect();
  view.chart = null;
  el.removeAttribute('aria-busy');

  if (!store.loaded) {
    el.innerHTML = `<div class="empty"><strong>${esc(t('ins.loadErr'))}</strong><div class="empty-actions"><button type="button" class="btn" data-retry>${esc(t('common.retry'))}</button></div></div>`;
    return;
  }
  const st = store.state;
  const today = C.todayISO();
  const sum = remainingSummary(st.installments, today);
  const toPlan = document.getElementById('to-plan');
  if (toPlan) toPlan.hidden = !sum.activeCount;
  if (!sum.activeCount) {
    el.innerHTML = emptyHTML(st.installments.length > 0);
    return;
  }
  const salary = Number(st.profile?.salary) || 0;
  const safe = Number(st.profile?.safe_limit) || C.DEFAULT_SAFE_LIMIT;
  const limit = salary > 0 ? C.round3((salary * safe) / 100) : null;
  const tl = timeline(st.installments, C.monthKey(today), 12);

  const active = document.activeElement;
  const focusKey = active && el.contains(active) ? active.getAttribute('data-focus-key') : null;
  el.innerHTML = `
    ${kpisHTML(sum, salary, safe)}
    <div class="grid gap-lg">
      ${timelineHTML(tl, limit, salary, safe)}
      ${donutHTML()}
      ${planHTML()}
    </div>`;

  // KPI count-up (first paint only)
  if (!view.counted) {
    view.counted = true;
    el.querySelectorAll('[data-count]').forEach((n) => fx.countUp(n, 0, Number(n.dataset.count), fmt.money, 800));
  }

  // timeline chart follows the card width
  const wrap = el.querySelector('#tl-chart');
  bindTips(wrap);
  const host = wrap.querySelector('.chart-host');
  view.chart = onWidth(host, (w) => drawTimeline(host, w, tl, limit, salary, safe));

  bindTips(el.querySelector('#dn-chart'));
  drawDonut();
  syncPlanControls();
  drawPlan();
  if (focusKey) el.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function kpisHTML(sum, salary, safe) {
  const ratio = salary > 0 ? (sum.monthly / salary) * 100 : null;
  const level = C.levelFor(ratio, safe);
  return `
    <section class="stats four ins-kpis" aria-label="${esc(t('ins.kicker'))}">
      <div class="stat feature tilt">
        <span class="stat-ico" aria-hidden="true">${IC.wallet}</span>
        <span class="stat-label">${esc(t('ins.kDebt'))}</span>
        <strong class="stat-value num" data-count="${sum.totalDebt}">${esc(fmt.money(sum.totalDebt))}</strong>
        <span class="stat-sub">${esc(t('ins.kDebtSub', { count: fmt.count(sum.activeCount) }))}</span>
      </div>
      <div class="stat tilt">
        <span class="stat-ico" aria-hidden="true">${IC.flag}</span>
        <span class="stat-label">${esc(t('ins.kFree'))}</span>
        <strong class="stat-value">${esc(fmt.date(sum.debtFreeDate))}</strong>
        <span class="stat-sub">${esc(t('ins.kFreeSub', { provider: fmt.provider(sum.lastInstallment?.provider) }))}</span>
      </div>
      <div class="stat tilt">
        <span class="stat-ico" aria-hidden="true">${IC.clock}</span>
        <span class="stat-label">${esc(t('ins.kLeft'))}</span>
        <strong class="stat-value">${esc(months(sum.monthsLeft))}</strong>
        <span class="stat-sub">${esc(t('ins.kLeftSub'))}</span>
      </div>
      <div class="stat tilt${ratio === null ? '' : ` tone-${level}`}">
        <span class="stat-ico" aria-hidden="true">${ICONS.gauge}</span>
        <span class="stat-label">${esc(t('ins.kMonthly'))}</span>
        <strong class="stat-value num" data-count="${sum.monthly}">${esc(fmt.money(sum.monthly))}</strong>
        <span class="stat-sub">${ratio === null ? esc(t('ins.kMonthlyNoSalary')) : `<span class="lvl-${level} fw-700">${esc(t('ins.kMonthlyOf', { pct: fmt.pct(ratio) }))}</span>`}</span>
      </div>
    </section>`;
}

function toneFor(total, salary, safe) {
  if (!(salary > 0)) return 'none';
  return C.levelFor((total / salary) * 100, safe);
}

function timelineSummary(tl, limit) {
  const first = tl[0];
  const last = tl[tl.length - 1];
  const lines = [t('ins.tlNow', { now: fmt.money(first.total), month: fmt.month(last.key), later: fmt.money(last.total) })];
  const dropAt = tl.findIndex((m, i) => i > 0 && m.total < tl[i - 1].total - 1e-9);
  if (dropAt > 0) {
    lines.push(t('ins.tlDrop', {
      month: fmt.month(tl[dropAt].key),
      drop: fmt.money(C.round3(tl[dropAt - 1].total - tl[dropAt].total)),
      names: names(tl[dropAt - 1].ending.length ? tl[dropAt - 1].ending : tl[dropAt].ending),
    }));
  } else if (tl.every((m) => Math.abs(m.total - first.total) < 1e-9)) {
    lines.push(t('ins.tlFlat'));
  }
  if (limit) {
    const over = tl.map((m) => m.total > limit + 1e-9);
    if (!over.some(Boolean)) lines.push(t('ins.tlAllUnder', { limit: fmt.money(limit) }));
    else if (over.every(Boolean)) lines.push(t('ins.tlStillOver', { limit: fmt.money(limit) }));
    else if (over[0]) {
      const back = over.findIndex((o) => !o);
      if (back > 0) lines.push(t('ins.tlBackUnder', { month: fmt.month(tl[back].key) }));
    }
  } else {
    lines.push(t('ins.tlNoSalary'));
  }
  return lines;
}

function timelineHTML(tl, limit, salary, safe) {
  const lines = timelineSummary(tl, limit);
  const rows = tl.map((m) => {
    const ratio = salary > 0 ? fmt.pct((m.total / salary) * 100) : '—';
    return `<tr><th scope="row">${esc(fmt.month(m.key))}</th><td class="num">${esc(fmt.money(m.total))}</td><td class="num">${m.count}</td><td class="num">${esc(ratio)}</td><td>${esc(m.ending.length ? names(m.ending) : '—')}</td></tr>`;
  }).join('');
  return `
    <section class="lg-col-8 card ins-tl" aria-labelledby="tl-title">
      <div class="card-head">
        <span class="card-ico" aria-hidden="true">${IC.trend}</span>
        <div><h2 id="tl-title">${esc(t('ins.tlTitle'))}</h2><p class="hint">${esc(t('ins.tlHint'))}</p></div>
      </div>
      <div class="chart" id="tl-chart"><div class="chart-host"></div></div>
      ${salary > 0 ? `
      <ul class="chart-legend" aria-hidden="true">
        <li><span class="sw tone-ok"></span>${esc(t('ins.lgOk'))}</li>
        <li><span class="sw tone-warn"></span>${esc(t('ins.lgWarn'))}</li>
        <li><span class="sw tone-over"></span>${esc(t('ins.lgOver'))}</li>
        <li><span class="sw-line"></span>${esc(t('ins.lgLimit'))} (${esc(fmt.money(limit))})</li>
      </ul>` : ''}
      <ul class="chart-summary">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <details class="disclosure chart-table">
        <summary>${esc(t('ins.table'))}</summary>
        <div class="table-wrap">
          <table class="table">
            <caption class="sr-only">${esc(t('ins.tlTitle'))}</caption>
            <thead><tr><th scope="col">${esc(t('ins.thMonth'))}</th><th scope="col" class="num">${esc(t('ins.thTotal'))}</th><th scope="col" class="num">${esc(t('ins.thCount'))}</th><th scope="col" class="num">${esc(t('ins.thRatio'))}</th><th scope="col">${esc(t('ins.thEnding'))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>
    </section>`;
}

function drawTimeline(host, width, tl, limit, salary, safe) {
  const rtl = isRTL();
  const data = tl.map((m, i) => {
    const tip = [t('ins.tip', { month: fmt.month(m.key), amount: fmt.money(m.total), count: fmt.count(m.count) })];
    if (m.ending.length) tip.push(t('ins.tipEnding', { names: names(m.ending) }));
    const narrow = width < 560;
    return {
      label: narrow ? `${monthName(m.key)} ${yearOf(m.key)}` : monthName(m.key),
      sub: !narrow && (i === 0 || m.key.endsWith('-01')) ? yearOf(m.key) : '',
      value: m.total,
      tone: toneFor(m.total, salary, safe),
      tip: tip.join('\n'),
    };
  });
  const common = {
    id: 'tl',
    data,
    rtl,
    limit,
    limitLabel: limit ? t('ins.limit', { amount: fmt.num(limit, 0) }) : '',
    title: t('ins.tlTitle'),
    desc: timelineSummary(tl, limit).join(' '),
  };
  host.innerHTML = width < 560
    ? rowChart({ ...common, width, fmtValue: (v) => fmt.num(v, 1), labelW: rtl ? 100 : 78 })
    : columnChart({ ...common, width, height: 280, fmtTick: tick, fmtValue: (v) => fmt.num(v, 1), valueAt: [0, data.length - 1] });
}

function donutHTML() {
  return `
    <section class="lg-col-4 card ins-dn" aria-labelledby="dn-title">
      <div class="card-head">
        <span class="card-ico gold" aria-hidden="true">${IC.pie}</span>
        <div><h2 id="dn-title">${esc(t('ins.dnTitle'))}</h2><p class="hint">${esc(t('ins.dnHint'))}</p></div>
      </div>
      <fieldset class="seg-field">
        <legend class="sr-only">${esc(t('ins.dnMeasure'))}</legend>
        <div class="seg dn-seg">
          <label><input type="radio" name="dn-measure" value="monthly" data-focus-key="dn-monthly"${prefs.measure === 'monthly' ? ' checked' : ''}><span>${esc(t('ins.dnMonthly'))}</span></label>
          <label><input type="radio" name="dn-measure" value="debt" data-focus-key="dn-debt"${prefs.measure === 'debt' ? ' checked' : ''}><span>${esc(t('ins.dnDebt'))}</span></label>
        </div>
      </fieldset>
      <div class="chart dn-chart" id="dn-chart">
        <div class="dn-figure">
          <div class="chart-host"></div>
          <div class="dn-center" aria-hidden="true"><strong class="num" id="dn-total"></strong><span id="dn-caption"></span></div>
        </div>
      </div>
      <ul class="dn-legend" id="dn-legend"></ul>
      <p class="chart-summary-p" id="dn-summary"></p>
      <details class="disclosure chart-table">
        <summary>${esc(t('ins.table'))}</summary>
        <div class="table-wrap" id="dn-table"></div>
      </details>
    </section>`;
}

function drawDonut() {
  const el = root();
  const wrap = el?.querySelector('#dn-chart');
  if (!wrap) return;
  const groups = byProvider(store.state.installments, C.todayISO(), prefs.measure);
  const total = C.round3(groups.reduce((s, g) => s + g.value, 0));
  const pctText = (g) => fmt.pct(g.pct); // isolated in Arabic so «41%» never shows as «%41»
  wrap.querySelector('.chart-host').innerHTML = donutChart({
    id: 'dn',
    size: 210,
    thickness: 28,
    slices: groups.map((g) => ({ value: g.value, color: g.color, tip: t('ins.dnTip', { provider: fmt.provider(g.provider), amount: fmt.money(g.value), pct: pctText(g) }) })),
    title: t('ins.dnTitle'),
    desc: groups.map((g) => `${fmt.provider(g.provider)} ${pctText(g)}`).join(getLang() === 'ar' ? '، ' : ', '),
  });
  el.querySelector('#dn-total').textContent = fmt.money(total);
  el.querySelector('#dn-caption').textContent = t(prefs.measure === 'debt' ? 'ins.dnCenterDebt' : 'ins.dnCenterMonthly');
  el.querySelector('#dn-legend').innerHTML = groups.map((g) => `
    <li>
      <span class="dot c-${g.color}" aria-hidden="true"></span>
      <span class="dn-name">${esc(fmt.provider(g.provider))}</span>
      <span class="dn-pct num">${esc(pctText(g))}</span>
      <span class="dn-amt num">${esc(fmt.money(g.value))}</span>
    </li>`).join('');
  const top = groups[0];
  el.querySelector('#dn-summary').textContent = top ? t('ins.dnSummary', { provider: fmt.provider(top.provider), pct: pctText(top), amount: fmt.money(top.value) }) : '';
  el.querySelector('#dn-table').innerHTML = `
    <table class="table">
      <caption class="sr-only">${esc(t('ins.dnTitle'))}</caption>
      <thead><tr><th scope="col">${esc(t('ins.thProvider'))}</th><th scope="col" class="num">${esc(t('ins.thAmount'))}</th><th scope="col" class="num">${esc(t('ins.thShare'))}</th><th scope="col" class="num">${esc(t('ins.thCount'))}</th></tr></thead>
      <tbody>${groups.map((g) => `<tr><th scope="row">${esc(fmt.provider(g.provider))}</th><td class="num">${esc(fmt.money(g.value))}</td><td class="num">${esc(pctText(g))}</td><td class="num">${g.count}</td></tr>`).join('')}</tbody>
    </table>`;
}

function planHTML() {
  return `
    <section class="lg-col-12 card ins-plan" id="plan" aria-labelledby="plan-title">
      <div class="card-head">
        <span class="card-ico gold" aria-hidden="true">${IC.rocket}</span>
        <div><h2 id="plan-title">${esc(t('ins.plTitle'))}</h2><p class="hint">${esc(t('ins.plHint'))}</p></div>
      </div>
      <div class="plan-grid">
        <div class="plan-controls">
          <fieldset class="seg-field">
            <legend class="field-label">${esc(t('ins.plStrategy'))}</legend>
            <div class="seg plan-seg">
              <label><input type="radio" name="strategy" value="relief" data-focus-key="st-relief" aria-describedby="strat-hint"><span>${esc(t('ins.plRelief'))}</span></label>
              <label><input type="radio" name="strategy" value="impact" data-focus-key="st-impact" aria-describedby="strat-hint"><span>${esc(t('ins.plImpact'))}</span></label>
            </div>
            <p class="hint" id="strat-hint"></p>
          </fieldset>
          <div class="field plan-range">
            <div class="split"><label for="plan-extra" class="field-label">${esc(t('ins.plExtra'))}</label><output id="plan-extra-out" for="plan-extra" class="num"></output></div>
            <input type="range" id="plan-extra" min="0" max="200" step="5" data-focus-key="extra" aria-describedby="plan-extra-hint">
            <div class="range-scale" aria-hidden="true"><span class="num">0</span><span class="num">100</span><span class="num">200</span></div>
            <p class="hint" id="plan-extra-hint">${esc(t('ins.plExtraHint'))}</p>
          </div>
          <label class="switch plan-switch">
            <input type="checkbox" role="switch" id="plan-rollover" data-focus-key="rollover">
            <span>${esc(t('ins.plRollover'))}</span>
          </label>
        </div>
        <div class="plan-result" id="plan-result" aria-live="polite"></div>
      </div>
      <h3 class="plan-order-title">${esc(t('ins.plOrder'))}</h3>
      <ol class="plan-list" id="plan-list"></ol>
    </section>`;
}

function syncPlanControls() {
  const el = root();
  const strat = el?.querySelector(`input[name="strategy"][value="${prefs.strategy}"]`);
  if (strat) strat.checked = true;
  const range = el?.querySelector('#plan-extra');
  if (range) range.value = String(prefs.extra);
  const sw = el?.querySelector('#plan-rollover');
  if (sw) sw.checked = prefs.rollover;
}

function drawPlan() {
  const el = root();
  const result = el?.querySelector('#plan-result');
  if (!result) return;
  const plan = simulatePlan(store.state.installments, { today: C.todayISO(), extra: prefs.extra, strategy: prefs.strategy, rollover: prefs.rollover });
  if (!plan) return;
  el.querySelector('#strat-hint').textContent = t(prefs.strategy === 'impact' ? 'ins.plImpactHint' : 'ins.plReliefHint');
  const range = el.querySelector('#plan-extra');
  const out = el.querySelector('#plan-extra-out');
  out.textContent = fmt.money(prefs.extra);
  range.setAttribute('aria-valuetext', fmt.money(prefs.extra));
  const pct = (prefs.extra / 200) * 100;
  range.style.setProperty('--fill', `${pct}%`);

  const saved = plan.monthsSaved;
  let note = '';
  if (prefs.extra === 0 && saved > 0) note = t('ins.plRolloverNote', { months: months(saved) });
  else if (prefs.extra === 0) note = t('ins.plZeroNote');
  result.innerHTML = `
    <p class="plan-kicker">${esc(t('ins.plFreeBy'))}</p>
    <strong class="plan-date">${esc(fmt.date(plan.debtFreeDate))}</strong>
    <p class="plan-chip">${saved > 0
    ? `<span class="chip chip-ok">${ICONS.check}${esc(t('ins.plSaved', { months: months(saved) }))}</span>`
    : `<span class="chip chip-none">${esc(t('ins.plSame'))}</span>`}</p>
    <div class="plan-compare">
      <div class="plan-bar">
        <div class="split"><span>${esc(t('ins.plWithout'))}</span><b>${esc(t('ins.plBar', { months: months(plan.naturalMonthsToFree), month: fmt.month(plan.naturalKey) }))}</b></div>
        <span class="meter"><i data-w="100"></i></span>
      </div>
      <div class="plan-bar">
        <div class="split"><span>${esc(t('ins.plWith'))}</span><b>${esc(t('ins.plBar', { months: months(plan.monthsToFree), month: fmt.month(plan.debtFreeKey) }))}</b></div>
        <span class="meter"><i class="gold" data-w="${(plan.monthsToFree / plan.naturalMonthsToFree) * 100}"></i></span>
      </div>
    </div>
    ${note ? `<p class="hint plan-note">${esc(note)}</p>` : ''}`;
  result.querySelectorAll('.meter > i').forEach((i) => fx.setWidth(i, Number(i.dataset.w)));

  el.querySelector('#plan-list').innerHTML = plan.debts.map((d) => `
    <li class="plan-item">
      <span class="plan-rank num" aria-hidden="true">${d.order}</span>
      <span class="due-dot c-${providerColor(d.provider)}" aria-hidden="true"></span>
      <div class="plan-main">
        <p class="plan-line"><b>${esc(fmt.provider(d.provider))}</b>${d.title ? `<span class="plan-title" dir="auto">${esc(d.title)}</span>` : ''}</p>
        <p class="plan-meta">${esc(t('ins.plLeft', { amount: fmt.money(d.remainingTotal), monthly: fmt.money(d.monthly) }))}</p>
      </div>
      <div class="plan-when">
        <b>${esc(fmt.date(d.finishDate))}</b>
        ${d.monthsSaved > 0
    ? `<span class="chip chip-ok">${esc(t('ins.plEarly', { months: months(d.monthsSaved) }))}</span><span class="plan-instead">${esc(t('ins.plInstead', { date: fmt.date(d.naturalDate) }))}</span>`
    : `<span class="chip chip-none">${esc(t('ins.plOnTime'))}</span>`}
      </div>
    </li>`).join('');
}

function emptyHTML(allDone) {
  return `
    <div class="empty ins-empty">
      <svg class="empty-art" viewBox="0 0 160 130" aria-hidden="true" focusable="false">
        <rect class="ill-soft" x="12" y="18" width="136" height="100" rx="20"/>
        <rect class="ill-card" x="24" y="28" width="112" height="80" rx="14"/>
        <path class="ill-grid" d="M36 92h88M36 72h88M36 52h88"/>
        <rect class="ill-bar1" x="44" y="58" width="12" height="34" rx="3"/>
        <rect class="ill-bar2" x="64" y="66" width="12" height="26" rx="3"/>
        <rect class="ill-bar1" x="84" y="72" width="12" height="20" rx="3"/>
        <rect class="ill-bar3" x="104" y="80" width="12" height="12" rx="3"/>
        <path class="ill-trend" d="M42 50 66 60 88 66 116 76"/>
        <circle class="ill-gold" cx="124" cy="36" r="13"/>
        <path class="ill-check" d="m118 36 4.5 4.5 8-9"/>
      </svg>
      <strong>${esc(t(allDone ? 'ins.doneTitle' : 'ins.emptyTitle'))}</strong>
      <p>${esc(t(allDone ? 'ins.doneDesc' : 'ins.emptyDesc'))}</p>
      <div class="empty-actions">
        <a class="btn btn-gold" href="/installments?add=1">${ICONS.plus}<span>${esc(t('ins.emptyCta'))}</span></a>
        <a class="btn btn-ghost" href="/check">${esc(t('ins.checkCta'))}</a>
      </div>
    </div>`;
}

// ---------- events ----------

function bind() {
  const el = root();
  el.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name === 'dn-measure') {
      prefs.measure = input.value === 'debt' ? 'debt' : 'monthly';
      savePrefs();
      drawDonut();
    } else if (input.name === 'strategy') {
      prefs.strategy = input.value === 'impact' ? 'impact' : 'relief';
      savePrefs();
      drawPlan();
    } else if (input.id === 'plan-rollover') {
      prefs.rollover = input.checked;
      savePrefs();
      drawPlan();
    } else if (input.id === 'plan-extra') {
      savePrefs();
    }
  });
  el.addEventListener('input', (e) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && input.id === 'plan-extra') {
      prefs.extra = Math.max(0, Math.min(200, Number(input.value) || 0));
      drawPlan();
    }
  });
  el.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-retry]')) {
      store.load().then(() => { showBanner(''); render(); }, (err) => toast(errorText(err), 'error'));
    }
  });
}

// ---------- boot ----------

bind();
await initPage({ active: 'insights', requireAuth: true, title: 'nav.insights' });
render();
store.subscribe(render);
window.addEventListener('langchange', render);
