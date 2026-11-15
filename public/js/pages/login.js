// أقساطي — /login: log in / sign up (tabs), show/hide password, strength hint, caps-lock hint,
// friendly Arabic/English errors, guest data merges automatically (core actions send p_token),
// then back to ?next= (default /app). Already logged in → «أنت داخل بـ …» with links.

import {
  initPage, registerStrings, t, getLang, store, login, signup, logout,
  errorText, flash, safeNext, toast, fmt, esc, $, $$,
} from '../core.js';
import { passwordStrength, MIN_LENGTH, MAX_LENGTH } from '../logic/password-strength.js';

registerStrings({
  ar: {
    'login.title': 'دخول',
    'login.kicker': 'حسابك',
    'login.h1': 'هلا فيك',
    'login.desc': 'ادخل أو سوّ حساب بثواني — إيميل وباسوورد بس، وأقساطك تنحفظ وتفتحها من أي جهاز.',
    'login.tabsLabel': 'دخول أو حساب جديد',
    'login.tabLogin': 'دخول',
    'login.tabSignup': 'حساب جديد',
    'login.email': 'الإيميل',
    'login.password': 'الباسوورد',
    'login.newPassword': 'اختار باسوورد',
    'login.show': 'أظهر الباسوورد',
    'login.hide': 'أخفِ الباسوورد',
    'login.caps': 'تنبيه: Caps Lock شغّال',
    'login.submitLogin': 'دخول',
    'login.submitSignup': 'سوّ حسابي',
    'login.busyLogin': 'ندخلك…',
    'login.busySignup': 'نسوي حسابك…',
    'login.noAccount': 'ما عندك حساب؟',
    'login.haveAccount': 'عندك حساب؟',
    'login.goSignup': 'سوّ حساب',
    'login.goLogin': 'ادخل',
    'login.forgot': 'نسيت الباسوورد؟',
    'login.forgotBody': 'استرجاع الباسوورد بالإيميل مو متوفر بهالنسخة. إذا أنت داخل بجهاز ثاني، تقدر تغيّره من «حسابي». وتقدر تكمّل كضيف وتسوي حساب جديد بعدين.',
    'login.guestNote': 'عندك {count} محفوظة بهالمتصفح — بتنتقل لحسابك تلقائياً أول ما تدخل أو تسجّل.',
    'login.guestNoteSalary': 'راتبك محفوظ بهالمتصفح — بينتقل لحسابك تلقائياً أول ما تدخل أو تسجّل.',
    'login.strength': 'قوة الباسوورد: {level}',
    'login.lvl.short': 'قصير (أقل من 8)',
    'login.lvl.weak': 'ضعيف',
    'login.lvl.fair': 'مقبول',
    'login.lvl.good': 'زين',
    'login.lvl.strong': 'قوي',
    'login.rule8': '8 حروف أو أكثر',
    'login.ruleMix': 'حروف وأرقام',
    'login.ruleSym': 'رمز أو مسافة (اختياري)',
    'login.terms': 'بتسجيلك توافق إن أقساطي أداة تنظيم وحساب، مو نصيحة مالية.',
    'login.eEmail': 'اكتب إيميل صحيح، مثل name@example.com',
    'login.ePassword': 'اكتب الباسوورد',
    'login.eLong': 'الباسوورد طويل وايد (الحد 200 حرف)',
    'login.eTaken': 'هالإيميل مسجل قبل.',
    'login.useLogin': 'ادخل بهالإيميل',
    'login.inTitle': 'أنت داخل بـ',
    'login.inDesc': 'أقساطك محفوظة بحسابك، وتقدر تفتحها من أي جهاز.',
    'login.inDash': 'افتح لوحتي',
    'login.inContinue': 'كمّل للصفحة الي كنت فيها',
    'login.inAccount': 'حسابي',
    'login.inSwitch': 'تبي تدخل بحساب ثاني؟ اطلع أول.',
    'login.sideTitle': 'حسابك يحفظ أقساطك',
    'login.side1': 'افتح أقساطك من أي جهاز — الجوال واللابتوب',
    'login.side2': 'الي سجلته كضيف ينتقل لحسابك تلقائياً',
    'login.side3': 'كلمة السر مشفرة، وما نطلب أي بيانات بنكية',
    'login.side4': 'تقدر تصدّر بياناتك أو تحذف حسابك متى ما تبي',
    'login.sideGuest': 'تبي تجرب أول؟',
    'login.sideGuestLink': 'كمّل بدون حساب',
    'login.welcomeBack': 'هلا والله! رجعت لحسابك ✓',
  },
  en: {
    'login.title': 'Log in',
    'login.kicker': 'Your account',
    'login.h1': 'Welcome',
    'login.desc': 'Log in or create an account in seconds — just an email and a password, and your installments follow you to any device.',
    'login.tabsLabel': 'Log in or sign up',
    'login.tabLogin': 'Log in',
    'login.tabSignup': 'Sign up',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.newPassword': 'Choose a password',
    'login.show': 'Show password',
    'login.hide': 'Hide password',
    'login.caps': 'Heads-up: Caps Lock is on',
    'login.submitLogin': 'Log in',
    'login.submitSignup': 'Create my account',
    'login.busyLogin': 'Logging you in…',
    'login.busySignup': 'Creating your account…',
    'login.noAccount': 'No account yet?',
    'login.haveAccount': 'Already have an account?',
    'login.goSignup': 'Sign up',
    'login.goLogin': 'Log in',
    'login.forgot': 'Forgot your password?',
    'login.forgotBody': 'Password reset by email isn’t available in this version. If you’re still logged in on another device, change it from “My account”. You can also continue as a guest and sign up later.',
    'login.guestNote': 'You have {count} saved in this browser — they move into your account automatically when you log in or sign up.',
    'login.guestNoteSalary': 'Your salary is saved in this browser — it moves into your account automatically when you log in or sign up.',
    'login.strength': 'Password strength: {level}',
    'login.lvl.short': 'too short (under 8)',
    'login.lvl.weak': 'weak',
    'login.lvl.fair': 'fair',
    'login.lvl.good': 'good',
    'login.lvl.strong': 'strong',
    'login.rule8': '8 characters or more',
    'login.ruleMix': 'Letters and numbers',
    'login.ruleSym': 'A symbol or space (optional)',
    'login.terms': 'By signing up you agree that Aqsati is an organising tool, not financial advice.',
    'login.eEmail': 'Enter a valid email, like name@example.com',
    'login.ePassword': 'Enter your password',
    'login.eLong': 'That password is too long (200 characters max)',
    'login.eTaken': 'That email is already registered.',
    'login.useLogin': 'Log in with this email',
    'login.inTitle': 'You’re logged in as',
    'login.inDesc': 'Your installments are saved to your account and open on any device.',
    'login.inDash': 'Open my dashboard',
    'login.inContinue': 'Continue where you were',
    'login.inAccount': 'My account',
    'login.inSwitch': 'Want a different account? Log out first.',
    'login.sideTitle': 'Your account keeps your installments safe',
    'login.side1': 'Open your installments on any device — phone or laptop',
    'login.side2': 'Everything you saved as a guest moves in automatically',
    'login.side3': 'Encrypted password, and we never ask for bank details',
    'login.side4': 'Export your data or delete your account any time',
    'login.sideGuest': 'Want to try it first?',
    'login.sideGuestLink': 'Continue without an account',
    'login.welcomeBack': 'Welcome back ✓',
  },
});

// Same rule as the server (lib/auth.js) so most mistakes are caught before a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const params = new URLSearchParams(location.search);
const nextRaw = params.get('next');
const nextPath = safeNext(nextRaw);
const hasNext = nextPath !== '/app' && !!nextRaw;

const ALERT_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/></svg>';

const ui = {
  tabs: { login: $('#tab-login'), signup: $('#tab-signup') },
  panels: { login: $('#panel-login'), signup: $('#panel-signup') },
  forms: { login: $('#login-form'), signup: $('#signup-form') },
};
let mode = params.get('mode') === 'signup' || location.hash === '#signup' ? 'signup' : 'login';
let busy = false;

// ---------- tabs (arrow keys follow the reading direction) ----------

function selectTab(next, { focus = false, push = true } = {}) {
  mode = next === 'signup' ? 'signup' : 'login';
  for (const key of ['login', 'signup']) {
    const on = key === mode;
    ui.tabs[key].setAttribute('aria-selected', String(on));
    ui.tabs[key].tabIndex = on ? 0 : -1;
    ui.panels[key].hidden = !on;
  }
  // carry the typed email across
  const from = $(`#${mode === 'login' ? 'signup' : 'login'}-email`);
  const to = $(`#${mode}-email`);
  if (from && to && !to.value && from.value) to.value = from.value;
  if (push) {
    const url = new URL(location.href);
    if (mode === 'signup') url.searchParams.set('mode', 'signup');
    else url.searchParams.delete('mode');
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
  }
  if (focus) ui.tabs[mode].focus();
}

function bindTabs() {
  for (const key of ['login', 'signup']) {
    ui.tabs[key].addEventListener('click', () => selectTab(key));
  }
  $('.auth-tabs').addEventListener('keydown', (e) => {
    const rtl = getLang() === 'ar';
    let target = null;
    if (e.key === 'Home') target = 'login';
    else if (e.key === 'End') target = 'signup';
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const forward = (e.key === 'ArrowLeft') === rtl;
      const order = ['login', 'signup'];
      const i = order.indexOf(mode);
      target = order[(i + (forward ? 1 : -1) + order.length) % order.length];
    }
    if (!target) return;
    e.preventDefault();
    selectTab(target, { focus: true });
  });
  $$('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
    selectTab(btn.dataset.go);
    $(`#${mode}-email`)?.focus();
  }));
}

// ---------- password fields: show / hide, caps lock, strength ----------

function bindPasswordTools() {
  $$('.pw-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggle);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('data-i18n-aria-label', show ? 'login.hide' : 'login.show');
      btn.setAttribute('aria-label', t(show ? 'login.hide' : 'login.show'));
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch { /* not supported for this type */ }
    });
  });
  for (const id of ['login-password', 'signup-password']) {
    const input = document.getElementById(id);
    const hint = document.getElementById(id.replace('password', 'caps'));
    if (!input || !hint) continue;
    const check = (e) => {
      if (typeof e.getModifierState === 'function') hint.hidden = !e.getModifierState('CapsLock');
    };
    input.addEventListener('keydown', check);
    input.addEventListener('keyup', check);
    input.addEventListener('blur', () => { hint.hidden = true; });
  }
  $('#signup-password')?.addEventListener('input', renderStrength);
}

let lastLevel = '';
function renderStrength() {
  const input = $('#signup-password');
  const box = $('.pw-strength');
  const label = $('#signup-strength');
  if (!input || !box || !label) return;
  const s = passwordStrength(input.value);
  box.dataset.level = s.level;
  box.dataset.score = String(s.score);
  // announce only when the level changes (not on every key)
  if (s.level !== lastLevel) {
    lastLevel = s.level;
    label.textContent = s.level === 'empty' ? '' : t('login.strength', { level: t(`login.lvl.${s.level}`) });
  }
  const rules = {
    length: s.checks.length,
    mix: (s.checks.lower || s.checks.upper || s.checks.otherLetter) && s.checks.digit,
    symbol: s.checks.symbol,
  };
  $$('.pw-rules li').forEach((li) => li.classList.toggle('is-met', !!rules[li.dataset.rule]));
}

// ---------- validation + errors ----------

function setFieldError(input, msg) {
  const err = document.getElementById(`${input.id}-err`);
  if (msg) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  if (err) err.textContent = msg || '';
}

function clearErrors(form) {
  $$('input', form).forEach((input) => setFieldError(input, ''));
  const alert = $('.form-alert', form);
  if (alert) alert.replaceChildren();
}

function showAlert(form, msg, action = null) {
  const alert = $('.form-alert', form);
  if (!alert) return;
  alert.innerHTML = `<div class="alert tone-over">${ALERT_ICON}<div class="alert-body"><p>${esc(msg)}</p></div></div>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-link';
    b.textContent = action.label;
    b.addEventListener('click', action.run);
    $('.alert-body', alert).append(b);
  }
}

function validate(kind, email, password) {
  const errors = {};
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.email = t('login.eEmail');
  if (kind === 'login') {
    if (!password) errors.password = t('login.ePassword');
    else if (password.length > MAX_LENGTH) errors.password = t('login.eLong');
  } else if (password.length < MIN_LENGTH) {
    errors.password = t('err.weak password');
  } else if (password.length > MAX_LENGTH) {
    errors.password = t('login.eLong');
  }
  return errors;
}

function setBusy(form, on, kind) {
  busy = on;
  const btn = $('.auth-submit', form);
  const label = $('.btn-label', btn);
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  if (on) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
  const key = on ? (kind === 'login' ? 'login.busyLogin' : 'login.busySignup') : (kind === 'login' ? 'login.submitLogin' : 'login.submitSignup');
  label.setAttribute('data-i18n', key);
  label.textContent = t(key);
  $$('input', form).forEach((input) => { input.readOnly = on; });
}

async function submit(kind, e) {
  e.preventDefault();
  if (busy) return;
  const form = ui.forms[kind];
  const emailEl = $(`#${kind}-email`);
  const pwEl = $(`#${kind}-password`);
  const email = emailEl.value.trim();
  const password = pwEl.value;
  emailEl.value = email;
  clearErrors(form);

  const errors = validate(kind, email, password);
  if (errors.email) setFieldError(emailEl, errors.email);
  if (errors.password) setFieldError(pwEl, errors.password);
  if (errors.email || errors.password) {
    (errors.email ? emailEl : pwEl).focus();
    return;
  }

  const hadGuestData = store.state.installments.length > 0 || !!store.state.profile;
  setBusy(form, true, kind);
  try {
    if (kind === 'login') await login(email, password);
    else await signup(email, password);
  } catch (err) {
    setBusy(form, false, kind);
    handleError(kind, err, emailEl, pwEl);
    return;
  }
  flash(kind === 'signup' || hadGuestData ? t('auth.welcome') : t('login.welcomeBack'), 'ok');
  location.assign(nextPath);
}

function handleError(kind, err, emailEl, pwEl) {
  const form = ui.forms[kind];
  const code = err?.code || err?.message;
  if (code === 'invalid email') {
    setFieldError(emailEl, errorText(err));
    emailEl.focus();
  } else if (code === 'weak password') {
    setFieldError(pwEl, errorText(err));
    pwEl.focus();
  } else if (code === 'invalid credentials') {
    showAlert(form, errorText(err));
    pwEl.setAttribute('aria-invalid', 'true');
    pwEl.select();
    pwEl.focus();
  } else if (code === 'email taken') {
    showAlert(form, t('login.eTaken'), {
      label: t('login.useLogin'),
      run: () => {
        $('#login-email').value = emailEl.value;
        selectTab('login');
        $('#login-password').focus();
      },
    });
    emailEl.setAttribute('aria-invalid', 'true');
    emailEl.focus();
  } else {
    showAlert(form, errorText(err));
    $('.auth-submit', form)?.focus();
  }
}

// ---------- page state: signed in / guest note ----------

function render() {
  const st = store.state;
  const signedIn = $('#signed-in');
  const forms = $('#auth-forms');
  if (st.user) {
    signedIn.hidden = false;
    forms.hidden = true;
    $('#si-email').textContent = st.user.email;
    $('#si-avatar').textContent = ([...st.user.email.trim()][0] || '?').toUpperCase();
    const primary = $('#si-primary');
    primary.href = nextPath;
    primary.setAttribute('data-i18n', hasNext ? 'login.inContinue' : 'login.inDash');
    primary.textContent = t(hasNext ? 'login.inContinue' : 'login.inDash');
  } else {
    signedIn.hidden = true;
    forms.hidden = false;
  }

  const note = $('#guest-note');
  const n = st.installments.length;
  if (!st.user && (n > 0 || st.profile)) {
    $('#guest-note-text').textContent = n > 0 ? t('login.guestNote', { count: fmt.count(n) }) : t('login.guestNoteSalary');
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

function bindSignedIn() {
  const btn = $('#si-logout');
  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await logout();
      toast(t('auth.loggedOut'));
      $('#login-email')?.focus();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
}

// ---------- boot ----------

bindTabs();
bindPasswordTools();
bindSignedIn();
ui.forms.login.addEventListener('submit', (e) => submit('login', e));
ui.forms.signup.addEventListener('submit', (e) => submit('signup', e));
// a field that was flagged clears its message as soon as the visitor edits it
for (const form of Object.values(ui.forms)) {
  form.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.getAttribute('aria-invalid') === 'true') setFieldError(e.target, '');
  });
}
selectTab(mode, { push: false });
renderStrength();

store.subscribe(render);
window.addEventListener('langchange', () => {
  lastLevel = '';
  renderStrength();
  render();
  $$('.pw-toggle').forEach((btn) => btn.setAttribute('aria-label', t(btn.getAttribute('aria-pressed') === 'true' ? 'login.hide' : 'login.show')));
});

initPage({ active: 'login', title: 'login.title' })
  .then(() => {
    render();
    if (!store.state.user) {
      const first = $(`#${mode}-email`);
      // focus the first field on wide screens only (on phones the keyboard would cover the page)
      if (first && window.matchMedia('(min-width: 1024px)').matches) first.focus({ preventScroll: true });
    }
  })
  .catch((err) => console.error(err));
