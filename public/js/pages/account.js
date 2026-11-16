// أقساطي — /account (حسابي). Works for guests too: they get an invitation to create an account plus the
// guest-safe settings (salary / safe limit / salary day, theme, language, CSV export).
// Accounts also get: change password, log out, delete account (confirm dialog + password, danger zone).

import {
  initPage, registerStrings, t, getLang, setLang, store, saveProfile, changePassword, deleteAccount, logout,
  getTheme, setTheme, errorText, toast, flash, confirmDialog, promptDialog, fmt, fx, esc, $, $$,
} from '../core.js';
import * as C from '../../calc.js';
import { passwordStrength, MIN_LENGTH, MAX_LENGTH } from '../logic/password-strength.js';
import { toCSV, installmentRows, exportFilename } from '../logic/export-csv.js';
import {
  getNotifySettings, notifySupport, enableNotify, disableNotify, setNotifyMode, sendTestNotification, checkDues,
  ensureBackgroundSync, refreshMirror, nextReminder,
} from '../logic/notify.js';

registerStrings({
  ar: {
    'acc.title': 'حسابي',
    'acc.kicker': 'حسابي',
    'acc.h1': 'حسابي والإعدادات',
    'acc.desc': 'راتبك وحدك الآمن، والمظهر واللغة، وأمان حسابك وبياناتك — كلها بمكان واحد.',
    'acc.signup': 'سوّ حساب',
    'acc.haveAccount': 'عندي حساب',
    'acc.exportShort': 'صدّر بياناتك',
    'acc.signedIn': 'داخل بحسابك',
    'acc.chipGuest': 'بياناتك بهالمتصفح بس',
    'acc.chipSaved': 'محفوظ بحسابك ✓',
    'acc.stCount': 'الأقساط',
    'acc.stPaid': 'الأشهر المدفوعة',
    'acc.stLimit': 'الحد الآمن',
    'acc.navLabel': 'أقسام الصفحة',

    'acc.inviteTitle': 'احفظ أقساطك بحساب',
    'acc.inviteDesc': 'حالياً بياناتك محفوظة بهالمتصفح بس. سوّ حساب بإيميل وباسوورد، وكل الي سجلته ينتقل له تلقائياً وتفتحه من أي جهاز.',
    'acc.invite1': 'من أي جهاز',
    'acc.invite2': 'ينتقل تلقائياً',
    'acc.invite3': 'مجاني',

    'acc.salaryTitle': 'الراتب والحد الآمن',
    'acc.salaryDesc': 'نحسب منها نسبة أقساطك وتنبيهات «أقدر أشتريه؟» ومواعيد الراتب بالتقويم.',
    'acc.salary': 'الراتب الشهري',
    'acc.salaryPh': 'مثلاً 1200',
    'acc.limit': 'الحد الآمن',
    'acc.limitHint': 'الافتراضي ⁦40%⁩. اختار أقل إذا تبي تكون أريح.',
    'acc.limitQuick': 'نسب جاهزة للحد الآمن',
    'acc.salaryDay': 'يوم نزول الراتب',
    'acc.dayNone': 'مو محدد',
    'acc.dayN': 'يوم {n}',
    'acc.dayLast': 'آخر يوم بالشهر (31)',
    'acc.pvLimit': 'حدك الآمن بالشهر',
    'acc.pvNext': 'راتبك الجاي',
    'acc.pvNoDay': 'حدد اليوم عشان نذكرك',
    'acc.pvNextVal': '{date} · {when}',
    'acc.eSalary': 'حط راتب صحيح أكبر من صفر',
    'acc.eLimit': 'نسبة من 1 إلى 100',
    'acc.eDay': 'يوم من 1 إلى 31',
    'acc.saved': 'انحفظت إعداداتك ✓',
    'acc.unsaved': 'فيه تغييرات ما انحفظت',
    'acc.savedState': 'محفوظ ✓',

    'acc.appearanceTitle': 'المظهر',
    'acc.appearanceDesc': 'فاتح، داكن، أو خله يتبع جهازك.',
    'acc.themeLight': 'فاتح',
    'acc.themeDark': 'داكن',
    'acc.themeSystem': 'حسب الجهاز',
    'acc.languageTitle': 'اللغة',
    'acc.languageDesc': 'لغة الواجهة على هالجهاز.',

    'acc.securityTitle': 'الأمان',
    'acc.securityDesc': 'غيّر الباسوورد. الجهاز الحالي يظل داخل، وأي جهاز ثاني يطلع.',
    'acc.securityGuest': 'تغيير الباسوورد يحتاج حساب. سوّ حساب عشان تحمي أقساطك بباسوورد.',
    'acc.show': 'أظهر الباسوورد',
    'acc.hide': 'أخفِ الباسوورد',
    'acc.pwCurrent': 'الباسوورد الحالي',
    'acc.pwNew': 'الباسوورد الجديد',
    'acc.pwConfirm': 'أكّد الباسوورد الجديد',
    'acc.pwSave': 'غيّر الباسوورد',
    'acc.pwSaving': 'نغيّره…',
    'acc.eCurrent': 'اكتب الباسوورد الحالي',
    'acc.eWrongCurrent': 'الباسوورد الحالي غلط',
    'acc.eLong': 'الباسوورد طويل وايد (الحد 200 حرف)',
    'acc.eMatch': 'الباسوورد الجديد وتأكيده مو نفس الشي',
    'acc.eSame': 'الباسوورد الجديد نفس الحالي — اختار واحد ثاني',
    'acc.strength': 'قوة الباسوورد: {level}',
    'acc.lvl.short': 'قصير (أقل من 8)',
    'acc.lvl.weak': 'ضعيف',
    'acc.lvl.fair': 'مقبول',
    'acc.lvl.good': 'زين',
    'acc.lvl.strong': 'قوي',

    'acc.dataTitle': 'بياناتك',
    'acc.dataDesc': 'نزّل أقساطك والأشهر الي علّمتها مدفوعة بملف CSV يفتح بالإكسل وبالعربي.',
    'acc.dsCount': 'عدد الأقساط',
    'acc.dsPaid': 'الأشهر المدفوعة',
    'acc.dsMonthly': 'مجموعها بالشهر',
    'acc.exportCsv': 'نزّل CSV',
    'acc.openReport': 'التقرير الشهري PDF',
    'acc.dataEmpty': 'ما عندك أقساط تصدّرها للحين.',
    'acc.dataAdd': 'أضف أول قسط',
    'acc.exported': 'نزل الملف {file} ✓',
    'acc.exportFail': 'ما قدرنا ننزّل الملف، جرب مرة ثانية.',
    'acc.csv.provider': 'الجهة',
    'acc.csv.title': 'الوصف',
    'acc.csv.monthly': 'القسط الشهري (د.ك)',
    'acc.csv.dueDay': 'يوم الاستحقاق',
    'acc.csv.first': 'أول استحقاق',
    'acc.csv.last': 'آخر استحقاق',
    'acc.csv.total': 'عدد الأقساط',
    'acc.csv.left': 'الأقساط الباقية',
    'acc.csv.leftAmount': 'المبلغ الباقي (د.ك)',
    'acc.csv.status': 'الحالة',
    'acc.csv.paidMonths': 'الأشهر المدفوعة',
    'acc.csv.paidCount': 'عدد الأشهر المدفوعة',
    'acc.csv.active': 'شغّال',
    'acc.csv.done': 'خالص',
    'acc.csv.mode': 'طريقة الإدخال',
    'acc.csv.lastAmount': 'آخر دفعة (د.ك)',
    'acc.csv.open': 'مفتوح',
    'acc.csv.modeCount': 'عدد الأقساط',
    'acc.csv.modeAmount': 'المبلغ الباقي',
    'acc.csv.modeOpen': 'بدون نهاية',

    'acc.dangerTitle': 'منطقة الخطر',
    'acc.dangerDesc': 'حذف الحساب نهائي: ينحذف حسابك وكل أقساطك وراتبك وسجل الدفع، وما نقدر نرجعها.',
    'acc.danger1': 'يطلع من كل الأجهزة على طول',
    'acc.danger2': 'نصيحة: نزّل نسخة CSV قبل لا تحذف',
    'acc.deleteBtn': 'احذف حسابي',
    'acc.delTitle': 'تحذف حسابك نهائياً؟',
    'acc.delBody': 'بينحذف حسابك (⁦{email}⁩) وكل أقساطك وراتبك وسجل الدفع من كل الأجهزة. ما نقدر نرجعها بعدين.',
    'acc.delContinue': 'إي، كمّل',
    'acc.delPwTitle': 'أكّد بالباسوورد',
    'acc.delPwBody': 'اكتب الباسوورد حقك عشان نتأكد إنه أنت.',
    'acc.delPwLabel': 'الباسوورد',
    'acc.delConfirm': 'احذف حسابي نهائياً',
    'acc.ePwRequired': 'اكتب الباسوورد',
    'acc.eWrongPw': 'الباسوورد غلط',
  },
  en: {
    'acc.title': 'My account',
    'acc.kicker': 'My account',
    'acc.h1': 'Account & settings',
    'acc.desc': 'Your salary and safe limit, look and language, account security and your data — all in one place.',
    'acc.signup': 'Create an account',
    'acc.haveAccount': 'I have an account',
    'acc.exportShort': 'Export your data',
    'acc.signedIn': 'Signed in',
    'acc.chipGuest': 'Saved in this browser only',
    'acc.chipSaved': 'Saved to your account ✓',
    'acc.stCount': 'Installments',
    'acc.stPaid': 'Months paid',
    'acc.stLimit': 'Safe limit',
    'acc.navLabel': 'Page sections',

    'acc.inviteTitle': 'Keep your installments in an account',
    'acc.inviteDesc': 'Right now your data lives in this browser only. Create an account with an email and a password — everything you saved moves in automatically and opens on any device.',
    'acc.invite1': 'Any device',
    'acc.invite2': 'Moves in automatically',
    'acc.invite3': 'Free',

    'acc.salaryTitle': 'Salary & safe limit',
    'acc.salaryDesc': 'Used for your installment ratio, the “Can I afford it?” warnings and salary days on the calendar.',
    'acc.salary': 'Monthly salary',
    'acc.salaryPh': 'e.g. 1200',
    'acc.limit': 'Safe limit',
    'acc.limitHint': 'Default is 40%. Pick lower if you want more breathing room.',
    'acc.limitQuick': 'Safe limit presets',
    'acc.salaryDay': 'Salary day',
    'acc.dayNone': 'Not set',
    'acc.dayN': 'Day {n}',
    'acc.dayLast': 'Last day of the month (31)',
    'acc.pvLimit': 'Your monthly safe limit',
    'acc.pvNext': 'Next salary',
    'acc.pvNoDay': 'Set the day to get reminders',
    'acc.pvNextVal': '{date} · {when}',
    'acc.eSalary': 'Enter a valid salary above zero',
    'acc.eLimit': 'A percentage from 1 to 100',
    'acc.eDay': 'A day from 1 to 31',
    'acc.saved': 'Settings saved ✓',
    'acc.unsaved': 'You have unsaved changes',
    'acc.savedState': 'Saved ✓',

    'acc.appearanceTitle': 'Appearance',
    'acc.appearanceDesc': 'Light, dark, or follow your device.',
    'acc.themeLight': 'Light',
    'acc.themeDark': 'Dark',
    'acc.themeSystem': 'Device',
    'acc.languageTitle': 'Language',
    'acc.languageDesc': 'Interface language on this device.',

    'acc.securityTitle': 'Security',
    'acc.securityDesc': 'Change your password. This device stays signed in; any other device is signed out.',
    'acc.securityGuest': 'Changing a password needs an account. Create one to protect your installments with a password.',
    'acc.show': 'Show password',
    'acc.hide': 'Hide password',
    'acc.pwCurrent': 'Current password',
    'acc.pwNew': 'New password',
    'acc.pwConfirm': 'Confirm new password',
    'acc.pwSave': 'Change password',
    'acc.pwSaving': 'Changing…',
    'acc.eCurrent': 'Enter your current password',
    'acc.eWrongCurrent': 'Your current password is wrong',
    'acc.eLong': 'That password is too long (200 characters max)',
    'acc.eMatch': 'The new password and its confirmation don’t match',
    'acc.eSame': 'The new password is the same as the current one',
    'acc.strength': 'Password strength: {level}',
    'acc.lvl.short': 'too short (under 8)',
    'acc.lvl.weak': 'weak',
    'acc.lvl.fair': 'fair',
    'acc.lvl.good': 'good',
    'acc.lvl.strong': 'strong',

    'acc.dataTitle': 'Your data',
    'acc.dataDesc': 'Download your installments and the months you marked paid as a CSV file that opens in Excel (Arabic included).',
    'acc.dsCount': 'Installments',
    'acc.dsPaid': 'Months paid',
    'acc.dsMonthly': 'per month',
    'acc.exportCsv': 'Download CSV',
    'acc.openReport': 'Monthly PDF report',
    'acc.dataEmpty': 'You have no installments to export yet.',
    'acc.dataAdd': 'Add your first installment',
    'acc.exported': 'Downloaded {file} ✓',
    'acc.exportFail': 'We couldn’t create the file. Please try again.',
    'acc.csv.provider': 'Provider',
    'acc.csv.title': 'Description',
    'acc.csv.monthly': 'Monthly (KWD)',
    'acc.csv.dueDay': 'Due day',
    'acc.csv.first': 'First due date',
    'acc.csv.last': 'Last due date',
    'acc.csv.total': 'Total payments',
    'acc.csv.left': 'Payments left',
    'acc.csv.leftAmount': 'Amount left (KWD)',
    'acc.csv.status': 'Status',
    'acc.csv.paidMonths': 'Months marked paid',
    'acc.csv.paidCount': 'Paid months count',
    'acc.csv.active': 'Active',
    'acc.csv.done': 'Finished',
    'acc.csv.mode': 'Entered as',
    'acc.csv.lastAmount': 'Last payment (KWD)',
    'acc.csv.open': 'Open-ended',
    'acc.csv.modeCount': 'Payments left',
    'acc.csv.modeAmount': 'Amount left',
    'acc.csv.modeOpen': 'Open-ended',

    'acc.dangerTitle': 'Danger zone',
    'acc.dangerDesc': 'Deleting your account is permanent: your account, installments, salary and payment history are removed and can’t be recovered.',
    'acc.danger1': 'Signs you out of every device at once',
    'acc.danger2': 'Tip: download a CSV copy first',
    'acc.deleteBtn': 'Delete my account',
    'acc.delTitle': 'Delete your account for good?',
    'acc.delBody': 'Your account (⁦{email}⁩) and all its installments, salary and payment history will be deleted from every device. This can’t be undone.',
    'acc.delContinue': 'Yes, continue',
    'acc.delPwTitle': 'Confirm with your password',
    'acc.delPwBody': 'Enter your password so we know it’s you.',
    'acc.delPwLabel': 'Password',
    'acc.delConfirm': 'Delete my account permanently',
    'acc.ePwRequired': 'Enter your password',
    'acc.eWrongPw': 'Wrong password',
  },
});

/** Point an element at another i18n key (language switches keep it right) and fill it now. */
function setKey(el, key) {
  if (!el) return;
  el.setAttribute('data-i18n', key);
  el.textContent = t(key);
}

function setFieldError(input, msg) {
  if (!input) return;
  const err = document.getElementById(`${input.id}-err`);
  if (msg) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  if (err) err.textContent = msg || '';
}

function setBusy(btn, on, labelKey) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  if (on) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
  if (labelKey) setKey($('.btn-label', btn), labelKey);
}

const paidCount = (st) => new Set(st.payments.map((p) => `${p.installment_id}|${p.month}`)).size;

// ---------- salary / safe limit / salary day ----------

const salary = { dirty: false, saving: false, touched: new Set() };

function buildDayOptions() {
  const select = $('#f-day');
  if (!select || select.options.length > 1) return;
  for (let d = 1; d <= 31; d += 1) {
    const opt = document.createElement('option');
    opt.value = String(d);
    select.append(opt);
  }
  labelDayOptions();
}

function labelDayOptions() {
  $$('#f-day option').forEach((opt) => {
    if (!opt.value) return;
    const n = Number(opt.value);
    opt.textContent = n === 31 ? t('acc.dayLast') : t('acc.dayN', { n });
  });
}

function fillSalary(force = false) {
  if (salary.dirty && !force) return;
  const p = store.state.profile;
  $('#f-salary').value = p?.salary ? String(C.round3(p.salary)) : '';
  $('#f-limit').value = String(p?.safe_limit ?? C.DEFAULT_SAFE_LIMIT);
  $('#f-day').value = p?.salary_day ? String(p.salary_day) : '';
  salary.touched.clear();
  syncLimitQuick();
  renderSalary();
}

function readSalary() {
  const raw = {
    salary: $('#f-salary').value,
    limit: $('#f-limit').value.trim() === '' ? String(C.DEFAULT_SAFE_LIMIT) : $('#f-limit').value,
    salaryDay: $('#f-day').value,
  };
  const v = C.validateProfileInput(raw);
  const errors = {};
  if (v.errors.salary) errors.salary = 'acc.eSalary';
  if (v.errors.limit) errors.limit = 'acc.eLimit';
  if (v.errors.salaryDay) errors.salaryDay = 'acc.eDay';
  return { ok: v.ok, errors, value: v.value };
}

function renderSalary({ showAll = false } = {}) {
  const r = readSalary();
  const map = { salary: '#f-salary', limit: '#f-limit', salaryDay: '#f-day' };
  for (const [key, sel] of Object.entries(map)) {
    const show = (showAll || salary.touched.has(key)) && r.errors[key];
    setFieldError($(sel), show ? t(r.errors[key]) : '');
  }
  const limitEl = $('#pv-limit');
  if (limitEl) {
    limitEl.textContent = !r.errors.salary && !r.errors.limit
      ? fmt.money((r.value.salary * r.value.limit) / 100)
      : '—';
  }
  const nextEl = $('#pv-next');
  if (nextEl) {
    const today = C.todayISO();
    const iso = r.value.salaryDay ? C.nextSalaryDate(r.value.salaryDay, today) : null;
    nextEl.textContent = iso
      ? t('acc.pvNextVal', { date: fmt.date(iso), when: fmt.daysLeft(C.daysBetween(today, iso)) })
      : t('acc.pvNoDay');
    nextEl.classList.toggle('is-muted', !iso);
  }
  const state = $('#salary-state');
  if (state) {
    if (salary.dirty) setKey(state, 'acc.unsaved');
    else if (store.state.profile) setKey(state, 'acc.savedState');
    else { state.removeAttribute('data-i18n'); state.textContent = ''; }
    state.classList.toggle('is-dirty', salary.dirty);
  }
}

function syncLimitQuick() {
  const v = C.parseAmount($('#f-limit').value);
  $$('input[name="limitQuick"]').forEach((r) => { r.checked = Number(r.value) === v; });
}

function bindSalary() {
  const form = $('#salary-form');
  form.addEventListener('input', (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.name === 'limitQuick') {
      $('#f-limit').value = target.value;
      salary.touched.add('limit');
    } else if (target instanceof HTMLInputElement && target.name === 'limit') {
      syncLimitQuick();
    }
    salary.dirty = true;
    renderSalary();
  });
  form.addEventListener('change', (e) => {
    if (e.target instanceof HTMLSelectElement) {
      salary.dirty = true;
      salary.touched.add('salaryDay');
      renderSalary();
    }
  });
  form.addEventListener('focusout', (e) => {
    const name = e.target?.name;
    if (['salary', 'limit', 'salaryDay'].includes(name)) {
      salary.touched.add(name);
      renderSalary();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (salary.saving) return;
    const r = readSalary();
    renderSalary({ showAll: true });
    if (!r.ok) {
      const first = r.errors.salary ? '#f-salary' : r.errors.limit ? '#f-limit' : '#f-day';
      $(first)?.focus();
      return;
    }
    const btn = $('#salary-save');
    salary.saving = true;
    setBusy(btn, true, 'common.saving');
    try {
      await saveProfile({ salary: r.value.salary, safeLimit: r.value.limit, salaryDay: r.value.salaryDay ?? null });
      salary.dirty = false;
      fillSalary(true);
      toast(t('acc.saved'), 'ok');
    } catch (err) {
      const code = err?.code;
      if (code === 'invalid salary') setFieldError($('#f-salary'), errorText(err));
      else if (code === 'invalid safe limit') setFieldError($('#f-limit'), t('acc.eLimit'));
      else if (code === 'invalid salary day') setFieldError($('#f-day'), errorText(err));
      toast(errorText(err), 'error');
    } finally {
      salary.saving = false;
      setBusy(btn, false, 'common.save');
    }
  });
}

// ---------- appearance + language ----------

function syncPrefs() {
  const mode = getTheme();
  $$('input[name="theme"]').forEach((r) => { r.checked = r.value === mode; });
  const lang = getLang();
  $$('input[name="lang"]').forEach((r) => { r.checked = r.value === lang; });
}

function bindPrefs() {
  $$('input[name="theme"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) setTheme(r.value); }));
  $$('input[name="lang"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) setLang(r.value); }));
  window.addEventListener('themechange', syncPrefs);
}

// ---------- password tools (show / hide + strength) ----------

function bindPasswordTools() {
  $$('.pw-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggle);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('data-i18n-aria-label', show ? 'acc.hide' : 'acc.show');
      btn.setAttribute('aria-label', t(show ? 'acc.hide' : 'acc.show'));
      input.focus({ preventScroll: true });
    });
  });
  $('#pw-new')?.addEventListener('input', renderStrength);
}

let lastLevel = '';
function renderStrength() {
  const input = $('#pw-new');
  const box = $('#password-form .pw-strength');
  const label = $('#pw-strength-label');
  if (!input || !box || !label) return;
  const s = passwordStrength(input.value);
  box.dataset.level = s.level;
  if (s.level !== lastLevel) {
    lastLevel = s.level;
    label.textContent = s.level === 'empty' ? '' : t('acc.strength', { level: t(`acc.lvl.${s.level}`) });
  }
}

// ---------- change password ----------

function bindPassword() {
  const form = $('#password-form');
  form.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.getAttribute('aria-invalid') === 'true') setFieldError(e.target, '');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = $('#pw-current');
    const next = $('#pw-new');
    const confirm = $('#pw-confirm');
    const alert = $('#password-alert');
    alert.replaceChildren();
    [current, next, confirm].forEach((el) => setFieldError(el, ''));

    let bad = null;
    if (!current.value) { setFieldError(current, t('acc.eCurrent')); bad ??= current; }
    if (next.value.length < MIN_LENGTH) { setFieldError(next, t('err.weak password')); bad ??= next; }
    else if (next.value.length > MAX_LENGTH) { setFieldError(next, t('acc.eLong')); bad ??= next; }
    else if (current.value && next.value === current.value) { setFieldError(next, t('acc.eSame')); bad ??= next; }
    if (!bad && confirm.value !== next.value) { setFieldError(confirm, t('acc.eMatch')); bad ??= confirm; }
    if (bad) {
      bad.focus();
      return;
    }

    const btn = $('#password-save');
    setBusy(btn, true, 'acc.pwSaving');
    try {
      await changePassword(current.value, next.value);
      form.reset();
      $('#pw-username').value = store.state.user?.email || '';
      lastLevel = '';
      renderStrength();
      toast(t('auth.passwordChanged'), 'ok');
    } catch (err) {
      const code = err?.code;
      if (code === 'invalid credentials') {
        setFieldError(current, t('acc.eWrongCurrent'));
        current.select();
        current.focus();
      } else if (code === 'weak password') {
        setFieldError(next, errorText(err));
        next.focus();
      } else {
        alert.innerHTML = `<div class="alert tone-over"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/></svg><p>${esc(errorText(err))}</p></div>`;
        if (code === 'not logged in') store.load().catch(() => {});
      }
    } finally {
      setBusy(btn, false, 'acc.pwSave');
    }
  });
}

// ---------- CSV export ----------

function exportCsv() {
  const st = store.state;
  if (!st.installments.length) {
    toast(t('acc.dataEmpty'));
    return;
  }
  const today = C.todayISO();
  const headers = ['provider', 'title', 'monthly', 'dueDay', 'first', 'last', 'total', 'left', 'leftAmount', 'status', 'paidMonths', 'paidCount', 'mode', 'lastAmount']
    .map((k) => t(`acc.csv.${k}`));
  try {
    const rows = installmentRows(st, today, {
      headers,
      provider: fmt.provider,
      status: { active: t('acc.csv.active'), done: t('acc.csv.done'), open: t('acc.csv.open') },
      modes: { count: t('acc.csv.modeCount'), amount: t('acc.csv.modeAmount'), open: t('acc.csv.modeOpen') },
    });
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const file = exportFilename(today);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.rel = 'noopener';
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(t('acc.exported', { file }), 'ok');
  } catch (err) {
    console.error(err);
    toast(t('acc.exportFail'), 'error');
  }
}

// ---------- delete account ----------

async function startDelete() {
  const email = store.state.user?.email;
  if (!email) return;
  const go = await confirmDialog({
    title: t('acc.delTitle'),
    body: t('acc.delBody', { email }),
    confirmLabel: t('acc.delContinue'),
    danger: true,
  });
  if (!go) return;
  const result = await promptDialog({
    title: t('acc.delPwTitle'),
    body: t('acc.delPwBody'),
    label: t('acc.delPwLabel'),
    type: 'password',
    autocomplete: 'current-password',
    dir: 'ltr',
    danger: true,
    confirmLabel: t('acc.delConfirm'),
    validate: (v) => (v ? '' : t('acc.ePwRequired')),
    onConfirm: async (password) => {
      try {
        await deleteAccount(password);
        return '';
      } catch (err) {
        return err?.code === 'invalid credentials' ? t('acc.eWrongPw') : errorText(err);
      }
    },
  });
  if (result === null) return;
  flash(t('auth.accountDeleted'), 'ok');
  location.assign('/');
}

// ---------- logout ----------

function bindLogout() {
  const btn = $('#acc-logout');
  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await logout();
      toast(t('auth.loggedOut'));
      $('#main')?.focus({ preventScroll: true });
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
}

// ---------- reminders («التنبيهات», public/js/logic/notify.js) ----------

registerStrings({
  ar: {
    'ntf.title': 'التنبيهات',
    'ntf.desc': 'نذكرك بالقسط قبل لا يجي موعده، عشان ما يفوتك ولا قسط.',
    'ntf.switch': 'نبهني قبل موعد القسط',
    'ntf.when': 'متى أذكرك؟',
    'ntf.before': 'قبل بيوم',
    'ntf.day': 'يوم القسط',
    'ntf.honest': 'التنبيه يوصلك لما تفتح اقصادي. وعلى الجوال، إذا ثبّت الموقع كتطبيق (Chrome على أندرويد)، يذكرك بالخلفية بعد حتى لو ما فتحته.',
    'ntf.test': 'جرّب تنبيه الحين',
    'ntf.onTitle': 'التنبيهات شغّالة',
    'ntf.onBefore': 'بنذكرك قبل موعد كل قسط بيوم.',
    'ntf.onDay': 'بنذكرك يوم القسط نفسه.',
    'ntf.next': 'التذكير الجاي {when}: {what} (الموعد {due})',
    'ntf.whenOn': 'يوم {day}',
    'ntf.whatOne': 'قسط {provider} {amount}',
    'ntf.whatMany': '{count} بـ {amount}',
    'ntf.nextNone': 'ما عندك قسط مستحق بالشهرين الجايين.',
    'ntf.bgOn': 'وبالخلفية بعد ✓ — حتى لو ما فتحت التطبيق.',
    'ntf.bgOff': 'حالياً يذكرك لما تفتح الموقع. عشان يذكرك بالخلفية، ثبّت الموقع كتطبيق على جوالك (Chrome على أندرويد: القائمة ← «تثبيت التطبيق»).',
    'ntf.bgNo': 'هالمتصفح يذكرك لما تفتح الموقع بس، ما يدعم التذكير بالخلفية.',
    'ntf.asking': 'نطلب الإذن من المتصفح… اختار «سماح».',
    'ntf.denied': 'المتصفح مانع التنبيهات لهالموقع. فعّلها من إعدادات الموقع بالمتصفح (رمز القفل جنب العنوان)، وبعدين شغّل المفتاح مرة ثانية.',
    'ntf.dismissed': 'ما سمحت للتنبيهات. شغّل المفتاح مرة ثانية واختار «سماح».',
    'ntf.unsupported': 'هالمتصفح ما يدعم التنبيهات. على الآيفون: ثبّت الموقع من زر المشاركة ← «إضافة إلى الشاشة الرئيسية» وافتحه من هناك، أو جرّب Chrome.',
    'ntf.enabled': 'تمام، بنذكرك قبل مواعيد أقساطك ✓',
    'ntf.disabled': 'وقّفنا التنبيهات.',
    'ntf.testSent': 'أرسلنا تنبيه تجريبي ✓ شوفه بشريط التنبيهات.',
    'ntf.testFail': 'ما قدرنا نرسل التنبيه. تأكد إن التنبيهات مسموحة للموقع.',
  },
  en: {
    'ntf.title': 'Reminders',
    'ntf.desc': 'We remind you before an installment is due, so you never miss one.',
    'ntf.switch': 'Remind me before an installment is due',
    'ntf.when': 'When should we remind you?',
    'ntf.before': 'A day before',
    'ntf.day': 'On the day',
    'ntf.honest': 'Reminders show up when you open Aqsati. On a phone where the site is installed as an app (Chrome on Android), they come in the background too, even if you don’t open it.',
    'ntf.test': 'Send a test reminder',
    'ntf.onTitle': 'Reminders are on',
    'ntf.onBefore': 'We’ll remind you a day before each installment is due.',
    'ntf.onDay': 'We’ll remind you on the day each installment is due.',
    'ntf.next': 'Next reminder {when}: {what} (due {due})',
    'ntf.whenOn': 'on {day}',
    'ntf.whatOne': '{provider} {amount}',
    'ntf.whatMany': '{count}, {amount}',
    'ntf.nextNone': 'Nothing is due in the next two months.',
    'ntf.bgOn': 'In the background too ✓ — even when the app is closed.',
    'ntf.bgOff': 'For now they come when you open the site. To get them in the background, install the site as an app on your phone (Chrome on Android: menu → “Install app”).',
    'ntf.bgNo': 'This browser reminds you only when you open the site; it has no background reminders.',
    'ntf.asking': 'Asking your browser for permission… choose “Allow”.',
    'ntf.denied': 'Your browser blocks notifications for this site. Allow them in the site settings (the lock icon next to the address), then turn the switch on again.',
    'ntf.dismissed': 'You didn’t allow notifications. Turn the switch on again and choose “Allow”.',
    'ntf.unsupported': 'This browser doesn’t support notifications. On iPhone: add the site to your Home Screen (Share → “Add to Home Screen”) and open it from there, or try Chrome.',
    'ntf.enabled': 'Done — we’ll remind you before your installments are due ✓',
    'ntf.disabled': 'Reminders are off.',
    'ntf.testSent': 'Test reminder sent ✓ Check your notifications.',
    'ntf.testFail': 'We couldn’t send it. Make sure notifications are allowed for this site.',
  },
});

const ntf = { busy: false, want: false, reason: '', background: null, html: null };

const NTF_ICONS = {
  ok: '<path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"/><path d="m8.5 12.2 2.3 2.3 4.7-4.8"/>',
  warn: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
};

function notifyBox(tone, icon, lines) {
  const [first, ...rest] = lines.filter(Boolean);
  return `<div class="alert tone-${tone}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${NTF_ICONS[icon]}</svg>`
    + `<div class="notify-msg"><p><strong>${esc(first)}</strong></p>${rest.map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>`;
}

function nextReminderLine(mode) {
  if (!store.loaded) return '';
  const today = C.todayISO();
  const next = nextReminder(store.state, today, mode);
  if (!next) return t('ntf.nextNone');
  const days = C.daysBetween(today, next.date);
  const when = days <= 1 ? fmt.daysLeft(days) : t('ntf.whenOn', { day: fmt.day(next.date) });
  const total = next.dues.reduce((s, d) => s + d.amount, 0);
  const money = (x) => fmt.money(x).replace(' ', ' '); // «45.500 د.ك» never splits across lines
  const what = next.dues.length === 1
    ? t('ntf.whatOne', { provider: fmt.provider(next.dues[0].provider), amount: money(next.dues[0].amount) })
    : t('ntf.whatMany', { count: fmt.count(next.dues.length), amount: money(total) });
  return t('ntf.next', { when, what, due: fmt.day(next.dues[0].date) });
}

function renderNotify() {
  const sw = $('#notify-on');
  if (!sw) return;
  const s = getNotifySettings();
  const perm = notifySupport();
  const on = s.on && perm === 'granted';
  sw.checked = ntf.busy ? ntf.want : on;
  sw.disabled = ntf.busy || perm === 'unsupported';
  $$('input[name="notifyWhen"]').forEach((r) => {
    r.checked = r.value === s.mode;
    r.disabled = !on || ntf.busy;
  });
  $('#notify-when').classList.toggle('is-off', !on);
  $('#notify-actions').hidden = !on;
  $('.notify-honest').hidden = on; // when on, the status box says exactly where reminders reach this device

  let html = '';
  if (ntf.busy && ntf.want) html = notifyBox('info', 'info', [t('ntf.asking')]);
  else if (perm === 'unsupported') html = notifyBox('info', 'info', [t('ntf.unsupported')]);
  else if (perm === 'denied') html = notifyBox('warn', 'warn', [t('ntf.denied')]);
  else if (!on && ntf.reason === 'dismissed') html = notifyBox('warn', 'warn', [t('ntf.dismissed')]);
  else if (on) {
    const bg = ntf.background === 'on' ? t('ntf.bgOn') : ntf.background === 'unsupported' ? t('ntf.bgNo') : t('ntf.bgOff');
    html = notifyBox('ok', 'ok', [t('ntf.onTitle'), t(s.mode === 'day' ? 'ntf.onDay' : 'ntf.onBefore'), nextReminderLine(s.mode), bg]);
  }
  if (ntf.html !== html) { // the box is aria-live: only touch it when the message changes
    $('#notify-status').innerHTML = html;
    ntf.html = html;
  }
}

async function toggleNotify() {
  const sw = $('#notify-on');
  ntf.want = sw.checked;
  ntf.reason = '';
  ntf.busy = true;
  renderNotify();
  try {
    if (ntf.want) {
      const mode = $('input[name="notifyWhen"]:checked')?.value;
      const r = await enableNotify(mode);
      if (r.ok) {
        ntf.background = r.background;
        toast(t('ntf.enabled'), 'ok');
        checkDues(store.state).catch(() => {}); // something due tomorrow? it shows right away
      } else {
        ntf.reason = r.reason;
      }
    } else {
      await disableNotify();
      ntf.background = null;
      toast(t('ntf.disabled'));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ntf.busy = false;
    renderNotify();
  }
}

function bindNotify() {
  $('#notify-on')?.addEventListener('change', () => { toggleNotify(); });
  $$('input[name="notifyWhen"]').forEach((r) => r.addEventListener('change', async () => {
    if (!r.checked) return;
    await setNotifyMode(r.value);
    renderNotify();
    toast(t(r.value === 'day' ? 'ntf.onDay' : 'ntf.onBefore'), 'ok');
    checkDues(store.state).catch(() => {});
  }));
  $('#notify-test')?.addEventListener('click', async () => {
    const ok = await sendTestNotification();
    toast(t(ok ? 'ntf.testSent' : 'ntf.testFail'), ok ? 'ok' : 'error');
  });
  window.addEventListener('langchange', () => { refreshMirror(); });
  // permission changed in the browser's site settings while this page is open
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderNotify(); });
  if (getNotifySettings().on && notifySupport() === 'granted') {
    ensureBackgroundSync().then((b) => { ntf.background = b; renderNotify(); }).catch(() => {});
  }
}

// ---------- render ----------

const GUEST_AVATAR = $('#acc-avatar')?.innerHTML || '';

function render() {
  const st = store.state;
  const user = st.user;

  const avatar = $('#acc-avatar');
  if (avatar) {
    if (user) avatar.textContent = ([...user.email.trim()][0] || '?').toUpperCase();
    else avatar.innerHTML = GUEST_AVATAR;
    avatar.classList.toggle('is-guest', !user);
  }
  setKey($('#profile-name'), user ? 'acc.signedIn' : 'auth.guest');
  const emailEl = $('#profile-email');
  emailEl.textContent = user?.email || '';
  emailEl.hidden = !user;
  const chip = $('#profile-chip');
  chip.className = `chip ${user ? 'chip-ok' : 'chip-none'}`;
  setKey(chip, user ? 'acc.chipSaved' : 'acc.chipGuest');

  const count = st.installments.length;
  const paid = paidCount(st);
  const limit = Number(st.profile?.safe_limit) || C.DEFAULT_SAFE_LIMIT;
  $('#st-count').textContent = fmt.num(count);
  $('#st-paid').textContent = fmt.num(paid);
  $('#st-limit').textContent = fmt.pct(limit);

  $('#profile-guest-actions').hidden = !!user;
  $('#profile-user-actions').hidden = !user;
  $('#acc-invite').hidden = !!user;
  $('#head-signup').hidden = !!user;
  $('#head-export').hidden = !user || !count;

  $('#security-guest').hidden = !!user;
  $('#password-form').hidden = !user;
  $('#pw-username').value = user?.email || '';
  $('#sec-danger').hidden = !user;
  $('#nav-danger').hidden = !user;

  // data
  $('#ds-count').textContent = fmt.num(count);
  $('#ds-paid').textContent = fmt.num(paid);
  let monthly = 0;
  try {
    monthly = count ? C.monthSummary(st.installments, Number(st.profile?.salary) || 0, limit, C.todayISO()).monthlyTotal : 0;
  } catch { monthly = 0; }
  $('#ds-monthly').textContent = count ? fmt.money(monthly) : '—';
  $('#export-csv').disabled = !count;
  $('#data-empty').hidden = count > 0;

  fillSalary();
  syncPrefs();
  renderNotify();
}

// ---------- boot ----------

buildDayOptions();
bindSalary();
bindPrefs();
bindPasswordTools();
bindPassword();
bindLogout();
bindNotify();
$('#export-csv')?.addEventListener('click', exportCsv);
$('#head-export')?.addEventListener('click', exportCsv);
$('#delete-account')?.addEventListener('click', () => { startDelete().catch((err) => toast(errorText(err), 'error')); });

// section nav highlights the section on screen
$$('.acc-nav a[href^="#"]').forEach((a) => { a.dataset.spy = a.getAttribute('href').slice(1); });
fx.scrollFx({ bar: null, links: $$('.acc-nav a[data-spy]') });

store.subscribe(render);
window.addEventListener('langchange', () => {
  labelDayOptions();
  lastLevel = '';
  renderStrength();
  renderSalary();
  render();
  $$('.pw-toggle').forEach((btn) => btn.setAttribute('aria-label', t(btn.getAttribute('aria-pressed') === 'true' ? 'acc.hide' : 'acc.show')));
});

render();
initPage({ active: 'account', requireAuth: true, title: 'acc.title' }).catch((err) => console.error(err));
