// أقساطي — small interaction effects (no dependencies). Every effect is skipped or softened
// when the visitor asks for reduced motion. Styles are set through the CSSOM only (CSP-safe).

const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');

export const reducedMotion = () => mqReduce.matches;

const easeOut = (t) => 1 - (1 - t) ** 3;

/** Animate a number from `from` to `to`, writing format(value) into el. Ends on the exact final text. */
export function countUp(el, from, to, format, duration = 900) {
  if (!el) return;
  if (reducedMotion() || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(to - from) < 1e-9) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  el.textContent = format(from);
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / duration);
    el.textContent = t < 1 ? format(from + (to - from) * easeOut(t)) : format(to);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Fill an SVG ring (a <circle>) to pct (0–100), animating from fromPct. */
export function setRing(circle, pct, fromPct = 0) {
  if (!circle) return;
  const r = Number(circle.getAttribute('r')) || 0;
  const len = 2 * Math.PI * r;
  const clamp = (p) => Math.max(0, Math.min(100, Number(p) || 0));
  const offset = (p) => `${(len * (1 - clamp(p) / 100)).toFixed(2)}`;
  circle.setAttribute('stroke-dasharray', `${len.toFixed(2)} ${len.toFixed(2)}`);
  if (reducedMotion()) {
    circle.style.strokeDashoffset = offset(pct);
    return;
  }
  circle.style.transition = 'none';
  circle.style.strokeDashoffset = offset(fromPct);
  circle.getBoundingClientRect(); // commit the start value before animating
  requestAnimationFrame(() => {
    circle.style.transition = '';
    circle.style.strokeDashoffset = offset(pct);
  });
}

/** Animate a bar's width (percent) on the next frame so the CSS transition runs. */
export function setWidth(el, pct) {
  if (!el) return;
  const w = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
  if (reducedMotion()) {
    el.style.width = w;
    return;
  }
  requestAnimationFrame(() => { el.style.width = w; });
}

/** Sections slide in as they scroll into view. Things already on screen are shown right away. */
export function reveal(selector = '.reveal') {
  const els = [...document.querySelectorAll(selector)];
  if (reducedMotion() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  const fold = window.innerHeight * 0.92;
  for (const el of els) {
    if (el.getBoundingClientRect().top < fold) {
      el.classList.add('is-in');
    } else {
      el.classList.add('reveal-wait');
      io.observe(el);
    }
  }
}

/** Gentle 3D tilt + glare that follows the mouse on `.tilt` cards (desktop mouse only). */
export function tilt(max = 5) {
  if (reducedMotion() || !mqFine.matches) return;
  let current = null;
  let frame = 0;
  let last = null;
  const reset = (el) => {
    el.classList.remove('tilting');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  const apply = () => {
    frame = 0;
    if (!last) return;
    const e = last;
    const el = e.target instanceof Element ? e.target.closest('.tilt') : null;
    if (current && current !== el) reset(current);
    current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
    el.classList.add('tilting');
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    last = e;
    if (!frame) frame = requestAnimationFrame(apply);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    if (current) reset(current);
    current = null;
  });
}

/** Material-style ripple on buttons (press feedback). */
export function ripples() {
  if (reducedMotion()) return;
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.btn') : null;
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    btn.append(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    setTimeout(() => dot.remove(), 1000);
  }, { passive: true });
}

/** Thin gold progress bar, "scrolled" header state, and the active link in the nav. */
export function scrollFx({ bar, links = [] }) {
  const root = document.documentElement;
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = root.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    root.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.dataset.spy, a]));
  const visible = new Set();
  let preferred = null; // the link the user tapped wins while its section is on screen
  const paint = () => {
    let active = preferred && visible.has(preferred) ? preferred : null;
    if (!active) for (const id of byId.keys()) if (visible.has(id)) { active = id; break; }
    for (const [id, a] of byId) {
      if (id === active) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  };
  for (const [id, a] of byId) a.addEventListener('click', () => { preferred = id; });
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target.id);
      else visible.delete(entry.target.id);
    }
    paint();
  }, { rootMargin: '-35% 0px -45% 0px' });
  for (const id of byId.keys()) {
    const el = document.getElementById(id);
    if (el) spy.observe(el);
  }
}
