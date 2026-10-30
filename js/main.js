// HALCYON — Architectural Core bootstrap. Renderer locked to the discrete GPU
// at pixel ratio 1.0, flow-field world, curl-noise stream, scroll-choreographed
// camera, single render loop that also drives the DOM scrollytelling engine.

import * as THREE from 'three';
import { TIERS, clamp, loadSettings, saveSettings } from './config.js';
import { QualityManager } from './quality.js';
import { createSharedUniforms } from './scene/materials.js';
import { createMatrix } from './scene/matrix.js';
import { createNodes } from './scene/nodes.js';
import { createCameraRig } from './scene/camera.js';
import { createPost } from './scene/post.js';
import { createShowcase } from './ui/showcase.js';
import { createInteractions } from './ui/interactions.js';

const $ = (id) => document.getElementById(id);

// ---------- settings / engines ----------
const settings = loadSettings();

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReducedMotion = () =>
  settings.reducedMotion !== null ? settings.reducedMotion : reducedQuery.matches;

// ---------- renderer / scene ----------
const canvas = $('scene');
let renderer = null;
let fallbackMode = false;
try {
  // force the discrete GPU on hybrid laptops; the pixel ratio is LOCKED at
  // 1.0 — runtime resolution rescaling is the #1 stutter source on 920MX parts
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  if (window.innerWidth && window.innerHeight) renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1.0);
} catch {
  fallbackMode = true;
}

const scene = new THREE.Scene();

const bootAspect = (window.innerWidth && window.innerHeight) ? window.innerWidth / window.innerHeight : 16 / 9;
const camera = new THREE.PerspectiveCamera(50, bootAspect, 0.5, 900);
camera.position.set(0, 31, 98);
camera.lookAt(0, 6, 0);

const shared = createSharedUniforms();
const ctx = {
  document, renderer, scene, camera, canvas, shared,
  tier: TIERS.medium, settings, quality: null, isReducedMotion,
};

// ---- world modules ----
const matrix = createMatrix(ctx);
const nodes = createNodes(ctx);
ctx.matrix = matrix;
ctx.nodes = nodes;
const rig = createCameraRig(ctx); // camera reads ctx.nodes for click shockwaves
const post = renderer ? createPost(ctx) : null;

ctx.rig = rig;
ctx.post = post;

function applyTierAll(tier) {
  ctx.tier = tier;
  matrix.applyTier(tier);
  nodes.applyTier(tier);
  if (post) {
    post.setEnabled(tier.post);
    post.setMSAA(tier.msaa);
  }
}

// ---- quality ----
const quality = new QualityManager(renderer, settings);
ctx.quality = quality;
quality.prLocked = true; // pixelRatio pinned at 1.0 — features step, pixels don't
quality.onTierChange = (tier) => applyTierAll(tier);

applyTierAll(TIERS.medium);
if (settings.quality !== 'auto' && TIERS[settings.quality]) quality.setMode(settings.quality);

// ---------- UI (scrollytelling engine + interactions) ----------
ctx.settingsUI = null;
const showcase = createShowcase(ctx);
ctx.showcase = showcase;
const interactions = createInteractions(ctx);
void interactions;

// rig needs the chapter count once the roster lands
window.addEventListener('halcyon:projects-ready', (e) => {
  const n = ((e.detail && e.detail.projects) || []).length;
  if (n > 0) rig.registerChapters(n);
});

// ---------- scroll state (owned by showcase, consumed here) ----------
// showcase.frame() updates: current/target/velocity/velNorm/progress/
// chapterFloat/chapterIndex/chapterP + palette + formation targets.
const scroll = showcase.scroll;
const ptr = interactions.pointerTarget;
const ptrSmooth = { x: 0, y: 0 };

// ---------- resize / visibility ----------
let resizeTimer = 0;
function applySize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h || !renderer) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (post) post.onResize();
}
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { applySize(); showcase.measure(); }, 150);
}
window.addEventListener('resize', onResize);

let lastInteract = performance.now();
['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev =>
  window.addEventListener(ev, () => { lastInteract = performance.now(); }, { passive: true }));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) quality.setThrottle(true);
  else quality.setThrottle(false);
});
window.addEventListener('blur', () => quality.setThrottle(true));
window.addEventListener('focus', () => quality.setThrottle(false));

// ---------- fallback (no WebGL / context lost) ----------
const fallbackEl = $('fallback');
function showFallback(on) {
  fallbackMode = on;
  fallbackEl.hidden = !on;
  canvas.style.display = on ? 'none' : '';
  document.body.classList.toggle('no-webgl', on);
}
if (renderer) {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showFallback(true);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    showFallback(false);
    if (post) post.onResize();
  });
} else {
  showFallback(true);
}

// ---------- perf HUD ----------
let lastSlow = 0;
function slowTick(nowMs) {
  if (nowMs - lastSlow < 250) return;
  lastSlow = nowMs;
  if (quality.hudVisible && renderer) $('hud').textContent = quality.hudText(renderer.info);
  const badge = $('fps-badge');
  if (badge) badge.textContent = renderer ? quality.badgeText() : 'UI MODE';
}

// ---------- main loop (UI always runs; 3D renders when healthy) ----------
let lastFrameTick = performance.now();
let lastRender = 0;

function tick(nowMs) {
  const dtMs = Math.max(0, nowMs - lastFrameTick);
  lastFrameTick = nowMs;
  const dt = Math.min(dtMs / 1000, 0.05);
  const t = nowMs / 1000;

  if (renderer) quality.frame(dtMs, nowMs);

  // showcase: scroll proxy, chapter choreography, sims, palette + formation
  showcase.frame(dt, nowMs);

  // cursor field: damp NDC pointer, feed shaders + ray-plane world point
  ptrSmooth.x += (ptr.x - ptrSmooth.x) * Math.min(1, dt * 5);
  ptrSmooth.y += (ptr.y - ptrSmooth.y) * Math.min(1, dt * 5);
  shared.uMouse.value.set(ptrSmooth.x, ptrSmooth.y);

  // scroll velocity drives the shader warp + post aberration
  shared.uScrollVelocity.value = scroll.velNorm;
  if (post) post.setVelocityAberration((ctx.tier.post ? 1 : 0) * clamp(Math.abs(scroll.velNorm), 0, 1) * 0.5);

  const idle = (nowMs - lastInteract > 5000) && !showcase.simActive();
  const renderThisFrame = renderer && quality.shouldRender(nowMs, lastRender, idle);

  if (renderThisFrame) {
    shared.uTime.value = t;
    rig.update(dt, t, scroll);
    matrix.update(dt, t, camera);
    nodes.update(dt, t, camera);
    renderer.info.reset();
    post.render(dt);
    lastRender = nowMs;
  }

  slowTick(nowMs);
}

function loop() {
  tick(performance.now());
  requestAnimationFrame(loop);
}

// ---------- boot sequence ----------
const BOOT_LINES = [
  ['> compiling flow-field shaders', 'OK'],
  ['> seeding 2,500-particle curl stream', 'OK'],
  ['> indexing AgEnt-F0X repositories', 'LIVE'],
  ['> gpu: DISCRETE · dpr: LOCKED 1.0', 'OK'],
  ['> system status', 'ONLINE'],
];
function bootSequence() {
  const boot = document.createElement('div');
  boot.id = 'boot';
  boot.innerHTML = `<div class="boot-title">HALCYON // ARCHITECTURAL CORE</div>` +
    BOOT_LINES.map(([text, status]) =>
      `<div class="boot-line">${text} <span class="ok">[${status}]</span></div>`).join('') +
    `<div class="boot-line"><span class="boot-cursor"></span></div>`;
  document.body.appendChild(boot);
  const lines = boot.querySelectorAll('.boot-line');
  lines.forEach((l, i) => setTimeout(() => l.classList.add('in'), 130 + i * 150));
}
bootSequence();

function intro() {
  setTimeout(() => {
    document.body.classList.add('ready');
    document.body.classList.remove('loading');
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
  }, 1250);
  setTimeout(() => document.body.classList.add('ui-in'), 1550);
}

// ---------- keyboard: perf HUD ----------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key.toLowerCase() === 'p') {
    const on = quality.toggleHud();
    $('hud').hidden = !on;
  }
});

// ---------- settings persistence ----------
window.addEventListener('halcyon:settings-change', () => saveSettings(settings));

// ---------- boot ----------
document.body.classList.toggle('reduced-motion', isReducedMotion());
if (renderer) {
  renderer.info.autoReset = false;
  applySize();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  quality.startBenchmark();
} else {
  const badge = $('fps-badge');
  if (badge) badge.textContent = 'UI MODE';
}
showcase.measure();
requestAnimationFrame(loop);
intro();

// ---------- PWA ----------
if ('serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
