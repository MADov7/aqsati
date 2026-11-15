import * as C from './calc.js';

const $ = (sel) => document.querySelector(sel);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_KEY = 'aqsati_token';

const state = { profile: null, installments: [], loaded: false, check: null };
let memoryToken = null;

// ---------- identity: one random token per browser (no account needed for the MVP) ----------

function getToken() {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token || !UUID_RE.test(token)) {
      token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    memoryToken ??= crypto.randomUUID();
    return memoryToken;
  }
}

// ---------- our server (/api/rpc) → MongoDB Atlas ----------

async function rpc(fn, args) {
  let res;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn, args }),
    });
  } catch {
    throw new Error('network');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `http_${res.status}`);
  return body;
}

const ERRORS = {
  network: 'ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرب مرة ثانية.',
  config: 'إعدادات قاعدة البيانات ناقصة: لازم MONGODB_URI بالـ Environment Variables.',
  db_unavailable: 'قاعدة البيانات مو متاحة الحين، جرب بعد شوي.',
  'too many installments': 'وصلت للحد الأقصى (50 قسط).',
  'invalid first due date': 'تاريخ الاستحقاق مو منطقي، تأكد من يوم الاستحقاق.',
};

function errorText(err) {
  return ERRORS[err?.message] || 'صار خطأ، جرب مرة ثانية.';
}

// ---------- small UI helpers ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showBanner(text) {
  const el = $('#banner');
  el.textContent = text;
  el.hidden = !text;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// Toast with one action button (used for «تراجع»).
function toastAction(text, label, onAction, ms = 5000) {
  const el = $('#toast');
  el.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = text;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-btn';
  b.textContent = label;
  b.addEventListener('click', () => {
    clearTimeout(toastTimer);
    el.hidden = true;
    onAction();
  }, { once: true });
  el.append(span, b);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- edit an installment (reuses the add form) ----------
function startEdit(id) {
  const inst = state.installments.find((i) => i.id === id);
  if (!inst) return;
  const status = C.installmentStatus(inst, C.todayISO());
  const known = C.PROVIDERS.includes(inst.provider) && inst.provider !== 'أخرى';
  $('#provider').value = known ? inst.provider : 'أخرى';
  $('#other-wrap').hidden = known;
  $('#provider-other').value = known ? '' : inst.provider;
  $('#title').value = inst.title || '';
  $('#monthly').value = Number(inst.monthly_amount).toFixed(3);
  $('#due-day').value = String(inst.due_day);
  $('#remaining').value = String(Math.max(1, status.remaining));
  state.editingId = id;
  $('#add-h').textContent = 'تعديل قسط';
  $('#add-form button[type="submit"]').textContent = 'حفظ التعديل';
  $('#cancel-edit').hidden = false;
  $('#add-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#monthly').focus({ preventScroll: true });
}

function endEdit() {
  state.editingId = null;
  $('#add-h').textContent = 'إضافة قسط';
  $('#add-form button[type="submit"]').textContent = 'أضف القسط';
  $('#cancel-edit').hidden = true;
}

// ---------- delete with undo ----------
const pending = new Map(); // id -> { item, index, timer }

function scheduleRemove(token, id) {
  const index = state.installments.findIndex((i) => i.id === id);
  if (index < 0) return;
  const [item] = state.installments.splice(index, 1);
  render();
  const timer = setTimeout(async () => {
    pending.delete(id);
    try {
      applyState(await rpc('aqsati_remove', { p_token: token, p_id: id }));
      showBanner('');
    } catch (err) {
      state.installments.splice(Math.min(index, state.installments.length), 0, item);
      render();
      showBanner(errorText(err));
      toast(errorText(err));
    }
  }, 5000);
  pending.set(id, { item, index, timer });
  toastAction('انحذف القسط', 'تراجع', () => {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    state.installments.splice(Math.min(p.index, state.installments.length), 0, p.item);
    render();
    toast('رجّعنا القسط ✓');
  });
}

function showErrors(form, errors) {
  form.querySelectorAll('[data-err]').forEach((el) => {
    const key = el.dataset.err;
    el.textContent = errors[key] || '';
    const input = el.parentElement.querySelector('input, select');
    if (input) input.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  });
  const first = Object.keys(errors)[0];
  if (first) form.querySelector(`[data-err="${first}"]`)?.parentElement.querySelector('input, select')?.focus();
}

async function withBusy(form, task) {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await task();
    showBanner('');
  } catch (err) {
    // Banner sits at the top (off-screen on a phone), so also toast where the user is.
    showBanner(errorText(err));
    toast(errorText(err));
  } finally {
    btn.disabled = false;
  }
}

function applyState(next) {
  state.profile = next?.profile ?? null;
  state.installments = Array.isArray(next?.installments) ? next.installments : [];
  state.loaded = true;
  render();
}

const salary = () => Number(state.profile?.salary ?? 0);
const safeLimit = () => Number(state.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT);

// ---------- rendering ----------

function render() {
  renderDash();
  if (state.check) renderCheck();
}

function renderDash() {
  const dash = $('#dash');
  if (!state.loaded) return;
  const today = C.todayISO();
  const limit = safeLimit();
  const s = C.monthSummary(state.installments, salary(), limit, today);
  const levelText = {
    ok: 'وضعك مريح ✓',
    warn: 'قربت من حدك الآمن',
    over: 'متعدي حدك الآمن',
    none: 'حط راتبك عشان نحسب النسبة',
  }[s.level];

  const meter = s.ratio == null ? '' : `
    <div class="meter" role="img" aria-label="${esc(`أقساطك ${C.fmtPct(s.ratio)} من راتبك، والحد الآمن ${C.fmtPct(limit)}`)}">
      <div class="meter-fill lvl-${s.level}"></div>
      <div class="meter-limit"></div>
    </div>
    <p class="meter-legend">الحد الآمن ${C.fmtPct(limit)} من راتبك = ${C.fmtKWD(s.limitAmount)} بالشهر${
      s.level === 'over' ? ` · متعديه بـ ${C.fmtKWD(s.monthlyTotal - s.limitAmount)}` : ''}</p>`;

  const rows = s.active.map((i) => `
    <li class="item${i.daysLeft <= 3 ? ' soon' : ''}">
      <div class="item-main"><span class="prov">${esc(i.provider)}</span><span class="title">${esc(i.title || 'بدون وصف')}</span></div>
      <div class="item-amt">${C.fmtKWD(i.monthly)}</div>
      <div class="item-meta">${C.fmtDay(i.nextDue)} · <b>${C.fmtDaysLeft(i.daysLeft)}</b> · باقي ${C.fmtCount(i.remaining)} · آخر قسط ${C.fmtMonth(i.lastDue)}</div>
      <div class="item-actions">
        <button type="button" class="edit" data-edit="${esc(i.id)}" aria-label="${esc(`تعديل قسط ${i.provider}`)}">تعديل</button>
        <button type="button" class="del" data-del="${esc(i.id)}" aria-label="${esc(`حذف قسط ${i.provider}`)}">حذف</button>
      </div>
    </li>`).join('');

  const finished = s.finished.length ? `
    <details class="done"><summary>أقساط خلصت (${s.finished.length}) 🎉</summary>
      <ul>${s.finished.map((i) => `<li>${esc(i.provider)}${i.title ? ` · ${esc(i.title)}` : ''} · آخر قسط ${C.fmtDay(i.lastDue)}</li>`).join('')}</ul>
    </details>` : '';

  dash.innerHTML = `
    <div class="dash-head">
      <h2>لوحة ${esc(C.fmtMonth(today))}</h2>
      <span class="chip chip-${s.level}">${levelText}</span>
    </div>
    <div class="stats">
      <div class="stat"><span>التزامك الشهري</span><strong>${C.fmtKWD(s.monthlyTotal)}</strong></div>
      <div class="stat"><span>من راتبك</span><strong class="lvl-${s.level}">${s.ratio == null ? '—' : C.fmtPct(s.ratio)}</strong></div>
      <div class="stat"><span>يبقى لك من الراتب</span><strong>${s.freeAfter == null ? '—' : C.fmtKWD(s.freeAfter)}</strong></div>
      <div class="stat"><span>باقي تدفعه هالشهر</span><strong>${C.fmtKWD(s.leftThisMonth)}</strong></div>
    </div>
    ${meter}
    <h3>الأقساط الجاية</h3>
    ${s.active.length ? `<ol class="list">${rows}</ol>` : '<p class="empty">ما في أقساط للحين. أضف أول قسط من «إضافة قسط».</p>'}
    ${s.active.length ? `<p class="debt">مجموع الي باقي عليك بكل الأقساط: <strong>${C.fmtKWD(s.totalDebt)}</strong></p>` : ''}
    ${finished}`;

  if (s.ratio != null) {
    dash.querySelector('.meter-fill').style.width = `${Math.min(100, s.ratio)}%`;
    dash.querySelector('.meter-limit').style.insetInlineStart = `${Math.min(100, limit)}%`;
  }
}

function renderCheck() {
  const box = $('#check-result');
  const { price, count } = state.check;
  if (!(salary() > 0)) {
    box.innerHTML = '<div class="verdict over"><strong>حط راتبك أول</strong><p>نحتاج الراتب عشان نحسب النسبة.</p></div>';
    box.hidden = false;
    return;
  }
  const limit = safeLimit();
  const current = C.monthSummary(state.installments, salary(), limit, C.todayISO()).monthlyTotal;
  const r = C.affordability({ price, count, salary: salary(), safeLimit: limit, currentMonthly: current });

  const verdict = r.ok
    ? `<div class="verdict ok"><strong>إي، تقدر ✓</strong>
         <p>قسطه ${C.fmtKWD(r.newMonthly)} بالشهر، ونسبتك بتصير ${C.fmtPct(r.newRatio)} من راتبك (حدك ${C.fmtPct(limit)}).</p></div>`
    : `<div class="verdict over"><strong>لا، بتتعدى حدك الآمن ✗</strong>
         <p>قسطه ${C.fmtKWD(r.newMonthly)} بالشهر، ونسبتك بتصير ${C.fmtPct(r.newRatio)}، يعني فوق حدك بـ ${C.fmtKWD(r.overBy)} بالشهر.</p>
         ${r.alreadyOver ? '<p>أنت أصلاً متعدي حدك قبل هالشراء. الأفضل تخلص قسط قبل لا تاخذ جديد.</p>' : ''}
         ${r.minSafeCount && r.minSafeCount <= 360 ? `<p>لو قسّطته على ${C.fmtCount(r.minSafeCount)} أو أكثر، يصير ضمن حدك.</p>` : ''}</div>`;

  box.innerHTML = `${verdict}
    <div class="compare">
      <div><span>نسبتك الحين</span><b>${C.fmtPct(r.currentRatio)}</b></div>
      <div><span>نسبتك بعد الشراء</span><b class="${r.ok ? 'lvl-ok' : 'lvl-over'}">${C.fmtPct(r.newRatio)}</b></div>
    </div>
    <button type="button" class="btn btn-ghost" id="use-check">أضفه لأقساطي</button>`;
  box.hidden = false;
  box.querySelector('#use-check').addEventListener('click', () => {
    state.checkApplied = true;
    $('#monthly').value = r.newMonthly.toFixed(3);
    $('#remaining').value = String(count);
    $('#add-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#provider').focus({ preventScroll: true });
    toast('عبّينا المبلغ وعدد الأقساط، اختار الجهة ويوم الاستحقاق.');
  });
}

// ---------- events ----------

function fillProviders() {
  $('#provider').innerHTML = C.PROVIDERS.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  $('#provider').addEventListener('change', () => {
    const other = $('#provider').value === 'أخرى';
    $('#other-wrap').hidden = !other;
    if (other) $('#provider-other').focus();
  });
}

function bindForms(token) {
  $('#salary-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = C.validateProfileInput({ salary: $('#salary').value, limit: $('#limit').value });
    showErrors(form, v.errors);
    if (!v.ok) return;
    withBusy(form, async () => {
      applyState(await rpc('aqsati_save', { p_token: token, p_salary: v.value.salary, p_safe_limit: v.value.limit }));
      toast('انحفظ الراتب ✓');
    });
  });

  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const picked = $('#provider').value;
    const v = C.validateInstallmentInput({
      provider: picked === 'أخرى' ? $('#provider-other').value : picked,
      title: $('#title').value,
      monthly: $('#monthly').value,
      dueDay: $('#due-day').value,
      remaining: $('#remaining').value,
    });
    showErrors(form, v.errors);
    if (picked === 'أخرى' && v.errors.provider) {
      // the empty field is the "other provider" name, not the dropdown
      $('#provider').setAttribute('aria-invalid', 'false');
      $('#provider-other').setAttribute('aria-invalid', 'true');
      $('#provider-other').focus();
    }
    if (!v.ok) return;
    const editingId = state.editingId;
    withBusy(form, async () => {
      const first = C.firstDueDate(v.value.dueDay, C.todayISO());
      const next = await rpc(editingId ? 'aqsati_update' : 'aqsati_add', {
        p_token: token,
        ...(editingId ? { p_id: editingId } : {}),
        p_provider: v.value.provider,
        p_title: v.value.title,
        p_monthly: v.value.monthly,
        p_due_day: v.value.dueDay,
        p_remaining: v.value.remaining,
        p_first_due: first,
      });
      // The checked purchase is now a real installment — clear the old verdict so it isn't counted twice.
      if (state.checkApplied) {
        state.check = null;
        state.checkApplied = false;
        $('#check-result').hidden = true;
        $('#check-result').innerHTML = '';
      }
      applyState(next);
      form.reset();
      $('#other-wrap').hidden = true;
      if (editingId) {
        endEdit();
        toast('انحفظ التعديل ✓');
      } else {
        toast('انضاف القسط ✓');
      }
    });
  });

  $('#cancel-edit').addEventListener('click', () => {
    $('#add-form').reset();
    $('#other-wrap').hidden = true;
    showErrors($('#add-form'), {});
    endEdit();
  });

  $('#check-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = C.validateCheckInput({ price: $('#price').value, count: $('#count').value });
    showErrors(form, v.errors);
    if (!v.ok) return;
    state.check = v.value;
    renderCheck();
  });

  // Two-step delete inside the page (native confirm() is blocked in some in-app browsers),
  // then a 5-second «تراجع» window before the delete is actually sent to the server.
  $('#dash').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      startEdit(editBtn.dataset.edit);
      return;
    }
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'متأكد؟ اضغط مرة ثانية';
      btn.classList.add('armed');
      setTimeout(() => {
        if (!btn.isConnected || btn.disabled) return;
        btn.dataset.armed = '';
        btn.textContent = 'حذف';
        btn.classList.remove('armed');
      }, 4000);
      return;
    }
    scheduleRemove(token, btn.dataset.del);
  });

  // If the page closes during the undo window, still send the pending deletes.
  window.addEventListener('pagehide', () => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      const body = JSON.stringify({ fn: 'aqsati_remove', args: { p_token: token, p_id: id } });
      navigator.sendBeacon?.('/api/rpc', new Blob([body], { type: 'application/json' }));
    }
    pending.clear();
  });
}

async function init() {
  const token = getToken();
  fillProviders();
  bindForms(token);
  try {
    applyState(await rpc('aqsati_state', { p_token: token }));
    if (state.profile) {
      $('#salary').value = Number(state.profile.salary).toString();
      $('#limit').value = Number(state.profile.safe_limit).toString();
    }
  } catch (err) {
    showBanner(errorText(err));
    applyState(null);
  }
}

init();
