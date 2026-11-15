import * as C from './calc.js';
import * as FX from './fx.js';

const $ = (sel, root = document) => root.querySelector(sel);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_KEY = 'aqsati_token';
const SAVE_DISMISS_KEY = 'aqsati_save_dismissed';

const state = {
  profile: null,
  installments: [],
  user: null,
  loaded: false,
  check: null,
  editingId: null,
  checkApplied: false,
};

// ---------- storage (private windows / blocked storage must never break the page) ----------

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* memory only */ }
  },
};

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ---------- identity: a random guest token per browser; an account (cookie session) when logged in ----------

let token = null; // in-memory copy, used only when storage is blocked

// Read localStorage every time: another tab may have logged out and switched this browser to a new guest.
function getToken() {
  const saved = storage.get(TOKEN_KEY);
  if (saved && UUID_RE.test(saved)) return (token = saved);
  if (!token) token = uuid();
  storage.set(TOKEN_KEY, token);
  return token;
}

// Another tab changed the guest identity (logout there) → follow it here right away.
function watchOtherTabs() {
  window.addEventListener('storage', (e) => {
    if (e.key !== TOKEN_KEY && e.key !== null) return;
    token = null;
    rpc('aqsati_state', { p_token: getToken() })
      .then((s) => {
        if (state.editingId) resetAddForm();
        applyState(s);
        syncProfileInputs();
      })
      .catch(() => {});
  });
}

function newGuestToken() {
  token = uuid();
  storage.set(TOKEN_KEY, token);
  return token;
}

// ---------- our server (/api/rpc) → MongoDB Atlas. The session cookie is HttpOnly and flows by itself. ----------

async function rpc(fn, args) {
  let res;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      credentials: 'same-origin',
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
  'bad origin': 'الطلب انرفض لأسباب أمان. حدّث الصفحة وجرب مرة ثانية.',
  'too many installments': 'وصلت للحد الأقصى (50 قسط).',
  'invalid first due date': 'تاريخ الاستحقاق مو منطقي، تأكد من يوم الاستحقاق.',
  'invalid monthly': 'المبلغ الشهري مو صحيح.',
  // accounts
  'invalid email': 'الإيميل مو صحيح',
  'weak password': 'الباسوورد لازم يكون 8 حروف أو أكثر',
  'email taken': 'هالإيميل مسجل قبل، جرّب «دخول»',
  'invalid credentials': 'الإيميل أو الباسوورد غلط',
  'too many attempts': 'محاولات كثيرة، جرّب بعد ربع ساعة',
  http_429: 'محاولات كثيرة، جرّب بعد ربع ساعة',
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
let toastHideTimer;

function showToastBox(tone) {
  const el = $('#toast');
  clearTimeout(toastHideTimer);
  el.classList.remove('is-out', 'pop', 'tone-ok', 'tone-error');
  if (tone) el.classList.add(`tone-${tone}`);
  el.hidden = false;
  void el.offsetWidth; // restart the slide-in
  el.classList.add('pop');
}

// A stable place for keyboard focus inside the dashboard (the list heading survives every re-render).
function focusListHeading() {
  $('#list-h')?.focus({ preventScroll: true });
}

// rescue: if focus is on the toast's button, move it somewhere stable before the toast disappears.
function hideToast(rescue = true) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  if (el.hidden) return;
  if (rescue && el.contains(document.activeElement)) focusListHeading();
  if (FX.reducedMotion()) {
    el.hidden = true;
    return;
  }
  el.classList.add('is-out');
  toastHideTimer = setTimeout(() => {
    el.hidden = true;
    el.classList.remove('is-out');
  }, 220);
}

function toast(text, tone = '') {
  const el = $('#toast');
  if (el.contains(document.activeElement)) focusListHeading(); // its button is about to be replaced
  el.textContent = text;
  showToastBox(tone);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2800);
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
    hideToast(false); // onAction decides where focus goes next
    onAction();
  }, { once: true });
  const active = document.activeElement;
  const lostFocus = !active || active === document.body || !active.isConnected || $('#dash').contains(active);
  el.append(span, b);
  showToastBox('');
  // The user's button was just re-rendered away: put focus on the action so keyboard and
  // screen-reader users can reach «تراجع» inside its 5 seconds.
  if (lostFocus) b.focus({ preventScroll: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
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
  $('#add-card').classList.add('is-editing');
  $('#add-card').scrollIntoView({ behavior: FX.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  $('#monthly').focus({ preventScroll: true });
}

function endEdit() {
  state.editingId = null;
  $('#add-h').textContent = 'إضافة قسط';
  $('#add-form button[type="submit"]').textContent = 'أضف القسط';
  $('#cancel-edit').hidden = true;
  $('#add-card').classList.remove('is-editing');
}

function resetAddForm() {
  $('#add-form').reset();
  $('#other-wrap').hidden = true;
  showErrors($('#add-form'), {});
  endEdit();
}

// ---------- delete with undo ----------

const pending = new Map(); // id -> { item, index, timer }

function scheduleRemove(id) {
  const index = state.installments.findIndex((i) => i.id === id);
  if (index < 0) return;
  const [item] = state.installments.splice(index, 1);
  if (state.editingId === id) resetAddForm();
  render();
  const timer = setTimeout(async () => {
    pending.delete(id);
    try {
      applyState(await rpc('aqsati_remove', { p_token: getToken(), p_id: id }));
      showBanner('');
    } catch (err) {
      state.installments.splice(Math.min(index, state.installments.length), 0, item);
      render();
      showBanner(errorText(err));
      toast(errorText(err), 'error');
    }
  }, 5000);
  pending.set(id, { item, index, timer });
  toastAction('انحذف القسط', 'تراجع', () => {
    const p = pending.get(id);
    if (!p) {
      focusListHeading();
      return;
    }
    clearTimeout(p.timer);
    pending.delete(id);
    state.installments.splice(Math.min(p.index, state.installments.length), 0, p.item);
    render();
    // back on the restored item (or the list heading if it isn't in the active list)
    const restored = $('#dash').querySelector(`[data-edit="${CSS.escape(id)}"]`);
    if (restored) restored.focus();
    else focusListHeading();
    toast('رجّعنا القسط ✓', 'ok');
  });
}

// Before switching accounts, send any delete still waiting in its undo window (under the current owner).
async function flushPending() {
  if (!pending.size) return;
  const jobs = [];
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    jobs.push(rpc('aqsati_remove', { p_token: getToken(), p_id: id }).catch(() => null));
  }
  pending.clear();
  hideToast();
  await Promise.all(jobs);
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
    toast(errorText(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

function applyState(next) {
  state.profile = next?.profile ?? null;
  state.installments = Array.isArray(next?.installments) ? next.installments : [];
  state.user = next?.user && typeof next.user.email === 'string' ? { email: next.user.email } : null;
  state.loaded = true;
  render();
}

function syncProfileInputs() {
  $('#salary').value = state.profile ? Number(state.profile.salary).toString() : '';
  $('#limit').value = state.profile ? Number(state.profile.safe_limit).toString() : String(C.DEFAULT_SAFE_LIMIT);
  showErrors($('#salary-form'), {});
}

const salary = () => Number(state.profile?.salary ?? 0);
const safeLimit = () => Number(state.profile?.safe_limit ?? C.DEFAULT_SAFE_LIMIT);

// ---------- rendering ----------

function render() {
  renderAuth();
  renderDash();
  renderSaveCard();
  if (state.check) renderCheck();
}

function renderAuth() {
  const u = state.user;
  $('#login-btn').hidden = !!u;
  $('#user-box').hidden = !u;
  $('#hero-login').hidden = !!u;
  $('#start-cta').textContent = u ? 'روح للوحتي' : 'ابدأ الحين — بدون تسجيل';
  if (u) {
    $('#user-email').textContent = u.email;
    $('#user-email').title = u.email;
    $('#user-avatar').textContent = (u.email.trim()[0] || '؟').toUpperCase();
    $('#logout-btn').setAttribute('aria-label', `خروج من حساب ${u.email}`);
  }
}

let saveDismissed = storage.get(SAVE_DISMISS_KEY) === '1';

function renderSaveCard() {
  $('#save-card').hidden = !(state.loaded && !state.user && state.installments.length >= 1 && !saveDismissed);
}

const ICONS = {
  wallet: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.4"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3S9.5 10.4 12 11s4.5 1.7 4.5 3.6-2 3-4.5 3-4.5-1.3-4.5-3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  stack: '<svg viewBox="0 0 24 24" focusable="false"><ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/><path d="M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/></svg>',
};

function providerHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 6;
}

// Last values shown, so numbers count from the old value to the new one.
const shown = { monthly: 0, free: 0, left: 0, debt: 0, ratio: 0 };

function renderDash() {
  const dash = $('#dash');
  if (!state.loaded) return;
  dash.removeAttribute('aria-busy');
  const today = C.todayISO();
  const limit = safeLimit();
  const s = C.monthSummary(state.installments, salary(), limit, today);
  const levelText = {
    ok: 'وضعك مريح ✓',
    warn: 'قربت من حدك الآمن',
    over: 'متعدي حدك الآمن',
    none: 'حط راتبك عشان نحسب النسبة',
  }[s.level];

  const stat = (key, label, value, icon, extra = '') => `
    <div class="stat tilt${extra}">
      <span class="stat-ico" aria-hidden="true">${icon}</span>
      <span class="stat-label">${label}</span>
      ${value == null
        ? '<strong>—</strong>'
        : `<strong class="${value < 0 ? 'lvl-over' : ''}"><span class="sr-only">${C.fmtKWD(value)}</span><span aria-hidden="true" data-count="${key}" data-to="${value}">${C.fmtKWD(value)}</span></strong>`}
    </div>`;

  const ratioText = s.ratio == null ? '—' : C.fmtPct(s.ratio);
  const legend = s.ratio == null
    ? 'حط راتبك فوق، ونحسب لك كم تاخذ الأقساط منه.'
    : `الحد الآمن ${C.fmtPct(limit)} من راتبك = ${C.fmtKWD(s.limitAmount)} بالشهر${
      s.level === 'over' ? ` · متعديه بـ ${C.fmtKWD(s.monthlyTotal - s.limitAmount)}` : ''}`;

  const rows = s.active.map((i) => `
    <li class="item${i.daysLeft <= 3 ? ' soon' : ''}">
      <span class="pv pv-${providerHue(i.provider)}" aria-hidden="true">${esc([...String(i.provider).trim()][0] || '؟')}</span>
      <div class="item-main"><span class="prov">${esc(i.provider)}</span><span class="title">${esc(i.title || 'بدون وصف')}</span></div>
      <div class="item-amt">${C.fmtKWD(i.monthly)}</div>
      <div class="item-meta">${i.daysLeft <= 3 ? '<span class="soon-dot" aria-hidden="true"></span>' : ''}${C.fmtDay(i.nextDue)} · <b>${C.fmtDaysLeft(i.daysLeft)}</b> · باقي ${C.fmtCount(i.remaining)} · آخر قسط ${C.fmtMonth(i.lastDue)}</div>
      <div class="item-actions">
        <button type="button" class="edit" data-edit="${esc(i.id)}" aria-label="${esc(`تعديل قسط ${i.provider}`)}">تعديل</button>
        <button type="button" class="del" data-del="${esc(i.id)}" aria-label="${esc(`حذف قسط ${i.provider}`)}">حذف</button>
      </div>
    </li>`).join('');

  const finished = s.finished.length ? `
    <details class="done"><summary>أقساط خلصت (${s.finished.length}) 🎉</summary>
      <ul>${s.finished.map((i) => `<li>${esc(i.provider)}${i.title ? ` · ${esc(i.title)}` : ''} · آخر قسط ${C.fmtDay(i.lastDue)}</li>`).join('')}</ul>
    </details>` : '';

  const empty = `
    <div class="empty">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="10" y="14" width="44" height="36" rx="9" fill="#eaf0fa"/><rect x="18" y="24" width="20" height="5" rx="2.5" fill="#c3cfdf"/><rect x="18" y="34" width="28" height="5" rx="2.5" fill="#dbe3ef"/><circle cx="48" cy="46" r="11" fill="#f5b942"/><path d="M48 41v10M43 46h10" stroke="#0f2a4a" stroke-width="3" stroke-linecap="round"/></svg>
      <strong>ما في أقساط للحين</strong>
      <span>أضف أول قسط من «إضافة قسط»، وتشوف لوحتك تتعبى.</span>
    </div>`;

  // innerHTML replaces every node: remember what had keyboard focus so it can come back afterwards.
  const active = document.activeElement;
  let focusSel = null;
  if (active && active !== dash && dash.contains(active)) {
    if (active.dataset.edit) focusSel = `[data-edit="${CSS.escape(active.dataset.edit)}"]`;
    else if (active.dataset.del) focusSel = `[data-del="${CSS.escape(active.dataset.del)}"]`;
    else if (active.matches('.done summary')) focusSel = '.done summary';
    else focusSel = '#list-h';
  }

  dash.innerHTML = `
    <div class="dash-head">
      <div>
        <p class="kicker">لوحة الشهر</p>
        <h2 id="dash-h">لوحة ${esc(C.fmtMonth(today))}</h2>
      </div>
      <span class="chip chip-${s.level}">${levelText}</span>
    </div>
    <div class="dash-top">
      <figure class="gauge">
        <div class="gauge-dial">
          <svg class="ring" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
            <circle class="ring-track" cx="80" cy="80" r="66"/>
            <circle class="ring-fill lvl-${s.level}" cx="80" cy="80" r="66" transform="rotate(-90 80 80)"/>
            ${s.ratio == null ? '' : `<g transform="rotate(${(Math.min(100, limit) * 3.6).toFixed(1)} 80 80)"><line class="ring-tick" x1="80" y1="3" x2="80" y2="25"/></g>`}
          </svg>
          <div class="gauge-center">
            <strong class="lvl-${s.level}">${s.ratio == null ? '—' : `<span class="sr-only">${ratioText}</span><span aria-hidden="true" data-count="ratio" data-to="${s.ratio}">${ratioText}</span>`}</strong>
            <span>من راتبك</span>
          </div>
        </div>
        <figcaption class="gauge-cap">${legend}</figcaption>
      </figure>
      <div class="stats">
        ${stat('monthly', 'التزامك الشهري', s.monthlyTotal, ICONS.wallet, ' feature')}
        ${stat('free', 'يبقى لك من الراتب', s.freeAfter, ICONS.leaf)}
        ${stat('left', 'باقي تدفعه هالشهر', s.leftThisMonth, ICONS.calendar)}
        ${stat('debt', 'مجموع الي باقي عليك', s.totalDebt, ICONS.stack)}
      </div>
    </div>
    <h3 id="list-h" tabindex="-1">الأقساط الجاية</h3>
    ${s.active.length ? `<ol class="list">${rows}</ol>` : empty}
    ${finished}`;
  if (focusSel) (dash.querySelector(focusSel) || dash.querySelector('#list-h'))?.focus({ preventScroll: true });

  // animate: ring fill + numbers counting from what was on screen before
  FX.setRing(dash.querySelector('.ring-fill'), s.ratio ?? 0, shown.ratio);
  const formats = { ratio: C.fmtPct };
  dash.querySelectorAll('[data-count]').forEach((el) => {
    const key = el.dataset.count;
    const to = Number(el.dataset.to);
    FX.countUp(el, shown[key] ?? 0, to, formats[key] || C.fmtKWD);
  });
  shown.monthly = s.monthlyTotal;
  shown.free = s.freeAfter ?? 0;
  shown.left = s.leftThisMonth;
  shown.debt = s.totalDebt;
  shown.ratio = s.ratio ?? 0;

  $('#dash-status').textContent = `التزامك الشهري ${C.fmtKWD(s.monthlyTotal)}${s.ratio == null ? '' : `، يعني ${ratioText} من راتبك`}. ${levelText}.`;
}

function renderCheck() {
  const box = $('#check-result');
  const { price, count } = state.check;
  if (!(salary() > 0)) {
    box.innerHTML = `<div class="verdict over">${verdictIcon(false)}<strong>حط راتبك أول</strong><p>نحتاج الراتب عشان نحسب النسبة.</p></div>`;
    box.hidden = false;
    return;
  }
  const limit = safeLimit();
  const current = C.monthSummary(state.installments, salary(), limit, C.todayISO()).monthlyTotal;
  const r = C.affordability({ price, count, salary: salary(), safeLimit: limit, currentMonthly: current });

  const verdict = r.ok
    ? `<div class="verdict ok">${verdictIcon(true)}<strong>إي، تقدر ✓</strong>
         <p>قسطه ${C.fmtKWD(r.newMonthly)} بالشهر، ونسبتك بتصير ${C.fmtPct(r.newRatio)} من راتبك (حدك ${C.fmtPct(limit)}).</p></div>`
    : `<div class="verdict over">${verdictIcon(false)}<strong>لا، بتتعدى حدك الآمن ✗</strong>
         <p>قسطه ${C.fmtKWD(r.newMonthly)} بالشهر، ونسبتك بتصير ${C.fmtPct(r.newRatio)}، يعني فوق حدك بـ ${C.fmtKWD(r.overBy)} بالشهر.</p>
         ${r.alreadyOver ? '<p>أنت أصلاً متعدي حدك قبل هالشراء. الأفضل تخلص قسط قبل لا تاخذ جديد.</p>' : ''}
         ${r.minSafeCount && r.minSafeCount <= 360 ? `<p>لو قسّطته على ${C.fmtCount(r.minSafeCount)} أو أكثر، يصير ضمن حدك.</p>` : ''}</div>`;

  box.innerHTML = `${verdict}
    <div class="compare">
      <div><span>نسبتك الحين</span><b>${C.fmtPct(r.currentRatio)}</b><span class="mini-meter" aria-hidden="true"><i data-w="${r.currentRatio}"></i><u></u></span></div>
      <div><span>نسبتك بعد الشراء</span><b class="${r.ok ? 'lvl-ok' : 'lvl-over'}">${C.fmtPct(r.newRatio)}</b><span class="mini-meter" aria-hidden="true"><i class="${r.ok ? 'lvl-ok' : 'lvl-over'}" data-w="${r.newRatio}"></i><u></u></span></div>
    </div>
    <button type="button" class="btn btn-ghost" id="use-check">أضفه لأقساطي</button>`;
  box.hidden = false;
  box.querySelectorAll('.mini-meter u').forEach((u) => { u.style.insetInlineStart = `${Math.min(100, limit)}%`; });
  box.querySelectorAll('.mini-meter i').forEach((i) => FX.setWidth(i, Number(i.dataset.w)));
  box.querySelector('#use-check').addEventListener('click', () => {
    // This is a NEW installment: leave edit mode (and its old provider/title) so we don't overwrite one.
    if (state.editingId) resetAddForm();
    state.checkApplied = true;
    $('#monthly').value = r.newMonthly.toFixed(3);
    $('#remaining').value = String(count);
    $('#add-card').scrollIntoView({ behavior: FX.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    $('#provider').focus({ preventScroll: true });
    toast('عبّينا المبلغ وعدد الأقساط، اختار الجهة ويوم الاستحقاق.');
  });
}

function verdictIcon(ok) {
  return `<svg class="verdict-ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="19"/>${
    ok ? '<path d="M12 20.5l5.5 5.5L28.5 14"/>' : '<path d="M14 14l12 12M26 14L14 26"/>'}</svg>`;
}

// ---------- account dialog (email + password) ----------

const auth = { mode: 'login', busy: false, lastFocus: null };
const BACKGROUND = ['.skip', '.topbar', 'main', '.foot'];

function setAuthMode(mode) {
  auth.mode = mode;
  const signup = mode === 'signup';
  const tabs = $('.tabs');
  tabs.classList.toggle('is-signup', signup);
  for (const [id, on] of [['#tab-login', !signup], ['#tab-signup', signup]]) {
    $(id).setAttribute('aria-selected', String(on));
    $(id).tabIndex = on ? 0 : -1;
  }
  $('#auth-form').setAttribute('aria-labelledby', signup ? 'tab-signup' : 'tab-login');
  $('#auth-title').textContent = signup ? 'سوّ حسابك بثواني' : 'هلا فيك من جديد';
  $('#auth-sub').textContent = signup
    ? 'إيميل وباسوورد بس، وأقساطك تنحفظ وتفتحها من أي جهاز.'
    : 'ادخل بإيميلك وتلقى أقساطك مثل ما خليتها.';
  $('#auth-submit .btn-label').textContent = signup ? 'سوّ الحساب' : 'دخول';
  $('#auth-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  // the strength hint only describes the field when it is shown (signup)
  $('#auth-password').setAttribute('aria-describedby', signup ? 'auth-password-err pw-strength-text' : 'auth-password-err');
  $('#pw-strength').hidden = !signup;
  updateStrength();
  showAuthErrors({});
}

function openAuth(mode = 'login') {
  const modal = $('#auth-modal');
  auth.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setAuthMode(mode);
  modal.hidden = false;
  document.documentElement.classList.add('modal-open');
  for (const sel of BACKGROUND) $(sel)?.setAttribute('inert', '');
  requestAnimationFrame(() => $('#auth-email').focus());
}

function closeAuth() {
  const modal = $('#auth-modal');
  if (modal.hidden) return;
  modal.hidden = true;
  document.documentElement.classList.remove('modal-open');
  for (const sel of BACKGROUND) $(sel)?.removeAttribute('inert');
  $('#auth-password').value = '';
  setPasswordVisible(false);
  showAuthErrors({});
  const back = auth.lastFocus;
  auth.lastFocus = null;
  if (back?.isConnected && !back.closest('[hidden]')) back.focus();
  else ($('#user-box').hidden ? $('#login-btn') : $('#logout-btn')).focus({ preventScroll: true });
}

function setPasswordVisible(on) {
  $('#auth-password').type = on ? 'text' : 'password';
  $('#pw-toggle').setAttribute('aria-pressed', String(on));
  $('#pw-toggle').setAttribute('aria-label', on ? 'خبّي الباسوورد' : 'أظهر الباسوورد');
}

function updateStrength() {
  const box = $('#pw-strength');
  if (box.hidden) return;
  const pw = $('#auth-password').value;
  let score = 0;
  if (pw.length >= 8) {
    score = 1;
    if (pw.length >= 12) score += 1;
    if (/[A-Za-z؀-ۿ]/.test(pw) && /\d/.test(pw)) score += 1;
    if (/[^A-Za-z0-9؀-ۿ]/.test(pw)) score += 1;
    score = Math.max(2, score);
  } else if (pw.length) {
    score = 1;
  }
  box.classList.remove('s-1', 's-2', 's-3', 's-4');
  if (score) box.classList.add(`s-${score}`);
  $('#pw-strength-text').textContent = !pw.length || pw.length < 8
    ? `لازم 8 حروف أو أكثر${pw.length ? ` (باقي ${8 - pw.length})` : ''}`
    : ['', '', 'مقبول — زيد أرقام أو رموز', 'زين 👍', 'قوي جداً 💪'][score];
}

function showAuthErrors(errors) {
  const map = { email: '#auth-email', password: '#auth-password' };
  for (const [key, sel] of Object.entries(map)) {
    $(`${sel}-err`).textContent = errors[key] || '';
    $(sel).setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  }
  const box = $('#auth-err');
  box.textContent = errors.form || '';
  if (errors.switchTo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-btn';
    b.textContent = errors.switchTo === 'login' ? 'روح لـ«دخول»' : 'سوّ حساب جديد';
    b.addEventListener('click', () => {
      setAuthMode(errors.switchTo);
      $('#auth-password').focus();
    });
    box.append(' ', b);
  }
}

function setAuthBusy(on) {
  auth.busy = on;
  const btn = $('#auth-submit');
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  btn.setAttribute('aria-busy', String(on));
}

async function submitAuth(e) {
  e.preventDefault();
  if (auth.busy) return;
  const signup = auth.mode === 'signup';
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errors = {};
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = ERRORS['invalid email'];
  if (signup ? password.length < 8 : !password) errors.password = signup ? ERRORS['weak password'] : 'اكتب الباسوورد';
  showAuthErrors(errors);
  if (errors.email) { $('#auth-email').focus(); return; }
  if (errors.password) { $('#auth-password').focus(); return; }

  setAuthBusy(true);
  try {
    await flushPending();
    const next = await rpc(signup ? 'auth_signup' : 'auth_login', { email, password, p_token: getToken() });
    resetAddForm();
    applyState(next);
    syncProfileInputs();
    closeAuth();
    showBanner('');
    toast('هلا! بياناتك صارت محفوظة بحسابك', 'ok');
  } catch (err) {
    const code = err?.message;
    if (code === 'invalid email') showAuthErrors({ email: ERRORS[code] });
    else if (code === 'weak password') showAuthErrors({ password: ERRORS[code] });
    else if (code === 'email taken') showAuthErrors({ form: ERRORS[code], switchTo: 'login' });
    else showAuthErrors({ form: errorText(err) });
    if (code === 'invalid email') $('#auth-email').focus();
    else if (code === 'weak password' || code === 'invalid credentials') $('#auth-password').select();
  } finally {
    setAuthBusy(false);
    // The disabled (busy) button dropped focus to <body>; bring it back into the dialog.
    const modal = $('#auth-modal');
    if (!modal.hidden && !modal.contains(document.activeElement)) $('#auth-submit').focus();
  }
}

async function logout() {
  const btn = $('#logout-btn');
  btn.disabled = true;
  try {
    await flushPending();
    applyState(await rpc('auth_logout', {}));
  } catch (err) {
    toast(errorText(err), 'error');
    btn.disabled = false;
    return;
  }
  // a fresh, empty guest identity for this browser
  newGuestToken();
  resetAddForm();
  state.check = null;
  state.checkApplied = false;
  $('#check-result').hidden = true;
  $('#check-result').innerHTML = '';
  try {
    applyState(await rpc('aqsati_state', { p_token: getToken() }));
    showBanner('');
  } catch (err) {
    showBanner(errorText(err));
  }
  syncProfileInputs();
  btn.disabled = false;
  $('#login-btn').focus();
  toast('طلعت من حسابك. أقساطك محفوظة فيه، وترجع لها متى ما دخلت.');
}

function bindAuth() {
  $('#login-btn').addEventListener('click', () => openAuth('login'));
  $('#hero-login').addEventListener('click', () => openAuth('login'));
  $('#save-signup').addEventListener('click', () => openAuth('signup'));
  $('#logout-btn').addEventListener('click', logout);
  $('#save-dismiss').addEventListener('click', () => {
    saveDismissed = true;
    storage.set(SAVE_DISMISS_KEY, '1');
    renderSaveCard();
    $('#app').focus({ preventScroll: true });
  });

  const modal = $('#auth-modal');
  modal.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-close]')) closeAuth();
  });
  // On document (not the dialog): Esc and the Tab trap must still work after focus falls to <body>,
  // e.g. after a click on the dialog's text or while the submit button is disabled.
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAuth();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.tabIndex !== -1 && el.getClientRects().length);
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
  });

  for (const [id, mode] of [['#tab-login', 'login'], ['#tab-signup', 'signup']]) {
    $(id).addEventListener('click', () => setAuthMode(mode));
  }
  $('.tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    let mode = auth.mode === 'login' ? 'signup' : 'login';
    if (e.key === 'Home') mode = 'login';
    if (e.key === 'End') mode = 'signup';
    setAuthMode(mode);
    $(mode === 'login' ? '#tab-login' : '#tab-signup').focus();
  });

  $('#pw-toggle').addEventListener('click', () => {
    const input = $('#auth-password');
    setPasswordVisible(input.type === 'password');
    input.focus();
  });
  $('#auth-password').addEventListener('input', updateStrength);
  $('#auth-form').addEventListener('submit', submitAuth);
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

function bindForms() {
  $('#salary-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = C.validateProfileInput({ salary: $('#salary').value, limit: $('#limit').value });
    showErrors(form, v.errors);
    if (!v.ok) return;
    withBusy(form, async () => {
      applyState(await rpc('aqsati_save', { p_token: getToken(), p_salary: v.value.salary, p_safe_limit: v.value.limit }));
      toast('انحفظ الراتب ✓', 'ok');
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
        p_token: getToken(),
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
        toast('انحفظ التعديل ✓', 'ok');
      } else {
        toast('انضاف القسط ✓', 'ok');
      }
    });
  });

  $('#cancel-edit').addEventListener('click', resetAddForm);

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
      const label = btn.getAttribute('aria-label');
      const provider = state.installments.find((i) => i.id === btn.dataset.del)?.provider ?? '';
      btn.dataset.armed = '1';
      btn.textContent = 'متأكد؟ اضغط مرة ثانية';
      // aria-label wins over the text, so it has to say the new state too
      btn.setAttribute('aria-label', `متأكد؟ اضغط مرة ثانية لحذف قسط ${provider}`.trim());
      btn.classList.add('armed');
      setTimeout(() => {
        if (!btn.isConnected || btn.disabled) return;
        btn.dataset.armed = '';
        btn.textContent = 'حذف';
        if (label) btn.setAttribute('aria-label', label);
        btn.classList.remove('armed');
      }, 4000);
      return;
    }
    scheduleRemove(btn.dataset.del);
  });

  // If the page closes during the undo window, still send the pending deletes (cookies ride along).
  window.addEventListener('pagehide', () => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      const body = JSON.stringify({ fn: 'aqsati_remove', args: { p_token: getToken(), p_id: id } });
      navigator.sendBeacon?.('/api/rpc', new Blob([body], { type: 'application/json' }));
    }
    pending.clear();
  });
}

// ---------- effects + the lazy 3D scene ----------

function startEffects() {
  FX.reveal('.reveal');
  FX.tilt();
  FX.ripples();
  FX.scrollFx({ bar: $('#scroll-progress'), links: [...document.querySelectorAll('.nav a[data-spy]')] });
}

function loadScene() {
  const box = $('#scene-box');
  if (!box) return;
  if (navigator.connection?.saveData) {
    box.classList.add('no-3d');
    return;
  }
  const go = () => import('./scene.js')
    .then((m) => m.mountScene(box))
    .catch(() => box.classList.add('no-3d'));
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));
  if (document.readyState === 'complete') idle(go);
  else window.addEventListener('load', () => idle(go), { once: true });
}

async function init() {
  getToken();
  fillProviders();
  bindForms();
  bindAuth();
  watchOtherTabs();
  startEffects();
  loadScene();
  try {
    applyState(await rpc('aqsati_state', { p_token: getToken() }));
    if (state.profile) syncProfileInputs();
  } catch (err) {
    showBanner(errorText(err));
    applyState(null);
  }
}

init();
