// أقساطي — smart tips (rule-based, no AI) + the salary-day look-ahead. Pure (no DOM).
//
//   buildTips({ installments, payments, profile, today }, { lang: 'ar' | 'en', max: 3, exclude: [] })
//     → [{ id, tone: 'ok' | 'warn' | 'over' | 'info', title, body, action: { href, label } | null }]
//   duesBeforeSalary(installments, payments, salaryDay, today)
//     → { salaryDate, daysToSalary, salaryToday, items: [{ inst, date, amount }], count, total } | null

import {
  DEFAULT_SAFE_LIMIT, monthSummary, nextSalaryDate, nthDueDate, daysBetween, monthKey, monthsBetween, paidKeys,
  dueEventsInMonth, planCount, paymentAmount,
  round3, fmtKWD, fmtKWDEn, fmtPct, fmtMonth, fmtMonthEn, fmtDay, fmtDayEn, fmtCount, fmtCountEn,
} from '../../calc.js';

const PROVIDER_EN = {
  'تابي': 'Tabby', 'تمارا': 'Tamara', 'ديما': 'Deema', 'قرض بنك': 'Bank loan', 'بطاقة ائتمانية': 'Credit card', 'أخرى': 'Other',
};

const F = {
  // percentages are isolated (LRI…PDI) so «30.1%» never turns into «%30.1» inside Arabic text
  ar: { money: fmtKWD, pct: (x) => `⁦${fmtPct(x)}⁩`, month: fmtMonth, day: fmtDay, count: fmtCount, provider: (p) => String(p ?? '') },
  en: { money: fmtKWDEn, pct: fmtPct, month: fmtMonthEn, day: fmtDayEn, count: fmtCountEn, provider: (p) => PROVIDER_EN[p] || String(p ?? '') },
};

/** Unpaid installments due from today up to (not including) the next salary day. */
export function duesBeforeSalary(installments, payments, salaryDay, today) {
  const salaryDate = nextSalaryDate(salaryDay, today);
  if (!salaryDate) return null;
  const paid = paidKeys(payments);
  const items = [];
  for (const inst of installments || []) {
    // start at this month (earlier payments are all before today); open-ended plans have no end, the
    // salary date always stops the walk within a month or two
    const total = planCount(inst);
    for (let k = Math.max(0, monthsBetween(monthKey(inst.first_due_date), monthKey(today))); k < total; k += 1) {
      const date = nthDueDate(inst, k);
      if (date >= salaryDate) break;
      if (date < today || paid.has(`${inst.id}|${monthKey(date)}`)) continue;
      items.push({ inst, date, amount: paymentAmount(inst, k) });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
  return {
    salaryDate,
    daysToSalary: daysBetween(today, salaryDate),
    salaryToday: salaryDate === today,
    items,
    count: items.length,
    total: round3(items.reduce((s, i) => s + i.amount, 0)),
  };
}

const TEXT = {
  ar: {
    start: () => ({ title: 'ابدأ بأول قسط', body: 'أضف أقساطك من تابي وتمارا وديما والبنك، ونحسب لك المجموع والنسبة من راتبك بثواني.', action: { href: '/installments?add=1', label: 'أضف قسط' } }),
    salary: () => ({ title: 'حط راتبك', body: 'نحتاج راتبك عشان نعرف كم تاخذ الأقساط منه ونقولك إذا وضعك آمن.', action: { href: '#salary', label: 'حط الراتب' } }),
    free: () => ({ title: 'خالي من الأقساط 🎉', body: 'خلّصت كل أقساطك! قبل لا تقسّط شي جديد افحصه بـ«أقدر أشتريه؟».', action: { href: '/check', label: 'أقدر أشتريه؟' } }),
    over: (v, f) => ({
      title: 'متعدي حدك الآمن',
      body: `أقساطك ${f.pct(v.ratio)} من راتبك، يعني فوق حدك (${f.pct(v.limit)}) بـ ${f.money(v.overBy)} بالشهر. وقّف أي قسط جديد لين يخلص قسط ${f.provider(v.provider)} (${f.month(v.lastDue)}).`,
      action: { href: '/check', label: 'جرّب «ماذا لو؟»' },
    }),
    warn: (v, f) => ({ title: 'قربت من حدك', body: `باقي لك ${f.money(v.headroom)} بالشهر بس قبل لا تتعدى حدك الآمن. فكّر مرتين قبل أي قسط جديد.`, action: { href: '/check', label: 'أقدر أشتريه؟' } }),
    good: (v, f) => ({ title: 'وضعك مريح 👌', body: `أقساطك ${f.pct(v.ratio)} بس من راتبك، ويبقى لك ${f.money(v.free)} كل شهر. استمر كذا!`, action: null }),
    unmarked: (v, f) => ({ title: 'علّم الي دفعته', body: v.count === 1
      ? `${f.count(v.count)} استحق هالشهر وما علّمته «دفعت ✓» (${f.money(v.total)}). علّمه عشان تمشي سلسلتك 🔥`
      : `${f.count(v.count)} استحقت هالشهر وما علّمتها «دفعت ✓» (${f.money(v.total)}). علّمها عشان تمشي سلسلتك 🔥`, action: { href: '/installments', label: 'روح لأقساطي' } }),
    salaryRisk: (v, f) => ({ title: 'قبل الراتب', body: `${f.count(v.count)} ${v.count === 1 ? 'ينسحب' : 'تنسحب'} قبل راتبك الجاي (${f.day(v.salaryDate)}) ${v.count === 1 ? 'بمبلغ' : 'بمجموع'} ${f.money(v.total)}. تأكد إن رصيدك يكفي.`, action: null }),
    salaryDay: () => ({ title: 'متى ينزل راتبك؟', body: 'حط يوم الراتب ونقولك أي أقساط تنسحب قبله، عشان ما يجيك خصم وحسابك فاضي.', action: { href: '#salary', label: 'حط يوم الراتب' } }),
    biggest: (v, f) => ({ title: 'أكبر حمل عليك', body: `قسط ${f.provider(v.provider)} (${f.money(v.amount)}) ياخذ ${f.pct(v.share)} من التزامك الشهري. لو قدرت تخلصه بدري يرتاح راتبك.`, action: { href: '/check#whatif', label: 'جرّب «ماذا لو؟»' } }),
    closest: (v, f) => ({ title: 'قربت تخلص!', body: `باقي ${f.count(v.count)} على ${f.provider(v.provider)} ويخلص ${f.month(v.lastDue)}. بعدها يزيد لك ${f.money(v.amount)} كل شهر.`, action: null }),
    overOpen: (v, f) => ({
      title: 'متعدي حدك الآمن',
      body: `أقساطك ${f.pct(v.ratio)} من راتبك، يعني فوق حدك (${f.pct(v.limit)}) بـ ${f.money(v.overBy)} بالشهر. وقّف أي قسط جديد، وجرّب «ماذا لو؟» تشوف وش يفرق.`,
      action: { href: '/check#whatif', label: 'جرّب «ماذا لو؟»' },
    }),
    openEnded: (v, f) => ({
      title: 'أقساط بدون نهاية',
      body: `${f.count(v.count)} بدون تاريخ نهاية (${f.money(v.amount)} بالشهر). إذا عرفت كم باقي ${v.count === 1 ? 'عليه' : 'عليها'}، عدّله عشان نحسب لك متى تخلص.`,
      action: { href: '/installments', label: 'روح لأقساطي' },
    }),
  },
  en: {
    start: () => ({ title: 'Add your first installment', body: 'Add your Tabby, Tamara, Deema and bank installments and we work out the total and your salary ratio in seconds.', action: { href: '/installments?add=1', label: 'Add installment' } }),
    salary: () => ({ title: 'Add your salary', body: "We need your salary to see how much of it goes to installments and whether you're safe.", action: { href: '#salary', label: 'Add salary' } }),
    free: () => ({ title: 'Debt free 🎉', body: 'You finished all your installments! Before buying anything new on installments, run it through “Can I afford it?”.', action: { href: '/check', label: 'Can I afford it?' } }),
    over: (v, f) => ({
      title: 'Over your safe limit',
      body: `Installments take ${f.pct(v.ratio)} of your salary — ${f.money(v.overBy)} a month over your ${f.pct(v.limit)} limit. Hold off on new installments until ${f.provider(v.provider)} ends (${f.month(v.lastDue)}).`,
      action: { href: '/check', label: 'Try “What if?”' },
    }),
    warn: (v, f) => ({ title: 'Close to your limit', body: `Only ${f.money(v.headroom)} a month left before you pass your safe limit. Think twice before any new installment.`, action: { href: '/check', label: 'Can I afford it?' } }),
    good: (v, f) => ({ title: "You're comfortable 👌", body: `Installments take just ${f.pct(v.ratio)} of your salary, leaving ${f.money(v.free)} every month. Keep it up!`, action: null }),
    unmarked: (v, f) => ({ title: 'Mark what you paid', body: `${f.count(v.count)} came due this month and ${v.count === 1 ? "isn't" : "aren't"} marked paid (${f.money(v.total)}). ${v.count === 1 ? 'Mark it' : 'Mark them'} to keep your streak 🔥`, action: { href: '/installments', label: 'Go to installments' } }),
    salaryRisk: (v, f) => ({ title: 'Before payday', body: `${f.count(v.count)} will be charged before your next salary (${f.day(v.salaryDate)}), ${f.money(v.total)} in total. Make sure your balance covers it.`, action: null }),
    salaryDay: () => ({ title: 'When is payday?', body: "Set your salary day and we'll tell you which installments get charged before it, so nothing bounces.", action: { href: '#salary', label: 'Set payday' } }),
    biggest: (v, f) => ({ title: 'Your biggest burden', body: `${f.provider(v.provider)} (${f.money(v.amount)}) is ${f.pct(v.share)} of your monthly commitment. Paying it off early would free up your salary the most.`, action: { href: '/check#whatif', label: 'Try “What if?”' } }),
    closest: (v, f) => ({ title: 'Almost done!', body: `${f.count(v.count)} left on ${f.provider(v.provider)}, finishing ${f.month(v.lastDue)}. After that you keep ${f.money(v.amount)} more every month.`, action: null }),
    overOpen: (v, f) => ({
      title: 'Over your safe limit',
      body: `Installments take ${f.pct(v.ratio)} of your salary — ${f.money(v.overBy)} a month over your ${f.pct(v.limit)} limit. Hold off on new installments and try “What if?” to see what helps.`,
      action: { href: '/check#whatif', label: 'Try “What if?”' },
    }),
    openEnded: (v, f) => ({
      title: 'Open-ended installments',
      body: `${f.count(v.count)} with no end date (${f.money(v.amount)} a month). If you find out what's left, edit ${v.count === 1 ? 'it' : 'them'} so we can tell you when you'll be done.`,
      action: { href: '/installments', label: 'Go to installments' },
    }),
  },
};

export const TIP_IDS = Object.keys(TEXT.ar);

export function buildTips(input, { lang = 'ar', max = 3, exclude = [] } = {}) {
  const { installments = [], payments = [], profile = null, today } = input || {};
  const salary = Number(profile?.salary) || 0;
  const limit = Number(profile?.safe_limit) || DEFAULT_SAFE_LIMIT;
  const s = monthSummary(installments, salary, limit, today);
  const raw = [];
  const add = (id, tone, priority, vars = {}) => raw.push({ id, tone, priority, vars });

  if (!installments.length) {
    add('start', 'info', 80);
    if (!salary) add('salary', 'info', 70);
  } else {
    if (!s.active.length) add('free', 'ok', 100);
    if (!salary && s.active.length) add('salary', 'info', 90);

    if (s.active.length) {
      // open-ended installments never finish: «closest», «biggest» and the «over» end date use finite ones only
      // (a seedless reduce over [] would throw, and null <= 3 is true in JS)
      const finite = s.active.filter((i) => !i.open);
      const soonest = finite.length
        ? finite.reduce((a, b) => (b.remaining < a.remaining || (b.remaining === a.remaining && b.lastDue < a.lastDue) ? b : a))
        : null;
      if (s.level === 'over') {
        const overBy = round3(s.monthlyTotal - s.limitAmount);
        if (soonest) add('over', 'over', 100, { ratio: s.ratio, limit, overBy, provider: soonest.provider, lastDue: soonest.lastDue });
        else add('overOpen', 'over', 100, { ratio: s.ratio, limit, overBy });
      } else if (s.level === 'warn') {
        add('warn', 'warn', 82, { headroom: round3(s.limitAmount - s.monthlyTotal) });
      } else if (s.level === 'ok') {
        add('good', 'ok', 64, { ratio: s.ratio, free: s.freeAfter });
      }

      // came due this month (on or before today) but not marked paid
      const paid = paidKeys(payments);
      const cur = monthKey(today);
      const late = dueEventsInMonth(installments, cur).filter((e) => e.date <= today && !paid.has(`${e.inst.id}|${cur}`));
      if (late.length) add('unmarked', 'warn', 78, { count: late.length, total: round3(late.reduce((t, e) => t + e.amount, 0)) });

      if (profile?.salary_day != null) {
        const d = duesBeforeSalary(installments, payments, profile.salary_day, today);
        if (d && d.count) add('salaryRisk', 'warn', 72, { count: d.count, total: d.total, salaryDate: d.salaryDate });
      } else if (salary) {
        add('salaryDay', 'info', 44);
      }

      const closest = Boolean(soonest && soonest.remaining <= 3);
      if (closest) {
        add('closest', 'ok', 62, { provider: soonest.provider, count: soonest.remaining, lastDue: soonest.lastDue, amount: soonest.monthly });
      }
      if (s.active.length >= 2 && finite.length >= 1) {
        const biggest = finite.reduce((a, b) => (b.monthly > a.monthly ? b : a));
        const sameAsClosest = closest && biggest.id === soonest.id;
        if (!sameAsClosest && s.monthlyTotal > 0) {
          add('biggest', 'info', 58, { provider: biggest.provider, amount: biggest.monthly, share: (biggest.monthly / s.monthlyTotal) * 100 });
        }
      }
      if (s.openCount > 0) add('openEnded', 'info', 40, { count: s.openCount, amount: s.openMonthly });
    }
  }

  const f = F[lang] || F.ar;
  const words = TEXT[lang] || TEXT.ar;
  return raw
    .filter((r) => !exclude.includes(r.id))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(0, max))
    .map((r) => ({ id: r.id, tone: r.tone, ...words[r.id](r.vars, f) }));
}
