// أقساطي — tiny i18n (Arabic first, English second). No dependencies, CSP-safe (textContent / attributes only).
//
//   registerStrings({ ar: { 'k': 'نص {name}' }, en: { 'k': 'Text {name}' } })
//   t('k', { name: 'x' })            → string in the current language (falls back to Arabic, then to the key)
//   a value may also be a function:  'count': (v) => (v.n === 1 ? '1 item' : `${v.n} items`)
//   applyI18n(root)                  → fills [data-i18n], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title]
//   setLang('en')                    → <html lang dir>, saved, applyI18n(document), then fires `langchange` on window

const LANG_KEY = 'aqsati_lang';
const LANGS = ['ar', 'en'];
const STRINGS = { ar: Object.create(null), en: Object.create(null) };

let current = null;

function readLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    // storage blocked: Arabic
  }
  return 'ar';
}

/** The current language: 'ar' (default) or 'en'. */
export function getLang() {
  if (!current) current = readLang();
  return current;
}

export const isRTL = () => getLang() === 'ar';

/** Merge page strings into the dictionary. Later calls win for the same key. */
export function registerStrings(dict = {}) {
  for (const lang of LANGS) {
    if (dict[lang] && typeof dict[lang] === 'object') Object.assign(STRINGS[lang], dict[lang]);
  }
}

export function hasString(key) {
  return key in STRINGS.ar || key in STRINGS.en;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined || vars[name] === null ? m : String(vars[name])));
}

/** Translate a key. Missing in English → Arabic → the key itself (so a typo is visible, never blank). */
export function t(key, vars) {
  const lang = getLang();
  let value = STRINGS[lang][key];
  if (value === undefined) value = STRINGS.ar[key];
  if (value === undefined) return String(key);
  if (typeof value === 'function') return String(value(vars || {}));
  return interpolate(String(value), vars);
}

/** Put the language on <html> (lang + dir) without saving or firing events. */
export function applyLangToDocument(lang = getLang()) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

/** Fill every [data-i18n*] element under root with the current language. */
export function applyI18n(root = document) {
  const scope = root || document;
  const each = (attr, fn) => {
    if (scope instanceof Element && scope.hasAttribute(attr)) fn(scope, scope.getAttribute(attr));
    scope.querySelectorAll(`[${attr}]`).forEach((el) => fn(el, el.getAttribute(attr)));
  };
  each('data-i18n', (el, key) => { el.textContent = t(key); });
  each('data-i18n-placeholder', (el, key) => el.setAttribute('placeholder', t(key)));
  each('data-i18n-aria-label', (el, key) => el.setAttribute('aria-label', t(key)));
  each('data-i18n-title', (el, key) => el.setAttribute('title', t(key)));
}

/** Switch language: updates <html lang/dir>, saves it, re-applies static strings, fires `langchange`. */
export function setLang(lang) {
  const next = LANGS.includes(lang) ? lang : 'ar';
  const changed = next !== getLang();
  current = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // memory only
  }
  applyLangToDocument(next);
  applyI18n(document);
  if (changed) window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: next } }));
  return next;
}

// Another tab switched the language → follow it here.
try {
  window.addEventListener('storage', (e) => {
    if (e.key !== LANG_KEY || !LANGS.includes(e.newValue) || e.newValue === getLang()) return;
    setLang(e.newValue);
  });
} catch {
  // no window (tests)
}

// ---------- shared strings: brand, navigation, auth area, theme, common buttons, levels, errors ----------

registerStrings({
  ar: {
    'app.name': 'اقصادي',
    'app.tagline': 'كل أقساطك بمكان واحد',
    'brand.home': 'اقصادي — الصفحة الرئيسية',
    'skip': 'تخطّى للمحتوى',

    'nav.label': 'التنقل الرئيسي',
    'nav.tabbar': 'التنقل السريع',
    'nav.home': 'الرئيسية',
    'nav.app': 'لوحتي',
    'nav.installments': 'أقساطي',
    'nav.tabInstallments': 'أقساطي',
    'nav.check': 'أقدر أشتريه؟',
    'nav.calendar': 'التقويم',
    'nav.insights': 'التحليل',
    'nav.report': 'التقرير',
    'nav.account': 'حسابي',
    'nav.login': 'دخول',
    'nav.menu': 'القائمة',
    'nav.openMenu': 'افتح القائمة',
    'nav.closeMenu': 'سكّر القائمة',
    'nav.more': 'صفحات ثانية',

    'auth.login': 'دخول',
    'auth.signup': 'سوّ حساب',
    'auth.logout': 'خروج',
    'auth.account': 'حسابي',
    'auth.menu': 'قائمة حسابك ({email})',
    'auth.signedInAs': 'داخل بحساب',
    'auth.guest': 'ضيف',
    'auth.guestHint': 'بياناتك محفوظة بهالمتصفح بس. سوّ حساب عشان تفتحها من أي جهاز.',
    'auth.welcome': 'هلا! بياناتك صارت محفوظة بحسابك',
    'auth.loggedOut': 'طلعت من حسابك. أقساطك محفوظة فيه، وترجع لها متى ما دخلت.',
    'auth.needLogin': 'هالصفحة تحتاج تدخل بحسابك.',
    'auth.passwordChanged': 'تغيّر الباسوورد ✓ وطلّعنا أي جهاز ثاني كان داخل بحسابك.',
    'auth.accountDeleted': 'انحذف حسابك وكل بياناته.',

    'lang.short': 'EN',
    'lang.label': 'التحويل للإنجليزية (English)',
    'lang.name': 'العربية',
    'theme.dark': 'الوضع الداكن',
    'theme.light': 'الوضع الفاتح',
    'theme.system': 'حسب الجهاز',
    'theme.toggle': 'الوضع الداكن',

    'common.save': 'حفظ',
    'common.saving': 'نحفظ…',
    'common.cancel': 'إلغاء',
    'common.close': 'سكّر',
    'common.confirm': 'تأكيد',
    'common.continue': 'كمّل',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.add': 'إضافة',
    'common.undo': 'تراجع',
    'common.retry': 'جرّب مرة ثانية',
    'common.loading': 'نحمّل…',
    'common.back': 'رجوع',
    'common.next': 'التالي',
    'common.prev': 'السابق',
    'common.yes': 'إي',
    'common.no': 'لا',
    'common.done': 'تم',
    'common.more': 'المزيد',
    'common.print': 'اطبع',
    'common.download': 'نزّل',
    'common.today': 'اليوم',
    'common.optional': '(اختياري)',
    'common.kwd': 'د.ك',
    'common.noTitle': 'بدون وصف',
    'common.paid': 'مدفوع',
    'common.unpaid': 'مو مدفوع',
    'common.markPaid': 'علّمه مدفوع',
    'common.perMonth': 'بالشهر',

    'level.ok': 'وضعك مريح ✓',
    'level.warn': 'قربت من حدك الآمن',
    'level.over': 'متعدي حدك الآمن',
    'level.none': 'حط راتبك عشان نحسب النسبة',

    'dialog.title': 'متأكد؟',
    'dialog.close': 'سكّر النافذة',

    'net.offline': 'أنت بدون إنترنت الحين. بياناتك تحتاج اتصال، والصفحة تتحدث بروحها أول ما يرجع الإنترنت.',
    'net.online': 'رجع الإنترنت ✓',
    'sw.update': 'فيه تحديث جديد للتطبيق',
    'sw.reload': 'حدّث',

    'err.network': 'ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرب مرة ثانية.',
    'err.offline': 'أنت بدون إنترنت. جرّب أول ما يرجع.',
    'err.config': 'إعدادات قاعدة البيانات ناقصة: لازم MONGODB_URI بالـ Environment Variables.',
    'err.db_unavailable': 'قاعدة البيانات مو متاحة الحين، جرب بعد شوي.',
    'err.bad origin': 'الطلب انرفض لأسباب أمان. حدّث الصفحة وجرب مرة ثانية.',
    'err.unsupported content type': 'الطلب انرفض لأسباب أمان. حدّث الصفحة وجرب مرة ثانية.',
    'err.too many installments': 'وصلت للحد الأقصى (50 قسط).',
    'err.invalid first due date': 'تاريخ الاستحقاق مو منطقي، تأكد من يوم الاستحقاق.',
    'err.invalid monthly': 'المبلغ الشهري مو صحيح.',
    'err.invalid input': 'في بيانات ناقصة أو مو صحيحة، راجعها وجرب مرة ثانية.',
    'err.invalid salary': 'حط راتب صحيح أكبر من صفر.',
    'err.invalid salary day': 'يوم الراتب لازم يكون من 1 إلى 31.',
    'err.invalid month': 'هالشهر برا الفترة المسموحة (آخر سنتين لين الشهر الجاي).',
    'err.invalid paid': 'صار خطأ بتعليم القسط، جرب مرة ثانية.',
    'err.token and id required': 'ما لقينا هالقسط. حدّث الصفحة وجرب مرة ثانية.',
    'err.token required': 'صار خطأ بهوية المتصفح. حدّث الصفحة وجرب مرة ثانية.',
    'err.not logged in': 'لازم تدخل بحسابك أول.',
    'err.invalid email': 'الإيميل مو صحيح',
    'err.weak password': 'الباسوورد لازم يكون 8 حروف أو أكثر',
    'err.email taken': 'هالإيميل مسجل قبل، جرّب «دخول»',
    'err.invalid credentials': 'الإيميل أو الباسوورد غلط',
    'err.too many attempts': 'محاولات كثيرة، جرّب بعد ربع ساعة',
    'err.http_429': 'محاولات كثيرة، جرّب بعد ربع ساعة',
    'err.body too large': 'البيانات أكبر من المسموح.',
    'err.unknown function': 'صار خطأ، حدّث الصفحة وجرب مرة ثانية.',
    'err.generic': 'صار خطأ، جرب مرة ثانية.',
  },
  en: {
    'app.name': 'Aqsati',
    'app.tagline': 'All your installments in one place',
    'brand.home': 'Aqsati — home',
    'skip': 'Skip to content',

    'nav.label': 'Main navigation',
    'nav.tabbar': 'Quick navigation',
    'nav.home': 'Home',
    'nav.app': 'Dashboard',
    'nav.installments': 'Installments',
    'nav.tabInstallments': 'Plans',
    'nav.check': 'Can I afford it?',
    'nav.calendar': 'Calendar',
    'nav.insights': 'Insights',
    'nav.report': 'Report',
    'nav.account': 'Account',
    'nav.login': 'Log in',
    'nav.menu': 'Menu',
    'nav.openMenu': 'Open menu',
    'nav.closeMenu': 'Close menu',
    'nav.more': 'More pages',

    'auth.login': 'Log in',
    'auth.signup': 'Sign up',
    'auth.logout': 'Log out',
    'auth.account': 'My account',
    'auth.menu': 'Account menu ({email})',
    'auth.signedInAs': 'Signed in as',
    'auth.guest': 'Guest',
    'auth.guestHint': 'Your data lives in this browser only. Create an account to open it on any device.',
    'auth.welcome': 'Welcome! Your data is now saved to your account',
    'auth.loggedOut': "You're logged out. Your installments stay in your account for next time.",
    'auth.needLogin': 'Please log in to open this page.',
    'auth.passwordChanged': 'Password changed ✓ Any other device signed in to your account was logged out.',
    'auth.accountDeleted': 'Your account and all its data were deleted.',

    'lang.short': 'ع',
    'lang.label': 'Switch to Arabic (العربية)',
    'lang.name': 'English',
    'theme.dark': 'Dark mode',
    'theme.light': 'Light mode',
    'theme.system': 'Match device',
    'theme.toggle': 'Dark mode',

    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.continue': 'Continue',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.undo': 'Undo',
    'common.retry': 'Try again',
    'common.loading': 'Loading…',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.prev': 'Previous',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.done': 'Done',
    'common.more': 'More',
    'common.print': 'Print',
    'common.download': 'Download',
    'common.today': 'Today',
    'common.optional': '(optional)',
    'common.kwd': 'KWD',
    'common.noTitle': 'No description',
    'common.paid': 'Paid',
    'common.unpaid': 'Not paid',
    'common.markPaid': 'Mark as paid',
    'common.perMonth': 'per month',

    'level.ok': "You're comfortable ✓",
    'level.warn': 'Close to your safe limit',
    'level.over': 'Over your safe limit',
    'level.none': 'Add your salary to see your ratio',

    'dialog.title': 'Are you sure?',
    'dialog.close': 'Close dialog',

    'net.offline': "You're offline. Your data needs a connection; the page refreshes by itself once you're back online.",
    'net.online': 'Back online ✓',
    'sw.update': 'A new version of the app is ready',
    'sw.reload': 'Reload',

    'err.network': "We couldn't reach the server. Check your connection and try again.",
    'err.offline': "You're offline. Try again once you're connected.",
    'err.config': 'The database settings are missing: MONGODB_URI must be set in the environment variables.',
    'err.db_unavailable': "The database isn't available right now. Try again shortly.",
    'err.bad origin': 'The request was blocked for security reasons. Refresh the page and try again.',
    'err.unsupported content type': 'The request was blocked for security reasons. Refresh the page and try again.',
    'err.too many installments': "You've reached the maximum (50 installments).",
    'err.invalid first due date': "That due date doesn't make sense. Check the due day.",
    'err.invalid monthly': "The monthly amount isn't valid.",
    'err.invalid input': 'Some details are missing or invalid. Check them and try again.',
    'err.invalid salary': 'Enter a valid salary above zero.',
    'err.invalid salary day': 'Salary day must be between 1 and 31.',
    'err.invalid month': "That month is outside the allowed range (the last two years up to next month).",
    'err.invalid paid': "We couldn't mark that installment. Try again.",
    'err.token and id required': "We couldn't find that installment. Refresh the page and try again.",
    'err.token required': 'Something went wrong with this browser identity. Refresh and try again.',
    'err.not logged in': 'Please log in first.',
    'err.invalid email': "That email isn't valid",
    'err.weak password': 'Password must be at least 8 characters',
    'err.email taken': 'That email is already registered. Try “Log in”',
    'err.invalid credentials': 'Wrong email or password',
    'err.too many attempts': 'Too many attempts. Try again in 15 minutes',
    'err.http_429': 'Too many attempts. Try again in 15 minutes',
    'err.body too large': 'That data is larger than allowed.',
    'err.unknown function': 'Something went wrong. Refresh the page and try again.',
    'err.generic': 'Something went wrong. Please try again.',
  },
});
