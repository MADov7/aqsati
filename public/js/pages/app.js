// اقصادي — لوحتي (dashboard): month summary with the ring gauge, payday alert, debt-free countdown,
// upcoming dues, smart tips, badges, guest banner, salary settings and the first-visit tour.
import {
  initPage, store, t, registerStrings, getLang, isRTL, fmt, toast, showBanner, errorText, saveProfile, $, esc, fx,
} from '../core.js';
import * as C from '../../calc.js';
import { buildTips, duesBeforeSalary } from '../logic/tips.js';
import { computeBadges, badgeText, newlyUnlocked } from '../logic/badges.js';
import { startTour, tourDone } from '../logic/tour.js';
import { remindDues } from '../logic/notify.js';
import { debtFreeCountdown } from '../logic/schedule.js';

// ---------- strings ----------

registerStrings({
  ar: {
    'dash.doc': 'لوحتي',
    'dash.kicker': 'لوحة الشهر',
    'dash.kickerMonth': 'لوحة {month}',
    'dash.title': 'لوحتي',
    'dash.desc': 'كل أقساطك هالشهر بنظرة وحدة: كم تدفع، وكم يبقى من راتبك، ومتى تخلص.',
    'dash.add': 'أضف قسط',
    'dash.check': 'أقدر أشتريه؟',
    'dash.sumTitle': 'ملخص الشهر',
    'dash.sumHint': 'التزامك ونسبته من راتبك',
    'dash.ofSalary': 'من راتبك',
    'dash.monthly': 'التزامك الشهري',
    'dash.free': 'يبقى لك من الراتب',
    'dash.left': 'باقي تدفعه هالشهر',
    'dash.debt': 'مجموع الي باقي عليك',
    'dash.activeCount': 'نشطة: {n}',
    'dash.leftDone': 'كل أقساط الشهر مدفوعة ✓',
    'dash.legend': 'الحد الآمن {limit} من راتبك = {amount} بالشهر',
    'dash.legendOver': '· متعديه بـ {amount}',
    'dash.legendNone': 'حط راتبك ونحسب لك كم تاخذ الأقساط منه.',
    'dash.setSalary': 'حط راتبك',
    'dash.ringLabel': 'نسبة أقساطك من راتبك: {ratio}. حدك الآمن {limit}.',
    'dash.ringNone': 'ما في راتب محفوظ، فما نقدر نحسب النسبة.',
    'dash.status': 'التزامك الشهري {amount}{ratio}. {level}',
    'dash.statusRatio': '، يعني {ratio} من راتبك',
    'dash.loadFail': 'ما قدرنا نجيب بياناتك.',
    'dash.retry': 'جرّب مرة ثانية',

    'dash.freeTitle': 'العد التنازلي للحرية',
    'dash.freeHint': 'متى تخلص من كل أقساطك',
    'dash.freeBy': 'بتخلص من كل أقساطك بـ',
    'dash.freeIn': 'باقي {months} · {count}',
    'dash.freeThisMonth': 'هالشهر آخر شهر!',
    'dash.freePaid': 'دفعت {pct} من مجموع أقساطك',
    'dash.freeOf': '{paid} من {total}',
    'dash.freeDone': 'خالي من الأقساط 🎉',
    'dash.freeDoneSub': 'خلّصت كل أقساطك. افحص أي شراء جديد قبل لا تقسّطه.',
    'dash.freeEmpty': 'أضف أقساطك ونقولك بأي شهر تخلص منها كلها.',
    'dash.freeMeter': 'نسبة الي دفعته من مجموع أقساطك: {pct}',

    'dash.upTitle': 'الأقساط الجاية',
    'dash.upHint': 'أقرب 5 مواعيد',
    'dash.upAll': 'كل الأقساط',
    'dash.upMore': 'وباقي {count} بصفحة اقصادي',
    'dash.left2': 'باقي {count}',
    'dash.debtOpen': 'ما يشمل المفتوحة ({n})',
    // n = how many (agreement via C.openAdjAr: قسط واحد مفتوح · قسطين مفتوحين · 3 أقساط مفتوحة · 11 قسط مفتوح);
    // the verb refers to the whole set, so it stays «تبقى» for 2+
    'dash.freeOpenNote': (v) => `ما يشمل ${v.count} ${C.openAdjAr(v.n)} (${v.amount} بالشهر) — ${v.n === 1 ? 'يبقى' : 'تبقى'} عليك بعد هالتاريخ.`,
    'dash.freeOpenOnly': 'كل أقساطك مفتوحة بدون تاريخ نهاية، فما نقدر نحسب متى تخلص.',
    'dash.freeOpenCta': 'حدّد كم باقي',
    'dash.last': 'آخر قسط {month}',
    'dash.paidChip': 'مدفوع ✓',
    'dash.emptyTitle': 'ما في أقساط للحين',
    'dash.emptyDesc': 'أضف أول قسط، أو الصق رسالة البنك ونعبيه عنك، وتشوف لوحتك تتعبى.',
    'dash.emptyCta': 'أضف أول قسط',

    'dash.tipsTitle': 'نصايح لك',
    'dash.tipsHint': 'مبنية على أرقامك أنت',

    'dash.badgesTitle': 'أوسمتك',
    'dash.badgesHint': 'إنجازات تفتحها وأنت ماشي صح',
    'dash.badgesCount': 'فتحت {n} من {total}',
    'dash.badgeLocked': 'مقفل',
    'dash.badgeUnlocked': 'مفتوح',
    'dash.badgeNew': '🏅 وسام جديد: {title}',

    'dash.guestTitle': 'احفظ أقساطك بحساب',
    'dash.guestBody': 'بياناتك الحين محفوظة بهالمتصفح بس. سوّ حساب مجاني بثواني وافتحها من أي جهاز.',
    'dash.guestCta': 'سوّ حساب',
    'dash.guestLater': 'مو الحين',

    'dash.payTitle': 'قبل الراتب',
    'dash.payRisk': (v) => (v.n === 1
      ? `عندك ${v.count} ينسحب قبل الراتب، مبلغه ${v.total}`
      : `عندك ${v.count} تنسحب قبل الراتب، مجموعها ${v.total}`),
    'dash.payOk': 'ما عندك أقساط تنسحب قبل راتبك الجاي ✓',
    'dash.payToday': 'راتبك ينزل اليوم 🎉',
    'dash.payWhen': 'راتبك ينزل {date} ({days})',
    'dash.payNoDay': 'حط يوم نزول راتبك ونقولك أي أقساط تنسحب قبله.',
    'dash.payNoDayCta': 'حط يوم الراتب',

    'sal.title': 'الراتب والحد الآمن',
    'sal.none': 'ما حطيت راتبك للحين',
    'sal.now': 'راتبك {salary} · الحد الآمن {limit}',
    'sal.nowDay': 'راتبك {salary} · الحد الآمن {limit} · ينزل يوم {day}',
    'sal.salary': 'راتبك الشهري',
    'sal.limit': 'الحد الآمن',
    'sal.limitHint': 'ننصح ما تتعدى أقساطك ⁦40%⁩ من الراتب',
    'sal.day': 'يوم نزول الراتب',
    'sal.dayHint': 'عشان ننبهك عن الأقساط الي تنسحب قبله',
    'sal.save': 'احفظ الراتب',
    'sal.saved': 'انحفظ الراتب ✓',
    'sal.err.salary': 'حط راتب صحيح أكبر من صفر',
    'sal.err.limit': 'نسبة من 1 إلى 100',
    'sal.err.salaryDay': 'يوم من 1 إلى 31',

    'tour.next': 'التالي',
    'tour.back': 'السابق',
    'tour.skip': 'تخطّى',
    'tour.done': 'يلا نبدأ',
    'tour.region': 'جولة سريعة',
    'tour.step': '{i} من {n}',
    'tour.1t': 'نسبتك من الراتب',
    'tour.1b': 'هالدائرة توريك كم تاخذ أقساطك من راتبك. الخط الصغير هو حدك الآمن، والألوان تقولك وضعك.',
    'tour.2t': 'أقرب الأقساط',
    'tour.2b': 'هنا أقرب مواعيدك بالترتيب، ومتى بالضبط ينسحب كل قسط.',
    'tour.3t': 'متى تخلص؟',
    'tour.3b': 'العد التنازلي يقولك بأي شهر تخلص من كل أقساطك، وكم دفعت لين الحين.',
    'tour.4t': 'أضف أول قسط',
    'tour.4b': 'من هنا تضيف قسط جديد، أو تلصق رسالة البنك ونفهمها ونعبي البيانات عنك.',

    'months.1': 'شهر واحد',
    'months.2': 'شهرين',
    'months.few': '{n} شهور',
    'months.many': '{n} شهر',
  },
  en: {
    'dash.doc': 'Dashboard',
    'dash.kicker': 'This month',
    'dash.kickerMonth': '{month}',
    'dash.title': 'Dashboard',
    'dash.desc': 'All your installments this month at a glance: what you pay, what is left of your salary, and when you are done.',
    'dash.add': 'Add installment',
    'dash.check': 'Can I afford it?',
    'dash.sumTitle': 'This month',
    'dash.sumHint': 'Your commitment and its share of your salary',
    'dash.ofSalary': 'of salary',
    'dash.monthly': 'Monthly commitment',
    'dash.free': 'Left from salary',
    'dash.left': 'Still to pay this month',
    'dash.debt': 'Total still owed',
    'dash.activeCount': '{n} active',
    'dash.leftDone': "This month's installments are all paid ✓",
    'dash.legend': 'Safe limit {limit} of your salary = {amount} a month',
    'dash.legendOver': '· {amount} over it',
    'dash.legendNone': "Add your salary and we'll show how much of it goes to installments.",
    'dash.setSalary': 'Add salary',
    'dash.ringLabel': 'Installments take {ratio} of your salary. Your safe limit is {limit}.',
    'dash.ringNone': "No salary saved, so we can't work out the ratio.",
    'dash.status': 'Monthly commitment {amount}{ratio}. {level}',
    'dash.statusRatio': ', which is {ratio} of your salary',
    'dash.loadFail': "We couldn't load your data.",
    'dash.retry': 'Try again',

    'dash.freeTitle': 'Debt-free countdown',
    'dash.freeHint': "When you'll be done with every installment",
    'dash.freeBy': "You'll be installment-free by",
    'dash.freeIn': '{months} to go · {count}',
    'dash.freeThisMonth': 'This is the last month!',
    'dash.freePaid': "You've paid {pct} of all your installments",
    'dash.freeOf': '{paid} of {total}',
    'dash.freeDone': 'Debt free 🎉',
    'dash.freeDoneSub': "You've finished every installment. Check any new purchase before splitting it.",
    'dash.freeEmpty': "Add your installments and we'll tell you the month you'll be done with all of them.",
    'dash.freeMeter': 'Share of your installments already paid: {pct}',

    'dash.upTitle': 'Coming up',
    'dash.upHint': 'Your next 5 due dates',
    'dash.upAll': 'All installments',
    'dash.upMore': 'and {n} more on the installments page',
    'dash.left2': '{count} left',
    'dash.debtOpen': 'Excludes open-ended ({n})',
    'dash.freeOpenNote': (v) => (v.n === 1
      ? `Excludes 1 open-ended installment (${v.amount} a month) — it continues after this date.`
      : `Excludes ${v.n} open-ended installments (${v.amount} a month) — they continue after this date.`),
    'dash.freeOpenOnly': "All your installments are open-ended, so there's no end date to count down to.",
    'dash.freeOpenCta': "Set what's left",
    'dash.last': 'ends {month}',
    'dash.paidChip': 'Paid ✓',
    'dash.emptyTitle': 'No installments yet',
    'dash.emptyDesc': 'Add your first installment — or paste your bank SMS and we fill it in — and watch your dashboard come alive.',
    'dash.emptyCta': 'Add your first installment',

    'dash.tipsTitle': 'Tips for you',
    'dash.tipsHint': 'Based on your own numbers',

    'dash.badgesTitle': 'Your badges',
    'dash.badgesHint': 'Achievements you unlock by staying on track',
    'dash.badgesCount': '{n} of {total} unlocked',
    'dash.badgeLocked': 'Locked',
    'dash.badgeUnlocked': 'Unlocked',
    'dash.badgeNew': '🏅 New badge: {title}',

    'dash.guestTitle': 'Save your installments to an account',
    'dash.guestBody': 'Right now your data lives in this browser only. Create a free account in seconds and open it on any device.',
    'dash.guestCta': 'Create account',
    'dash.guestLater': 'Not now',

    'dash.payTitle': 'Before payday',
    'dash.payRisk': '{count} will be charged before payday, {total} in total',
    'dash.payOk': 'Nothing gets charged before your next salary ✓',
    'dash.payToday': 'Payday is today 🎉',
    'dash.payWhen': 'Your salary arrives {date} ({days})',
    'dash.payNoDay': "Set your salary day and we'll tell you which installments get charged before it.",
    'dash.payNoDayCta': 'Set payday',

    'sal.title': 'Salary & safe limit',
    'sal.none': "You haven't added your salary yet",
    'sal.now': 'Salary {salary} · safe limit {limit}',
    'sal.nowDay': 'Salary {salary} · safe limit {limit} · paid on day {day}',
    'sal.salary': 'Monthly salary',
    'sal.limit': 'Safe limit',
    'sal.limitHint': 'We recommend keeping installments under 40% of your salary',
    'sal.day': 'Salary day',
    'sal.dayHint': 'So we can warn you about installments charged before it',
    'sal.save': 'Save salary',
    'sal.saved': 'Salary saved ✓',
    'sal.err.salary': 'Enter a valid salary above zero',
    'sal.err.limit': 'A percentage from 1 to 100',
    'sal.err.salaryDay': 'A day from 1 to 31',

    'tour.next': 'Next',
    'tour.back': 'Back',
    'tour.skip': 'Skip',
    'tour.done': "Let's go",
    'tour.region': 'Quick tour',
    'tour.step': '{i} of {n}',
    'tour.1t': 'Your salary ratio',
    'tour.1b': 'This ring shows how much of your salary goes to installments. The small mark is your safe limit, and the colour tells you how you are doing.',
    'tour.2t': 'Next due dates',
    'tour.2b': 'Your closest due dates in order, and exactly when each installment is charged.',
    'tour.3t': "When will you be done?",
    'tour.3b': 'The countdown tells you the month you finish every installment, and how much you have paid so far.',
    'tour.4t': 'Add your first installment',
    'tour.4b': 'Add a new installment here — or paste your bank SMS and we read it and fill in the details for you.',

    'months.1': '1 month',
    'months.2': '2 months',
    'months.few': '{n} months',
    'months.many': '{n} months',
  },
});

// ---------- small helpers ----------

const ICO = {
  wallet: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.4"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3S9.5 10.4 12 11s4.5 1.7 4.5 3.6-2 3-4.5 3-4.5-1.3-4.5-3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  stack: '<svg viewBox="0 0 24 24" focusable="false"><ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/><path d="M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/></svg>',
  alert: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/></svg>',
  ok: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  clock: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cloud: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M12 11v5M9.8 13.2 12 11l2.2 2.2"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg class="ico ico-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"/></svg>',
  lock: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
};

// Badge medallion art (stroke = currentColor).
const BADGE_ART = {
  first_add: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z"/><path d="M12 15c0-3-2.4-5-5.5-5 0 3 2.4 5 5.5 5z"/>',
  planner: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="m9 15 2 2 4-4"/>',
  under_limit: '<path d="M12 3.5 19 6v6c0 4.4-3 7.6-7 8.8C8 19.6 5 16.4 5 12V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  paid_month: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  early_bird: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M9 2.8h6"/>',
  streak3: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.2 2.3-4.6 3.4-7.4.4 1.8 1.2 2.7 2.2 3.2.2-3 1.6-5.5 4-7.2-.4 2.6.3 4.4 1.6 6 1 1.3 1.8 2.9 1.8 5.1 0 3.4-3 5.9-7 5.9z"/>',
  first_finish: '<path d="M6 21V4"/><path d="M6 4h12l-2.5 4L18 12H6"/>',
  debt_free: '<path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.6 8z"/>',
};

const num = (s) => `<span class="num">${esc(s)}</span>`;
/** Keep «40%» as one left-to-right unit inside plain Arabic text (LRI … PDI). */
const ltrIso = (s) => `⁦${s}⁩`;
const today = () => C.todayISO();
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* memory only */ } },
};
const GUEST_DISMISS_KEY = 'aqsati_save_dismissed';
const BADGES_SEEN_KEY = 'aqsati_badges_seen';

function monthsText(n) {
  if (n === 1) return t('months.1');
  if (n === 2) return t('months.2');
  return t(n <= 10 ? 'months.few' : 'months.many', { n });
}

function providerHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 6;
}

/** t() whose vars are already-safe HTML (escaped by the caller). */
const th = (key, vars) => t(key, vars);

// ---------- state for animations ----------

const shown = { monthly: 0, free: 0, left: 0, debt: 0, ratio: 0, freePct: 0 };
let loadFailed = false;
let firstRender = true;
let painted = false; // entrance animations only on the first paint

// ---------- sections ----------

function renderKicker() {
  $('#dash-kicker').textContent = t('dash.kickerMonth', { month: fmt.month(today()) });
}

function renderSummary(st, s) {
  const card = $('#summary-card');
  const body = $('#summary-body');
  card.removeAttribute('aria-busy');
  const limit = Number(st.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT);
  const hasSalary = s.ratio != null;
  const levelText = t(`level.${s.level}`);
  $('#sum-level').innerHTML = `<span class="chip chip-${s.level}">${esc(levelText)}</span>`;

  const paid = C.paidKeys(st.payments);
  const cur = C.monthKey(today());
  const dueNow = s.active.filter((i) => i.nextDue.slice(0, 7) === cur);
  // the amount really due next (a partial final payment counts as itself, not as a full monthly)
  const leftNow = C.round3(dueNow.filter((i) => !paid.has(`${i.id}|${cur}`)).reduce((a, i) => a + (i.nextAmount ?? i.monthly), 0));

  const tile = (key, label, value, icon, cls = '', sub = '') => `
    <div class="stat tilt${cls}">
      <span class="stat-ico" aria-hidden="true">${icon}</span>
      <span class="stat-label">${esc(label)}</span>
      ${value == null
        ? '<strong class="stat-value">—</strong>'
        : `<strong class="stat-value${value < 0 ? ' lvl-over' : ''}"><span class="sr-only">${esc(fmt.money(value))}</span><span class="num" aria-hidden="true" data-count="${key}" data-to="${value}">${esc(fmt.money(value))}</span></strong>`}
      ${sub ? `<span class="stat-sub">${sub}</span>` : ''}
    </div>`;

  const ratioText = hasSalary ? fmt.pct(s.ratio) : '—';
  const legend = hasSalary
    ? `${th('dash.legend', { limit: num(fmt.pct(limit)), amount: num(fmt.money(s.limitAmount)) })}${
      s.level === 'over' ? ` ${th('dash.legendOver', { amount: num(fmt.money(s.monthlyTotal - s.limitAmount)) })}` : ''}`
    : esc(t('dash.legendNone'));
  const tick = hasSalary
    ? `<g transform="rotate(${(Math.min(100, limit) * 3.6).toFixed(1)} 80 80)"><line class="ring-tick" x1="80" y1="2" x2="80" y2="26"/></g>`
    : '';

  body.innerHTML = `
    <figure class="gauge lg summary-ring">
      <div class="gauge-dial" role="img" aria-label="${esc(hasSalary ? t('dash.ringLabel', { ratio: ratioText, limit: fmt.pct(limit) }) : t('dash.ringNone'))}">
        <svg class="ring" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
          <circle class="ring-track" cx="80" cy="80" r="66"/>
          <circle class="ring-fill lvl-${s.level}" cx="80" cy="80" r="66" transform="rotate(-90 80 80)"/>
          ${tick}
        </svg>
        <div class="gauge-center" aria-hidden="true">
          <strong class="num lvl-${s.level}">${hasSalary ? `<span data-count="ratio" data-to="${s.ratio}">${esc(ratioText)}</span>` : '—'}</strong>
          <span>${esc(t('dash.ofSalary'))}</span>
        </div>
      </div>
      <figcaption class="gauge-cap">${legend}</figcaption>
      ${hasSalary ? '' : `<a class="btn btn-gold btn-sm" href="#salary" data-open-salary>${esc(t('dash.setSalary'))}</a>`}
    </figure>
    <div class="stats">
      ${tile('monthly', t('dash.monthly'), s.monthlyTotal, ICO.wallet, ' feature', esc(t('dash.activeCount', { count: fmt.count(s.active.length), n: fmt.num(s.active.length) })))}
      ${tile('free', t('dash.free'), s.freeAfter, ICO.leaf, s.freeAfter != null && s.freeAfter < 0 ? ' tone-over' : '')}
      ${tile('left', t('dash.left'), leftNow, ICO.calendar, '', dueNow.length && !leftNow ? esc(t('dash.leftDone')) : '')}
      ${tile('debt', t('dash.debt'), s.totalDebt, ICO.stack, '', s.openCount > 0 ? esc(t('dash.debtOpen', { n: s.openCount })) : '')}
    </div>`;

  fx.setRing(body.querySelector('.ring-fill'), s.ratio ?? 0, shown.ratio);
  const formats = { ratio: fmt.pct };
  body.querySelectorAll('[data-count]').forEach((el) => {
    const key = el.dataset.count;
    fx.countUp(el, shown[key] ?? 0, Number(el.dataset.to), formats[key] || fmt.money);
  });
  shown.monthly = s.monthlyTotal;
  shown.free = s.freeAfter ?? 0;
  shown.left = leftNow;
  shown.debt = s.totalDebt;
  shown.ratio = s.ratio ?? 0;

  $('#dash-status').textContent = t('dash.status', {
    amount: fmt.money(s.monthlyTotal),
    ratio: hasSalary ? t('dash.statusRatio', { ratio: ratioText }) : '',
    level: levelText,
  });
}

function renderFreedom(st) {
  const box = $('#free-body');
  box.classList.remove('skel-stack');
  const f = debtFreeCountdown(st.installments, today());
  if (!st.installments.length) {
    box.innerHTML = `<p class="free-empty">${esc(t('dash.freeEmpty'))}</p>
      <a class="btn btn-gold btn-sm" href="/installments?add=1">${esc(t('dash.emptyCta'))}</a>`;
    shown.freePct = 0;
    return;
  }
  if (f.activeCount === 0 && f.openCount > 0) {
    // only open-ended plans left: there is no month to count down to
    box.innerHTML = `<p class="free-empty">${esc(t('dash.freeOpenOnly'))}</p>
      <a class="btn btn-glass btn-sm" href="/installments">${esc(t('dash.freeOpenCta'))}</a>`;
    shown.freePct = 0;
    return;
  }
  if (f.activeCount === 0 || !f.last) {
    box.innerHTML = `<p class="free-big"><strong class="gold-text">${esc(t('dash.freeDone'))}</strong></p>
      <p class="free-sub">${esc(t('dash.freeDoneSub'))}</p>
      <a class="btn btn-glass btn-sm" href="/check">${esc(t('dash.check'))}</a>`;
    shown.freePct = 100;
    return;
  }
  const pct = Math.max(0, Math.min(100, f.pct));
  box.innerHTML = `
    <p class="free-by">${esc(t('dash.freeBy'))}</p>
    <p class="free-big"><strong class="gold-text">${esc(fmt.month(f.last))}</strong></p>
    <p class="free-sub">${f.monthsLeft > 0
      ? esc(t('dash.freeIn', { months: monthsText(f.monthsLeft), count: fmt.count(f.left) }))
      : esc(t('dash.freeThisMonth'))}</p>
    <div class="free-meter">
      <span class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(t('dash.freeMeter', { pct: fmt.pct(pct) }))}"><i class="gold"></i></span>
      <div class="free-meter-legend">
        <span>${th('dash.freePaid', { pct: `<b class="num" data-free-pct>${esc(fmt.pct(pct))}</b>` })}</span>
        <span class="free-of">${th('dash.freeOf', { paid: num(fmt.money(f.paid)), total: num(fmt.money(f.total)) })}</span>
      </div>
    </div>
    ${f.openCount > 0 ? `<p class="free-note">${esc(t('dash.freeOpenNote', { count: fmt.count(f.openCount), n: f.openCount, amount: fmt.money(f.openMonthly) }))}</p>` : ''}`;
  fx.setWidth(box.querySelector('.meter > i'), pct);
  fx.countUp(box.querySelector('[data-free-pct]'), shown.freePct, pct, fmt.pct);
  shown.freePct = pct;
}

function renderUpcoming(st, s) {
  const box = $('#up-body');
  box.classList.remove('skel-stack');
  if (!s.active.length) {
    box.innerHTML = `
      <div class="empty">
        <svg class="empty-art" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
          <rect class="ea-card" x="22" y="22" width="104" height="76" rx="16"/>
          <rect class="ea-line" x="38" y="42" width="44" height="8" rx="4"/>
          <rect class="ea-line soft" x="38" y="60" width="64" height="8" rx="4"/>
          <rect class="ea-line soft" x="38" y="76" width="34" height="8" rx="4"/>
          <circle class="ea-gold" cx="122" cy="88" r="20"/>
          <path class="ea-plus" d="M122 79v18M113 88h18"/>
        </svg>
        <strong>${esc(t('dash.emptyTitle'))}</strong>
        <p>${esc(t('dash.emptyDesc'))}</p>
        <div class="empty-actions"><a class="btn btn-gold" href="/installments?add=1">${esc(t('dash.emptyCta'))}</a></div>
      </div>`;
    return;
  }
  const paid = C.paidKeys(st.payments);
  const rows = s.active.slice(0, 5).map((i) => {
    const name = fmt.provider(i.provider);
    const isPaid = paid.has(`${i.id}|${C.monthKey(i.nextDue)}`);
    const soon = !isPaid && i.daysLeft <= 3;
    return `
      <li class="item up-item${soon ? ' soon' : ''}${isPaid ? ' is-paid' : ''}">
        <span class="pv pv-${providerHue(i.provider)}" aria-hidden="true">${esc([...name.trim()][0] || '؟')}</span>
        <div class="item-main"><span class="prov" dir="auto">${esc(name)}</span><span class="title" dir="auto">${esc(i.title || t('common.noTitle'))}</span></div>
        <div class="item-amt">${num(fmt.money(i.nextAmount ?? i.monthly))}</div>
        <div class="item-meta">
          <span class="up-date">${num(fmt.day(i.nextDue))} · <b>${esc(fmt.daysLeft(i.daysLeft))}</b></span>
          ${isPaid ? `<span class="chip chip-ok">${esc(t('dash.paidChip'))}</span>` : ''}
          <span class="up-sub">${esc(fmt.left(i))}${i.open ? '' : ` · ${esc(t('dash.last', { month: fmt.month(i.lastDue) }))}`}</span>
        </div>
      </li>`;
  }).join('');
  const more = s.active.length > 5
    ? `<p class="up-more"><a href="/installments">${esc(t('dash.upMore', { count: fmt.count(s.active.length - 5), n: fmt.num(s.active.length - 5) }))}</a></p>`
    : '';
  box.innerHTML = `<ol class="list up-list${painted ? ' is-static' : ''}">${rows}</ol>${more}`;
}

function renderTips(st) {
  const box = $('#tips-body');
  box.classList.remove('skel-stack');
  const tips = buildTips(
    { installments: st.installments, payments: st.payments, profile: st.profile, today: today() },
    { lang: getLang(), max: 3, exclude: ['salaryRisk', 'salaryDay'] },
  );
  const icon = { ok: ICO.ok, warn: ICO.alert, over: ICO.alert, info: ICO.info };
  box.innerHTML = `<ul class="tips">${tips.map((tip) => `
    <li class="tip tone-${tip.tone}">
      <span class="tip-ico" aria-hidden="true">${icon[tip.tone] || ICO.info}</span>
      <div class="tip-text">
        <strong>${esc(tip.title)}</strong>
        <p>${esc(tip.body)}</p>
        ${tip.action ? `<a class="tip-link" href="${esc(tip.action.href)}"${tip.action.href === '#salary' ? ' data-open-salary' : ''}>${esc(tip.action.label)}${ICO.arrow}</a>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

function renderBadges(st) {
  const box = $('#badges-body');
  const lang = getLang();
  const list = computeBadges(st, today());
  const unlocked = list.filter((b) => b.unlocked);
  $('#badges-hint').textContent = t('dash.badgesCount', { n: unlocked.length, total: list.length });
  box.classList.toggle('is-static', painted);
  box.innerHTML = list.map((b) => {
    const txt = badgeText(b.id, lang);
    const prog = !b.unlocked && b.progress && b.progress.target > 1
      ? `<span class="mini-meter" aria-hidden="true"><i class="gold" data-w="${(b.progress.value / b.progress.target) * 100}"></i></span>
         <span class="badge-prog num">${b.progress.value}/${b.progress.target}</span>`
      : '';
    return `
      <div class="badge-tile${b.unlocked ? ' is-on' : ''}" role="group" aria-label="${esc(`${txt.title} — ${b.unlocked ? t('dash.badgeUnlocked') : t('dash.badgeLocked')}`)}">
        <span class="medal" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">${BADGE_ART[b.id] || BADGE_ART.debt_free}</svg>
          ${b.unlocked ? '' : `<span class="medal-lock">${ICO.lock}</span>`}
        </span>
        <span class="badge-name">${esc(txt.title)}</span>
        <span class="badge-desc">${esc(b.unlocked ? txt.desc : txt.hint)}</span>
        ${prog}
      </div>`;
  }).join('');
  box.querySelectorAll('.mini-meter i').forEach((i) => fx.setWidth(i, Number(i.dataset.w)));

  // celebrate badges unlocked since the last visit (not on the very first one: no toast storm)
  const ids = unlocked.map((b) => b.id);
  const raw = storage.get(BADGES_SEEN_KEY);
  if (raw === null) {
    storage.set(BADGES_SEEN_KEY, JSON.stringify(ids));
    return;
  }
  let before = [];
  try { before = JSON.parse(raw) || []; } catch { before = []; }
  const fresh = newlyUnlocked(before, list);
  if (fresh.length) {
    toast(t('dash.badgeNew', { title: badgeText(fresh[0], lang).title }), 'ok');
    storage.set(BADGES_SEEN_KEY, JSON.stringify([...new Set([...before, ...ids])]));
  }
}

function renderGuest(st) {
  const slot = $('#guest-slot');
  const show = !st.user && st.installments.length > 0 && storage.get(GUEST_DISMISS_KEY) !== '1';
  if (!show) {
    slot.replaceChildren();
    return;
  }
  if (slot.querySelector('.guest-card')) {
    // language may have changed: refresh text only
    slot.querySelector('.guest-title').textContent = t('dash.guestTitle');
    slot.querySelector('.guest-body').textContent = t('dash.guestBody');
    slot.querySelector('.guest-cta span').textContent = t('dash.guestCta');
    slot.querySelector('.guest-x').setAttribute('aria-label', t('dash.guestLater'));
    return;
  }
  slot.innerHTML = `
    <aside class="guest-card" aria-labelledby="guest-t">
      <span class="guest-ico" aria-hidden="true">${ICO.cloud}</span>
      <div class="guest-text">
        <strong class="guest-title" id="guest-t">${esc(t('dash.guestTitle'))}</strong>
        <p class="guest-body">${esc(t('dash.guestBody'))}</p>
      </div>
      <a class="btn btn-gold btn-sm guest-cta" href="/login?mode=signup&amp;next=%2Fapp"><span>${esc(t('dash.guestCta'))}</span></a>
      <button type="button" class="icon-btn guest-x" aria-label="${esc(t('dash.guestLater'))}">${ICO.x}</button>
    </aside>`;
  slot.querySelector('.guest-x').addEventListener('click', () => {
    storage.set(GUEST_DISMISS_KEY, '1');
    slot.replaceChildren();
    $('#main').focus({ preventScroll: true });
  });
}

function renderPayday(st, s) {
  const slot = $('#payday-slot');
  if (!s.active.length) {
    slot.replaceChildren();
    return;
  }
  const day = st.profile?.salary_day;
  if (day == null) {
    slot.innerHTML = `
      <div class="alert tone-info payday">
        ${ICO.clock}
        <div class="payday-text"><p>${esc(t('dash.payNoDay'))}</p></div>
        <a class="btn btn-ghost btn-sm" href="#salary" data-open-salary="day">${esc(t('dash.payNoDayCta'))}</a>
      </div>`;
    return;
  }
  const d = duesBeforeSalary(st.installments, st.payments, day, today());
  if (!d) {
    slot.replaceChildren();
    return;
  }
  const when = d.salaryToday ? esc(t('dash.payToday')) : th('dash.payWhen', { date: num(fmt.day(d.salaryDate)), days: esc(fmt.daysLeft(d.daysToSalary)) });
  if (!d.count) {
    slot.innerHTML = `
      <div class="alert tone-ok payday">
        ${ICO.ok}
        <div class="payday-text"><p><b>${esc(t('dash.payOk'))}</b></p><p class="hint">${when}</p></div>
      </div>`;
    return;
  }
  const chips = d.items.slice(0, 4).map((x) => `<li class="chip">${esc(fmt.provider(x.inst.provider))} · ${num(fmt.day(x.date))} · ${num(fmt.money(x.amount))}</li>`).join('');
  slot.innerHTML = `
    <div class="alert tone-warn payday" role="status">
      ${ICO.alert}
      <div class="payday-text">
        <p><b>${th('dash.payRisk', { count: esc(fmt.count(d.count)), n: d.count, total: num(fmt.money(d.total)) })}</b></p>
        <p class="hint">${when}</p>
        <ul class="payday-chips">${chips}</ul>
      </div>
    </div>`;
}

function renderSalary(st) {
  const p = st.profile;
  const now = $('#salary-now');
  if (p && p.salary > 0) {
    now.textContent = p.salary_day
      ? t('sal.nowDay', { salary: fmt.money(p.salary), limit: ltrIso(fmt.pct(p.safe_limit)), day: p.salary_day })
      : t('sal.now', { salary: fmt.money(p.salary), limit: ltrIso(fmt.pct(p.safe_limit)) });
  } else {
    now.textContent = t('sal.none');
  }
  now.removeAttribute('data-i18n');
  const form = $('#salary-form');
  // fill the inputs from STATE unless the user is typing in them
  if (!form.contains(document.activeElement)) {
    $('#sal-salary').value = p ? String(Number(p.salary) || '') : '';
    $('#sal-limit').value = String(p ? Number(p.safe_limit) : C.DEFAULT_SAFE_LIMIT);
    $('#sal-day').value = p?.salary_day ? String(p.salary_day) : '';
  }
  // first-time users: salary settings move up, right under the summary, and open
  const grid = $('#dash-grid');
  const card = $('#salary-card');
  const needs = !p || !(p.salary > 0);
  if (!card.contains(document.activeElement)) {
    if (needs && card.previousElementSibling !== $('#summary-card')) $('#summary-card').after(card);
    if (!needs && grid.lastElementChild !== card) grid.append(card);
  }
  card.classList.toggle('is-setup', needs);
  if (needs && firstRender) $('#salary').open = true;
}

function renderError() {
  const body = $('#summary-body');
  $('#summary-card').removeAttribute('aria-busy');
  body.innerHTML = `
    <div class="empty">
      <strong>${esc(t('dash.loadFail'))}</strong>
      <div class="empty-actions"><button type="button" class="btn" data-retry>${esc(t('dash.retry'))}</button></div>
    </div>`;
}

function render() {
  renderKicker();
  if (!store.loaded) {
    if (loadFailed) renderError();
    return;
  }
  const st = store.state;
  const salary = Number(st.profile?.salary) || 0;
  const limit = Number(st.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT);
  const s = C.monthSummary(st.installments, salary, limit, today());
  renderGuest(st);
  renderPayday(st, s);
  renderSummary(st, s);
  renderFreedom(st);
  renderUpcoming(st, s);
  renderTips(st);
  renderBadges(st);
  renderSalary(st);
  firstRender = false;
  painted = true;
}

// ---------- salary form ----------

function showErrors(form, errors) {
  form.querySelectorAll('[data-err]').forEach((el) => {
    const key = el.dataset.err;
    el.textContent = errors[key] ? t(`sal.err.${key}`) : '';
    const input = el.closest('.field')?.querySelector('input');
    if (input) input.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  });
  const first = Object.keys(errors)[0];
  if (first) form.querySelector(`[data-err="${first}"]`)?.closest('.field')?.querySelector('input')?.focus();
}

function bindSalary() {
  const form = $('#salary-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = C.validateProfileInput({ salary: $('#sal-salary').value, limit: $('#sal-limit').value, salaryDay: $('#sal-day').value });
    showErrors(form, v.errors);
    if (!v.ok) return;
    const btn = $('#sal-save');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await saveProfile({ salary: v.value.salary, safeLimit: v.value.limit, salaryDay: v.value.salaryDay });
      showBanner('');
      toast(t('sal.saved'), 'ok');
      $('#salary').open = false;
      $('#salary').querySelector('summary').focus({ preventScroll: true });
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
}

/** Opens the salary form; field 'day' focuses the salary-day input (the «حط يوم الراتب» buttons). */
function openSalary(field = '') {
  const d = $('#salary');
  d.open = true;
  const input = $(field === 'day' ? '#sal-day' : '#sal-salary') || $('#sal-salary');
  (field === 'day' ? input : d).scrollIntoView({ block: 'center', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  input.focus({ preventScroll: true });
}

function bindPage() {
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const opener = target.closest('[data-open-salary]');
    if (opener) {
      e.preventDefault();
      openSalary(opener.dataset.openSalary);
      return;
    }
    if (target.closest('[data-retry]')) {
      store.load().then(() => { loadFailed = false; showBanner(''); render(); }).catch((err) => toast(errorText(err), 'error'));
    }
  });
  window.addEventListener('hashchange', () => { if (location.hash === '#salary') openSalary(); });
}

// ---------- tour ----------

function maybeTour() {
  if (tourDone() || !store.loaded || document.querySelector('body > .modal')) return;
  setTimeout(() => {
    if (document.visibilityState !== 'visible' || document.querySelector('body > .modal')) return;
    startTour({
      rtl: isRTL(),
      labels: {
        next: t('tour.next'), back: t('tour.back'), skip: t('tour.skip'), done: t('tour.done'), region: t('tour.region'),
        step: (i, n) => t('tour.step', { i, n }),
      },
      steps: [
        { target: '#summary-card .gauge', title: t('tour.1t'), body: t('tour.1b') },
        { target: '#upcoming-card', title: t('tour.2t'), body: t('tour.2b') },
        { target: '#free-card', title: t('tour.3t'), body: t('tour.3b') },
        { target: '#add-btn', title: t('tour.4t'), body: t('tour.4b') },
      ],
    });
  }, fx.reducedMotion() ? 200 : 900);
}

// ---------- boot ----------

store.subscribe(render);
window.addEventListener('langchange', render);
bindSalary();
bindPage();
renderKicker();

await initPage({ active: 'app', requireAuth: true, title: 'dash.doc' });
remindDues(store); // installment reminders (switched on in /account)
if (!store.loaded) {
  loadFailed = true;
  render();
} else {
  if (location.hash === '#salary') openSalary();
  maybeTour();
}
