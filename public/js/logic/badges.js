// أقساطي — achievement badges (أوسمة). Pure (no DOM): computeBadges(state, today) → [{ id, unlocked, progress }].
// Text lives here too (Arabic + English) so the page and the tests read the same wording.

import { installmentStatus, monthSummary, DEFAULT_SAFE_LIMIT, dueInMonth, todayISO } from '../../calc.js';
import { computeStreak } from './streak.js';

/** Display order. */
export const BADGE_IDS = ['first_add', 'planner', 'under_limit', 'paid_month', 'early_bird', 'streak3', 'first_finish', 'debt_free'];

const TEXT = {
  ar: {
    first_add: { title: 'أول خطوة', desc: 'أضفت أول قسط لك', hint: 'أضف أول قسط' },
    planner: { title: 'المخطط', desc: 'حطيت راتبك ويوم نزوله', hint: 'حط راتبك ويوم الراتب' },
    under_limit: { title: 'تحت الحد الآمن', desc: 'أقساطك ضمن حدك الآمن من الراتب', hint: 'خل أقساطك تحت حدك الآمن' },
    paid_month: { title: 'شهر مكتمل', desc: 'علّمت كل أقساط هالشهر «دفعت ✓»', hint: 'علّم كل أقساط الشهر مدفوعة' },
    early_bird: { title: 'سبّاق', desc: 'دفعت قسط قبل موعده', hint: 'علّم قسط مدفوع قبل موعده' },
    streak3: { title: '3 شهور التزام', desc: '3 شهور ورا بعض دفعت فيها كل أقساطك', hint: '3 شهور ورا بعض بدون ما يفوتك قسط' },
    first_finish: { title: 'أول قسط يخلص', desc: 'خلّصت قسط كامل', hint: 'خلّص أول قسط' },
    debt_free: { title: 'خالي من الأقساط', desc: 'ما عليك ولا قسط', hint: 'خلّص كل أقساطك' },
  },
  en: {
    first_add: { title: 'First step', desc: 'You added your first installment', hint: 'Add your first installment' },
    planner: { title: 'Planner', desc: 'You set your salary and payday', hint: 'Set your salary and payday' },
    under_limit: { title: 'Under the limit', desc: 'Your installments are within your safe limit', hint: 'Keep installments under your safe limit' },
    paid_month: { title: 'Month complete', desc: 'Every installment this month is marked paid', hint: "Mark all of this month's installments paid" },
    early_bird: { title: 'Early bird', desc: 'You paid an installment before its due date', hint: 'Mark one paid before its due date' },
    streak3: { title: '3-month streak', desc: 'Three months in a row with everything paid', hint: 'Three months in a row without missing one' },
    first_finish: { title: 'First one done', desc: 'You finished an installment plan', hint: 'Finish your first installment' },
    debt_free: { title: 'Debt free', desc: 'Not a single installment left', hint: 'Finish all your installments' },
  },
};

/** { title, desc, hint } for a badge in 'ar' | 'en'. */
export function badgeText(id, lang = 'ar') {
  return (TEXT[lang] || TEXT.ar)[id] || TEXT.ar[id] || { title: id, desc: '', hint: '' };
}

/** A paid_at timestamp as the local calendar day ('YYYY-MM-DD'); bad input → null. */
function localDay(stamp) {
  const d = new Date(stamp);
  return Number.isNaN(d.getTime()) ? null : todayISO(d);
}

/**
 * state = { installments, payments, profile }, today = 'YYYY-MM-DD'.
 * → [{ id, unlocked, progress: { value, target } | null }] in BADGE_IDS order.
 */
export function computeBadges(state, today) {
  const installments = state?.installments || [];
  const payments = state?.payments || [];
  const profile = state?.profile || null;
  const salary = Number(profile?.salary) || 0;
  const limit = Number(profile?.safe_limit) || DEFAULT_SAFE_LIMIT;
  const summary = monthSummary(installments, salary, limit, today);
  const streak = computeStreak(installments, payments, today);
  const byId = new Map(installments.map((i) => [i.id, i]));

  const early = payments.some((p) => {
    const inst = byId.get(p.installment_id);
    if (!inst) return false;
    const due = dueInMonth(inst, p.month);
    const paidOn = localDay(p.paid_at);
    return Boolean(due && paidOn && paidOn < due);
  });
  const finishedOne = installments.some((i) => installmentStatus(i, today).remaining === 0);

  const out = {
    first_add: { unlocked: installments.length > 0, progress: { value: Math.min(1, installments.length), target: 1 } },
    planner: {
      unlocked: salary > 0 && profile?.salary_day != null,
      progress: { value: (salary > 0 ? 1 : 0) + (profile?.salary_day != null ? 1 : 0), target: 2 },
    },
    under_limit: { unlocked: salary > 0 && summary.active.length > 0 && summary.level !== 'over', progress: null },
    paid_month: {
      unlocked: streak.thisMonth.complete,
      progress: streak.thisMonth.due ? { value: streak.thisMonth.paid, target: streak.thisMonth.due } : null,
    },
    early_bird: { unlocked: early, progress: null },
    streak3: { unlocked: streak.best >= 3, progress: { value: Math.min(3, streak.best), target: 3 } },
    first_finish: { unlocked: finishedOne, progress: null },
    debt_free: { unlocked: installments.length > 0 && summary.active.length === 0, progress: null },
  };
  return BADGE_IDS.map((id) => ({ id, ...out[id] }));
}

/** Badges unlocked now that were not in `before` (an array of ids). */
export function newlyUnlocked(before, badges) {
  const had = new Set(before || []);
  return badges.filter((b) => b.unlocked && !had.has(b.id)).map((b) => b.id);
}
