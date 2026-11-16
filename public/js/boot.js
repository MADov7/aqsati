// اقصادي — tiny render-blocking boot script (classic, runs in <head> before the CSS).
// Puts the saved language (lang + dir) and theme on <html> BEFORE the first paint, so English or
// explicitly-dark users never see an Arabic/RTL/light flash that flips once the page modules load.
// core.js re-applies the same values later; storage access is always wrapped in try/catch.
(function boot() {
  var root = document.documentElement;
  var lang = 'ar';
  var mode = 'system';
  try {
    var savedLang = window.localStorage.getItem('aqsati_lang');
    if (savedLang === 'en' || savedLang === 'ar') lang = savedLang;
  } catch (e) { /* storage blocked: Arabic */ }
  try {
    var savedTheme = window.localStorage.getItem('aqsati_theme');
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') mode = savedTheme;
  } catch (e) { /* storage blocked: follow the device */ }

  root.lang = lang;
  root.dir = lang === 'en' ? 'ltr' : 'rtl';

  var dark = mode === 'dark';
  if (mode === 'system') {
    try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { dark = false; }
  }
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-theme-mode', mode);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#07121f' : '#0f2a4a');

  // English pages keep <main> hidden until core.js has applied the strings (it adds .i18n-ready);
  // never leave it hidden for long if the modules fail to load.
  if (lang === 'en') {
    window.setTimeout(function reveal() { root.classList.add('i18n-ready'); }, 2500);
  }
}());
