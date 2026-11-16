// اقصادي — اقصادي: the installment list (active / finished), add + edit in an accessible modal, two-step delete
// with a 5-second undo, «دفعت ✓» per month (this month + the last two), the payment streak, and the bank-SMS reader.
import {
  initPage, store, t, registerStrings, getLang, applyI18n, fmt, toast, toastAction, showBanner, errorText, getToken,
  addInstallment, updateInstallment, removeInstallment, markPaid, $, $$, esc, fx,
} from '../core.js';
import * as C from '../../calc.js';
import { parseSms, SAMPLE_MESSAGES } from '../logic/sms.js';
import { computeStreak, monthStatus } from '../logic/streak.js';
import { remindDues } from '../logic/notify.js';

// ---------- strings ----------

registerStrings({
  ar: {
    'inst.doc': 'إدارة الأقساط',
    'inst.kicker': 'إدارة الأقساط',
    'inst.title': 'اقصادي',
    'inst.desc': 'أضف أقساطك وعدّلها، وعلّم الي دفعته كل شهر عشان تمشي سلسلة التزامك.',
    'inst.add': 'أضف قسط',
    'inst.smsJump': 'الصق رسالة البنك',
    'inst.statActive': 'أقساط نشطة',
    'inst.statMonthly': 'مجموعها بالشهر',
    'inst.statPaid': 'مدفوع هالشهر',
    'inst.statPaidOf': '{paid} من {due}',
    'inst.statPaidNone': 'ما في شي مستحق',
    'inst.statDebt': 'باقي عليك',
    'inst.listTitle': 'قائمة أقساطك',
    'inst.listHint': 'رتبناها حسب أقرب موعد',
    'inst.tabActive': 'نشطة',
    'inst.tabDone': 'خلصت',
    'inst.perMonth': 'بالشهر',
    'inst.next': 'الجاي {date}',
    'inst.left': 'باقي {count}',
    'inst.last': 'آخر قسط {month}',
    'inst.finishedOn': 'خلص {month} 🎉',
    'inst.progress': 'دفعت {paid} من {totalText}',
    'inst.paidMonth': 'دفعت قسط {month}',
    'inst.paidMonthShort': '{month}',
    'inst.paidThis': 'دفعت ✓',
    'inst.markThis': 'علّمه مدفوع',
    'inst.pastLabel': 'شهور قبل:',
    'inst.marked': 'علّمنا قسط {month} مدفوع ✓',
    'inst.unmarked': 'شلنا علامة الدفع عن {month}',
    'inst.monthDone': '🔥 كل أقساط {month} مدفوعة! سلسلتك صارت {streak}',
    'inst.edit': 'تعديل',
    'inst.editLabel': 'تعديل قسط {name}',
    'inst.del': 'حذف',
    'inst.delLabel': 'حذف قسط {name}',
    'inst.delArmed': 'متأكد؟ اضغط مرة ثانية',
    'inst.delArmedLabel': 'متأكد؟ اضغط مرة ثانية لحذف قسط {name}',
    'inst.deleted': 'انحذف القسط',
    'inst.restored': 'رجّعنا القسط ✓',
    'inst.added': 'انضاف القسط ✓',
    'inst.saved': 'انحفظ التعديل ✓',
    'inst.emptyTitle': 'ما في أقساط للحين',
    'inst.emptyDesc': 'أضف أول قسط بيدك، أو الصق رسالة البنك ونعبي البيانات عنك.',
    'inst.emptyDoneTitle': 'ما خلص ولا قسط للحين',
    'inst.emptyDoneDesc': 'أول ما يخلص قسط بيطلع هني، وتفتح وسام «أول قسط يخلص» 🏁',
    'inst.loadFail': 'ما قدرنا نجيب أقساطك.',
    'inst.retry': 'جرّب مرة ثانية',

    'inst.streakTitle': 'سلسلة الالتزام',
    'inst.streakHint': 'شهور ورا بعض دفعت فيها كل أقساطك',
    'inst.streakNow': 'سلسلتك الحين',
    'inst.streakBest': 'أفضل سلسلة: {best}',
    'inst.streakStart': 'أول شهر تكمّله يبدأ سلسلتك 🔥',
    'inst.streakThis': 'هالشهر علّمت {paid} من {due}',
    'inst.streakThisDone': 'هالشهر كامل ✓',
    'inst.streakThisNone': 'ما عليك شي هالشهر',
    'inst.streakRule': 'كل شهر تعلّم فيه كل أقساطك «دفعت ✓» يزيد سلسلتك شهر.',
    'inst.streakComplete': 'مكتمل',
    'inst.streakPartial': 'ناقص',
    'inst.streakNoDue': 'ما فيه أقساط',
    'inst.streakCurrent': 'الشهر الحالي',
    'inst.streakMonth': '{month}: {state}',

    'form.addTitle': 'إضافة قسط',
    'form.editTitle': 'تعديل قسط',
    'form.addDesc': 'عبّي بيانات القسط مثل ما تشوفها بالتطبيق أو كشف البنك.',
    'form.provider': 'الجهة',
    'form.other': 'اسم الجهة',
    'form.otherPh': 'مثال: بنك بوبيان',
    'form.title': 'وصف القسط',
    'form.titlePh': 'مثال: آيفون 16',
    'form.monthly': 'المبلغ الشهري',
    'form.dueDay': 'يوم الاستحقاق',
    'form.dueDayHint': 'اليوم الي ينسحب فيه القسط كل شهر (1–31)',
    'form.remaining': 'كم قسط باقي؟',
    'form.remainingHint': 'مع قسط هالشهر إذا ما انسحب للحين',
    'form.preview': 'القسط الجاي {next} · آخر قسط {last} · المجموع {total}',
    'form.save': 'أضف القسط',
    'form.saveEdit': 'احفظ التعديل',
    'form.fromSms': 'عبّينا الي فهمناه من الرسالة، راجعه واضغط «أضف القسط».',
    'form.fromCheck': 'عبّينا المبلغ وعدد الأقساط من «أقدر أشتريه؟». اختار الجهة ويوم الاستحقاق.',
    'form.err.provider': 'اكتب اسم الجهة',
    'form.err.title': 'خله أقصر من 80 حرف',
    'form.err.monthly': 'حط مبلغ صحيح أكبر من صفر',
    'form.err.dueDay': 'يوم من 1 إلى 31',
    'form.err.remaining': 'عدد من 1 إلى 360',
    'form.remWhat': 'وش تعرف عن الباقي؟',
    'form.modeCount': 'عدد الأقساط',
    'form.modeAmount': 'المبلغ الباقي',
    'form.modeOpen': 'ما أعرف',
    'form.amountLeft': 'كم باقي عليك بالدينار؟',
    'form.amountLeftHint': 'المجموع الي باقي تدفعه، مع قسط هالشهر إذا ما انسحب للحين',
    'form.amountCalc': 'يعني {count}، وآخر قسط {last}',
    'form.amountCalcEven': 'يعني {count} كلها بنفس المبلغ',
    'form.amountCalcOne': 'يعني دفعة وحدة بـ {last}',
    'form.amountCalcMax': 'يطلع {count} — الحد 360 قسط',
    'form.amountCalcNeedMonthly': 'حط المبلغ الشهري ونحسب لك كم قسط',
    'form.amountCalcTiny': 'يعني {count}، وآخر قسط {last} بس — إذا هذا فرق تقريب، اختار «عدد الأقساط» وحط {n}',
    'form.openNote': 'مفتوح — بدون تاريخ نهاية: نحسبه عليك كل شهر (مثل البطاقة أو قرض ما تعرف متى يخلص). تقدر تعدّله بعدين.',
    'form.previewOpen': 'القسط الجاي {next} · كل شهر بدون نهاية',
    'form.err.remainingMode': 'اختار وش تعرف عن الباقي',
    'form.err.amountLeft': 'حط مبلغ أكبر من صفر (وما يطلع أكثر من 360 قسط)',
    'inst.statDebtOpen': 'ما يشمل المفتوحة ({n})',
    'inst.openSince': 'شغّال من {month}',
    'inst.openStarts': 'يبدأ {month}',

    'sms.title': 'الصق رسالة البنك',
    'sms.hint': 'نفهم المبلغ والجهة وكم قسط باقي، وأنت تأكد قبل الحفظ.',
    'sms.label': 'نص الرسالة',
    'sms.placeholder': 'مثال: تابي: قسطك 25.500 د.ك مستحق بتاريخ 15/12، القسط 2 من 4',
    'sms.read': 'افهم الرسالة',
    'sms.sample': 'جرّب مثال',
    'sms.privacy': 'الرسالة تنقرا بجهازك بس، وما نرسلها لأي مكان.',
    'sms.understood': 'هذا الي فهمناه',
    'sms.amount': 'المبلغ: {v}',
    'sms.provider': 'الجهة: {v}',
    'sms.remaining': 'باقي: {v}',
    'sms.dueDay': 'يوم الاستحقاق: {v}',
    'sms.noRemaining': 'الباقي: اختار أنت (عدد، مبلغ، أو ما أعرف)',
    'sms.noProvider': 'الجهة: اختارها أنت',
    'sms.noDueDay': 'يوم الاستحقاق: كمّله أنت',
    'sms.level.high': 'ثقة عالية',
    'sms.level.medium': 'ثقة متوسطة',
    'sms.level.low': 'ثقة ضعيفة',
    'sms.paid': 'رسالة دفع',
    'sms.due': 'رسالة تذكير',
    'sms.apply': 'عبّي نموذج الإضافة',
    'sms.fail': 'ما لقينا مبلغ بهالرسالة. تأكد إنك لصقت رسالة القسط كاملة (فيها المبلغ مع د.ك أو KWD).',
    'sms.empty': 'الصق الرسالة أول.',
  },
  en: {
    'inst.doc': 'Installments',
    'inst.kicker': 'Manage installments',
    'inst.title': 'Installments',
    'inst.desc': 'Add and edit your installments, and mark what you paid each month to keep your streak going.',
    'inst.add': 'Add installment',
    'inst.smsJump': 'Paste bank SMS',
    'inst.statActive': 'Active installments',
    'inst.statMonthly': 'Per month',
    'inst.statPaid': 'Paid this month',
    'inst.statPaidOf': '{paid} of {due}',
    'inst.statPaidNone': 'Nothing due',
    'inst.statDebt': 'Still owed',
    'inst.listTitle': 'Your installments',
    'inst.listHint': 'Sorted by the closest due date',
    'inst.tabActive': 'Active',
    'inst.tabDone': 'Finished',
    'inst.perMonth': 'per month',
    'inst.next': 'next {date}',
    'inst.left': '{count} left',
    'inst.last': 'ends {month}',
    'inst.finishedOn': 'Finished {month} 🎉',
    'inst.progress': '{paid} of {total} payments made',
    'inst.paidMonth': 'Paid {month} installment',
    'inst.paidMonthShort': '{month}',
    'inst.paidThis': 'Paid ✓',
    'inst.markThis': 'Mark as paid',
    'inst.pastLabel': 'Earlier:',
    'inst.marked': 'Marked {month} as paid ✓',
    'inst.unmarked': 'Removed the paid mark from {month}',
    'inst.monthDone': '🔥 Every {month} installment is paid! Your streak is now {streak}',
    'inst.edit': 'Edit',
    'inst.editLabel': 'Edit {name} installment',
    'inst.del': 'Delete',
    'inst.delLabel': 'Delete {name} installment',
    'inst.delArmed': 'Sure? Tap again',
    'inst.delArmedLabel': 'Sure? Tap again to delete the {name} installment',
    'inst.deleted': 'Installment deleted',
    'inst.restored': 'Installment restored ✓',
    'inst.added': 'Installment added ✓',
    'inst.saved': 'Changes saved ✓',
    'inst.emptyTitle': 'No installments yet',
    'inst.emptyDesc': 'Add your first one by hand, or paste your bank SMS and we fill it in for you.',
    'inst.emptyDoneTitle': 'Nothing finished yet',
    'inst.emptyDoneDesc': 'Finished plans show up here — and unlock the “First one done” badge 🏁',
    'inst.loadFail': "We couldn't load your installments.",
    'inst.retry': 'Try again',

    'inst.streakTitle': 'Payment streak',
    'inst.streakHint': 'Months in a row with every installment paid',
    'inst.streakNow': 'Current streak',
    'inst.streakBest': 'Best streak: {best}',
    'inst.streakStart': 'Complete your first month to start a streak 🔥',
    'inst.streakThis': 'This month: {paid} of {due} marked',
    'inst.streakThisDone': 'This month is complete ✓',
    'inst.streakThisNone': 'Nothing due this month',
    'inst.streakRule': 'Each month you mark every installment “Paid ✓” adds a month to your streak.',
    'inst.streakComplete': 'complete',
    'inst.streakPartial': 'incomplete',
    'inst.streakNoDue': 'nothing due',
    'inst.streakCurrent': 'this month',
    'inst.streakMonth': '{month}: {state}',

    'form.addTitle': 'Add installment',
    'form.editTitle': 'Edit installment',
    'form.addDesc': 'Fill in the details as you see them in the app or on your bank statement.',
    'form.provider': 'Provider',
    'form.other': 'Provider name',
    'form.otherPh': 'e.g. Boubyan Bank',
    'form.title': 'Description',
    'form.titlePh': 'e.g. iPhone 16',
    'form.monthly': 'Monthly amount',
    'form.dueDay': 'Due day',
    'form.dueDayHint': 'The day of the month it is charged (1–31)',
    'form.remaining': 'Payments left',
    'form.remainingHint': "Including this month's if it hasn't been charged yet",
    'form.preview': 'Next {next} · last {last} · total {total}',
    'form.save': 'Add installment',
    'form.saveEdit': 'Save changes',
    'form.fromSms': 'We filled in what we understood from the message. Check it and press “Add installment”.',
    'form.fromCheck': 'We filled in the amount and number of payments from “Can I afford it?”. Pick the provider and due day.',
    'form.err.provider': 'Enter the provider name',
    'form.err.title': 'Keep it under 80 characters',
    'form.err.monthly': 'Enter a valid amount above zero',
    'form.err.dueDay': 'A day from 1 to 31',
    'form.err.remaining': 'A number from 1 to 360',
    'form.remWhat': "What do you know about what's left?",
    'form.modeCount': 'Payments left',
    'form.modeAmount': 'Amount left',
    'form.modeOpen': 'Not sure',
    'form.amountLeft': 'How much is left (KWD)?',
    'form.amountLeftHint': "The total still to pay, including this month's if it hasn't been charged yet",
    'form.amountCalc': '= {count}, final payment {last}',
    'form.amountCalcEven': '= {count}, all the same amount',
    'form.amountCalcOne': '= a single payment of {last}',
    'form.amountCalcMax': "That's {count} — the limit is 360",
    'form.amountCalcNeedMonthly': "Enter the monthly amount and we'll work out the payments",
    'form.amountCalcTiny': '= {count}, final payment only {last} — if that\'s just rounding, choose “Payments left” and enter {n}',
    'form.openNote': "Open-ended — no end date: we count it every month (like a card or a loan whose end you don't know). You can change it later.",
    'form.previewOpen': 'Next {next} · every month, no end date',
    'form.err.remainingMode': "Choose what you know about what's left",
    'form.err.amountLeft': 'Enter an amount above zero (no more than 360 payments)',
    'inst.statDebtOpen': 'Excludes open-ended ({n})',
    'inst.openSince': 'Running since {month}',
    'inst.openStarts': 'Starts {month}',

    'sms.title': 'Paste a bank SMS',
    'sms.hint': 'We pick out the amount, provider and payments left — you confirm before saving.',
    'sms.label': 'Message text',
    'sms.placeholder': 'e.g. Tabby: Your payment of KWD 25.500 is due on 15/12. Installment 2 of 4.',
    'sms.read': 'Read message',
    'sms.sample': 'Try an example',
    'sms.privacy': 'The message is read on your device only and never sent anywhere.',
    'sms.understood': "Here's what we understood",
    'sms.amount': 'Amount: {v}',
    'sms.provider': 'Provider: {v}',
    'sms.remaining': 'Left: {v}',
    'sms.dueDay': 'Due day: {v}',
    'sms.noRemaining': "What's left: you choose (payments, amount or not sure)",
    'sms.noProvider': 'Provider: you pick it',
    'sms.noDueDay': 'Due day: you fill it in',
    'sms.level.high': 'High confidence',
    'sms.level.medium': 'Medium confidence',
    'sms.level.low': 'Low confidence',
    'sms.paid': 'Payment confirmation',
    'sms.due': 'Reminder',
    'sms.apply': 'Fill the add form',
    'sms.fail': "We couldn't find an amount in that message. Make sure you pasted the whole installment SMS (with KWD or د.ك).",
    'sms.empty': 'Paste the message first.',
  },
});

// ---------- helpers ----------

const ICO = {
  check: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path class="pay-tick" d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  edit: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>',
  spark: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
};

const num = (s) => `<span class="num">${esc(s)}</span>`;
const today = () => C.todayISO();
const curMonth = () => C.monthKey(today());

function providerHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 6;
}

const monthNameFmt = new Map();
/** 'YYYY-MM' → «نوفمبر» / «November» (adds the year when it is not this year). */
function monthName(key) {
  const lang = getLang();
  const withYear = key.slice(0, 4) !== curMonth().slice(0, 4);
  const id = `${lang}|${withYear}`;
  if (!monthNameFmt.has(id)) {
    monthNameFmt.set(id, new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-KW-u-nu-latn', {
      month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
    }));
  }
  const [y, m] = key.split('-').map(Number);
  return monthNameFmt.get(id).format(new Date(Date.UTC(y, m - 1, 1)));
}

const shortFmt = new Map();
/** 'YYYY-MM' → «نوفمبر» / «Nov» (tiny labels). */
function monthShort(key) {
  const lang = getLang();
  if (!shortFmt.has(lang)) {
    shortFmt.set(lang, new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-KW-u-nu-latn', { month: lang === 'en' ? 'short' : 'long', timeZone: 'UTC' }));
  }
  const [y, m] = key.split('-').map(Number);
  return shortFmt.get(lang).format(new Date(Date.UTC(y, m - 1, 1)));
}

function monthsText(n) {
  if (getLang() === 'en') return n === 1 ? '1 month' : `${n} months`;
  if (n === 1) return 'شهر واحد';
  if (n === 2) return 'شهرين';
  return n <= 10 ? `${n} شهور` : `${n} شهر`;
}

/** Unit after a big number: «3 شهور» / «12 شهر» / «3 months». */
function monthUnit(n) {
  if (getLang() === 'en') return n === 1 ? 'month' : 'months';
  return n >= 3 && n <= 10 ? 'شهور' : 'شهر';
}

/** Re-render something and put keyboard focus back on the control with the same data-fk. */
function keepFocus(container, renderFn) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.getAttribute('data-fk') : null;
  const fallback = active && container.contains(active) && !key;
  renderFn();
  if (key) {
    const again = container.querySelector(`[data-fk="${CSS.escape(key)}"]`);
    if (again) again.focus({ preventScroll: true });
    else $('#list-h').focus({ preventScroll: true });
  } else if (fallback && !container.contains(document.activeElement)) {
    $('#list-h').focus({ preventScroll: true });
  }
}

// ---------- page state ----------

const ui = { tab: 'active', armed: null, armTimer: 0, loadFailed: false, smsIndex: 0, sms: null, animated: false };
const pending = new Map(); // id -> timer (delete waiting for its undo window)
const shown = { active: 0, monthly: 0, debt: 0 };

// ---------- rendering ----------

function renderStats(st, s) {
  const box = $('#inst-stats');
  box.removeAttribute('aria-busy');
  const ms = monthStatus(visibleInstallments(st), st.payments, curMonth());
  const tile = (label, value, icon, cls = '', sub = '') => `
    <div class="stat${cls}">
      <span class="stat-ico" aria-hidden="true">${icon}</span>
      <span class="stat-label">${esc(label)}</span>
      <strong class="stat-value">${value}</strong>
      ${sub ? `<span class="stat-sub">${sub}</span>` : ''}
    </div>`;
  const svg = (d) => `<svg viewBox="0 0 24 24" focusable="false">${d}</svg>`;
  box.innerHTML = `
    ${tile(t('inst.statActive'), `<span class="num" data-count="active" data-to="${s.active.length}">${s.active.length}</span>`, svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'), ' feature')}
    ${tile(t('inst.statMonthly'), `<span class="num" data-count="monthly" data-to="${s.monthlyTotal}">${esc(fmt.money(s.monthlyTotal))}</span>`, svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.4"/>'))}
    ${tile(t('inst.statPaid'), ms.due ? num(t('inst.statPaidOf', { paid: ms.paid, due: ms.due })) : `<span class="stat-none">${esc(t('inst.statPaidNone'))}</span>`, svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>'), ms.complete ? ' tone-ok' : '',
      ms.due ? `<span class="mini-meter" aria-hidden="true"><i class="lvl-ok" data-w="${(ms.paid / ms.due) * 100}"></i></span>` : '')}
    ${tile(t('inst.statDebt'), `<span class="num" data-count="debt" data-to="${s.totalDebt}">${esc(fmt.money(s.totalDebt))}</span>`, svg('<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/><path d="M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/>'), '',
      s.openCount > 0 ? esc(t('inst.statDebtOpen', { n: s.openCount })) : '')}`;
  box.querySelectorAll('.mini-meter i').forEach((i) => fx.setWidth(i, Number(i.dataset.w)));
  const fmts = { active: (x) => String(Math.round(x)), monthly: fmt.money, debt: fmt.money };
  box.querySelectorAll('[data-count]').forEach((el) => {
    const k = el.dataset.count;
    fx.countUp(el, shown[k] ?? 0, Number(el.dataset.to), fmts[k]);
  });
  shown.active = s.active.length;
  shown.monthly = s.monthlyTotal;
  shown.debt = s.totalDebt;
}

/** Months the user may mark for an installment: this month (or next, if nothing is due now) + the two before. */
function payMonths(inst) {
  const cur = curMonth();
  const months = [];
  const main = C.dueInMonth(inst, cur) ? cur : C.dueInMonth(inst, C.shiftMonthKey(cur, 1)) ? C.shiftMonthKey(cur, 1) : null;
  const past = [C.shiftMonthKey(cur, -1), C.shiftMonthKey(cur, -2)].filter((m) => C.dueInMonth(inst, m));
  if (main) months.push(main);
  return { main, past, all: [...months, ...past] };
}

function itemHTML(i, paid, finished) {
  const name = fmt.provider(i.provider);
  const total = i.open ? 0 : Number(i.count) || 0;
  const done = i.open ? 0 : total - i.remaining;
  const { main, past } = payMonths(i);
  const mainPaid = main ? paid.has(`${i.id}|${main}`) : false;
  const soon = !finished && !mainPaid && i.daysLeft != null && i.daysLeft <= 3;
  const armed = ui.armed === i.id;
  // The visible words stay the start of the accessible name (WCAG 2.5.3); the installment is added for screen readers.
  const whose = `<span class="sr-only"> — ${esc(name)}${i.title ? ` ${esc(i.title)}` : ''}</span>`;
  const mainBtn = main ? `
    <button type="button" class="pay-btn" data-pay="${esc(i.id)}" data-month="${main}" data-fk="pay:${esc(i.id)}:${main}" aria-pressed="${mainPaid}">
      ${ICO.check}<span class="pay-txt">${esc(mainPaid ? t('inst.paidThis') : t('inst.markThis'))}</span><span class="pay-month">${esc(monthName(main))}</span>${whose}
    </button>` : '';
  const pastBtns = past.length ? `
    <span class="pay-past"><span class="pay-past-label">${esc(t('inst.pastLabel'))}</span>${past.map((m) => {
      const on = paid.has(`${i.id}|${m}`);
      return `<button type="button" class="chip-btn pay-chip" data-pay="${esc(i.id)}" data-month="${m}" data-fk="pay:${esc(i.id)}:${m}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(monthName(m))}${whose}</button>`;
    }).join('')}</span>` : '';
  return `
    <li class="item inst-item${soon ? ' soon' : ''}${mainPaid ? ' is-paid' : ''}${finished ? ' is-done' : ''}" data-id="${esc(i.id)}">
      <span class="pv pv-${providerHue(i.provider)}" aria-hidden="true">${esc([...name.trim()][0] || '؟')}</span>
      <div class="item-main">
        <span class="prov" dir="auto">${esc(name)}</span>
        <span class="title" dir="auto">${esc(i.title || t('common.noTitle'))}</span>
      </div>
      <div class="item-amt">${num(fmt.money(i.monthly))}<small>${esc(t('inst.perMonth'))}</small></div>
      <div class="item-meta">
        ${finished
          ? `<span class="chip chip-ok">${esc(t('inst.finishedOn', { month: fmt.month(i.lastDue) }))}</span>`
          : `<span>${t('inst.next', { date: `<b class="num">${esc(fmt.day(i.nextDue))}</b>` })} · <b class="when${soon ? ' is-soon' : ''}">${esc(fmt.daysLeft(i.daysLeft))}</b></span>
             <span class="inst-left${i.open ? ' is-open' : ''}">${esc(fmt.left(i))}${i.open ? '' : ` · ${esc(t('inst.last', { month: fmt.month(i.lastDue) }))}`}</span>`}
        ${i.open
          ? `<span class="plan plan-open-line"><span class="plan-txt">${esc(t(i.first_due_date <= today() ? 'inst.openSince' : 'inst.openStarts', { month: fmt.month(i.first_due_date) }))}</span></span>`
          : `<span class="plan" title="${esc(t('inst.progress', { paid: done, total, totalText: fmt.count(total) }))}">
          <span class="mini-meter" aria-hidden="true"><i class="${finished ? 'lvl-ok' : 'gold'}" data-w="${total ? (done / total) * 100 : 0}"></i></span>
          <span class="plan-txt">${esc(t('inst.progress', { paid: done, total, totalText: fmt.count(total) }))}</span>
        </span>`}
      </div>
      ${main || past.length ? `<div class="inst-pay">${mainBtn}${pastBtns}</div>` : ''}
      <div class="item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(i.id)}" data-fk="edit:${esc(i.id)}" aria-label="${esc(t('inst.editLabel', { name }))}">${ICO.edit}<span>${esc(t('inst.edit'))}</span></button>
        <button type="button" class="btn btn-sm ${armed ? 'btn-danger' : 'btn-danger-ghost'}" data-del="${esc(i.id)}" data-fk="del:${esc(i.id)}" aria-label="${esc(t(armed ? 'inst.delArmedLabel' : 'inst.delLabel', { name }))}">${ICO.trash}<span>${esc(t(armed ? 'inst.delArmed' : 'inst.del'))}</span></button>
      </div>
    </li>`;
}

const emptyArt = `
  <svg class="empty-art" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
    <rect class="ea-card" x="22" y="22" width="104" height="76" rx="16"/>
    <rect class="ea-line" x="38" y="42" width="44" height="8" rx="4"/>
    <rect class="ea-line soft" x="38" y="60" width="64" height="8" rx="4"/>
    <rect class="ea-line soft" x="38" y="76" width="34" height="8" rx="4"/>
    <circle class="ea-gold" cx="122" cy="88" r="20"/>
    <path class="ea-plus" d="M122 79v18M113 88h18"/>
  </svg>`;

function visibleInstallments(st) {
  return st.installments.filter((i) => !pending.has(i.id));
}

function renderList(st, s) {
  const body = $('#list-body');
  body.classList.remove('skel-stack');
  const paid = C.paidKeys(st.payments);
  $('#count-active').textContent = String(s.active.length);
  $('#count-done').textContent = String(s.finished.length);
  for (const tab of $$('#list-tabs [role="tab"]')) {
    const on = tab.dataset.tab === ui.tab;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  body.setAttribute('aria-labelledby', ui.tab === 'active' ? 'tab-active' : 'tab-done');

  // rows slide in on the first paint only; later re-renders (a toggle, an edit) stay still
  const still = ui.animated ? ' is-static' : '';
  ui.animated = true;
  keepFocus(body, () => {
    if (ui.tab === 'active') {
      body.innerHTML = s.active.length
        ? `<ol class="list inst-list${still}">${s.active.map((i) => itemHTML(i, paid, false)).join('')}</ol>`
        : `<div class="empty">${emptyArt}<strong>${esc(t('inst.emptyTitle'))}</strong><p>${esc(t('inst.emptyDesc'))}</p>
            <div class="empty-actions">
              <button type="button" class="btn btn-gold" data-open-add>${ICO.plus}<span>${esc(t('inst.add'))}</span></button>
              <a class="btn btn-ghost" href="#sms" data-go-sms>${esc(t('inst.smsJump'))}</a>
            </div></div>`;
    } else {
      const done = [...s.finished].sort((a, b) => (a.lastDue < b.lastDue ? 1 : -1));
      body.innerHTML = done.length
        ? `<ol class="list inst-list${still}">${done.map((i) => itemHTML(i, paid, true)).join('')}</ol>`
        : `<div class="empty"><strong>${esc(t('inst.emptyDoneTitle'))}</strong><p>${esc(t('inst.emptyDoneDesc'))}</p></div>`;
    }
  });
  body.querySelectorAll('.mini-meter i').forEach((i) => fx.setWidth(i, Number(i.dataset.w)));
}

function renderStreak(st) {
  const box = $('#streak-body');
  box.classList.remove('skel-stack');
  const list = visibleInstallments(st);
  const sk = computeStreak(list, st.payments, today());
  const last6 = sk.months.slice(-6);
  const stateOf = (m) => (m.complete ? 'complete' : m.due ? 'partial' : 'none');
  const label = { complete: t('inst.streakComplete'), partial: t('inst.streakPartial'), none: t('inst.streakNoDue') };
  const tm = sk.thisMonth;
  const thisLine = !tm.due ? t('inst.streakThisNone') : tm.complete ? t('inst.streakThisDone') : t('inst.streakThis', { paid: tm.paid, due: tm.due });
  box.innerHTML = `
    <div class="streak-hero${sk.current ? ' is-lit' : ''}">
      <span class="flame" aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false">
          <defs><linearGradient id="flame-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e9a425"/><stop offset=".6" stop-color="#f5b942"/><stop offset="1" stop-color="#ffd27a"/></linearGradient></defs>
          <path class="flame-outer" d="M24 44c-8.4 0-14-5.6-14-13 0-7.4 5.3-10.8 7.9-17.3.9 4.2 2.8 6.3 5.1 7.4.5-7 3.7-12.8 9.4-16.8-.9 6 .7 10.3 3.8 14 2.4 3 4.1 6.7 4.1 11.9C40.3 38.2 33.4 44 24 44z"/>
          <path class="flame-inner" d="M24 41c-4 0-6.6-2.6-6.6-6.1 0-3.4 2.4-5 3.6-8 .5 1.9 1.3 2.9 2.4 3.4.3-3.2 1.7-5.9 4.3-7.7-.4 2.8.3 4.8 1.8 6.5 1.1 1.4 1.9 3.1 1.9 5.5 0 3.6-3.2 6.4-7.4 6.4z"/>
        </svg>
      </span>
      <div class="streak-num-wrap">
        <span class="streak-label">${esc(t('inst.streakNow'))}</span>
        <strong class="streak-num"><span class="num">${sk.current}</span> <span class="streak-unit">${esc(monthUnit(sk.current))}</span></strong>
        <span class="streak-best">${esc(sk.best ? t('inst.streakBest', { best: monthsText(sk.best) }) : t('inst.streakStart'))}</span>
      </div>
    </div>
    <ol class="streak-months" aria-label="${esc(t('inst.streakHint'))}">
      ${last6.map((m) => {
        const stt = stateOf(m);
        const name = monthName(m.month);
        const desc = t('inst.streakMonth', { month: name, state: m.current && !m.complete ? `${t('inst.streakCurrent')} · ${m.paid}/${m.due}` : label[stt] });
        return `<li class="sm is-${stt}${m.current ? ' is-current' : ''}"><span class="sm-dot" aria-hidden="true">${m.complete ? '✓' : ''}</span><span class="sm-label" aria-hidden="true">${esc(monthShort(m.month))}</span><span class="sr-only">${esc(desc)}</span></li>`;
      }).join('')}
    </ol>
    <p class="streak-this">${esc(thisLine)}</p>
    <p class="hint">${esc(t('inst.streakRule'))}</p>`;
}

function renderError() {
  const body = $('#list-body');
  body.classList.remove('skel-stack');
  body.innerHTML = `<div class="empty"><strong>${esc(t('inst.loadFail'))}</strong>
    <div class="empty-actions"><button type="button" class="btn" data-retry>${esc(t('inst.retry'))}</button></div></div>`;
}

function render() {
  if (!store.loaded) {
    if (ui.loadFailed) renderError();
    return;
  }
  const st = store.state;
  const list = visibleInstallments(st);
  const s = C.monthSummary(list, Number(st.profile?.salary) || 0, Number(st.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT), today());
  renderStats(st, s);
  renderList(st, s);
  renderStreak(st);
  if (ui.sms) renderSms(ui.sms);
}

// ---------- paid toggles ----------

async function togglePaid(id, month, btn) {
  const inst = store.state.installments.find((i) => i.id === id);
  if (!inst) return;
  const next = btn.getAttribute('aria-pressed') !== 'true';
  const before = monthStatus(visibleInstallments(store.state), store.state.payments, month).complete;
  try {
    const st = await markPaid(id, month, next);
    showBanner('');
    const after = monthStatus(visibleInstallments(st), st.payments, month);
    if (next && after.complete && !before) {
      const sk = computeStreak(visibleInstallments(st), st.payments, today());
      toast(t('inst.monthDone', { month: monthName(month), streak: monthsText(Math.max(1, sk.current)) }), 'ok');
    } else {
      toast(t(next ? 'inst.marked' : 'inst.unmarked', { month: monthName(month) }), next ? 'ok' : '');
    }
  } catch (err) {
    toast(errorText(err), 'error');
  }
}

// ---------- delete: two steps, then 5 seconds to undo ----------

function arm(id) {
  clearTimeout(ui.armTimer);
  ui.armed = id;
  render();
  ui.armTimer = setTimeout(() => {
    if (ui.armed !== id) return;
    ui.armed = null;
    render();
  }, 4000);
}

function scheduleRemove(id) {
  clearTimeout(ui.armTimer);
  ui.armed = null;
  if (editor.id === id) editor.close();
  const timer = setTimeout(async () => {
    try {
      await removeInstallment(id);
      pending.delete(id);
      showBanner('');
    } catch (err) {
      pending.delete(id);
      render();
      toast(errorText(err), 'error');
    }
  }, 5000);
  pending.set(id, timer);
  render();
  // the deleted row is gone: let the toast's «تراجع» take keyboard focus
  if (document.activeElement && ($('#list-body').contains(document.activeElement) || document.activeElement === $('#list-h'))) document.activeElement.blur();
  toastAction(t('inst.deleted'), t('common.undo'), () => {
    const tm = pending.get(id);
    if (tm === undefined) {
      $('#list-h').focus({ preventScroll: true });
      return;
    }
    clearTimeout(tm);
    pending.delete(id);
    render();
    const back = document.querySelector(`[data-edit="${CSS.escape(id)}"]`);
    if (back) back.focus();
    else $('#list-h').focus({ preventScroll: true });
    toast(t('inst.restored'), 'ok');
  });
}

// Sends every delete still waiting for its undo window, now. Resolves when they are done (or after 4 s).
let flushing = null;
function flushPending() {
  if (flushing) return flushing;
  const ids = [...pending.keys()];
  for (const id of ids) clearTimeout(pending.get(id));
  const work = Promise.allSettled(ids.map((id) => removeInstallment(id)));
  const cap = new Promise((resolve) => { setTimeout(resolve, 4000); });
  flushing = Promise.race([work, cap]).then(() => {
    for (const id of ids) pending.delete(id);
    flushing = null;
  });
  return flushing;
}

// In-app navigation during an undo window (header, tab bar, any same-site link): finish the deletes first,
// then go. Unload requests are not reliable once the service worker controls the page.
document.addEventListener('click', (e) => {
  if (!pending.size || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  let url;
  try { url = new URL(a.href, location.href); } catch { return; }
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // same-page anchor
  e.preventDefault();
  flushPending().finally(() => location.assign(url.href));
}, true);

// Fallback when the tab itself closes during an undo window: still try to send the waiting deletes.
window.addEventListener('pagehide', () => {
  for (const [id, timer] of pending) {
    clearTimeout(timer);
    try {
      fetch('/api/rpc', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fn: 'aqsati_remove', args: { p_token: getToken(), p_id: id } }),
      }).catch(() => {});
    } catch {
      // nothing more we can do while unloading
    }
  }
  pending.clear();
});

// ---------- add / edit modal ----------

const editor = {
  id: null,
  el: null,
  prevFocus: null,
  inert: [],
  busy: false,

  build() {
    const wrap = document.createElement('div');
    wrap.className = 'modal inst-modal';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ed-title" aria-describedby="ed-desc" tabindex="-1">
        <button type="button" class="icon-btn modal-x" data-close data-i18n-aria-label="common.close" aria-label="سكّر">${ICO.x}</button>
        <div class="modal-head">
          <span class="modal-ico" aria-hidden="true">${ICO.plus}</span>
          <h2 class="modal-title" id="ed-title"></h2>
          <p class="modal-body" id="ed-desc"></p>
        </div>
        <p class="ed-note" id="ed-note" hidden></p>
        <form class="modal-form ed-form" id="ed-form" novalidate>
          <div class="form-row">
            <div class="field">
              <label for="ed-provider" data-i18n="form.provider">الجهة</label>
              <select id="ed-provider" name="provider" aria-describedby="ed-provider-err"></select>
              <p class="err" id="ed-provider-err" data-err="provider" aria-live="polite"></p>
            </div>
            <div class="field" id="ed-other-wrap" hidden>
              <label for="ed-other" data-i18n="form.other">اسم الجهة</label>
              <input id="ed-other" name="other" maxlength="40" autocomplete="off" data-i18n-placeholder="form.otherPh" aria-describedby="ed-other-err">
              <p class="err" id="ed-other-err" data-err="other" aria-live="polite"></p>
            </div>
          </div>
          <div class="field">
            <label for="ed-title-in"><span data-i18n="form.title">وصف القسط</span> <em data-i18n="common.optional">(اختياري)</em></label>
            <input id="ed-title-in" name="title" maxlength="80" autocomplete="off" data-i18n-placeholder="form.titlePh" aria-describedby="ed-title-err">
            <p class="err" id="ed-title-err" data-err="title" aria-live="polite"></p>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="ed-monthly" data-i18n="form.monthly">المبلغ الشهري</label>
              <div class="input-group" dir="ltr">
                <input id="ed-monthly" name="monthly" inputmode="decimal" autocomplete="off" placeholder="25.500" aria-describedby="ed-monthly-err">
                <span class="input-affix" data-i18n="common.kwd">د.ك</span>
              </div>
              <p class="err" id="ed-monthly-err" data-err="monthly" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="ed-day" data-i18n="form.dueDay">يوم الاستحقاق</label>
              <input id="ed-day" name="dueDay" inputmode="numeric" autocomplete="off" dir="ltr" placeholder="25" aria-describedby="ed-day-hint ed-day-err">
              <p class="hint" id="ed-day-hint" data-i18n="form.dueDayHint">اليوم الي ينسحب فيه القسط كل شهر (1–31)</p>
              <p class="err" id="ed-day-err" data-err="dueDay" aria-live="polite"></p>
            </div>
          </div>
          <fieldset class="rem-field">
            <legend class="field-label" data-i18n="form.remWhat">وش تعرف عن الباقي؟</legend>
            <div class="seg rem-seg">
              <label><input type="radio" name="remainingMode" id="ed-mode-count" value="count" aria-describedby="ed-mode-err"><span data-i18n="form.modeCount">عدد الأقساط</span></label>
              <label><input type="radio" name="remainingMode" id="ed-mode-amount" value="amount" aria-describedby="ed-mode-err"><span data-i18n="form.modeAmount">المبلغ الباقي</span></label>
              <label><input type="radio" name="remainingMode" id="ed-mode-open" value="open" aria-describedby="ed-open-note ed-mode-err"><span data-i18n="form.modeOpen">ما أعرف</span></label>
            </div>
            <p class="err" id="ed-mode-err" data-err="remainingMode" aria-live="polite"></p>
            <div class="field" id="ed-count-wrap">
              <label for="ed-remaining" data-i18n="form.remaining">كم قسط باقي؟</label>
              <input id="ed-remaining" name="remaining" inputmode="numeric" autocomplete="off" dir="ltr" placeholder="6" aria-describedby="ed-rem-hint ed-remaining-err">
              <p class="hint" id="ed-rem-hint" data-i18n="form.remainingHint">مع قسط هالشهر إذا ما انسحب للحين</p>
              <p class="err" id="ed-remaining-err" data-err="remaining" aria-live="polite"></p>
            </div>
            <div class="field" id="ed-amount-wrap" hidden>
              <label for="ed-amount" data-i18n="form.amountLeft">كم باقي عليك بالدينار؟</label>
              <div class="input-group" dir="ltr">
                <input id="ed-amount" name="amountLeft" inputmode="decimal" autocomplete="off" placeholder="162.500" aria-describedby="ed-amount-hint ed-amount-err">
                <span class="input-affix" data-i18n="common.kwd">د.ك</span>
              </div>
              <p class="hint" id="ed-amount-hint"></p>
              <p class="err" id="ed-amount-err" data-err="amountLeft" aria-live="polite"></p>
            </div>
            <p class="hint ed-open-note" id="ed-open-note" data-i18n="form.openNote" hidden>مفتوح — بدون تاريخ نهاية: نحسبه عليك كل شهر (مثل البطاقة أو قرض ما تعرف متى يخلص). تقدر تعدّله بعدين.</p>
          </fieldset>
          <p class="ed-preview" id="ed-preview"></p>
          <p class="sr-only" id="ed-live" aria-live="polite" aria-atomic="true"></p>
          <p class="err modal-err" id="ed-form-err" aria-live="assertive"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close data-i18n="common.cancel">إلغاء</button>
            <button type="submit" class="btn btn-gold" id="ed-save"><span class="spinner" aria-hidden="true"></span><span class="btn-label"></span></button>
          </div>
        </form>
      </div>`;
    document.body.append(wrap);
    this.el = wrap;
    const form = wrap.querySelector('form');
    wrap.addEventListener('click', (e) => {
      if (!this.busy && e.target instanceof Element && e.target.closest('[data-close]')) this.close();
    });
    wrap.querySelector('#ed-provider').addEventListener('change', () => {
      const other = this.$('#ed-provider').value === 'أخرى';
      this.$('#ed-other-wrap').hidden = !other;
      if (other) this.$('#ed-other').focus();
      this.preview();
    });
    form.addEventListener('change', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.name === 'remainingMode') this.syncMode();
    });
    form.addEventListener('input', () => {
      this.preview();
      // every shown error whose condition no longer holds goes away right away — also one that depends on another
      // field (fixing the monthly amount can make the «amount left» valid again)
      const v = C.validateInstallmentInput(this.raw());
      this.el.querySelectorAll('[data-err]').forEach((p) => {
        if (!p.textContent) return;
        const key = p.dataset.err === 'other' ? 'provider' : p.dataset.err;
        if (v.errors[key]) return;
        p.textContent = '';
        p.closest('.field')?.querySelector('input, select')?.setAttribute('aria-invalid', 'false');
      });
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
  },

  $(sel) { return this.el.querySelector(sel); },

  fillProviders() {
    const sel = this.$('#ed-provider');
    const value = sel.value || C.PROVIDERS[0];
    sel.innerHTML = C.PROVIDERS.map((p) => `<option value="${esc(p)}">${esc(fmt.provider(p))}</option>`).join('');
    sel.value = value;
  },

  texts() {
    if (!this.el) return;
    const editing = Boolean(this.id);
    this.$('#ed-title').textContent = t(editing ? 'form.editTitle' : 'form.addTitle');
    this.$('#ed-desc').textContent = t('form.addDesc');
    this.$('.btn-label').textContent = t(editing ? 'form.saveEdit' : 'form.save');
    this.$('.modal-ico').innerHTML = editing ? ICO.edit : ICO.plus;
    this.fillProviders();
    this.syncMode();
  },

  /** The checked «وش تعرف عن الباقي؟» option: 'count' | 'amount' | 'open', or '' when none is picked yet. */
  mode() {
    return this.$('input[name="remainingMode"]:checked')?.value || '';
  },

  /** Show only the input of the checked mode (none checked ⇒ none), clear what is hidden, refresh the preview. */
  syncMode() {
    if (!this.el) return;
    const mode = this.mode();
    const parts = { count: '#ed-count-wrap', amount: '#ed-amount-wrap', open: '#ed-open-note' };
    for (const [m, sel] of Object.entries(parts)) {
      const el = this.$(sel);
      el.hidden = m !== mode;
      if (el.hidden) {
        el.querySelectorAll('[data-err]').forEach((p) => { p.textContent = ''; });
        el.querySelectorAll('input').forEach((i) => i.setAttribute('aria-invalid', 'false'));
      }
    }
    // the generic input handler never reaches the radios: a picked mode clears its own error here
    if (mode) this.$('#ed-mode-err').textContent = '';
    this.preview();
  },

  open({ id = null, values = {}, note = '', keep = null } = {}) {
    if (!this.el) this.build();
    if (!this.el.hidden) this.close(false);
    this.id = id;
    this.keep = id ? keep : null;
    this.prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const form = this.$('form');
    form.reset();
    this.showErrors({});
    this.$('#ed-form-err').textContent = '';
    this.fillProviders();
    const provider = values.provider ?? C.PROVIDERS[0];
    const known = C.PROVIDERS.includes(provider) && provider !== 'أخرى';
    this.$('#ed-provider').value = known ? provider : 'أخرى';
    this.$('#ed-other-wrap').hidden = known;
    this.$('#ed-other').value = known || provider === 'أخرى' ? '' : provider;
    this.$('#ed-title-in').value = values.title ?? '';
    this.$('#ed-monthly').value = values.monthly ?? '';
    this.$('#ed-day').value = values.dueDay ?? '';
    this.$('#ed-remaining').value = values.remaining ?? '';
    this.$('#ed-amount').value = values.amountLeft ?? '';
    // form.reset() unchecked every radio; pick the saved / requested mode BEFORE texts() runs syncMode()
    const mode = values.remainingMode === undefined ? 'count' : values.remainingMode;
    const radio = C.REMAINING_MODES.includes(mode) ? this.$(`#ed-mode-${mode}`) : null;
    if (radio) radio.checked = true;
    const noteEl = this.$('#ed-note');
    noteEl.textContent = note;
    noteEl.hidden = !note;
    this.$('#ed-live').textContent = '';
    this.lastLive = '';
    this.texts();
    applyI18n(this.el);

    for (const el of document.body.children) {
      if (el === this.el || el.id === 'toast' || el.inert) continue;
      el.inert = true;
      this.inert.push(el);
    }
    document.documentElement.classList.add('modal-open');
    this.el.hidden = false;
    document.addEventListener('keydown', this.onKey, true);
    requestAnimationFrame(() => {
      // the first field that still needs the user
      if (!values.provider) {
        this.$('#ed-provider').focus();
        return;
      }
      const firstEmpty = ['#ed-monthly', '#ed-day'].find((s) => !this.$(s).value);
      if (firstEmpty) {
        this.$(firstEmpty).focus();
        return;
      }
      const m = this.mode();
      const modeInput = !m ? '#ed-mode-count' : m === 'count' ? '#ed-remaining' : m === 'amount' ? '#ed-amount' : null;
      // no mode yet ⇒ the radio group; a mode whose field is still empty ⇒ that field; otherwise save
      const target = modeInput && (!m || !this.$(modeInput).value) ? this.$(modeInput) : this.$('#ed-save');
      target.focus();
    });
  },

  close(restore = true) {
    if (!this.el || this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('keydown', this.onKey, true);
    for (const el of this.inert) el.inert = false;
    this.inert = [];
    document.documentElement.classList.remove('modal-open');
    const back = this.prevFocus;
    this.id = null;
    this.prevFocus = null;
    if (restore) {
      if (back?.isConnected && !back.closest('[hidden]')) back.focus({ preventScroll: true });
      else $('#list-h').focus({ preventScroll: true });
    }
  },

  onKey: (e) => {
    const el = editor.el;
    if (!el || el.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!editor.busy) editor.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const card = el.querySelector('.modal-card');
    const items = $$('button, input, select, textarea, a[href]', card).filter((x) => !x.disabled && x.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = items.indexOf(document.activeElement);
    if (at === -1) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && at === 0) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === items.length - 1) {
      e.preventDefault();
      first.focus();
    }
  },

  raw() {
    const picked = this.$('#ed-provider').value;
    return {
      picked,
      provider: picked === 'أخرى' ? this.$('#ed-other').value : picked,
      title: this.$('#ed-title-in').value,
      monthly: this.$('#ed-monthly').value,
      dueDay: this.$('#ed-day').value,
      remainingMode: this.mode(),
      remaining: this.$('#ed-remaining').value,
      amountLeft: this.$('#ed-amount').value,
    };
  },

  /**
   * v.value as it will be saved. The stored schedule (first due date, so the paid marks stay aligned) is kept only
   * when nothing that defines it changed; a mode switch or any change ⇒ a new plan from today.
   */
  plan(value) {
    const k = this.id ? this.keep : null;
    if (!k || value.remainingMode !== k.mode || Number(value.dueDay) !== k.dueDay) return value;
    if (k.mode === 'count' && Number(value.remaining) === k.remaining) {
      return { ...value, firstDue: k.firstDue, remaining: k.remainingCount };
    }
    if (k.mode === 'amount' && C.round3(value.monthly) === k.monthly && C.round3(value.amountLeft) === k.amountLeft) {
      // the server re-derives the same count + last payment from the stored plan total
      return { ...value, firstDue: k.firstDue, amountLeft: k.planTotal };
    }
    if (k.mode === 'open') return { ...value, firstDue: k.firstDue };
    return value;
  },

  /** The live line under «كم باقي عليك بالدينار؟»: the server's own split (count + last payment) of what was typed. */
  amountHint(v, raw) {
    const el = this.$('#ed-amount-hint');
    if (raw.remainingMode !== 'amount') {
      el.textContent = t('form.amountLeftHint');
      return;
    }
    if (v.errors.monthly) {
      el.textContent = t('form.amountCalcNeedMonthly');
      return;
    }
    // numbers only: Number('١٦٢٫٥') is NaN, so parse the typed text first (Arabic digits OK)
    const split = C.splitAmount(C.round3(C.parseAmount(raw.amountLeft)), v.value.monthly);
    const monthly = v.value.monthly;
    let text;
    if (!split) text = t('form.amountLeftHint');
    else if (split.count > C.MAX_PAYMENTS) text = t('form.amountCalcMax', { count: fmt.count(split.count) });
    else if (split.count === 1) text = t('form.amountCalcOne', { last: fmt.money(split.last) });
    else if (split.lastAmount === null) text = t('form.amountCalcEven', { count: fmt.count(split.count) });
    else if (split.lastAmount < 1 && split.lastAmount * 10 < monthly) {
      // e.g. 1000 at 33.333 ⇒ 31 payments, the last 0.010 — allowed, but probably a rounded monthly
      text = t('form.amountCalcTiny', { count: fmt.count(split.count), last: fmt.money(split.lastAmount), n: split.count - 1 });
    } else text = t('form.amountCalc', { count: fmt.count(split.count), last: fmt.money(split.lastAmount) });
    el.textContent = text;
  },

  preview() {
    if (!this.el) return;
    const raw = this.raw();
    const v = C.validateInstallmentInput(raw);
    const out = this.$('#ed-preview');
    const mode = raw.remainingMode;
    this.amountHint(v, raw);
    const e = v.errors;
    const ready = Boolean(mode) && !e.monthly && !e.dueDay && !e.remainingMode
      && (mode !== 'count' || !e.remaining) && (mode !== 'amount' || !e.amountLeft);
    // in amount mode the live hint (payments, last payment, the 360 limit, the rounding warning) is announced too
    const hint = mode === 'amount' && String(raw.amountLeft ?? '').trim() ? this.$('#ed-amount-hint').textContent : '';
    if (!ready) {
      out.textContent = '';
      out.hidden = true;
      this.announce(hint);
      return;
    }
    const p = this.plan(v.value);
    const first = p.firstDue || C.firstDueDate(v.value.dueDay, today());
    const base = { first_due_date: first, due_day: v.value.dueDay, monthly_amount: v.value.monthly, remaining_mode: mode };
    if (mode === 'open') {
      const inst = { ...base, remaining_count: null, last_amount: null };
      const next = p.firstDue ? C.installmentStatus(inst, today()).nextDue || first : first;
      out.innerHTML = t('form.previewOpen', { next: num(fmt.day(next)) });
    } else if (mode === 'amount') {
      // the plan exactly as the server will store it (a kept plan re-splits its stored total)
      const split = C.splitAmount(p.amountLeft, v.value.monthly);
      const inst = { ...base, remaining_count: split.count, last_amount: split.lastAmount };
      const stt = C.installmentStatus(inst, today());
      const total = p.firstDue ? (stt.remainingTotal > 0 ? stt.remainingTotal : stt.lastAmount) : v.value.amountLeft;
      out.innerHTML = t('form.preview', {
        next: num(fmt.day(p.firstDue ? stt.nextDue || first : first)),
        last: num(fmt.month(C.nthDueDate(inst, split.count - 1))),
        total: num(fmt.money(total)),
      });
    } else {
      const inst = { ...base, remaining_count: p.remaining, last_amount: null };
      const left = p.firstDue ? Math.max(1, C.installmentStatus(inst, today()).remaining) : v.value.remaining;
      const next = p.firstDue ? C.installmentStatus(inst, today()).nextDue || first : first;
      out.innerHTML = t('form.preview', {
        next: num(fmt.day(next)),
        last: num(fmt.month(C.nthDueDate(inst, p.remaining - 1))),
        total: num(fmt.money(v.value.monthly * left)),
      });
    }
    out.hidden = false;
    this.announce([hint, out.textContent].filter(Boolean).join(' · '));
  },

  /** One fixed live region for the running result: written only when the text changes (no repeat per keystroke). */
  announce(text) {
    if (text === this.lastLive) return;
    this.lastLive = text;
    this.$('#ed-live').textContent = text;
  },

  showErrors(errors, picked) {
    const map = { ...errors };
    if (picked === 'أخرى' && map.provider) {
      map.other = map.provider;
      delete map.provider;
    }
    this.el.querySelectorAll('[data-err]').forEach((p) => {
      const key = p.dataset.err;
      const msgKey = key === 'other' ? 'provider' : key;
      p.textContent = map[key] ? t(`form.err.${msgKey}`) : '';
      const input = p.closest('.field')?.querySelector('input, select');
      if (input) input.setAttribute('aria-invalid', map[key] ? 'true' : 'false');
    });
    const order = ['provider', 'other', 'title', 'monthly', 'dueDay', 'remainingMode', 'remaining', 'amountLeft'];
    const first = order.find((k) => map[k]);
    // the mode error sits outside any .field by design: focus the first radio (focus() does not check it)
    if (first === 'remainingMode') this.$('#ed-mode-count').focus();
    else if (first) this.el.querySelector(`[data-err="${first}"]`)?.closest('.field')?.querySelector('input, select')?.focus();
  },

  async submit() {
    if (this.busy) return;
    const raw = this.raw();
    const v = C.validateInstallmentInput(raw);
    this.showErrors(v.errors, raw.picked);
    this.$('#ed-form-err').textContent = '';
    if (!v.ok) return;
    const btn = this.$('#ed-save');
    this.busy = true;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    const editing = this.id;
    try {
      if (editing) await updateInstallment(editing, this.plan(v.value));
      else await addInstallment(v.value);
      showBanner('');
      this.busy = false;
      if (!editing) ui.tab = 'active';
      this.close();
      render();
      toast(t(editing ? 'inst.saved' : 'inst.added'), 'ok');
    } catch (err) {
      this.$('#ed-form-err').textContent = errorText(err);
      btn.focus();
    } finally {
      this.busy = false;
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
    }
  },
};

function startEdit(id) {
  const inst = store.state.installments.find((i) => i.id === id);
  if (!inst) return;
  const mode = C.remainingMode(inst);
  const stt = C.installmentStatus(inst, today());
  const open = mode === 'open';
  // modes 1 and 2 are both prefilled, so switching between them shows the equivalent of what is left
  const shownRemaining = open ? null : Math.max(1, stt.remaining);
  const shownAmount = open ? null : C.round3(stt.remainingTotal > 0 ? stt.remainingTotal : stt.lastAmount);
  editor.open({
    id,
    values: {
      provider: inst.provider,
      title: inst.title || '',
      monthly: Number(inst.monthly_amount).toFixed(3),
      dueDay: String(inst.due_day),
      remainingMode: mode,
      remaining: open ? '' : String(shownRemaining),
      amountLeft: open ? '' : shownAmount.toFixed(3),
    },
    // Saving with the same mode and the same numbers keeps the original schedule (and its paid marks).
    keep: {
      mode,
      dueDay: Number(inst.due_day),
      firstDue: inst.first_due_date,
      remaining: shownRemaining,
      remainingCount: Number(inst.remaining_count),
      monthly: C.round3(Number(inst.monthly_amount)),
      amountLeft: shownAmount,
      planTotal: C.planTotal(inst),
      lastAmount: inst.last_amount ?? null,
    },
  });
}

// ---------- bank SMS ----------

function renderSms(r) {
  const box = $('#sms-result');
  if (!r) {
    box.replaceChildren();
    return;
  }
  if (!r.ok) {
    box.innerHTML = `<div class="alert tone-warn sms-fail"><p>${esc(t('sms.fail'))}</p></div>`;
    return;
  }
  const lang = getLang();
  const chip = (cls, text) => `<li class="chip ${cls}">${text}</li>`;
  const providerName = r.provider ? fmt.provider(r.provider) : null;
  const brand = r.brandName && r.provider !== null && r.brandName[lang] !== providerName ? ` · ${esc(r.brandName[lang])}` : '';
  const chips = [
    chip('chip-info', esc(t('sms.amount', { v: fmt.money(r.amount) }))),
    providerName ? chip('chip-info', `${esc(t('sms.provider', { v: providerName }))}${brand}`) : chip('chip-none', esc(t('sms.noProvider'))),
    r.remaining != null ? chip('chip-info', esc(t('sms.remaining', { v: fmt.count(r.remaining) }))) : chip('chip-none', esc(t('sms.noRemaining'))),
    r.dueDay != null ? chip('chip-info', esc(t('sms.dueDay', { v: r.dueDay }))) : chip('chip-none', esc(t('sms.noDueDay'))),
  ];
  const tone = { high: 'chip-ok', medium: 'chip-warn', low: 'chip-over' }[r.level];
  box.innerHTML = `
    <div class="sms-res">
      <div class="sms-head">
        <strong>${esc(t('sms.understood'))}</strong>
        <span class="chip ${tone}">${esc(t(`sms.level.${r.level}`))}</span>
        ${r.status !== 'unknown' ? `<span class="chip">${esc(t(r.status === 'paid' ? 'sms.paid' : 'sms.due'))}</span>` : ''}
      </div>
      <ul class="sms-chips">${chips.join('')}</ul>
      <span class="meter sms-meter" aria-hidden="true"><i class="${r.level === 'high' ? 'lvl-ok' : r.level === 'medium' ? 'lvl-warn' : 'lvl-over'}"></i></span>
      <button type="button" class="btn btn-gold btn-block" data-sms-apply>${ICO.spark}<span>${esc(t('sms.apply'))}</span></button>
    </div>`;
  fx.setWidth(box.querySelector('.sms-meter i'), r.confidence * 100);
}

function readSms() {
  const text = $('#sms-text').value;
  if (!text.trim()) {
    ui.sms = null;
    $('#sms-result').innerHTML = `<p class="err">${esc(t('sms.empty'))}</p>`;
    $('#sms-text').focus();
    return;
  }
  ui.sms = parseSms(text);
  renderSms(ui.sms);
}

function applySms() {
  const r = ui.sms;
  if (!r?.ok) return;
  const lang = getLang();
  const hasCount = r.remaining != null && r.remaining >= 1;
  editor.open({
    values: {
      provider: r.provider || undefined, // unknown: the select gets focus so the user picks it
      title: r.title ? r.title[lang] : '',
      monthly: r.amount.toFixed(3),
      dueDay: r.dueDay != null ? String(r.dueDay) : '',
      // a count in the message ⇒ mode 1; otherwise nothing is pre-picked and the user chooses what they know
      remainingMode: hasCount ? 'count' : '',
      remaining: hasCount ? String(r.remaining) : '',
    },
    note: t('form.fromSms'),
  });
}

// ---------- prefill from the URL (?add=1 / ?prefill=1&monthly=…&remaining=…&title=…&provider=…&dueDay=…, ?edit=<id>) ----------

function handleUrl() {
  const q = new URLSearchParams(location.search);
  const editId = q.get('edit');
  const wantsAdd = q.has('add') || q.has('prefill');
  if (editId && store.state.installments.some((i) => i.id === editId)) {
    startEdit(editId);
  } else if (wantsAdd) {
    const monthly = C.parseAmount(q.get('monthly') || '');
    const remaining = C.parseWhole(q.get('remaining') || '');
    const dueDay = C.parseWhole(q.get('dueDay') || '');
    const provider = q.get('provider') || '';
    const title = (q.get('title') || '').slice(0, 80);
    const fromCheck = q.get('from') === 'check';
    editor.open({
      values: {
        provider: C.PROVIDERS.includes(provider) ? provider : provider ? provider.slice(0, 40) : undefined,
        title,
        monthly: monthly > 0 ? C.round3(monthly).toFixed(3) : '',
        remaining: remaining >= 1 && remaining <= 360 ? String(remaining) : '',
        dueDay: dueDay >= 1 && dueDay <= 31 ? String(dueDay) : '',
      },
      note: fromCheck ? t('form.fromCheck') : '',
    });
  }
  if (editId || wantsAdd) history.replaceState(null, '', location.pathname + location.hash);
  if (location.hash === '#sms') focusSms();
}

function focusSms() {
  const card = $('#sms');
  card.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  $('#sms-text').focus({ preventScroll: true });
}

// ---------- events ----------

function bind() {
  $('#add-btn').addEventListener('click', () => editor.open());
  $('#sms-jump').addEventListener('click', (e) => {
    e.preventDefault();
    focusSms();
  });
  $('#sms-form').addEventListener('submit', (e) => {
    e.preventDefault();
    readSms();
  });
  $('#sms-sample').addEventListener('click', () => {
    $('#sms-text').value = SAMPLE_MESSAGES[ui.smsIndex % SAMPLE_MESSAGES.length];
    ui.smsIndex += 1;
    readSms();
  });
  $('#sms-result').addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-sms-apply]')) applySms();
  });

  // tabs (roving tabindex + arrow keys)
  const tabs = $('#list-tabs');
  tabs.addEventListener('click', (e) => {
    const tab = e.target instanceof Element ? e.target.closest('[role="tab"]') : null;
    if (!tab || tab.dataset.tab === ui.tab) return;
    ui.tab = tab.dataset.tab;
    render();
  });
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    ui.tab = e.key === 'Home' ? 'active' : e.key === 'End' ? 'done' : ui.tab === 'active' ? 'done' : 'active';
    render();
    tabs.querySelector(`[data-tab="${ui.tab}"]`).focus();
  });

  $('#list-body').addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const pay = target.closest('[data-pay]');
    if (pay) {
      togglePaid(pay.dataset.pay, pay.dataset.month, pay);
      return;
    }
    const edit = target.closest('[data-edit]');
    if (edit) {
      startEdit(edit.dataset.edit);
      return;
    }
    const del = target.closest('[data-del]');
    if (del) {
      if (ui.armed === del.dataset.del) scheduleRemove(del.dataset.del);
      else arm(del.dataset.del);
      return;
    }
    if (target.closest('[data-open-add]')) {
      editor.open();
      return;
    }
    if (target.closest('[data-go-sms]')) {
      e.preventDefault();
      focusSms();
      return;
    }
    if (target.closest('[data-retry]')) {
      store.load().then(() => { ui.loadFailed = false; showBanner(''); render(); }).catch((err) => toast(errorText(err), 'error'));
    }
  });

  window.addEventListener('langchange', () => {
    render();
    if (editor.el && !editor.el.hidden) editor.texts();
  });
}

// ---------- boot ----------

store.subscribe(render);
bind();
await initPage({ active: 'installments', requireAuth: true, title: 'inst.doc' });
remindDues(store); // installment reminders (switched on in /account)
if (!store.loaded) {
  ui.loadFailed = true;
  render();
} else {
  handleUrl();
}
