// Halcyon — Architectural Core bootstrap: renderer (high-performance GPU,
// pixel ratio locked at 1.0), matrix assembly, the render loop, the boot
// sequence, keyboard shortcuts, visibility handling and the WebGL fallback.

import * as THREE from 'three';
import { MATRIX, TIERS, clamp, loadSettings, saveSettings } from './config.js';
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
  // force the discrete GPU on hybrid laptops, then lock the pixel ratio to
  // 1.0 — resolution rescaling is the #1 stutter source on 920MX-class parts
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  if (window.innerWidth && window.innerHeight) renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1.0); // LOCKED — never rescaled at runtime
} catch {
  fallbackMode = true;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(MATRIX.bg);

// the viewport can be 0×0 while the tab is hidden — fall back to a sane aspect
const bootAspect = (window.innerWidth && window.innerHeight) ? window.innerWidth / window.innerHeight : 16 / 9;
const camera = new THREE.PerspectiveCamera(MATRIX.fov, bootAspect, 0.5, 1500);
camera.position.set(...MATRIX.camPos);
camera.lookAt(...MATRIX.camTarget);

const shared = createSharedUniforms();
const ctx = {
  document, renderer, scene, camera, canvas, shared,
  tier: TIERS.medium, settings, quality: null, isReducedMotion,
};

// ---- world modules ----
const matrix = createMatrix(ctx);
const nodes = createNodes({ ...ctx, document });
const rig = createCameraRig(ctx);
const post = renderer ? createPost(ctx) : null;

ctx.matrix = matrix;
ctx.nodes = nodes;
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
quality.prLocked = true; // spec: pixelRatio locked at 1.0 — no dynamic rescaling
quality.onTierChange = (tier) => applyTierAll(tier);

applyTierAll(TIERS.medium);
if (settings.quality !== 'auto' && TIERS[settings.quality]) quality.setMode(settings.quality);

// ---------- UI ----------
ctx.settingsUI = null;
const showcase = createShowcase(ctx);
ctx.showcase = showcase;
const interactions = createInteractions(ctx);
void interactions;

// ---------- showcase / matrix event bus ----------
// the roster arrives async from the GitHub layer — build the racks then
window.addEventListener('halcyon:projects-ready', (e) => {
  const projects = (e.detail && e.detail.projects) || [];
  nodes.build(projects);
  applyTierAll(ctx.tier); // re-apply draw-range gating to the fresh geometry
  const focused = ctx.showcase && ctx.showcase.focused;
  if (focused) {
    const idx = nodes.byName(focused.name);
    if (idx >= 0) {
      nodes.setActive(idx);
      const anchor = nodes.getFocusAnchor(idx);
      rig.focusNode(anchor);
    }
  }
});
window.addEventListener('halcyon:project-select', (e) => {
  const { project, index } = e.detail || {};
  if (!project || typeof index !== 'number' || index < 0) return;
  const anchor = nodes.getFocusAnchor(index);
  if (!anchor) return;
  nodes.setActive(index);
  if (rig.isOrbit()) rig.setOrbit(false);
  rig.focusNode(anchor);
  rig.whipPan(0.65);
  nodes.setFocusTarget(1);
  clearTimeout(window.__focusDecay);
  window.__focusDecay = setTimeout(() => nodes.setFocusTarget(0), 1400);
  if (post) post.pulseChromatic(0.5);
});
window.addEventListener('halcyon:orbit-toggle', () => {
  const on = rig.setOrbit(!rig.isOrbit());
  if (on) {
    const focusIdx = nodes.activeIndex;
    if (focusIdx >= 0 && nodes.hitboxes[focusIdx]) {
      const p = nodes.hitboxes[focusIdx].position;
      rig.setOrbitPivot(new THREE.Vector3(p.x, 5, p.z), { radius: 20, homeAz: 0.3, homeEl: 0.42 });
    } else {
      rig.setOrbitPivot(new THREE.Vector3(0, 15, 0), { radius: 34, homeAz: 0.35, homeEl: 0.36 });
    }
  }
  showcase.toast(on ? 'FREE ORBIT — DRAG · WHEEL ZOOMS' : 'MATRIX CAM RESTORED');
});
window.addEventListener('halcyon:zen-toggle', () => {
  document.body.classList.toggle('zen');
});
window.addEventListener('halcyon:scan-all', () => {
  nodes.pulseAll();
  showcase.toast('SCAN PULSE — FULL MATRIX SWEEP');
});
// full-screen inspection modals can pause the WebGL loop entirely
let renderPaused = false;
window.addEventListener('halcyon:pause-render', (e) => {
  renderPaused = !!(e.detail && e.detail.on);
  setRunning(!renderPaused && !document.hidden);
});

// ---------- resize / visibility ----------
let resizeTimer = 0;
function applySize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h || !renderer) return; // degenerate size (hidden pane) — keep last good state
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (post) post.onResize();
}
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applySize, 150);
}
// The viewport can be 0×0 while a tab is hidden; sync sizes cheaply every frame
function syncSize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return;
  if (Math.abs(camera.aspect - w / h) > 1e-4 || renderer.domElement.width !== w || renderer.domElement.height !== h) {
    applySize();
  }
}
window.addEventListener('resize', onResize);

let lastInteract = performance.now();
['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { lastInteract = performance.now(); }, { passive: true }));

let running = false;
function setRunning(v) {
  if (!renderer) return;
  running = v;
  renderer.setAnimationLoop(v ? loop : null);
  if (v) { lastFrameTick = performance.now(); }
}
document.addEventListener('visibilitychange', () => {
  setRunning(!document.hidden && !renderPaused);
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
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  showFallback(true);
  setRunning(false);
});
canvas.addEventListener('webglcontextrestored', () => {
  showFallback(false);
  if (post) post.onResize();
  setRunning(true);
});
if (fallbackMode) showFallback(true);

// ---------- perf HUD ----------
let lastSlow = 0;
let lastSec = 0;
function slowTick(nowMs) {
  if (nowMs - lastSlow < 250) return;
  lastSlow = nowMs;
  if (nowMs - lastSec >= 1000) lastSec = nowMs;
  if (quality.hudVisible && renderer) $('hud').textContent = quality.hudText(renderer.info);
  const badge = $('fps-badge');
  if (badge) badge.textContent = quality.badgeText();
}

// ---------- main loop ----------
let lastFrameTick = performance.now();
let lastRender = 0;
const ptrTarget = { x: 0, y: 0 };
function loop() {
  const nowMs = performance.now();
  const dtMs = Math.max(0, nowMs - lastFrameTick);
  lastFrameTick = nowMs;
  const dt = Math.min(dtMs / 1000, 0.05);
  const t = nowMs / 1000;

  quality.frame(dtMs, nowMs);
  // eco throttle: 24 FPS after 4 s without input (thermals), instant wake;
  // never while a camera flight is mid-transition
  const idle = (nowMs - lastInteract > 4000) && !rig.isTransitioning();
  if (!quality.shouldRender(nowMs, lastRender, idle)) return;

  shared.uTime.value = t;

  // pointer parallax: damp the cursor into the shader uniform
  ptrTarget.x += (interactions.pointerTarget.x - ptrTarget.x) * Math.min(1, dt * 4.5);
  ptrTarget.y += (interactions.pointerTarget.y - ptrTarget.y) * Math.min(1, dt * 4.5);
  shared.uPointer.value.set(ptrTarget.x, ptrTarget.y);

  syncSize();
  rig.update(dt, t);
  // velocity chromatic aberration: fast teleports feel cinematic
  if (post) post.setVelocityAberration((ctx.tier.post ? 1 : 0) * clamp(rig.getFlightVelocity() / 45, 0, 1) * 0.45);
  matrix.update(dt, t, camera);
  nodes.update(dt, t, camera);
  slowTick(nowMs);

  if (renderer) {
    renderer.info.reset();
    post.render(dt);
    lastRender = nowMs;
  }
}

// ---------- boot sequence ----------
const BOOT_LINES = [
  ['> mounting coordinate grid', 'OK'],
  ['> indexing AgEnt-F0X repositories', 'LIVE'],
  ['> compiling shader family', 'OK'],
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
  lines.forEach((l, i) => setTimeout(() => l.classList.add('in'), 140 + i * 170));
}
bootSequence();

function intro() {
  setTimeout(() => {
    document.body.classList.add('ready');
    document.body.classList.remove('loading'); // retire the boot log overlay
  }, 1150);
  setTimeout(() => document.body.classList.add('ui-in'), 1500);
}

// ---------- keyboard: perf HUD ----------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key.toLowerCase() === 'p') {
    const on = quality.toggleHud();
    $('hud').hidden = !on;
  }
});

// ---------- boot ----------
document.body.classList.toggle('reduced-motion', isReducedMotion());
if (renderer) {
  // warm-up frame behind the boot overlay, then start the loop
  renderer.info.autoReset = false;
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  quality.startBenchmark();
  setRunning(true);
} else {
  // no WebGL: run the UI-only cadence (badge shows static text)
  setInterval(() => slowTick(performance.now()), 250);
  const badge = $('fps-badge');
  if (badge) badge.textContent = 'UI MODE';
}
intro();

// ---------- settings persistence (quality mode only) ----------
window.addEventListener('halcyon:quality-change', (e) => {
  if (e.detail && TIERS[e.detail]) {
    settings.quality = e.detail;
    saveSettings(settings);
  }
});

// ---------- PWA ----------
if ('serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
