// أقساطي — hero 3D scene: glossy gold «د.ك» coins and floating glass instalment cards.
// three.js r170 is imported straight from jsDelivr (no build step, no importmap). If WebGL2 isn't there,
// the import fails, or the GPU drops the context, the inline SVG under the canvas simply stays visible.
// Shared copy for the multi-page app (moved from /scene.js): import("/js/scene.js").then((m) => m.mountScene(box)).

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const GOLD = 0xf5b942;
const FONT = '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif';

const CARD_LABELS = {
  ar: [
    { tag: 'جوال جديد', amount: '45.500 د.ك', step: 'قسط 2 من 4', progress: 0.5 },
    { tag: 'سيارة', amount: '180.000 د.ك', step: 'قسط 14 من 48', progress: 0.29 },
    { tag: 'أثاث البيت', amount: '62.250 د.ك', step: 'قسط 5 من 6', progress: 0.83 },
  ],
  en: [
    { tag: 'New phone', amount: 'KWD 45.500', step: 'Payment 2 of 4', progress: 0.5 },
    { tag: 'Car', amount: 'KWD 180.000', step: 'Payment 14 of 48', progress: 0.29 },
    { tag: 'Home furniture', amount: 'KWD 62.250', step: 'Payment 5 of 6', progress: 0.83 },
  ],
};
/** The page language (set on <html> by boot.js / core.js); the cards are redrawn on `langchange`. */
const sceneLang = () => (document.documentElement.lang === 'en' ? 'en' : 'ar');

/** Mounts the scene into `box` (which holds a <canvas>). Returns a controller, or null on fallback. */
export async function mountScene(box) {
  const canvas = box?.querySelector('canvas');
  if (!canvas || !hasWebGL2()) return fallback(box);
  let THREE;
  try {
    THREE = await import(THREE_URL);
  } catch {
    return fallback(box);
  }
  try {
    return await createScene(THREE, box, canvas);
  } catch (err) {
    console.warn('3D scene unavailable:', err?.message);
    return fallback(box);
  }
}

function fallback(box) {
  box?.classList.remove('is-3d');
  box?.classList.add('no-3d');
  return null;
}

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

async function fontsReady() {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      document.fonts.load(`700 64px ${FONT}`, 'د.ك أقساطي'),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch {
    // canvas text falls back to Tahoma/Arial
  }
}

// Let the page handle input between the heavy setup steps (a macrotask, so taps aren't stuck behind us).
const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

// Small seeded random so the layout looks the same on every visit.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------

async function createScene(THREE, box, canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const BASE_Z = 12.5;
  camera.position.set(0, 0, BASE_Z);

  // Reflections: a tiny studio (gradient dome + soft boxes) baked into a PMREM environment map.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = buildStudio(THREE);
  const envRT = pmrem.fromScene(studio.scene, 0.03);
  studio.dispose();
  pmrem.dispose();
  scene.environment = envRT.texture;
  await yieldToPage(); // split the PMREM bake from the texture drawing → shorter main-thread tasks

  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x0b1f3a, 0.8));
  const key = new THREE.DirectionalLight(0xfff0d0, 2.6);
  key.position.set(-4, 6, 7);
  const rim = new THREE.DirectionalLight(0x86b2ff, 1.8);
  rim.position.set(6, -3, -5);
  const warm = new THREE.PointLight(GOLD, 22, 14, 2);
  warm.position.set(1.8, 0.6, 4.2);
  scene.add(key, rim, warm);

  const root = new THREE.Group();
  scene.add(root);

  await fontsReady();

  let world = null;
  let small = null;
  let lang = null;
  const build = () => {
    const isSmall = box.clientWidth < 440;
    const nowLang = sceneLang();
    if (world && small === isSmall && lang === nowLang) return;
    if (world) {
      root.remove(world.group);
      world.dispose();
    }
    small = isSmall;
    lang = nowLang;
    world = buildWorld(THREE, isSmall, renderer.capabilities.getMaxAnisotropy(), nowLang);
    root.add(world.group);
  };
  const onLang = () => {
    build();
    if (!raf) renderFrame(lastNow || performance.now(), true);
  };

  // ---- state driven by the page ----
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollP = 0;
  let boxBottom = 1;
  let visible = true;
  let pageVisible = !document.hidden;
  let lost = false;
  let raf = 0;
  let elapsed = 0;
  let lastNow = 0;
  let shown = false;

  const readScroll = () => {
    scrollP = Math.max(0, Math.min(1, window.scrollY / boxBottom));
  };

  const resize = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 440 ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 1 ? BASE_Z / Math.max(0.7, camera.aspect) : BASE_Z;
    camera.updateProjectionMatrix();
    const rect = box.getBoundingClientRect();
    boxBottom = Math.max(1, rect.bottom + window.scrollY);
    readScroll();
    build();
    if (!raf) renderFrame(lastNow || performance.now(), true);
  };

  function update(dt) {
    elapsed += dt;
    const t = elapsed;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    camera.position.x = pointer.x * 0.75;
    camera.position.y = -pointer.y * 0.5;
    camera.lookAt(0, 0, 0);
    const k = Math.min(1, dt * 4);
    root.rotation.y += (scrollP * 0.9 - root.rotation.y) * k;
    root.rotation.x += (scrollP * 0.28 - root.rotation.x) * k;
    root.position.y += (scrollP * 0.8 - root.position.y) * k;
    world.update(t, pointer);
  }

  function renderFrame(now, still = false) {
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    update(still ? 0 : dt);
    renderer.render(scene, camera);
    if (!shown) {
      shown = true;
      box.classList.add('is-3d');
    }
  }

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    renderFrame(now);
  };

  // The login dialog covers the page with a blurred backdrop: don't redraw (and re-blur) under it.
  const modalOpen = () => document.documentElement.classList.contains('modal-open');

  const sync = () => {
    const run = !reduce && visible && pageVisible && !lost && !modalOpen();
    if (run && !raf) {
      lastNow = 0;
      raf = requestAnimationFrame(loop);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  // ---- listeners ----
  const onPointer = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => readScroll();
  const onVisibility = () => {
    pageVisible = !document.hidden;
    sync();
  };
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    sync();
    fallback(box);
  };

  const ro = new ResizeObserver(resize);
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((en) => en.isIntersecting);
    sync();
  }, { rootMargin: '80px' });
  const mo = new MutationObserver(sync); // <html class="modal-open"> toggles
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // devicePixelRatio can change with no CSS-size change (other monitor, zoom) → resize again.
  let dprQuery = null;
  const onDpr = () => {
    resize();
    watchDpr();
  };
  const watchDpr = () => {
    dprQuery?.removeEventListener?.('change', onDpr);
    try {
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener?.('change', onDpr);
    } catch {
      dprQuery = null;
    }
  };

  build();
  // Link every shader program now, off the critical path where possible (no blocking status queries),
  // instead of inside the first render() as one long task.
  renderer.debug.checkShaderErrors = false;
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // older/limited drivers: programs simply compile on the first frame
  }
  await yieldToPage();
  resize();
  ro.observe(box);
  io.observe(box);
  watchDpr();
  if (!reduce) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('langchange', onLang);

  renderFrame(performance.now(), true); // first (and, with reduced motion, only) frame
  sync();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      dprQuery?.removeEventListener?.('change', onDpr);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('langchange', onLang);
      if (world) world.dispose();
      envRT.dispose();
      renderer.dispose();
      box.classList.remove('is-3d');
    },
  };
}

// ---------------------------------------------------------------------------------------------

function buildStudio(THREE) {
  const scene = new THREE.Scene();
  const geos = [];
  const mats = [];

  const dome = new THREE.SphereGeometry(20, 32, 16);
  const top = new THREE.Color(0xb7cbe6);
  const mid = new THREE.Color(0x34557f);
  const bottom = new THREE.Color(0x0a1d36);
  const pos = dome.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 20;
    if (y > 0) c.lerpColors(mid, top, y);
    else c.lerpColors(mid, bottom, -y);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
  geos.push(dome);
  mats.push(domeMat);
  scene.add(new THREE.Mesh(dome, domeMat));

  const panel = (w, h, hex, strength, x, y, z) => {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(strength), side: THREE.DoubleSide });
    geos.push(g);
    mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(10, 4, 0xffffff, 4.5, 0, 9, 6); // big soft key, above and in front
  panel(4, 10, 0xffdc96, 3.2, -10, 2, 4); // warm side
  panel(4, 8, 0x8db8ff, 2.2, 10, -1, 2); // cool side
  panel(12, 1.6, 0xffffff, 3, 0, -4, 10); // low front strip → bright coin edges

  return {
    scene,
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

function buildWorld(THREE, small, maxAniso, lang = 'ar') {
  const ltr = lang === 'en';
  const labels = (CARD_LABELS[lang] || CARD_LABELS.ar).map((l) => ({ ...l, ltr, brand: ltr ? 'Aqsati' : 'أقساطي' }));
  const bag = new Set();
  const track = (x) => {
    bag.add(x);
    return x;
  };
  const group = new THREE.Group();
  const items = [];

  const makeCoin = coinFactory(THREE, track, small, maxAniso);
  const makeCard = cardFactory(THREE, track, small, maxAniso);

  const coins = [
    { s: 1.3, p: [0.35, 0.25, 0.9], ry: -0.35, rock: 0.55, main: true },
    { s: 0.62, p: [-1.85, 1.55, -0.6], ry: 0.4, spin: 0.55 },
    { s: 0.7, p: [1.95, -1.6, 0.2], ry: 1.2, spin: -0.42 },
    { s: 0.5, p: [2.15, 1.8, -1.6], ry: -0.8, rock: 0.7, big: true },
    { s: 0.48, p: [-2.1, -1.55, 0.7], ry: 2.0, spin: 0.6, big: true },
  ].filter((c) => !(small && c.big));

  const cards = [
    { p: [-0.95, -0.75, -1.25], r: [-0.18, 0.5, 0.14], label: labels[0] },
    { p: [1.25, 1.05, -2.3], r: [0.16, -0.45, -0.12], label: labels[1] },
    { p: [0.55, -2.0, -2.9], r: [-0.4, -0.2, 0.06], label: labels[2], big: true },
  ].filter((c) => !(small && c.big));

  const rand = rng(7);
  for (const c of coins) {
    const obj = makeCoin(c.s);
    obj.position.set(...c.p);
    obj.rotation.set(-0.12, c.ry, 0);
    group.add(obj);
    items.push({
      obj,
      baseY: c.p[1],
      baseRX: -0.12,
      baseRY: c.ry,
      amp: 0.12 + rand() * 0.1,
      speed: 0.6 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      spin: c.spin || 0,
      rock: c.rock || 0,
      main: !!c.main,
    });
  }
  for (const c of cards) {
    const obj = makeCard(c.label);
    obj.position.set(...c.p);
    obj.rotation.set(...c.r);
    group.add(obj);
    items.push({
      obj,
      baseY: c.p[1],
      baseRX: c.r[0],
      baseRY: c.r[1],
      amp: 0.16 + rand() * 0.08,
      speed: 0.35 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      spin: 0,
      rock: 0.16,
      card: true,
    });
  }

  const dust = sparkles(THREE, track, small ? 26 : 64);
  group.add(dust);

  return {
    group,
    update(t, pointer) {
      for (const it of items) {
        it.obj.position.y = it.baseY + Math.sin(t * it.speed + it.phase) * it.amp;
        if (it.spin) it.obj.rotation.y = it.baseRY + t * it.spin;
        else it.obj.rotation.y = it.baseRY + Math.sin(t * 0.45 + it.phase) * it.rock + (it.main ? pointer.x * 0.4 : 0);
        it.obj.rotation.x = it.baseRX + Math.sin(t * 0.38 + it.phase) * (it.card ? 0.06 : 0.1) + (it.main ? pointer.y * 0.25 : 0);
      }
      dust.rotation.y = t * 0.035;
    },
    dispose() {
      for (const x of bag) x.dispose?.();
      bag.clear();
    },
  };
}

// ---------- coins ----------

function coinFactory(THREE, track, small, maxAniso) {
  const tex = coinTextures(THREE, small ? 256 : 512);
  track(tex.map);
  track(tex.bump);
  tex.map.anisotropy = Math.min(8, maxAniso);

  const edgeMat = track(new THREE.MeshStandardMaterial({ color: 0xf2b23c, metalness: 1, roughness: 0.24, envMapIntensity: 1.3 }));
  const faceMat = track(new THREE.MeshStandardMaterial({
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: 2.4,
    metalness: 1,
    roughness: 0.3,
    envMapIntensity: 1.25,
  }));

  // Beveled rim with a raised lip, bottom → top so the normals face outwards.
  const profile = [
    [0.84, -0.072], [0.885, -0.1], [0.95, -0.1], [1.0, -0.062],
    [1.0, 0.062], [0.95, 0.1], [0.885, 0.1], [0.84, 0.072],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const rimGeo = track(new THREE.LatheGeometry(profile, small ? 48 : 72));
  const faceGeo = track(new THREE.CircleGeometry(0.86, small ? 48 : 72));

  return (scale) => {
    const coin = new THREE.Group();
    coin.add(new THREE.Mesh(rimGeo, edgeMat));
    const front = new THREE.Mesh(faceGeo, faceMat);
    front.rotation.x = -Math.PI / 2;
    front.position.y = 0.072;
    const back = new THREE.Mesh(faceGeo, faceMat);
    back.rotation.set(Math.PI / 2, 0, Math.PI);
    back.position.y = -0.072;
    coin.add(front, back);
    coin.rotation.x = Math.PI / 2; // face the camera
    coin.scale.setScalar(scale);
    const pivot = new THREE.Group();
    pivot.add(coin);
    return pivot;
  };
}

function coinTextures(THREE, s) {
  const canvasOf = () => {
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    return [c, c.getContext('2d')];
  };
  const h = s / 2;
  const textFont = `700 ${Math.round(s * 0.3)}px ${FONT}`;
  const smallFont = `600 ${Math.round(s * 0.058)}px ${FONT}`;
  const ty = h + s * 0.01;

  // colour map
  const [mapCanvas, g] = canvasOf();
  const grad = g.createRadialGradient(s * 0.36, s * 0.3, s * 0.04, h, h, s * 0.62);
  grad.addColorStop(0, '#fff3c9');
  grad.addColorStop(0.35, '#f7c55a');
  grad.addColorStop(0.75, '#e2a12c');
  grad.addColorStop(1, '#b67812');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  g.globalAlpha = 0.07;
  g.strokeStyle = '#7a4c00';
  g.lineWidth = 1;
  for (let r = s * 0.04; r < s * 0.5; r += s * 0.011) {
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(122, 76, 0, 0.55)';
  g.lineWidth = s * 0.014;
  g.beginPath();
  g.arc(h, h, s * 0.405, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(122, 76, 0, 0.42)';
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    g.beginPath();
    g.arc(h + Math.cos(a) * s * 0.452, h + Math.sin(a) * s * 0.452, s * 0.0085, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.font = textFont;
  g.fillStyle = 'rgba(92, 56, 0, 0.6)';
  g.fillText('د.ك', h + s * 0.008, ty + s * 0.012);
  g.fillStyle = 'rgba(255, 246, 214, 0.9)';
  g.fillText('د.ك', h - s * 0.005, ty - s * 0.006);
  g.fillStyle = '#eab042';
  g.fillText('د.ك', h, ty);
  g.font = smallFont;
  g.fillStyle = 'rgba(110, 68, 0, 0.8)';
  g.fillText('أقساطي', h, h + s * 0.25);

  // bump map (white = raised)
  const [bumpCanvas, b] = canvasOf();
  b.fillStyle = '#000';
  b.fillRect(0, 0, s, s);
  b.strokeStyle = '#fff';
  b.lineWidth = s * 0.014;
  b.beginPath();
  b.arc(h, h, s * 0.405, 0, Math.PI * 2);
  b.stroke();
  b.fillStyle = '#fff';
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    b.beginPath();
    b.arc(h + Math.cos(a) * s * 0.452, h + Math.sin(a) * s * 0.452, s * 0.0085, 0, Math.PI * 2);
    b.fill();
  }
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  b.direction = 'rtl';
  b.font = textFont;
  b.fillText('د.ك', h, ty);
  b.font = smallFont;
  b.fillText('أقساطي', h, h + s * 0.25);

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  return { map, bump };
}

// ---------- glass instalment cards ----------

function roundedRect(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function cardFactory(THREE, track, small, maxAniso) {
  const w = 2.7;
  const h = 1.7;
  const geo = track(new THREE.ExtrudeGeometry(roundedRect(THREE, w, h, 0.2), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: small ? 2 : 4,
    curveSegments: small ? 6 : 12,
  }));
  geo.center();
  const glass = track(new THREE.MeshPhysicalMaterial({
    color: 0xdfeaff,
    metalness: 0,
    roughness: 0.08,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const edges = track(new THREE.EdgesGeometry(geo, 25));
  const edgeMat = track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
  const chipGeo = track(new THREE.ExtrudeGeometry(roundedRect(THREE, 0.42, 0.32, 0.07), {
    depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 6,
  }));
  chipGeo.center();
  const chipMat = track(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 }));
  const labelGeo = track(new THREE.PlaneGeometry(w - 0.1, h - 0.1));

  return (label) => {
    const tex = track(cardTexture(THREE, label, small));
    tex.anisotropy = Math.min(4, maxAniso);
    const labelMat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const card = new THREE.Group();
    const body = new THREE.Mesh(geo, glass);
    body.renderOrder = 1;
    const outline = new THREE.LineSegments(edges, edgeMat);
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(label.ltr ? w / 2 - 0.48 : -w / 2 + 0.48, 0.1, 0.07); // opposite the text
    const face = new THREE.Mesh(labelGeo, labelMat);
    face.position.z = 0.056;
    face.renderOrder = 2;
    card.add(body, outline, chip, face);
    const pivot = new THREE.Group();
    pivot.add(card);
    return pivot;
  };
}

function cardTexture(THREE, { tag, amount, step, progress, ltr = false, brand = 'أقساطي' }, small) {
  const W = small ? 400 : 560;
  const H = Math.round(W * (1.6 / 2.6));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const pad = W * 0.07;
  const tx = ltr ? pad : W - pad; // text starts on the reading side
  g.direction = ltr ? 'ltr' : 'rtl';
  g.textAlign = ltr ? 'left' : 'right';
  g.textBaseline = 'alphabetic';

  g.fillStyle = 'rgba(255, 255, 255, 0.95)';
  g.font = `700 ${Math.round(W * 0.056)}px ${ltr ? `Inter, ${FONT}` : FONT}`;
  g.fillText(brand, tx, pad + W * 0.05);
  g.fillStyle = 'rgba(255, 255, 255, 0.7)';
  g.font = `500 ${Math.round(W * 0.042)}px ${ltr ? `Inter, ${FONT}` : FONT}`;
  g.fillText(tag, tx, pad + W * 0.115);

  g.fillStyle = '#ffffff';
  g.font = `700 ${Math.round(W * 0.088)}px ${ltr ? `Inter, ${FONT}` : FONT}`;
  g.fillText(amount, tx, H * 0.68);

  g.fillStyle = 'rgba(255, 255, 255, 0.78)';
  g.font = `500 ${Math.round(W * 0.04)}px ${ltr ? `Inter, ${FONT}` : FONT}`;
  g.fillText(step, tx, H - pad);

  // progress bar on the far side, filling in the reading direction (like the page)
  const bw = W * 0.34;
  const bh = W * 0.02;
  const bx = ltr ? W - pad - bw : pad;
  const by = H - pad - bh * 1.2;
  const pill = (x, y, w, hh) => {
    const r = hh / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + r, y + hh);
    g.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
    g.closePath();
  };
  g.fillStyle = 'rgba(255, 255, 255, 0.25)';
  pill(bx, by, bw, bh);
  g.fill();
  g.fillStyle = '#f5b942';
  const fw = Math.max(bh, bw * progress);
  pill(ltr ? bx : bx + bw - fw, by, fw, bh);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- gold dust ----------

function sparkles(THREE, track, count) {
  const rand = rng(42);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 2.3 + rand() * 2.6;
    const a = rand() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (rand() - 0.5) * 5.4;
    pos[i * 3 + 2] = Math.sin(a) * r * 0.6 - 0.6;
  }
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const dot = document.createElement('canvas');
  dot.width = 64;
  dot.height = 64;
  const g = dot.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.3, 'rgba(245, 185, 66, 0.75)');
  grad.addColorStop(1, 'rgba(245, 185, 66, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const map = track(new THREE.CanvasTexture(dot));
  map.colorSpace = THREE.SRGBColorSpace;

  const mat = track(new THREE.PointsMaterial({
    size: 0.16,
    map,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  return new THREE.Points(geo, mat);
}
