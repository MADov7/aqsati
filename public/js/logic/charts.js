// أقساطي — hand-built SVG charts (no libraries). The builders are pure and return SVG markup strings;
// bindTips() is the only DOM helper (hover / tap tooltips). CSP-safe: no style="" attributes — colours come
// from classes (.tone-*, .c-0 … .c-7) styled in the page CSS, so light and dark themes both work.
//
// Bidi: the <svg> is direction="ltr" so x maths is plain; Arabic labels get direction="rtl" and the anchor
// is picked from the physical edge we want (left / right / middle), so text never lands on the wrong side.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const r1 = (x) => Math.round(x * 10) / 10;

/** A "nice" step (1, 2, 2.5, 5 × 10^n) at or above raw. */
export function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Axis scale for values 0..max: { top, step, ticks }. */
export function niceScale(max, count = 4) {
  const step = niceStep((max > 0 ? max : 1) / count);
  const top = Math.max(step, Math.ceil((max > 0 ? max : 1) / step - 1e-9) * step);
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, step, ticks };
}

function anchorFor(edge, rtlText) {
  if (edge === 'middle') return 'middle';
  if (rtlText) return edge === 'right' ? 'start' : 'end';
  return edge === 'left' ? 'start' : 'end';
}

function text(x, y, s, { edge = 'middle', cls = '', rtl = false } = {}) {
  return `<text x="${r1(x)}" y="${r1(y)}" class="${cls}" text-anchor="${anchorFor(edge, rtl)}"${rtl ? ' direction="rtl"' : ''}>${esc(s)}</text>`;
}

/** Column with a 4px rounded top, square at the baseline. */
function colPath(x0, x1, y, yb, r = 4) {
  const h = yb - y;
  if (!(h > 0.4)) return '';
  const rr = Math.min(r, h, (x1 - x0) / 2);
  return `M${r1(x0)} ${r1(yb)}V${r1(y + rr)}Q${r1(x0)} ${r1(y)} ${r1(x0 + rr)} ${r1(y)}H${r1(x1 - rr)}Q${r1(x1)} ${r1(y)} ${r1(x1)} ${r1(y + rr)}V${r1(yb)}Z`;
}

/** Horizontal bar from the base x to the tip x (either direction), rounded at the tip only. */
function rowPath(xb, xt, y0, y1, r = 4) {
  const w = Math.abs(xt - xb);
  if (!(w > 0.4)) return '';
  const dir = xt > xb ? 1 : -1;
  const rr = Math.min(r, w, (y1 - y0) / 2);
  const xa = xt - dir * rr;
  return `M${r1(xb)} ${r1(y0)}H${r1(xa)}Q${r1(xt)} ${r1(y0)} ${r1(xt)} ${r1(y0 + rr)}V${r1(y1 - rr)}Q${r1(xt)} ${r1(y1)} ${r1(xa)} ${r1(y1)}H${r1(xb)}Z`;
}

function frame(id, width, height, title, desc, body, cls = '') {
  return `<svg class="ch-svg ${cls}" viewBox="0 0 ${r1(width)} ${r1(height)}" width="${r1(width)}" height="${r1(height)}" role="img" aria-labelledby="${id}-t${desc ? ` ${id}-d` : ''}" direction="ltr" focusable="false">`
    + `<title id="${id}-t">${esc(title)}</title>${desc ? `<desc id="${id}-d">${esc(desc)}</desc>` : ''}${body}</svg>`;
}

/**
 * Vertical columns (wide screens).
 * data: [{ label, sub?, value, tone?: 'ok'|'warn'|'over'|'none', tip? }] in time order (first = now).
 * rtl: time runs right → left (Arabic). limit: optional reference line (e.g. the safe limit) with limitLabel.
 * valueAt: indexes whose value is written on the cap (selective labels).
 */
export function columnChart({
  id = 'col', data = [], width = 640, height = 260, limit = null, limitLabel = '', rtl = false, rtlText = rtl,
  fmtTick = String, fmtValue = String, title = '', desc = '', valueAt = [0],
} = {}) {
  const padTop = 30;
  const padBottom = data.some((d) => d.sub) ? 46 : 32;
  const axisW = 48;
  const padEnd = 10;
  const plotL = rtl ? padEnd : axisW;
  const plotR = width - (rtl ? axisW : padEnd);
  const plotT = padTop;
  const plotB = height - padBottom;
  const plotW = Math.max(10, plotR - plotL);
  const plotH = Math.max(10, plotB - plotT);
  const values = data.map((d) => Math.max(0, Number(d.value) || 0));
  const { top, ticks } = niceScale(Math.max(0, ...values, limit > 0 ? limit : 0));
  const y = (v) => plotB - (v / top) * plotH;
  const n = Math.max(1, data.length);
  const slot = plotW / n;
  const bw = Math.min(24, Math.max(6, slot * 0.56));
  const cx = (i) => (rtl ? plotR - slot * (i + 0.5) : plotL + slot * (i + 0.5));
  const every = slot < 46 ? 2 : 1;

  let body = '<g class="ch-grid-g">';
  for (const tk of ticks) {
    const ty = y(tk);
    body += `<line class="${tk === 0 ? 'ch-axis' : 'ch-grid'}" x1="${r1(plotL)}" x2="${r1(plotR)}" y1="${r1(ty)}" y2="${r1(ty)}"/>`;
    body += rtl
      ? text(plotR + 8, ty + 4, fmtTick(tk), { edge: 'left', cls: 'ch-tick' })
      : text(plotL - 8, ty + 4, fmtTick(tk), { edge: 'right', cls: 'ch-tick' });
  }
  body += '</g>';

  data.forEach((d, i) => {
    const v = values[i];
    const x = cx(i);
    const showLabel = i % every === 0 || d.sub;
    body += `<g class="ch-slot" data-i="${i}">`;
    body += `<path class="ch-bar tone-${esc(d.tone || 'none')}" d="${colPath(x - bw / 2, x + bw / 2, y(v), plotB)}"/>`;
    if (showLabel) body += text(x, plotB + 18, d.label, { cls: 'ch-xlab', rtl: rtlText });
    if (d.sub) body += text(x, plotB + 34, d.sub, { cls: 'ch-xsub', rtl: rtlText });
    if (valueAt.includes(i) && v > 0) body += text(x, y(v) - 8, fmtValue(v), { cls: 'ch-val' });
    body += `<rect class="ch-hit" x="${r1(x - slot / 2)}" y="${r1(plotT - 10)}" width="${r1(slot)}" height="${r1(plotH + padBottom)}"${d.tip ? ` data-tip="${esc(d.tip)}"` : ''}/>`;
    body += '</g>';
  });

  if (limit > 0) {
    const ly = y(limit);
    body += `<line class="ch-limit" x1="${r1(plotL)}" x2="${r1(plotR)}" y1="${r1(ly)}" y2="${r1(ly)}"/>`;
    if (limitLabel) {
      body += rtl
        ? text(plotL + 2, ly - 7, limitLabel, { edge: 'left', cls: 'ch-limit-lab', rtl: rtlText })
        : text(plotR - 2, ly - 7, limitLabel, { edge: 'right', cls: 'ch-limit-lab', rtl: rtlText });
    }
  }
  return frame(id, width, height, title, desc, body, 'ch-col');
}

/**
 * Horizontal bars, one row per item (phones). Same data as columnChart; the value is written at each bar tip.
 * rtl: labels on the right and bars growing to the left.
 */
export function rowChart({
  id = 'row', data = [], width = 340, limit = null, limitLabel = '', rtl = false, rtlText = rtl,
  fmtValue = String, title = '', desc = '', labelW = 96, valueW = 76, rowH = 32,
} = {}) {
  const padTop = limit > 0 ? 28 : 6;
  const padBottom = 6;
  const height = padTop + data.length * rowH + padBottom;
  const base = rtl ? width - labelW : labelW;
  const maxBar = Math.max(20, width - labelW - valueW);
  const values = data.map((d) => Math.max(0, Number(d.value) || 0));
  const { top } = niceScale(Math.max(0, ...values, limit > 0 ? limit : 0));
  const x = (v) => (rtl ? base - (v / top) * maxBar : base + (v / top) * maxBar);
  const barH = Math.min(18, rowH * 0.58);

  let body = `<line class="ch-axis" x1="${r1(base)}" x2="${r1(base)}" y1="${r1(padTop - 2)}" y2="${r1(height - padBottom + 2)}"/>`;
  data.forEach((d, i) => {
    const v = values[i];
    const yc = padTop + rowH * (i + 0.5);
    body += `<g class="ch-slot" data-i="${i}">`;
    body += text(rtl ? width - 2 : 2, yc + 4, d.label, { edge: rtl ? 'right' : 'left', cls: 'ch-ylab', rtl: rtlText });
    body += `<path class="ch-bar tone-${esc(d.tone || 'none')}" d="${rowPath(base, x(v), yc - barH / 2, yc + barH / 2)}"/>`;
    body += text(x(v) + (rtl ? -6 : 6), yc + 4, fmtValue(v), { edge: rtl ? 'right' : 'left', cls: 'ch-val' });
    body += `<rect class="ch-hit" x="0" y="${r1(yc - rowH / 2)}" width="${r1(width)}" height="${r1(rowH)}"${d.tip ? ` data-tip="${esc(d.tip)}"` : ''}/>`;
    body += '</g>';
  });
  if (limit > 0) {
    const lx = x(limit);
    body += `<line class="ch-limit" x1="${r1(lx)}" x2="${r1(lx)}" y1="${r1(padTop - 6)}" y2="${r1(height - padBottom)}"/>`;
    if (limitLabel) body += text(lx + (rtl ? 4 : -4), 16, limitLabel, { edge: rtl ? 'left' : 'right', cls: 'ch-limit-lab', rtl: rtlText });
  }
  return frame(id, width, height, title, desc, body, 'ch-row');
}

/**
 * Donut: slices [{ label, value, color (0–7), tip? }] clockwise from 12 o'clock, separated by a 2px surface gap.
 * The centre text is HTML laid over the SVG by the page (bidi-safe).
 */
export function donutChart({ id = 'donut', slices = [], size = 200, thickness = 26, gap = 2, title = '', desc = '' } = {}) {
  const c = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  let body = '';
  if (!(total > 0)) {
    body = `<circle class="ch-track" cx="${c}" cy="${c}" r="${r1(r)}" stroke-width="${thickness}"/>`;
  } else {
    const live = slices.filter((s) => Number(s.value) > 0);
    let acc = 0;
    body += `<g transform="rotate(-90 ${c} ${c})">`;
    for (const s of live) {
      const len = (Number(s.value) / total) * C;
      const dash = live.length > 1 ? Math.max(0.8, len - gap) : C;
      body += `<circle class="ch-slice c-${Number(s.color) || 0}" cx="${c}" cy="${c}" r="${r1(r)}" stroke-width="${thickness}"`
        + ` stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"${s.tip ? ` data-tip="${esc(s.tip)}"` : ''}/>`;
      acc += len;
    }
    body += '</g>';
  }
  return frame(id, size, size, title, desc, body, 'ch-donut');
}

/**
 * One whole split into parts as a thin horizontal bar (report): parts [{ value, color, tip? }].
 * rtl: the first part starts on the right.
 */
export function splitBar({ id = 'split', parts = [], width = 600, height = 14, gap = 2, rtl = false, title = '', desc = '' } = {}) {
  const total = parts.reduce((s, p) => s + Math.max(0, Number(p.value) || 0), 0);
  let body = `<rect class="ch-track-fill" x="0" y="0" width="${r1(width)}" height="${height}" rx="${height / 2}"/>`;
  if (total > 0) {
    const live = parts.filter((p) => Number(p.value) > 0);
    const usable = width - gap * (live.length - 1);
    let acc = 0;
    body = `<clipPath id="${id}-clip"><rect x="0" y="0" width="${r1(width)}" height="${height}" rx="${height / 2}"/></clipPath><g clip-path="url(#${id}-clip)">`;
    for (const p of live) {
      const w = (Number(p.value) / total) * usable;
      const x0 = rtl ? width - acc - w : acc;
      body += `<rect class="ch-part c-${Number(p.color) || 0}" x="${r1(x0)}" y="0" width="${r1(Math.max(w, 0.8))}" height="${height}"${p.tip ? ` data-tip="${esc(p.tip)}"` : ''}/>`;
      acc += w + gap;
    }
    body += '</g>';
  }
  return frame(id, width, height, title, desc, body, 'ch-split');
}

/**
 * Hover / tap tooltips for every [data-tip] inside root (the tooltip is appended to root, so re-render
 * the chart into a child element). Mouse and touch only — every chart also has a table alternative.
 */
export function bindTips(root) {
  if (!root || root.dataset.tipsBound) return;
  root.dataset.tipsBound = '1';
  const tip = document.createElement('div');
  tip.className = 'ch-tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  root.append(tip);
  let hot = null;
  const setHot = (el) => {
    if (hot === el) return;
    hot?.classList.remove('is-hot');
    hot = el;
    hot?.classList.add('is-hot');
    root.classList.toggle('has-hot', Boolean(hot));
  };
  const hide = () => {
    tip.hidden = true;
    setHot(null);
  };
  const show = (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
    if (!el || !root.contains(el)) {
      hide();
      return;
    }
    setHot(el.closest('.ch-slot') || el);
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    const box = root.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = e.clientX - box.left - w / 2;
    left = Math.max(4, Math.min(box.width - w - 4, left));
    let top = e.clientY - box.top - h - 14;
    if (top < 0) top = e.clientY - box.top + 20;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };
  root.addEventListener('pointermove', show);
  root.addEventListener('pointerdown', show);
  root.addEventListener('pointerleave', hide);
  root.addEventListener('pointercancel', hide);
}

/** Watch an element's width and call render(width) (one frame debounce; only on real width changes). → { force, disconnect } */
export function onWidth(el, render) {
  let last = -1;
  let frame = 0;
  const run = () => {
    frame = 0;
    const w = Math.floor(el.clientWidth);
    if (w > 0 && w !== last) {
      last = w;
      render(w);
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
  let ro = null;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(schedule);
    ro.observe(el);
  } else {
    window.addEventListener('resize', schedule, { passive: true });
  }
  run();
  return {
    force() { last = -1; run(); },
    disconnect() {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    },
  };
}
