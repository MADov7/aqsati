// أقساطي — أقدر أشتريه؟: the affordability check (calc.affordability) with a verdict, the minimum safe number of
// installments and «أضفه لأقساطي», plus the «ماذا لو؟» simulator (salary −30%..+50%, finish installments early).
import {
  initPage, store, t, registerStrings, getLang, fmt, toast, showBanner, errorText, saveProfile, $, $$, esc, fx,
} from '../core.js';
import * as C from '../../calc.js';

// ---------- strings ----------

registerStrings({
  ar: {
    'chk.doc': 'أقدر أشتريه؟',
    'chk.kicker': 'قبل لا تقسّط',
    'chk.title': 'أقدر أشتريه؟',
    'chk.desc': 'حط السعر وعدد الأقساط، ونقولك إذا يمشي مع راتبك وحدك الآمن، وكم أقل عدد أقساط يخليك مرتاح.',
    'chk.whatifJump': 'جرّب «ماذا لو؟»',
    'chk.formTitle': 'شنو بتشتري؟',
    'chk.formHint': 'النتيجة تتحدّث وأنت تكتب',
    'chk.what': 'اسم الغرض',
    'chk.whatPh': 'مثال: لابتوب',
    'chk.price': 'السعر الكلي',
    'chk.count': 'عدد الأقساط',
    'chk.countQuick': 'اختيار سريع:',
    'chk.provider': 'مع أي جهة؟',
    'chk.providerNone': 'ما حددت للحين',
    'chk.submit': 'افحص',
    'chk.resultTitle': 'الحكم',
    'chk.resultHint': 'على حسب راتبك وأقساطك الحالية',
    'chk.emptyTitle': 'النتيجة تطلع هني',
    'chk.emptyDesc': 'حط السعر وعدد الأقساط، ونقولك بثانية إذا تقدر.',
    'chk.err.price': 'حط سعر صحيح أكبر من صفر',
    'chk.err.count': 'عدد من 1 إلى 360',
    'chk.okTitle': 'إي، تقدر ✓',
    'chk.warnTitle': 'تقدر، بس بتقرب من حدك',
    'chk.overTitle': 'لا، بتتعدى حدك الآمن ✗',
    'chk.okBody': 'قسطه {monthly} بالشهر، ونسبتك بتصير {ratio} من راتبك (حدك {limit}).',
    'chk.warnBody': 'قسطه {monthly} بالشهر، ونسبتك بتصير {ratio}. يبقى لك {room} بس بالشهر قبل لا توصل حدك.',
    'chk.overBody': 'قسطه {monthly} بالشهر، ونسبتك بتصير {ratio}، يعني فوق حدك بـ {over} بالشهر.',
    'chk.alreadyOver': 'أنت أصلاً متعدي حدك قبل هالشراء. الأفضل تخلص قسط قبل لا تاخذ جديد.',
    'chk.suggest': 'لو قسّطته على {count} أو أكثر، يصير ضمن حدك ({monthly} بالشهر).',
    'chk.suggestTry': 'جرّب على {n} قسط',
    'chk.suggestNone': 'حتى لو قسّطته على 360 قسط ما يمشي مع حدك. وفّر له أو خلّص قسط أول.',
    'chk.kvMonthly': 'قسطه الشهري',
    'chk.kvTotal': 'التزامك بعد الشراء',
    'chk.kvFree': 'يبقى لك من الراتب',
    'chk.kvLimit': 'حدك الآمن بالشهر',
    'chk.kvEnds': 'آخر قسط تقريباً',
    'chk.now': 'نسبتك الحين',
    'chk.after': 'بعد الشراء',
    'chk.legendNow': 'أقساطك الحالية',
    'chk.legendNew': 'الشراء الجديد',
    'chk.ringLabel': 'نسبتك بعد الشراء {ratio} من راتبك، الحين {now}، وحدك {limit}.',
    'chk.add': 'أضفه لأقساطي',
    'chk.toWhatif': 'شوفه بـ«ماذا لو؟»',
    'chk.status': '{title}: {body}',
    'chk.needSalary': 'حط راتبك أول',
    'chk.needSalaryBody': 'نحتاج راتبك عشان نحسب نسبتك ونحكم.',

    'sal.quickTitle': 'كم راتبك؟',
    'sal.quickBody': 'نحتاجه عشان نحسب نسبة أقساطك ونحكم على أي شراء جديد. ينحفظ لك وتقدر تغيّره من لوحتك.',
    'sal.quickLabel': 'راتبك الشهري',
    'sal.quickSave': 'احفظ',
    'sal.quickSaved': 'انحفظ الراتب ✓',
    'sal.quickErr': 'حط راتب صحيح أكبر من صفر',

    'wi.title': 'ماذا لو؟',
    'wi.hint': 'حرّك راتبك أو خلّص قسط بدري، وشوف وضعك يتغيّر على طول.',
    'wi.reset': 'رجّع كل شي',
    'wi.salary': 'لو تغيّر راتبك',
    'wi.salaryNow': 'راتبك بيصير {salary}',
    'wi.salaryText': '{pct} ({salary})',
    'wi.early': 'لو خلّصت قسط بدري',
    'wi.earlyItem': '{amount} بالشهر · تحتاج {payoff} عشان تخلصه',
    'wi.earlyNone': 'ما عندك أقساط نشطة.',
    'wi.purchase': 'مع الشراء الي فحصته ({amount} بالشهر)',
    'wi.ofSalary': 'من الراتب',
    'wi.kvSalary': 'الراتب',
    'wi.kvMonthly': 'الالتزام الشهري',
    'wi.kvFree': 'يبقى لك',
    'wi.kvDelta': 'الفرق عن الحين',
    'wi.more': 'زيادة',
    'wi.less': 'نقص',
    'wi.kvPayoff': 'مبلغ السداد المبكر',
    'wi.nowVs': 'الحين {now} ← بعدين {next}',
    'wi.status': 'لو راتبك {salary} والتزامك {monthly}: نسبتك {ratio} ويبقى لك {free}. {level}',
    'wi.needSalary': 'حط راتبك فوق عشان تقدر تجرّب «ماذا لو؟».',
    'wi.ringLabel': 'النسبة في هالسيناريو {ratio} من الراتب، وحدك {limit}.',
  },
  en: {
    'chk.doc': 'Can I afford it?',
    'chk.kicker': 'Before you split it',
    'chk.title': 'Can I afford it?',
    'chk.desc': "Enter the price and number of payments and we'll tell you if it fits your salary and safe limit — and the fewest payments that keep you comfortable.",
    'chk.whatifJump': 'Try “What if?”',
    'chk.formTitle': 'What are you buying?',
    'chk.formHint': 'The result updates as you type',
    'chk.what': 'Item',
    'chk.whatPh': 'e.g. Laptop',
    'chk.price': 'Total price',
    'chk.count': 'Number of payments',
    'chk.countQuick': 'Quick pick:',
    'chk.provider': 'With which provider?',
    'chk.providerNone': 'Not decided yet',
    'chk.submit': 'Check',
    'chk.resultTitle': 'Verdict',
    'chk.resultHint': 'Based on your salary and current installments',
    'chk.emptyTitle': 'Your result shows up here',
    'chk.emptyDesc': "Enter the price and number of payments and we'll tell you in a second.",
    'chk.err.price': 'Enter a valid price above zero',
    'chk.err.count': 'A number from 1 to 360',
    'chk.okTitle': 'Yes, you can ✓',
    'chk.warnTitle': "You can, but you'll be close to your limit",
    'chk.overTitle': "No — you'd pass your safe limit ✗",
    'chk.okBody': 'That is {monthly} a month, taking your ratio to {ratio} of your salary (limit {limit}).',
    'chk.warnBody': 'That is {monthly} a month, taking your ratio to {ratio}. Only {room} a month left before your limit.',
    'chk.overBody': "That is {monthly} a month, taking your ratio to {ratio} — {over} a month over your limit.",
    'chk.alreadyOver': "You're already over your limit before this purchase. Better to finish an installment first.",
    'chk.suggest': 'Split it over {count} or more and it fits your limit ({monthly} a month).',
    'chk.suggestTry': 'Try {n} payments',
    'chk.suggestNone': "Even over 360 payments it won't fit your limit. Save up for it or finish an installment first.",
    'chk.kvMonthly': 'Monthly payment',
    'chk.kvTotal': 'Commitment after buying',
    'chk.kvFree': 'Left from salary',
    'chk.kvLimit': 'Safe limit per month',
    'chk.kvEnds': 'Last payment (approx.)',
    'chk.now': 'Your ratio now',
    'chk.after': 'After buying',
    'chk.legendNow': 'Current installments',
    'chk.legendNew': 'New purchase',
    'chk.ringLabel': 'After buying your ratio is {ratio} of your salary, now {now}, limit {limit}.',
    'chk.add': 'Add to my installments',
    'chk.toWhatif': 'See it in “What if?”',
    'chk.status': '{title}: {body}',
    'chk.needSalary': 'Add your salary first',
    'chk.needSalaryBody': 'We need your salary to work out your ratio.',

    'sal.quickTitle': "What's your salary?",
    'sal.quickBody': 'We need it to work out your installment ratio and judge any new purchase. It is saved and you can change it from your dashboard.',
    'sal.quickLabel': 'Monthly salary',
    'sal.quickSave': 'Save',
    'sal.quickSaved': 'Salary saved ✓',
    'sal.quickErr': 'Enter a valid salary above zero',

    'wi.title': 'What if?',
    'wi.hint': 'Move your salary or pay something off early and watch your situation change instantly.',
    'wi.reset': 'Reset',
    'wi.salary': 'If your salary changes',
    'wi.salaryNow': 'Your salary becomes {salary}',
    'wi.salaryText': '{pct} ({salary})',
    'wi.early': 'If you pay one off early',
    'wi.earlyItem': '{amount} a month · {payoff} to pay it off',
    'wi.earlyNone': 'You have no active installments.',
    'wi.purchase': 'Include the purchase you checked ({amount} a month)',
    'wi.ofSalary': 'of salary',
    'wi.kvSalary': 'Salary',
    'wi.kvMonthly': 'Monthly commitment',
    'wi.kvFree': 'Left over',
    'wi.kvDelta': 'Change vs now',
    'wi.more': 'up',
    'wi.less': 'down',
    'wi.kvPayoff': 'Early payoff needed',
    'wi.nowVs': 'Now {now} → then {next}',
    'wi.status': 'With a salary of {salary} and {monthly} in installments: ratio {ratio}, {free} left. {level}',
    'wi.needSalary': 'Add your salary above to try “What if?”.',
    'wi.ringLabel': 'In this scenario installments take {ratio} of your salary; your limit is {limit}.',
  },
});

// ---------- helpers ----------

const num = (s) => `<span class="num">${esc(s)}</span>`;
const today = () => C.todayISO();
const salaryOf = (st) => Number(st.profile?.salary) || 0;
const limitOf = (st) => Number(st.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT);

function verdictIcon(ok) {
  return `<svg class="verdict-ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="19"/>${
    ok ? '<path d="M12 20.5l5.5 5.5L28.5 14"/>' : '<path d="M14 14l12 12M26 14L14 26"/>'}</svg>`;
}

function ringSVG({ ratio, nowRatio = null, level, limit, showTick = true }) {
  const tick = showTick ? `<g transform="rotate(${(Math.min(100, limit) * 3.6).toFixed(1)} 80 80)"><line class="ring-tick" x1="80" y1="2" x2="80" y2="26"/></g>` : '';
  return `
    <svg class="ring" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <circle class="ring-track" cx="80" cy="80" r="66"/>
      <circle class="ring-fill lvl-${level}" cx="80" cy="80" r="66" transform="rotate(-90 80 80)" data-ring="${ratio}"/>
      ${nowRatio != null ? `<circle class="ring-fill ring-now" cx="80" cy="80" r="66" transform="rotate(-90 80 80)" data-ring="${nowRatio}"/>` : ''}
      ${tick}
    </svg>`;
}

// ---------- page state ----------

const check = { value: null, result: null, shownRatio: 0, tone: '' };
const wi = { pct: 0, early: new Set(), purchase: false, shownRatio: 0, key: '' };
let statusTimer = 0;
let liveTimer = 0;
let loadFailed = false;

function current(st) {
  return C.monthSummary(st.installments, salaryOf(st), limitOf(st), today());
}

// ---------- salary (only when missing) ----------

function renderSalarySlot(st) {
  const slot = $('#salary-slot');
  if (salaryOf(st) > 0) {
    if (slot.firstChild) slot.replaceChildren();
    return;
  }
  if (slot.querySelector('form')) {
    slot.querySelector('.sq-title').textContent = t('sal.quickTitle');
    slot.querySelector('.sq-body').textContent = t('sal.quickBody');
    slot.querySelector('label').textContent = t('sal.quickLabel');
    slot.querySelector('.sq-save').textContent = t('sal.quickSave');
    slot.querySelector('.input-affix').textContent = t('common.kwd');
    return;
  }
  slot.innerHTML = `
    <section class="card salary-quick" aria-labelledby="sq-t">
      <div class="sq-text">
        <h2 class="sq-title" id="sq-t">${esc(t('sal.quickTitle'))}</h2>
        <p class="sq-body">${esc(t('sal.quickBody'))}</p>
      </div>
      <form class="sq-form" novalidate>
        <div class="field">
          <label for="sq-salary">${esc(t('sal.quickLabel'))}</label>
          <div class="input-group" dir="ltr">
            <input id="sq-salary" inputmode="decimal" autocomplete="off" placeholder="1200" aria-describedby="sq-err">
            <span class="input-affix">${esc(t('common.kwd'))}</span>
          </div>
          <p class="err" id="sq-err" aria-live="polite"></p>
        </div>
        <button type="submit" class="btn btn-gold sq-save">${esc(t('sal.quickSave'))}</button>
      </form>
    </section>`;
  slot.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = slot.querySelector('#sq-salary');
    const salary = C.round3(C.parseAmount(input.value));
    const err = slot.querySelector('#sq-err');
    if (!(salary > 0) || salary >= 1e6) {
      err.textContent = t('sal.quickErr');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    const btn = slot.querySelector('.sq-save');
    btn.disabled = true;
    try {
      await saveProfile({ salary });
      showBanner('');
      toast(t('sal.quickSaved'), 'ok');
      $('#chk-price').focus({ preventScroll: true });
    } catch (ex) {
      err.textContent = errorText(ex);
      btn.disabled = false;
    }
  });
}

// ---------- the check ----------

function readForm() {
  return C.validateCheckInput({ price: $('#chk-price').value, count: $('#chk-count').value });
}

function showErrors(errors) {
  $$('#check-form [data-err]').forEach((p) => {
    const key = p.dataset.err;
    p.textContent = errors[key] ? t(`chk.err.${key}`) : '';
    const input = p.closest('.field')?.querySelector('input');
    if (input) input.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  });
}

function syncCountChips() {
  const v = $('#chk-count').value.trim();
  $$('.count-chips [data-count]').forEach((b) => b.setAttribute('aria-pressed', String(String(C.parseWhole(v)) === b.dataset.count)));
}

function fillProviders() {
  const sel = $('#chk-provider');
  const value = sel.value;
  sel.innerHTML = `<option value="">${esc(t('chk.providerNone'))}</option>${C.PROVIDERS.map((p) => `<option value="${esc(p)}">${esc(fmt.provider(p))}</option>`).join('')}`;
  sel.value = value;
}

function addHref(r, value) {
  const q = new URLSearchParams({ add: '1', from: 'check', monthly: r.newMonthly.toFixed(3), remaining: String(value.count) });
  const title = $('#chk-title').value.trim();
  const provider = $('#chk-provider').value;
  if (title) q.set('title', title.slice(0, 80));
  if (provider) q.set('provider', provider);
  return `/installments?${q}`;
}

function renderResult({ announce = false } = {}) {
  const box = $('#result-body');
  const st = store.state;
  if (!check.value) return;
  const salary = salaryOf(st);
  if (!(salary > 0)) {
    check.result = null;
    box.innerHTML = `<div class="verdict over">${verdictIcon(false)}<strong>${esc(t('chk.needSalary'))}</strong><p>${esc(t('chk.needSalaryBody'))}</p></div>`;
    return;
  }
  const limit = limitOf(st);
  const s = current(st);
  const { price, count } = check.value;
  const r = C.affordability({ price, count, salary, safeLimit: limit, currentMonthly: s.monthlyTotal });
  check.result = r;
  const level = r.ok ? C.levelFor(r.newRatio, limit) : 'over';
  const tone = r.ok ? (level === 'warn' ? 'warn' : 'ok') : 'over';
  const vars = {
    monthly: num(fmt.money(r.newMonthly)),
    ratio: num(fmt.pct(r.newRatio)),
    limit: num(fmt.pct(limit)),
    over: num(fmt.money(r.overBy)),
    room: num(fmt.money(Math.max(0, r.limitAmount - r.newTotal))),
  };
  const title = t(`chk.${tone}Title`);
  const body = t(`chk.${tone}Body`, vars);
  let extra = '';
  if (!r.ok) {
    if (r.alreadyOver) extra += `<p>${esc(t('chk.alreadyOver'))}</p>`;
  }
  let suggest = '';
  if (!r.ok && !r.alreadyOver) {
    suggest = r.minSafeCount && r.minSafeCount <= 360
      ? `<div class="alert tone-info suggest">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>
          <div><p>${t('chk.suggest', { count: esc(fmt.count(r.minSafeCount)), monthly: num(fmt.money(C.round3(price / r.minSafeCount))) })}</p>
          <button type="button" class="btn btn-ghost btn-sm" data-try="${r.minSafeCount}">${esc(t('chk.suggestTry', { n: r.minSafeCount }))}</button></div>
        </div>`
      : `<div class="alert tone-warn suggest"><p>${esc(t('chk.suggestNone'))}</p></div>`;
  }
  const first = C.firstDueDate(new Date().getDate(), today());
  const lastDue = C.nthDueDate({ first_due_date: first, due_day: Number(first.slice(8)), remaining_count: count }, count - 1);
  const freeAfter = C.round3(salary - r.newTotal);

  // the verdict pops in when it changes, not on every keystroke
  const still = check.tone === tone ? ' is-static' : '';
  check.tone = tone;
  box.innerHTML = `
    <div class="verdict ${tone}${still}">${verdictIcon(r.ok)}<strong>${esc(title)}</strong><p>${body}</p>${extra}</div>
    <div class="result-grid">
      <figure class="gauge result-ring">
        <div class="gauge-dial" role="img" aria-label="${esc(t('chk.ringLabel', { ratio: fmt.pct(r.newRatio), now: fmt.pct(r.currentRatio), limit: fmt.pct(limit) }))}">
          ${ringSVG({ ratio: r.newRatio, nowRatio: r.currentRatio, level, limit })}
          <div class="gauge-center" aria-hidden="true">
            <strong class="num lvl-${level}" data-count-ratio>${esc(fmt.pct(r.newRatio))}</strong>
            <span>${esc(t('chk.after'))}</span>
          </div>
        </div>
        <figcaption class="ring-legend" aria-hidden="true">
          <span><i class="lg-now"></i>${esc(t('chk.legendNow'))}</span>
          <span><i class="lg-new lvl-${level}"></i>${esc(t('chk.legendNew'))}</span>
        </figcaption>
      </figure>
      <dl class="kv">
        <div><dt>${esc(t('chk.kvMonthly'))}</dt><dd>${num(fmt.money(r.newMonthly))}</dd></div>
        <div><dt>${esc(t('chk.kvTotal'))}</dt><dd>${num(fmt.money(r.newTotal))}</dd></div>
        <div><dt>${esc(t('chk.kvFree'))}</dt><dd class="${freeAfter < 0 ? 'lvl-over' : ''}">${num(fmt.money(freeAfter))}</dd></div>
        <div><dt>${esc(t('chk.kvLimit'))}</dt><dd>${num(fmt.money(r.limitAmount))}</dd></div>
        <div><dt>${esc(t('chk.kvEnds'))}</dt><dd>${num(fmt.month(lastDue))}</dd></div>
      </dl>
    </div>
    <div class="compare">
      <div><span>${esc(t('chk.now'))}</span><b class="num">${esc(fmt.pct(r.currentRatio))}</b><span class="mini-meter" aria-hidden="true"><i class="lvl-${C.levelFor(r.currentRatio, limit)}" data-w="${r.currentRatio}"></i><u></u></span></div>
      <div><span>${esc(t('chk.after'))}</span><b class="num lvl-${level}">${esc(fmt.pct(r.newRatio))}</b><span class="mini-meter" aria-hidden="true"><i class="lvl-${level}" data-w="${r.newRatio}"></i><u></u></span></div>
    </div>
    ${suggest}
    <div class="result-actions">
      <a class="btn btn-gold" href="${esc(addHref(r, check.value))}">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>
        <span>${esc(t('chk.add'))}</span>
      </a>
      <button type="button" class="btn btn-ghost" data-to-whatif>${esc(t('chk.toWhatif'))}</button>
    </div>`;

  box.querySelectorAll('.mini-meter u').forEach((u) => { u.style.insetInlineStart = `${Math.min(100, limit)}%`; });
  box.querySelectorAll('.mini-meter i').forEach((i) => fx.setWidth(i, Number(i.dataset.w)));
  const rings = box.querySelectorAll('[data-ring]');
  fx.setRing(rings[0], r.newRatio, check.shownRatio);
  if (rings[1]) fx.setRing(rings[1], r.currentRatio, 0);
  fx.countUp(box.querySelector('[data-count-ratio]'), check.shownRatio, r.newRatio, fmt.pct, 700);
  check.shownRatio = r.newRatio;

  if (announce) {
    const tmp = document.createElement('div');
    tmp.innerHTML = body;
    $('#chk-status').textContent = t('chk.status', { title, body: tmp.textContent });
  }
  // the purchase can now be included in «ماذا لو؟»
  renderWhatif();
}

function evaluate({ submit = false } = {}) {
  const v = readForm();
  syncCountChips();
  if (submit) showErrors(v.errors);
  else {
    // clear errors of fields that became valid while typing
    const shownErr = {};
    $$('#check-form [data-err]').forEach((p) => { if (p.textContent && v.errors[p.dataset.err]) shownErr[p.dataset.err] = true; });
    showErrors(shownErr);
  }
  if (!v.ok) {
    if (submit) {
      const first = ['price', 'count'].find((k) => v.errors[k]);
      $(`#chk-${first}`)?.focus();
    }
    return;
  }
  check.value = v.value;
  renderResult({ announce: submit });
  if (submit) $('#result-h').focus({ preventScroll: false });
}

// ---------- «ماذا لو؟» ----------

function renderWhatif() {
  const box = $('#whatif-body');
  const st = store.state;
  const salary = salaryOf(st);
  if (!store.loaded) return;
  if (!(salary > 0)) {
    wi.key = 'nosalary';
    box.innerHTML = `<p class="alert tone-info wi-need">${esc(t('wi.needSalary'))}</p>`;
    return;
  }
  const s = current(st);
  for (const id of [...wi.early]) if (!s.active.some((i) => i.id === id)) wi.early.delete(id);
  const key = `${getLang()}|${s.active.map((i) => `${i.id}:${i.monthly}:${i.remaining}`).join(',')}|${check.result ? check.result.newMonthly : ''}|${salary}`;
  if (key !== wi.key) {
    wi.key = key;
    const active = document.activeElement;
    const fk = active && box.contains(active) ? active.getAttribute('data-fk') : null;
    if (!check.result) wi.purchase = false;
    box.innerHTML = `
      <div class="wi-grid">
        <div class="wi-controls">
          <div class="wi-block">
            <div class="wi-row">
              <label class="field-label" for="wi-salary">${esc(t('wi.salary'))}</label>
              <output class="wi-out num" id="wi-salary-out" for="wi-salary" dir="ltr"></output>
            </div>
            <input type="range" id="wi-salary" data-fk="salary" min="-30" max="50" step="5" value="${wi.pct}" aria-describedby="wi-salary-now">
            <div class="wi-scale" aria-hidden="true"><span dir="ltr">−30%</span><span class="wi-zero" dir="ltr">0%</span><span dir="ltr">+50%</span></div>
            <p class="hint" id="wi-salary-now"></p>
          </div>
          <fieldset class="wi-block wi-early">
            <legend class="field-label">${esc(t('wi.early'))}</legend>
            ${s.active.length ? s.active.map((i) => `
              <label class="switch wi-switch">
                <input type="checkbox" role="switch" data-early="${esc(i.id)}" data-fk="early:${esc(i.id)}"${wi.early.has(i.id) ? ' checked' : ''}>
                <span class="wi-sw-text">
                  <b>${esc(fmt.provider(i.provider))}${i.title ? ` · <bdi dir="auto">${esc(i.title)}</bdi>` : ''}</b>
                  <small>${t('wi.earlyItem', { amount: num(fmt.money(i.monthly)), payoff: num(fmt.money(i.remainingTotal)) })}</small>
                </span>
              </label>`).join('') : `<p class="hint">${esc(t('wi.earlyNone'))}</p>`}
          </fieldset>
          ${check.result ? `
          <div class="wi-block">
            <label class="switch wi-switch wi-purchase">
              <input type="checkbox" role="switch" id="wi-purchase" data-fk="purchase"${wi.purchase ? ' checked' : ''}>
              <span class="wi-sw-text"><b>${t('wi.purchase', { amount: num(fmt.money(check.result.newMonthly)) })}</b></span>
            </label>
          </div>` : ''}
        </div>
        <div class="wi-result">
          <figure class="gauge lg">
            <div class="gauge-dial" role="img" id="wi-dial">
              ${ringSVG({ ratio: 0, level: 'ok', limit: limitOf(st) })}
              <div class="gauge-center" aria-hidden="true">
                <strong class="num" id="wi-ratio">—</strong>
                <span>${esc(t('wi.ofSalary'))}</span>
              </div>
            </div>
            <figcaption class="gauge-cap" id="wi-nowvs"></figcaption>
          </figure>
          <span class="chip" id="wi-level"></span>
          <dl class="kv wi-kv">
            <div><dt>${esc(t('wi.kvSalary'))}</dt><dd class="num" id="wi-k-salary"></dd></div>
            <div><dt>${esc(t('wi.kvMonthly'))}</dt><dd class="num" id="wi-k-monthly"></dd></div>
            <div><dt>${esc(t('wi.kvFree'))}</dt><dd class="num" id="wi-k-free"></dd></div>
            <div><dt>${esc(t('wi.kvDelta'))}</dt><dd class="num" id="wi-k-delta"></dd></div>
            <div><dt>${esc(t('wi.kvPayoff'))}</dt><dd class="num" id="wi-k-payoff"></dd></div>
          </dl>
        </div>
      </div>`;
    if (fk) box.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
  }
  updateWhatif(false);
}

function updateWhatif(announce = true) {
  const st = store.state;
  const salary = salaryOf(st);
  const box = $('#whatif-body');
  if (!(salary > 0) || !box.querySelector('#wi-salary')) return;
  const limit = limitOf(st);
  const s = current(st);
  const simSalary = C.round3(salary * (1 + wi.pct / 100));
  const kept = s.active.filter((i) => !wi.early.has(i.id));
  const purchase = wi.purchase && check.result ? check.result.newMonthly : 0;
  const monthly = C.round3(kept.reduce((a, i) => a + i.monthly, 0) + purchase);
  const payoff = C.round3(s.active.filter((i) => wi.early.has(i.id)).reduce((a, i) => a + i.remainingTotal, 0));
  const ratio = simSalary > 0 ? (monthly / simSalary) * 100 : 0;
  const level = C.levelFor(ratio, limit);
  const free = C.round3(simSalary - monthly);
  const nowFree = s.freeAfter ?? 0;
  const delta = C.round3(free - nowFree);

  const range = box.querySelector('#wi-salary');
  const pctText = wi.pct > 0 ? `+${wi.pct}%` : wi.pct < 0 ? `−${-wi.pct}%` : '0%';
  box.querySelector('#wi-salary-out').textContent = pctText;
  range.setAttribute('aria-valuetext', t('wi.salaryText', { pct: pctText, salary: fmt.money(simSalary) }));
  // filled part of the track (CSSOM custom property, CSP-safe)
  range.style.setProperty('--fill', `${((wi.pct + 30) / 80) * 100}%`);
  box.querySelector('#wi-salary-now').innerHTML = t('wi.salaryNow', { salary: `<b>${num(fmt.money(simSalary))}</b>` });

  const strong = box.querySelector('#wi-ratio');
  strong.textContent = fmt.pct(ratio);
  strong.className = `num lvl-${level}`;
  const fill = box.querySelector('.ring-fill');
  fill.setAttribute('class', `ring-fill lvl-${level}`);
  fx.setRing(fill, ratio, wi.shownRatio);
  wi.shownRatio = ratio;
  box.querySelector('#wi-dial').setAttribute('aria-label', t('wi.ringLabel', { ratio: fmt.pct(ratio), limit: fmt.pct(limit) }));
  box.querySelector('#wi-nowvs').innerHTML = t('wi.nowVs', { now: num(fmt.pct(s.ratio ?? 0)), next: num(fmt.pct(ratio)) });
  const chip = box.querySelector('#wi-level');
  chip.className = `chip chip-${level}`;
  chip.textContent = t(`level.${level}`);
  box.querySelector('#wi-k-salary').textContent = fmt.money(simSalary);
  box.querySelector('#wi-k-monthly').textContent = fmt.money(monthly);
  const freeEl = box.querySelector('#wi-k-free');
  freeEl.textContent = fmt.money(free);
  freeEl.classList.toggle('lvl-over', free < 0);
  const deltaEl = box.querySelector('#wi-k-delta');
  deltaEl.innerHTML = delta === 0
    ? esc(fmt.money(0))
    : `<span aria-hidden="true">${delta > 0 ? '▲' : '▼'}</span> <span class="sr-only">${esc(t(delta > 0 ? 'wi.more' : 'wi.less'))}</span>${esc(fmt.money(Math.abs(delta)))}`;
  deltaEl.classList.toggle('lvl-ok', delta > 0);
  deltaEl.classList.toggle('lvl-over', delta < 0);
  box.querySelector('#wi-k-payoff').textContent = fmt.money(payoff);

  if (announce) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      $('#chk-status').textContent = t('wi.status', {
        salary: fmt.money(simSalary), monthly: fmt.money(monthly), ratio: fmt.pct(ratio), free: fmt.money(free), level: t(`level.${level}`),
      });
    }, 700);
  }
}

// ---------- render + events ----------

function render() {
  if (!store.loaded) {
    if (loadFailed) {
      $('#whatif-body').innerHTML = `
        <div class="empty">
          <p class="alert tone-warn">${esc(errorText('network'))}</p>
          <div class="empty-actions"><button type="button" class="btn" data-retry>${esc(t('common.retry'))}</button></div>
        </div>`;
    }
    return;
  }
  renderSalarySlot(store.state);
  if (check.value) renderResult();
  renderWhatif();
}

function bind() {
  const form = $('#check-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    evaluate({ submit: true });
  });
  form.addEventListener('input', (e) => {
    if (e.target.id === 'chk-title' || e.target.id === 'chk-provider') {
      if (check.result) renderResult();
      return;
    }
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => evaluate(), 250);
  });
  form.addEventListener('change', (e) => {
    if (e.target.id === 'chk-provider' && check.result) renderResult();
  });
  form.querySelector('.count-chips').addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-count]') : null;
    if (!b) return;
    $('#chk-count').value = b.dataset.count;
    evaluate();
  });

  $('#result-body').addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const tryBtn = target.closest('[data-try]');
    if (tryBtn) {
      $('#chk-count').value = tryBtn.dataset.try;
      evaluate({ submit: true });
      return;
    }
    if (target.closest('[data-to-whatif]')) {
      wi.purchase = true;
      wi.key = '';
      renderWhatif();
      goWhatif();
    }
  });

  const wbox = $('#whatif-body');
  wbox.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-retry]')) return;
    store.load().then(() => {
      loadFailed = false;
      showBanner('');
      render();
      prefillFromUrl();
    }, (err) => toast(errorText(err), 'error'));
  });
  wbox.addEventListener('input', (e) => {
    if (e.target.id === 'wi-salary') {
      wi.pct = Number(e.target.value) || 0;
      updateWhatif();
    }
  });
  wbox.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-early]')) {
      if (el.checked) wi.early.add(el.dataset.early);
      else wi.early.delete(el.dataset.early);
      updateWhatif();
    } else if (el.id === 'wi-purchase') {
      wi.purchase = el.checked;
      updateWhatif();
    }
  });
  $('#wi-reset').addEventListener('click', () => {
    wi.pct = 0;
    wi.early.clear();
    wi.purchase = false;
    wi.key = '';
    renderWhatif();
  });
  $('#whatif-jump').addEventListener('click', (e) => {
    e.preventDefault();
    goWhatif();
  });

  window.addEventListener('langchange', () => {
    fillProviders();
    wi.key = '';
    render();
  });
}

function goWhatif() {
  const card = $('#whatif');
  card.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  card.focus({ preventScroll: true });
}

function prefillFromUrl() {
  const q = new URLSearchParams(location.search);
  const price = q.get('price');
  const count = q.get('count');
  if (price) $('#chk-price').value = price.slice(0, 12);
  if (count) $('#chk-count').value = count.slice(0, 3);
  if (q.get('title')) $('#chk-title').value = q.get('title').slice(0, 80);
  if (price && count) evaluate();
  if (location.hash === '#whatif') goWhatif();
}

// ---------- boot ----------

store.subscribe(render);
fillProviders();
bind();
await initPage({ active: 'check', requireAuth: true, title: 'chk.doc' });
if (!store.loaded) {
  loadFailed = true;
  render();
} else {
  prefillFromUrl();
}
