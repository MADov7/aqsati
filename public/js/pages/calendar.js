// أقساطي — التقويم: month grid (Saturday-first in Arabic, Sunday-first in English), due chips per day with
// provider colours and amounts, paid ✓ from payments, today + salary day, a day panel with «دفعته» toggles,
// the month total, an agenda list (the accessible text view of the grid) and the .ics export.

import {
  initPage, store, t, registerStrings, getLang, isRTL, fmt, toast, showBanner, errorText, esc, ICONS, fx,
} from '../core.js';
import * as C from '../../calc.js';
import { monthGrid, monthEvents, eventsByDay, monthTotals, weekdayOf, providerColor } from '../logic/schedule.js';
import { buildICS, remainingOccurrences } from '../logic/ics.js';

registerStrings({
  ar: {
    'cal.kicker': 'التقويم',
    'cal.title': 'تقويم أقساطك',
    'cal.desc': 'كل موعد دفع بيومه — المدفوع والباقي ومجموع الشهر، وتقدر تضيفها لتقويم جوالك.',
    'cal.ics': 'أضف لتقويم جوالك',
    'cal.prev': 'الشهر اللي قبل',
    'cal.next': 'الشهر الجاي',
    'cal.today': 'اليوم',
    'cal.help': 'تنقّل بين الأيام بالأسهم، واضغط على أي يوم تشوف أقساطه.',
    'cal.legendPaid': 'مدفوع',
    'cal.legendToday': 'اليوم',
    'cal.legendSalary': 'يوم الراتب',
    'cal.salaryTag': 'راتب',
    'cal.sumTitle': 'مجموع {month}',
    'cal.paid': 'دفعت',
    'cal.left': 'باقي عليك',
    'cal.past': 'فات موعده وما تعلّم',
    'cal.paidPct': '{pct} من أقساط الشهر مدفوعة',
    'cal.ofSalary': '{pct} من راتبك',
    'cal.noSalary': 'حط راتبك بصفحة «حسابي» عشان نحسب النسبة.',
    'cal.dayNone': 'ما عليك أي قسط بهاليوم.',
    'cal.monthNone': 'ما عليك أقساط بهالشهر — شهر مرتاح.',
    'cal.payN': 'الدفعة {n} من {total}',
    'cal.lastPay': 'آخر دفعة',
    'cal.paidCheck': 'دفعته',
    'cal.paidCheckAria': 'دفعت قسط {provider} لشهر {month}',
    'cal.outOfRange': 'تقدر تعلّم الدفع لين الشهر الجاي بس.',
    'cal.paidOk': 'تمام، تعلّم مدفوع ✓',
    'cal.unpaidOk': 'شلنا علامة الدفع.',
    'cal.stPaid': 'مدفوع ✓',
    'cal.stPast': 'فات موعده',
    'cal.stToday': 'اليوم',
    'cal.agenda': 'كل دفعات {month}',
    'cal.agendaHint': 'نفس التقويم بشكل قائمة، مرتبة حسب التاريخ.',
    'cal.providers': 'الجهات هالشهر',
    'cal.icsTitle': 'أضف مواعيدك لتقويم جوالك',
    'cal.icsHint': 'ملف واحد فيه كل دفعاتك الجاية ({n}) مع تنبيه قبل كل موعد بيوم.',
    'cal.icsStep1': 'آيفون: اضغط الزر، افتح الملف، واختر «إضافة الكل».',
    'cal.icsStep2': 'أندرويد: نزّل الملف وافتحه بتقويم Google أو Samsung.',
    'cal.icsStep3': 'عدّلت أقساطك؟ نزّل الملف من جديد. كل موعد له معرّف ثابت، فأغلب التقاويم تحدّثه بدل ما تكرره.',
    'cal.icsBtn': 'نزّل ملف التقويم (.ics)',
    'cal.icsNone': 'ما عندك مواعيد جاية تنضاف للتقويم.',
    'cal.icsDone': 'نزل الملف ✓ افتحه عشان تضيف {n} للتقويم.',
    'cal.emptyTitle': 'تقويمك فاضي للحين',
    'cal.emptyDesc': 'أضف أقساطك وبنرتب لك كل مواعيد الدفع على التقويم، مع تنبيه بجوالك قبل كل موعد.',
    'cal.emptyCta': 'أضف أول قسط',
    'cal.emptyCta2': 'أقدر أشتريه؟',
    'cal.loadErr': 'ما قدرنا نحمّل أقساطك.',
    'cal.dayAriaDues': '، {count} بمجموع {amount}',
    'cal.dayAriaPaid': '، كلها مدفوعة',
    'cal.dayAriaToday': '، اليوم',
    'cal.dayAriaSalary': '، يوم الراتب',
    'cal.dues': (v) => (v.n === 1 ? 'دفعة وحدة' : v.n === 2 ? 'دفعتين' : v.n <= 10 ? `${v.n} دفعات` : `${v.n} دفعة`),
    'wd.0': 'الأحد', 'wd.1': 'الاثنين', 'wd.2': 'الثلاثاء', 'wd.3': 'الأربعاء', 'wd.4': 'الخميس', 'wd.5': 'الجمعة', 'wd.6': 'السبت',
    'wds.0': 'أحد', 'wds.1': 'اثنين', 'wds.2': 'ثلاثاء', 'wds.3': 'أربعاء', 'wds.4': 'خميس', 'wds.5': 'جمعة', 'wds.6': 'سبت',
  },
  en: {
    'cal.kicker': 'Calendar',
    'cal.title': 'Your installment calendar',
    'cal.desc': 'Every payment on its day — paid, still due and the month total. Add them to your phone calendar too.',
    'cal.ics': 'Add to my phone calendar',
    'cal.prev': 'Previous month',
    'cal.next': 'Next month',
    'cal.today': 'Today',
    'cal.help': 'Move between days with the arrow keys; pick a day to see its payments.',
    'cal.legendPaid': 'Paid',
    'cal.legendToday': 'Today',
    'cal.legendSalary': 'Payday',
    'cal.salaryTag': 'Payday',
    'cal.sumTitle': '{month} total',
    'cal.paid': 'Paid',
    'cal.left': 'Still due',
    'cal.past': 'Past due, not marked',
    'cal.paidPct': '{pct} of this month is paid',
    'cal.ofSalary': '{pct} of your salary',
    'cal.noSalary': 'Add your salary on the Account page to see the ratio.',
    'cal.dayNone': 'Nothing due on this day.',
    'cal.monthNone': 'Nothing due this month — enjoy it.',
    'cal.payN': 'Payment {n} of {total}',
    'cal.lastPay': 'Last payment',
    'cal.paidCheck': 'Paid',
    'cal.paidCheckAria': 'I paid the {provider} installment for {month}',
    'cal.outOfRange': 'You can mark payments up to next month only.',
    'cal.paidOk': 'Marked as paid ✓',
    'cal.unpaidOk': 'Paid mark removed.',
    'cal.stPaid': 'Paid ✓',
    'cal.stPast': 'Past due',
    'cal.stToday': 'Today',
    'cal.agenda': 'All payments in {month}',
    'cal.agendaHint': 'The same calendar as a list, by date.',
    'cal.providers': 'Providers this month',
    'cal.icsTitle': 'Add your due dates to your phone',
    'cal.icsHint': 'One file with all your upcoming payments ({n}), each with a reminder the day before.',
    'cal.icsStep1': 'iPhone: tap the button, open the file and choose “Add All”.',
    'cal.icsStep2': 'Android: download the file and open it with Google or Samsung Calendar.',
    'cal.icsStep3': 'Changed your installments? Download it again. Every date has a fixed ID, so most calendars update it instead of duplicating.',
    'cal.icsBtn': 'Download calendar file (.ics)',
    'cal.icsNone': 'You have no upcoming dates to add.',
    'cal.icsDone': 'Downloaded ✓ Open it to add {n} to your calendar.',
    'cal.emptyTitle': 'Your calendar is empty',
    'cal.emptyDesc': 'Add your installments and we will place every due date on the calendar, with a phone reminder before each one.',
    'cal.emptyCta': 'Add your first installment',
    'cal.emptyCta2': 'Can I afford it?',
    'cal.loadErr': "We couldn't load your installments.",
    'cal.dayAriaDues': ', {count} totalling {amount}',
    'cal.dayAriaPaid': ', all paid',
    'cal.dayAriaToday': ', today',
    'cal.dayAriaSalary': ', payday',
    'cal.dues': (v) => (v.n === 1 ? '1 payment' : `${v.n} payments`),
    'wd.0': 'Sunday', 'wd.1': 'Monday', 'wd.2': 'Tuesday', 'wd.3': 'Wednesday', 'wd.4': 'Thursday', 'wd.5': 'Friday', 'wd.6': 'Saturday',
    'wds.0': 'Sun', 'wds.1': 'Mon', 'wds.2': 'Tue', 'wds.3': 'Wed', 'wds.4': 'Thu', 'wds.5': 'Fri', 'wds.6': 'Sat',
  },
});

// ---------- icons ----------

const svg = (body, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const IC = {
  prev: svg('<path d="m15 6-6 6 6 6"/>', 'ico flip-rtl'),
  next: svg('<path d="m9 6 6 6-6 6"/>', 'ico flip-rtl'),
  calPlus: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
  wallet: svg('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v4"/><rect x="4" y="9" width="16" height="10" rx="2.5"/><circle cx="16" cy="14" r="1.3"/>'),
  phone: svg('<rect x="7" y="2.8" width="10" height="18.4" rx="2.6"/><path d="M11 18h2"/>'),
  sum: svg('<path d="M17 5H7l6 7-6 7h10"/>'),
};

// ---------- view state ----------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const view = { month: '', selected: '', countedKey: '', dir: 0 };

function initialMonth() {
  try {
    const m = new URLSearchParams(location.search).get('m');
    if (m && MONTH_RE.test(m)) return m;
  } catch { /* ignore */ }
  return C.monthKey(C.todayISO());
}

function setMonth(key, { select = null, dir = 0 } = {}) {
  view.month = key;
  view.dir = dir;
  view.selected = select || defaultSelection(key);
  try {
    const url = new URL(location.href);
    if (key === C.monthKey(C.todayISO())) url.searchParams.delete('m');
    else url.searchParams.set('m', key);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}

function defaultSelection(key) {
  const today = C.todayISO();
  if (C.monthKey(today) === key) return today;
  const first = monthEvents(store.state.installments, key, store.state.payments, today)[0];
  return first ? first.date : `${key}-01`;
}

// ---------- helpers ----------

const weekStart = () => (getLang() === 'ar' ? 6 : 0);
const amountShort = (x) => fmt.num(x, 3);
const canMark = (month) => {
  const now = C.monthKey(C.todayISO());
  return C.monthsBetween(month, now) <= 24 && C.monthsBetween(now, month) <= 1;
};

function salaryDateIn(key) {
  const day = store.state.profile?.salary_day;
  if (!day) return null;
  const [y, m] = key.split('-').map(Number);
  return C.dueDateIn(y, m, day);
}

function statusChip(ev, today) {
  if (ev.status === 'paid') return `<span class="chip chip-ok">${esc(t('cal.stPaid'))}</span>`;
  if (ev.status === 'past') return `<span class="chip chip-warn">${esc(t('cal.stPast'))}</span>`;
  if (ev.status === 'today') return `<span class="chip chip-gold">${esc(t('cal.stToday'))}</span>`;
  return `<span class="chip chip-none">${esc(fmt.daysLeft(C.daysBetween(today, ev.date)))}</span>`;
}

function dueRow(ev, today, { withDate = false, scope = 'day' } = {}) {
  const meta = [t('cal.payN', { n: ev.n, total: ev.total })];
  if (ev.last) meta.push(t('cal.lastPay'));
  const markable = canMark(ev.month);
  const key = `pay-${scope}-${ev.id}-${ev.month}`; // the same due can be in the day panel AND the agenda
  return `
    <li class="due-row st-${ev.status}">
      <span class="due-dot c-${ev.color}" aria-hidden="true"></span>
      <div class="due-main">
        <p class="due-line"><b class="prov">${esc(fmt.provider(ev.provider))}</b>${ev.title ? `<span class="due-title" dir="auto">${esc(ev.title)}</span>` : ''}</p>
        <p class="due-meta">${withDate ? `<span class="due-date">${esc(fmt.day(ev.date))}</span>` : ''}${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</p>
      </div>
      <div class="due-side">
        <b class="due-amt num">${esc(fmt.money(ev.amount))}</b>
        ${statusChip(ev, today)}
      </div>
      <label class="pay-check${markable ? '' : ' is-disabled'}"${markable ? '' : ` title="${esc(t('cal.outOfRange'))}"`}>
        <input type="checkbox" data-pay="${esc(ev.id)}|${ev.month}" data-focus-key="${esc(key)}"${ev.paid ? ' checked' : ''}${markable ? '' : ' disabled'}
          aria-label="${esc(t('cal.paidCheckAria', { provider: fmt.provider(ev.provider), month: fmt.month(ev.month) }))}">
        <span aria-hidden="true">${ICONS.check}${esc(t('cal.paidCheck'))}</span>
      </label>
    </li>`;
}

// ---------- render ----------

const root = () => document.getElementById('cal-root');

function render() {
  const el = root();
  if (!el) return;
  const st = store.state;
  const icsBtn = document.getElementById('ics-btn');

  if (!store.loaded) {
    el.removeAttribute('aria-busy');
    el.innerHTML = `
      <div class="empty">
        <strong>${esc(t('cal.loadErr'))}</strong>
        <div class="empty-actions"><button type="button" class="btn" data-retry>${esc(t('common.retry'))}</button></div>
      </div>`;
    if (icsBtn) icsBtn.disabled = true;
    return;
  }

  if (!st.installments.length) {
    el.removeAttribute('aria-busy');
    el.innerHTML = emptyHTML();
    if (icsBtn) icsBtn.disabled = true;
    return;
  }

  const today = C.todayISO();
  const key = view.month;
  const events = monthEvents(st.installments, key, st.payments, today);
  const byDay = eventsByDay(events);
  const totals = monthTotals(events);
  const upcoming = remainingOccurrences(st.installments, { today, payments: st.payments });
  if (icsBtn) icsBtn.disabled = upcoming.length === 0;

  const active = document.activeElement;
  const focusKey = active && el.contains(active) ? active.getAttribute('data-focus-key') : null;

  el.removeAttribute('aria-busy');
  el.innerHTML = `
    <div class="grid gap-lg">
      <section class="lg-col-8 card cal-card" aria-labelledby="cal-month-title">
        ${toolbarHTML(key)}
        ${legendHTML(events, key)}
        ${gridHTML(key, byDay, today)}
        <p class="hint cal-help">${esc(t('cal.help'))}</p>
      </section>
      <aside class="lg-col-4 cal-side">
        ${summaryHTML(key, totals)}
        ${dayPanelHTML(byDay, today, events.length)}
      </aside>
      <section class="lg-col-7 card cal-agenda" aria-labelledby="agenda-title">
        <div class="card-head">
          <span class="card-ico" aria-hidden="true">${ICONS.list}</span>
          <div><h2 id="agenda-title">${esc(t('cal.agenda', { month: fmt.month(key) }))}</h2><p class="hint">${esc(t('cal.agendaHint'))}</p></div>
        </div>
        ${events.length
    ? `<ul class="due-list">${events.map((ev) => dueRow(ev, today, { withDate: true, scope: 'agenda' })).join('')}</ul>`
    : `<p class="cal-none">${esc(t('cal.monthNone'))}</p>`}
      </section>
      <section class="lg-col-5 card cal-ics" aria-labelledby="ics-title">
        <div class="card-head">
          <span class="card-ico gold" aria-hidden="true">${IC.phone}</span>
          <div><h2 id="ics-title">${esc(t('cal.icsTitle'))}</h2><p class="hint">${esc(t('cal.icsHint', { n: t('cal.dues', { n: upcoming.length }) }))}</p></div>
        </div>
        <ol class="ics-steps">
          <li>${esc(t('cal.icsStep1'))}</li>
          <li>${esc(t('cal.icsStep2'))}</li>
          <li>${esc(t('cal.icsStep3'))}</li>
        </ol>
        <button type="button" class="btn btn-gold btn-block" data-ics data-focus-key="ics-card"${upcoming.length ? '' : ' disabled'}>${IC.calPlus}<span>${esc(t('cal.icsBtn'))}</span></button>
      </section>
    </div>`;

  // month total: count up once per month shown
  const totalEl = el.querySelector('[data-total]');
  if (totalEl && view.countedKey !== key) {
    view.countedKey = key;
    fx.countUp(totalEl, 0, totals.total, fmt.money, 700);
  }
  fx.setWidth(el.querySelector('.cal-meter > i'), totals.paidPct);

  if (view.dir) {
    const g = el.querySelector('.cal-grid');
    g?.classList.add(view.dir > 0 ? 'slide-next' : 'slide-prev');
    view.dir = 0;
  }
  if (focusKey) el.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function toolbarHTML(key) {
  const isNow = key === C.monthKey(C.todayISO());
  return `
    <div class="cal-toolbar">
      <button type="button" class="icon-btn cal-nav" data-nav="-1" data-focus-key="nav-prev" aria-label="${esc(t('cal.prev'))}">${IC.prev}</button>
      <h2 class="cal-month" id="cal-month-title" aria-live="polite">${esc(fmt.month(key))}</h2>
      <button type="button" class="icon-btn cal-nav" data-nav="1" data-focus-key="nav-next" aria-label="${esc(t('cal.next'))}">${IC.next}</button>
      <button type="button" class="btn btn-ghost btn-sm cal-today-btn" data-nav="0" data-focus-key="nav-today"${isNow ? ' aria-disabled="true"' : ''}>${esc(t('cal.today'))}</button>
    </div>`;
}

function legendHTML(events, key) {
  const names = [...new Set(events.map((e) => e.provider))];
  const salary = salaryDateIn(key);
  return `
    <div class="cal-legend">
      <ul class="legend-list" aria-label="${esc(t('cal.providers'))}">
        ${names.map((n) => `<li><span class="dot c-${providerColor(n)}" aria-hidden="true"></span>${esc(fmt.provider(n))}</li>`).join('')}
      </ul>
      <ul class="legend-list legend-keys">
        <li><span class="key-paid" aria-hidden="true">${ICONS.check}</span>${esc(t('cal.legendPaid'))}</li>
        <li><span class="key-today" aria-hidden="true"></span>${esc(t('cal.legendToday'))}</li>
        ${salary ? `<li><span class="key-salary" aria-hidden="true"></span>${esc(t('cal.legendSalary'))}</li>` : ''}
      </ul>
    </div>`;
}

function gridHTML(key, byDay, today) {
  const grid = monthGrid(key, weekStart());
  const salary = salaryDateIn(key);
  const inView = (iso) => iso.slice(0, 7) === key;
  const focusable = inView(view.selected) ? view.selected : inView(today) ? today : `${key}-01`;
  const head = grid.weekdays.map((d) => `<div role="columnheader" class="cal-wd"><abbr title="${esc(t(`wd.${d}`))}">${esc(t(`wds.${d}`))}</abbr></div>`).join('');
  const rows = grid.weeks.map((week) => `<div role="row" class="cal-row">${week.map((cell) => {
    if (!cell.inMonth) return '<div role="gridcell" class="cal-cell is-out" aria-hidden="true"><span class="cal-num">' + cell.day + '</span></div>';
    const evs = byDay.get(cell.iso) || [];
    const sum = C.round3(evs.reduce((s, e) => s + e.amount, 0));
    const allPaid = evs.length > 0 && evs.every((e) => e.paid);
    const hasPast = evs.some((e) => e.status === 'past');
    const isToday = cell.iso === today;
    const isSel = cell.iso === view.selected;
    const isSalary = cell.iso === salary;
    let label = `${t(`wd.${cell.weekday}`)} ${fmt.day(cell.iso)}`;
    if (evs.length) label += t('cal.dayAriaDues', { count: t('cal.dues', { n: evs.length }), amount: fmt.money(sum) });
    if (allPaid) label += t('cal.dayAriaPaid');
    if (isToday) label += t('cal.dayAriaToday');
    if (isSalary) label += t('cal.dayAriaSalary');
    const cls = ['cal-day', evs.length ? 'has-due' : '', allPaid ? 'all-paid' : '', hasPast ? 'has-past' : '', isToday ? 'is-today' : '', isSel ? 'is-selected' : '', isSalary ? 'is-salary' : ''].filter(Boolean).join(' ');
    const dots = evs.slice(0, 3).map((e) => `<i class="dot c-${e.color}${e.paid ? ' is-paid' : ''}"></i>`).join('') + (evs.length > 3 ? '<i class="dot-more">+</i>' : '');
    const chips = evs.slice(0, 2).map((e) => `<span class="cal-chip c-${e.color}${e.paid ? ' is-paid' : ''}"><i class="dot"></i><span class="num">${esc(amountShort(e.amount))}</span></span>`).join('')
      + (evs.length > 2 ? `<span class="cal-chip more">+${evs.length - 2}</span>` : '');
    return `<div role="gridcell" class="cal-cell" aria-selected="${isSel}">
      <button type="button" class="${cls}" data-date="${cell.iso}" data-focus-key="day-${cell.iso}" tabindex="${cell.iso === focusable ? '0' : '-1'}" aria-label="${esc(label)}"${isToday ? ' aria-current="date"' : ''}>
        <span class="cal-num" aria-hidden="true">${cell.day}</span>
        ${allPaid ? `<span class="cal-check" aria-hidden="true">${ICONS.check}</span>` : ''}
        ${isSalary ? `<span class="cal-salary" aria-hidden="true">${esc(t('cal.salaryTag'))}</span>` : ''}
        ${evs.length ? `<span class="cal-dots" aria-hidden="true">${dots}</span><span class="cal-chips" aria-hidden="true">${chips}</span>` : ''}
      </button>
    </div>`;
  }).join('')}</div>`).join('');
  return `<div class="cal-grid" role="grid" aria-labelledby="cal-month-title"><div role="row" class="cal-row cal-head">${head}</div>${rows}</div>`;
}

function summaryHTML(key, totals) {
  const salary = Number(store.state.profile?.salary) || 0;
  const safe = Number(store.state.profile?.safe_limit) || C.DEFAULT_SAFE_LIMIT;
  const ratio = salary > 0 ? (totals.total / salary) * 100 : null;
  const level = C.levelFor(ratio, safe);
  return `
    <section class="card card-feature cal-sum" aria-labelledby="sum-title">
      <div class="cal-sum-head">
        <span class="card-ico" aria-hidden="true">${IC.wallet}</span>
        <div>
          <h2 id="sum-title">${esc(t('cal.sumTitle', { month: fmt.month(key) }))}</h2>
          <p class="hint">${esc(t('cal.dues', { n: totals.count }))}</p>
        </div>
      </div>
      <strong class="cal-total num" data-total>${esc(fmt.money(totals.total))}</strong>
      <span class="meter cal-meter" aria-hidden="true"><i class="lvl-ok"></i></span>
      <p class="cal-paid-pct">${esc(t('cal.paidPct', { pct: fmt.pct(totals.paidPct) }))}</p>
      <dl class="kv cal-kv">
        <div><dt>${esc(t('cal.paid'))}</dt><dd class="num">${esc(fmt.money(totals.paid))}</dd></div>
        <div><dt>${esc(t('cal.left'))}</dt><dd class="num">${esc(fmt.money(totals.unpaid))}</dd></div>
        ${totals.pastCount ? `<div><dt>${esc(t('cal.past'))}</dt><dd class="num">${esc(fmt.money(totals.past))}</dd></div>` : ''}
      </dl>
      ${ratio === null
    ? `<p class="cal-ratio">${esc(t('cal.noSalary'))}</p>`
    : `<p class="cal-ratio"><span class="chip chip-${level}">${esc(t('cal.ofSalary', { pct: fmt.pct(ratio) }))}</span></p>`}
    </section>`;
}

function dayPanelHTML(byDay, today, monthCount) {
  const iso = view.selected;
  const evs = iso.slice(0, 7) === view.month ? (byDay.get(iso) || []) : [];
  const sum = C.round3(evs.reduce((s, e) => s + e.amount, 0));
  return `
    <section class="card cal-day-panel" aria-labelledby="day-title" aria-live="polite">
      <div class="card-head">
        <span class="card-ico" aria-hidden="true">${ICONS.calendar}</span>
        <div>
          <h2 id="day-title">${esc(`${t(`wd.${weekdayOf(iso)}`)} ${fmt.day(iso)}`)}</h2>
          <p class="hint">${evs.length ? esc(`${t('cal.dues', { n: evs.length })} · ${fmt.money(sum)}`) : esc(monthCount ? t('cal.dayNone') : t('cal.monthNone'))}</p>
        </div>
      </div>
      ${evs.length ? `<ul class="due-list">${evs.map((ev) => dueRow(ev, today, { scope: 'day' })).join('')}</ul>` : ''}
    </section>`;
}

function emptyHTML() {
  return `
    <div class="empty cal-empty">
      <svg class="empty-art" viewBox="0 0 160 130" aria-hidden="true" focusable="false">
        <rect class="ill-soft" x="14" y="22" width="132" height="98" rx="18"/>
        <rect class="ill-card" x="24" y="30" width="112" height="84" rx="14"/>
        <rect class="ill-navy" x="24" y="30" width="112" height="22" rx="11"/>
        <rect class="ill-navy" x="24" y="41" width="112" height="11"/>
        <rect class="ill-gold" x="46" y="20" width="8" height="20" rx="4"/>
        <rect class="ill-gold" x="106" y="20" width="8" height="20" rx="4"/>
        <g class="ill-line">
          <rect x="38" y="62" width="14" height="12" rx="3"/><rect x="58" y="62" width="14" height="12" rx="3"/>
          <rect x="78" y="62" width="14" height="12" rx="3"/><rect x="98" y="62" width="14" height="12" rx="3"/>
          <rect x="38" y="82" width="14" height="12" rx="3"/><rect x="58" y="82" width="14" height="12" rx="3"/>
          <rect x="98" y="82" width="14" height="12" rx="3"/>
        </g>
        <rect class="ill-gold" x="78" y="82" width="14" height="12" rx="3"/>
        <circle class="ill-teal" cx="128" cy="102" r="15"/>
        <path class="ill-check" d="m121 102 5 5 9-10"/>
      </svg>
      <strong>${esc(t('cal.emptyTitle'))}</strong>
      <p>${esc(t('cal.emptyDesc'))}</p>
      <div class="empty-actions">
        <a class="btn btn-gold" href="/installments?add=1">${ICONS.plus}<span>${esc(t('cal.emptyCta'))}</span></a>
        <a class="btn btn-ghost" href="/check">${esc(t('cal.emptyCta2'))}</a>
      </div>
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

function downloadICS() {
  const st = store.state;
  const today = C.todayISO();
  const occ = remainingOccurrences(st.installments, { today, payments: st.payments });
  if (!occ.length) {
    toast(t('cal.icsNone'), 'warn');
    return;
  }
  const en = getLang() === 'en';
  const text = buildICS(st.installments, {
    today,
    payments: st.payments,
    calName: t('app.name'),
    summary: en ? (ev) => `${fmt.provider(ev.inst.provider)} installment — ${C.fmtKWDEn(ev.amount)}` : undefined,
    description: en ? (ev) => `${ev.inst.title ? `${ev.inst.title}\n` : ''}Payment ${ev.n} of ${ev.total} · Aqsati` : undefined,
    alarm: en ? (ev) => `Tomorrow: ${fmt.provider(ev.inst.provider)} installment — ${C.fmtKWDEn(ev.amount)}` : undefined,
  });
  download('aqsati-installments.ics', text, 'text/calendar;charset=utf-8');
  toast(t('cal.icsDone', { n: t('cal.dues', { n: occ.length }) }), 'ok');
}

async function togglePaid(input) {
  const [id, month] = String(input.dataset.pay).split('|');
  const paid = input.checked;
  try {
    await store.markPaid(id, month, paid);
    toast(paid ? t('cal.paidOk') : t('cal.unpaidOk'), 'ok');
  } catch (err) {
    toast(errorText(err), 'error');
  }
}

function moveTo(iso) {
  const key = iso.slice(0, 7);
  if (key !== view.month) setMonth(key, { select: iso, dir: key > view.month ? 1 : -1 });
  else view.selected = iso;
  render();
  root()?.querySelector(`[data-date="${iso}"]`)?.focus({ preventScroll: false });
}

function bind() {
  const el = root();
  el.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const nav = target.closest('[data-nav]');
    if (nav) {
      const k = Number(nav.dataset.nav);
      const now = C.monthKey(C.todayISO());
      if (k === 0) {
        if (view.month === now && view.selected === C.todayISO()) return;
        setMonth(now, { select: C.todayISO(), dir: now > view.month ? 1 : now < view.month ? -1 : 0 });
      } else {
        setMonth(C.shiftMonthKey(view.month, k), { dir: k });
      }
      render();
      return;
    }
    const day = target.closest('[data-date]');
    if (day) {
      view.selected = day.dataset.date;
      render();
      // on phones the day panel is below the grid: bring it into view
      if (window.matchMedia('(max-width: 1023px)').matches) {
        root()?.querySelector('.cal-day-panel')?.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
      }
      return;
    }
    if (target.closest('[data-ics]')) downloadICS();
    if (target.closest('[data-retry]')) {
      store.load().then(() => { showBanner(''); render(); }, (err) => toast(errorText(err), 'error'));
    }
  });
  el.addEventListener('change', (e) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && input.dataset.pay) togglePaid(input);
  });
  el.addEventListener('keydown', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-date]') : null;
    if (!btn) return;
    const iso = btn.dataset.date;
    const rtl = isRTL();
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = C.daysBetween('2000-01-01', iso) + (rtl ? -1 : 1); break;
      case 'ArrowLeft': next = C.daysBetween('2000-01-01', iso) + (rtl ? 1 : -1); break;
      case 'ArrowDown': next = C.daysBetween('2000-01-01', iso) + 7; break;
      case 'ArrowUp': next = C.daysBetween('2000-01-01', iso) - 7; break;
      case 'Home': next = C.daysBetween('2000-01-01', iso) - ((weekdayOf(iso) - weekStart() + 7) % 7); break;
      case 'End': next = C.daysBetween('2000-01-01', iso) + (6 - ((weekdayOf(iso) - weekStart() + 7) % 7)); break;
      case 'PageUp': case 'PageDown': {
        e.preventDefault();
        const key = C.shiftMonthKey(iso.slice(0, 7), e.key === 'PageDown' ? 1 : -1);
        const [y, m] = key.split('-').map(Number);
        moveTo(C.dueDateIn(y, m, Number(iso.slice(8, 10))));
        return;
      }
      default: return;
    }
    e.preventDefault();
    const base = new Date(Date.UTC(2000, 0, 1 + next));
    moveTo(C.isoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()));
  });
  document.getElementById('ics-btn')?.addEventListener('click', downloadICS);
}

// ---------- boot ----------

view.month = initialMonth();
bind();
await initPage({ active: 'calendar', requireAuth: true, title: 'nav.calendar' });
view.selected = defaultSelection(view.month);
render();
store.subscribe(render);
window.addEventListener('langchange', render);
