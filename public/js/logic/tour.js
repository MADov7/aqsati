// اقصادي — first-visit onboarding tour: coach marks that point at real elements on the page.
// Keyboard: Tab stays inside the coach mark, ←/→ move (mirrored in Arabic), Esc skips. Remembered per browser.
// Safe to import anywhere (no DOM work until startTour runs). Styles: .tour* in the page CSS (CSSOM only, CSP-safe).
//
//   if (!tourDone()) startTour({ steps: [{ target: '#el', title, body }], labels, rtl, onEnd(reason) })

export const TOUR_KEY = 'aqsati_tour_v1';

export function tourDone(key = TOUR_KEY) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markTourDone(key = TOUR_KEY) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // blocked storage: the tour may show again next time, which is fine
  }
}

/** Keep the step index inside 0..n-1. */
export const clampStep = (i, n) => Math.max(0, Math.min(n - 1, i));

const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length && !el.closest('[hidden]'));

let active = null;

/**
 * steps: [{ target: selector | Element, title, body }] (steps whose target is missing are skipped)
 * labels: { next, back, skip, done, close, step(i, n), region }
 * Returns { stop() } or null when nothing can be shown.
 */
export function startTour({ steps = [], labels = {}, rtl = false, key = TOUR_KEY, onEnd } = {}) {
  if (typeof document === 'undefined' || active) return null;
  const list = steps
    .map((s) => ({ ...s, el: typeof s.target === 'string' ? document.querySelector(s.target) : s.target }))
    .filter((s) => visible(s.el));
  if (!list.length) return null;

  const L = {
    next: 'التالي', back: 'السابق', skip: 'تخطّى', done: 'يلا نبدأ', region: 'جولة سريعة',
    step: (i, n) => `${i} من ${n}`,
    ...labels,
  };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <div class="tour-catch"></div>
    <div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabindex="-1">
      <div class="tour-top">
        <span class="tour-step"></span>
        <button type="button" class="tour-skip" data-tour="skip"></button>
      </div>
      <h2 class="tour-title" id="tour-title"></h2>
      <p class="tour-body" id="tour-body"></p>
      <div class="tour-foot">
        <span class="tour-dots" aria-hidden="true">${list.map(() => '<i></i>').join('')}</span>
        <span class="tour-btns">
          <button type="button" class="btn btn-ghost btn-sm" data-tour="back"></button>
          <button type="button" class="btn btn-gold btn-sm" data-tour="next"></button>
        </span>
      </div>
    </div>`;
  const spot = root.querySelector('.tour-spot');
  const pop = root.querySelector('.tour-pop');
  const stepEl = root.querySelector('.tour-step');
  const titleEl = root.querySelector('.tour-title');
  const bodyEl = root.querySelector('.tour-body');
  const backBtn = root.querySelector('[data-tour="back"]');
  const nextBtn = root.querySelector('[data-tour="next"]');
  const skipBtn = root.querySelector('[data-tour="skip"]');
  const dots = [...root.querySelectorAll('.tour-dots i')];
  pop.setAttribute('aria-roledescription', L.region);
  skipBtn.textContent = L.skip;
  backBtn.textContent = L.back;

  // everything else is inert while the tour is open
  const madeInert = [];
  for (const el of document.body.children) {
    if (el.id === 'toast' || el.inert) continue;
    el.inert = true;
    madeInert.push(el);
  }
  document.body.append(root);

  let index = 0;
  let frame = 0;
  let follow = 0;

  const place = () => {
    frame = 0;
    const el = list[index].el;
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const pad = 8;
    const top = Math.max(4, r.top - pad);
    const bottom = Math.min(vh - 4, r.bottom + pad);
    // Moved with transform only (pinned at 0,0 in CSS): no layout per frame and no layout shift (CLS).
    const left = Math.max(4, r.left - pad);
    spot.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    spot.style.width = `${Math.max(0, Math.min(vw - 8, r.right + pad) - left)}px`;
    spot.style.height = `${Math.max(0, bottom - top)}px`;

    const bar = document.getElementById('tabbar');
    const barH = bar && bar.getClientRects().length ? bar.getBoundingClientRect().height : 0;
    const limit = vh - 12 - barH;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 14;
    const head = document.getElementById('site-header');
    const minY = Math.max(12, head && head.getClientRects().length ? head.getBoundingClientRect().bottom + 10 : 12);
    let y;
    if (bottom + gap + ph <= limit) y = bottom + gap;
    else if (top - gap - ph >= minY) y = top - gap - ph;
    else y = Math.max(minY, limit - ph);
    let x = r.left + r.width / 2 - pw / 2;
    x = Math.max(12, Math.min(vw - pw - 12, x));
    pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(place);
  };

  const show = (i) => {
    index = clampStep(i, list.length);
    const s = list[index];
    stepEl.textContent = L.step(index + 1, list.length);
    titleEl.textContent = s.title || '';
    bodyEl.textContent = s.body || '';
    backBtn.hidden = index === 0;
    nextBtn.textContent = index === list.length - 1 ? L.done : L.next;
    dots.forEach((d, k) => d.classList.toggle('is-on', k === index));
    s.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    // follow the smooth scroll for a moment
    cancelAnimationFrame(follow);
    const until = performance.now() + (reduce ? 0 : 700);
    const loop = () => {
      place();
      if (performance.now() < until) follow = requestAnimationFrame(loop);
    };
    loop();
    pop.focus({ preventScroll: true });
  };

  const end = (reason) => {
    if (!active) return;
    active = null;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(follow);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    for (const el of madeInert) el.inert = false;
    root.remove();
    markTourDone(key);
    if (prevFocus?.isConnected && !prevFocus.closest('[hidden]')) prevFocus.focus({ preventScroll: true });
    else document.getElementById('main')?.focus({ preventScroll: true });
    try { onEnd?.(reason); } catch (err) { console.error(err); }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      end('skip');
      return;
    }
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if ((e.key === forward || e.key === backward) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      if (e.key === forward) {
        if (index === list.length - 1) end('done');
        else show(index + 1);
      } else if (index > 0) {
        show(index - 1);
      }
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [skipBtn, backBtn, nextBtn].filter((b) => !b.hidden);
    const at = items.indexOf(document.activeElement);
    e.preventDefault();
    const next = at === -1 ? (e.shiftKey ? items.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
  };

  root.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-tour]') : null;
    if (!btn) return;
    const what = btn.getAttribute('data-tour');
    if (what === 'skip') end('skip');
    else if (what === 'back') show(index - 1);
    else if (index === list.length - 1) end('done');
    else show(index + 1);
  });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true, capture: true });

  active = { stop: () => end('stop') };
  requestAnimationFrame(() => {
    root.classList.add('is-on');
    show(0);
  });
  return active;
}
