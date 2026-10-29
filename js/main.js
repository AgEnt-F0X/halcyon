// Halcyon bootstrap: renderer + scene assembly, atmosphere engine (palette/sun/
// weather blending into damped uniforms), the render loop, intro sequence,
// keyboard shortcuts, visibility handling and the WebGL fallback.

import * as THREE from 'three';
import {
  WORLD, PHASES, PHASE_LABELS, SEASONS, TIERS, COND_LABELS, PHRASES,
  WEATHER_CYCLE, SEASON_CYCLE, clamp, lerp, smooth,
  seasonFor, loadSettings, saveSettings,
} from './config.js';
import { TimeEngine } from './time.js';
import { WeatherEngine } from './weather.js';
import { QualityManager } from './quality.js';
import { createSharedUniforms } from './scene/materials.js';
import { createSky } from './scene/sky.js';
import { createTerrain } from './scene/terrain.js';
import { createWater } from './scene/water.js';
import { createForest } from './scene/forest.js';
import { createCabin } from './scene/cabin.js';
import { createClouds } from './scene/clouds.js';
import { createWeatherFx } from './scene/weatherfx.js';
import { createStars } from './scene/stars.js';
import { createBirds } from './scene/birds.js';
import { createCameraRig } from './scene/camera.js';
import { createPost } from './scene/post.js';
import { groundHeight } from './scene/terrain.js';
import { createClock } from './ui/clock.js';
import { createScrubber } from './ui/scrubber.js';
import { createSettings } from './ui/settings.js';
import { AudioEngine } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------- settings / engines ----------
const settings = loadSettings();
const time = new TimeEngine();
const weather = new WeatherEngine();
const audio = new AudioEngine();

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReducedMotion = () =>
  settings.reducedMotion !== null ? settings.reducedMotion : reducedQuery.matches;

// ---------- atmosphere targets (preallocated, no per-frame allocation) ----------
const T = {
  zen: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(),
  sun: new THREE.Color(), ambS: new THREE.Color(), ambG: new THREE.Color(),
  ground: new THREE.Color(), water: new THREE.Color(), season: new THREE.Color(),
  grade: new THREE.Color(),
  sunI: 1, moonI: 0, ambI: 1, fogDensity: 0.0026, night: 0, wind: 0.25,
  rain: 0, snow: 0, fogAmt: 0, blossom: 0, snowGround: 0,
  sunVis: 1, moonVis: 0, aurora: 0, cloudsFrac: 0.2, shaftI: 0,
  windowGlow: 0, lantern: 0, firefly: 0, gradeAmt: 0.15, birdsOn: false,
  storm: false, cloud01: 0.2,
};
const sunDirT = new THREE.Vector3(0.4, 0.5, -0.7);
const moonDirT = new THREE.Vector3(-0.4, 0.2, -0.7);
const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();
const tmpV = new THREE.Vector3();

const COND_PARAMS = {
  clear: { cloud: 0.12, fog: 0.0, rain: 0, snow: 0, dark: 0.00, windB: 0 },
  partly: { cloud: 0.45, fog: 0.0, rain: 0, snow: 0, dark: 0.06, windB: 0 },
  overcast: { cloud: 0.92, fog: 0.15, rain: 0, snow: 0, dark: 0.22, windB: 0 },
  fog: { cloud: 0.7, fog: 1.0, rain: 0, snow: 0, dark: 0.15, windB: 0 },
  drizzle: { cloud: 0.8, fog: 0.3, rain: 0.45, snow: 0, dark: 0.25, windB: 0.05 },
  rain: { cloud: 0.94, fog: 0.35, rain: 1, snow: 0, dark: 0.35, windB: 0.15 },
  snow: { cloud: 0.85, fog: 0.5, rain: 0, snow: 1, dark: 0.18, windB: 0.05 },
  storm: { cloud: 1.0, fog: 0.4, rain: 1, snow: 0, dark: 0.52, windB: 0.35 },
};

let previewCond = null;
let previewSeason = null;
let atmosphereDirty = true;

// ---------- renderer / scene ----------
const canvas = $('scene');
let renderer = null;
let fallbackMode = false;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  if (window.innerWidth && window.innerHeight) renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
} catch {
  fallbackMode = true;
}

const scene = new THREE.Scene();
// the viewport can be 0×0 while the tab is hidden — fall back to a sane aspect
const bootAspect = (window.innerWidth && window.innerHeight) ? window.innerWidth / window.innerHeight : 16 / 9;
const camera = new THREE.PerspectiveCamera(WORLD.fov, bootAspect, 0.5, 1200);
camera.position.set(...WORLD.camPos);

const shared = createSharedUniforms();

// keep the camera above the terrain along its whole sight line, or nearby
// hillsides end up back-face-culled and the sky shows through the valley floor
{
  let clearY = WORLD.camPos[1];
  for (let z = 74; z >= 16; z -= 3) clearY = Math.max(clearY, groundHeight(0, z) + 3.2);
  clearY = Math.max(clearY, groundHeight(WORLD.cabin.x, WORLD.cabin.z) + 4);
  WORLD.camPos[1] = clearY;
}

const ctx = { renderer, scene, camera, canvas, shared, tier: TIERS.medium, settings, quality: null, time, weather, audio, isReducedMotion };

// ---------- modules ----------
const sky = createSky(ctx);
const terrain = createTerrain(ctx);
const water = createWater(ctx);
const forest = createForest(ctx);
const cabin = createCabin(ctx);
const clouds = createClouds(ctx);
const fx = createWeatherFx(ctx);
const stars = createStars(ctx);
const birds = createBirds(ctx);
const rig = createCameraRig(ctx);
const post = renderer ? createPost(ctx) : null;

const tiered = [forest, clouds, fx, stars];

function applyTierAll(tier) {
  ctx.tier = tier;
  const reduced = isReducedMotion();
  const eff = reduced ? Object.assign({}, tier, { fxMul: tier.fxMul * 0.5 }) : tier;
  tiered.forEach(m => m.applyTier(eff));
  if (post) {
    post.setEnabled(tier.post);
    post.setMSAA(tier.msaa);
  }
  $('vignette').hidden = !!tier.post;
}

// ---------- quality ----------
const quality = new QualityManager(renderer, settings);
ctx.quality = quality;
quality.onTierChange = (tier) => applyTierAll(tier);
quality.onResolutionChange = () => { if (post) post.onResize(); };
applyTierAll(TIERS.medium);
if (settings.quality !== 'auto') quality.setMode(settings.quality);

// ---------- UI ----------
const clock = createClock({ document, isReducedMotion });
const scrubCtx = {
  document, time,
  onScrub(h) {
    if (h === null) {
      time.previewMin = 0;
    } else {
      const pm = time.previewMin;
      time.previewMin = 0;
      const live = time.dayHours();
      time.previewMin = pm;
      let d = h - live;
      if (d > 12) d -= 24;
      if (d < -12) d += 24;
      time.previewMin = d * 60;
    }
    atmosphereDirty = true;
  },
};
const scrubber = createScrubber(scrubCtx);
scrubCtx.scrubbing = () => scrubber.previewing;
ctx.scrubbing = () => scrubber.previewing;

const settingsUI = createSettings({
  document, settings, weather, quality,
  scrubbing: () => scrubber.previewing,
  onSettingChange(key) {
    saveSettings(settings);
    if (key === 'h24') { clock.rebuild(settings.h24); clock.update(time.displayParts(settings.h24)); }
    if (key === 'place') {
      if (settings.place) {
        weather.setPlace(settings.place);
        saveSettings(settings);
      }
    }
    if (key === 'reducedMotion') {
      document.body.classList.toggle('reduced-motion', isReducedMotion());
      applyTierAll(quality.tier);
    }
    if (key === 'sound') audio.setEnabled(settings.sound);
    atmosphereDirty = true;
  },
});

// ---------- weather wiring ----------
weather.onPlace = (place) => {
  if (place.lat !== null && place.lat !== undefined) {
    time.setPlace(place.lat, place.lon, place.tz);
  } else {
    time.tz = place.tz;
  }
  settingsUI.setPlaceName(place.name);
  $('place-name').textContent = place.name;
};
weather.onChange = () => {
  const s = weather.state;
  if (s.sunrise) time.setSunWindow(parseH(s.sunrise), parseH(s.sunset));
  atmosphereDirty = true;
};
function parseH(iso) {
  // "2026-10-29T07:12" (local to place) -> 7.2
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? (+m[1] + +m[2] / 60) : NaN;
}

if (settings.place) {
  weather.place = settings.place;
  weather.refresh(true);
} else {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  weather.adoptDeviceDefaults(tz);
}

// ---------- atmosphere computation (1 Hz + on scrub) ----------
function mixPhase(keyA, keyB, f, out, field) {
  tmpC.setHex(PHASES[keyA][field]);
  tmpC2.setHex(PHASES[keyB][field]);
  out.copy(tmpC).lerp(tmpC2, f);
}

function effectiveWeather() {
  const w = weather.state;
  const cond = previewCond || w.cond;
  const P = COND_PARAMS[cond] || COND_PARAMS.partly;
  const cloud = previewCond ? P.cloud : Math.max(P.cloud * 0.35 + w.cloud * 0.65, w.cloud * 0.9);
  const wind = previewCond ? (0.3 + P.windB) : clamp(w.wind + P.windB, 0, 1);
  return { cond, P, cloud, wind, temp: w.temp, isDay: w.isDay };
}

function computeAtmosphere() {
  const nowMs = time.previewedNow();
  const h = time.dayHours();
  const blend = time.sample(h);
  const A = PHASES[blend.aKey], B = PHASES[blend.bKey], f = blend.f;

  mixPhase(blend.aKey, blend.bKey, f, T.zen, 'zen');
  mixPhase(blend.aKey, blend.bKey, f, T.hor, 'hor');
  mixPhase(blend.aKey, blend.bKey, f, T.fog, 'fog');
  mixPhase(blend.aKey, blend.bKey, f, T.sun, 'sun');
  mixPhase(blend.aKey, blend.bKey, f, T.ambS, 'ambS');
  mixPhase(blend.aKey, blend.bKey, f, T.ambG, 'ambG');
  mixPhase(blend.aKey, blend.bKey, f, T.ground, 'ground');
  mixPhase(blend.aKey, blend.bKey, f, T.water, 'water');
  mixPhase(blend.aKey, blend.bKey, f, T.grade, 'grade');
  T.gradeAmt = lerp(A.gradeAmt, B.gradeAmt, f);
  T.sunI = lerp(A.sunI, B.sunI, f);
  T.night = lerp(A.night, B.night, f);

  const dirs = time.skyDirs(nowMs);
  sunDirT.set(dirs.sun.x, dirs.sun.y, dirs.sun.z);
  moonDirT.set(dirs.moon.x, dirs.moon.y, dirs.moon.z);
  const sunAlt = dirs.sunAlt;
  const moonAlt = dirs.moonAlt;

  const W = effectiveWeather();
  const { cond, P, cloud, wind } = W;
  T.cloud01 = cloud;
  T.storm = cond === 'storm';
  T.wind = wind;
  T.rain = P.rain;
  T.snow = P.snow;
  T.fogAmt = P.fog;

  // weather reshapes the palette
  const desatAmt = cloud * 0.4 + P.dark * 0.3;
  desat(T.zen, desatAmt); desat(T.hor, desatAmt * 0.8); desat(T.fog, desatAmt * 0.9);
  const dark = P.dark + cloud * 0.08;
  T.ambI = 1 - dark * 0.55;
  T.sunI *= (1 - cloud * 0.75);
  darken(T.zen, dark * 0.45); darken(T.hor, dark * 0.3); darken(T.fog, dark * 0.2);
  T.fogDensity = 0.0022 * (1 + T.fogAmt * 3.4 + T.rain * 0.5 + T.snow * 0.8);
  lift(T.hor, T.snow * 0.4, 0xcfd8e6);

  T.sunVis = smooth(-5, 7, sunAlt) * (1 - cloud * 0.9) * (1 - T.fogAmt * 0.6);
  const fullness = 1 - Math.abs(dirs.moonPhase * 2 - 1);
  T.moonVis = smooth(1.5, 8, moonAlt) * (0.25 + 0.75 * T.night) * (1 - cloud * 0.85);
  T.moonI = 0.8 * T.moonVis * (0.35 + 0.65 * fullness);
  T.cloudsFrac = cloud;
  T.shaftI = smooth(2, 12, sunAlt) * (1 - cloud) * (1 - T.fogAmt) * T.sunI;

  // windows and lantern wake as the sun drops
  T.windowGlow = smooth(4, -9, sunAlt);
  T.lantern = smooth(2, -6, sunAlt) * (0.75 + 0.25 * Math.sin(nowMs / 1000 * 2.1));
  T.firefly = T.night * (1 - T.rain) * (1 - T.snow) * (1 - T.fogAmt * 0.5);

  // season
  const seasonKey = previewSeason || seasonFor(new Date(nowMs), time.lat);
  const S = SEASONS[seasonKey];
  T.season.setRGB(S.tint[0], S.tint[1], S.tint[2]);
  T.blossom = S.blossom;
  T.snowGround = clamp(S.snow + T.snow * 0.6, 0, 1);
  tmpC.setRGB(S.water[0], S.water[1], S.water[2]);
  T.water.multiply(tmpC);
  T.ground.multiply(tmpC2.setRGB(1, 1, 1).lerp(tmpC, 0.5));

  // aurora: clear winter nights at high |latitude|
  const auroraOk = Math.abs(time.lat) > 55 && seasonKey === 'winter' && T.night > 0.8 && cloud < 0.3;
  T.aurora = auroraOk ? 1 : 0;

  // birds near sunrise / sunset only
  const sr = time.sunriseH, ss = time.sunsetH;
  const d1 = Math.min(wrapDist(h, sr), wrapDist(h, ss));
  T.birdsOn = d1 < 0.8 && sunAlt > -9 && sunAlt < 15;

  atmosphereDirty = false;
}
function desat(c, amt) {
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  c.r += (l - c.r) * amt; c.g += (l - c.g) * amt; c.b += (l - c.b) * amt;
}
function darken(c, amt) { c.multiplyScalar(1 - clamp(amt, 0, 0.85)); }
function lift(c, amt, hex) { tmpC2.setHex(hex); c.lerp(tmpC2, amt); }
function wrapDist(a, b) {
  let d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

// ---------- per-frame damping of uniforms ----------
const k = (dt, l) => 1 - Math.exp(-l * dt);
function dampAll(dt) {
  const l = 2.2, kw = k(dt, l);
  shared.uSkyZenith.value.lerp(T.zen, kw);
  shared.uSkyHorizon.value.lerp(T.hor, kw);
  shared.uFogColor.value.lerp(T.fog, kw);
  shared.uSunColor.value.lerp(T.sun, kw);
  shared.uAmbSky.value.lerp(T.ambS, kw);
  shared.uAmbGnd.value.lerp(T.ambG, kw);
  shared.uGroundTint.value.lerp(T.ground, kw);
  shared.uWaterTint.value.lerp(T.water, kw);
  shared.uSeasonTint.value.lerp(T.season, kw);
  tmpV.copy(sunDirT); shared.uSunDir.value.lerp(tmpV, kw).normalize();
  tmpV.copy(moonDirT); shared.uMoonDir.value.lerp(tmpV, kw).normalize();
  const d = (u, target) => { u.value += (target - u.value) * kw; };
  d(shared.uSunI, T.sunI); d(shared.uMoonI, T.moonI); d(shared.uAmbI, T.ambI);
  d(shared.uFogDensity, T.fogDensity); d(shared.uNight, T.night);
  d(shared.uWindSpeed, T.wind); d(shared.uRain, T.rain); d(shared.uSnow, T.snow);
  d(shared.uBlossom, T.blossom);
  d(shared.uSnowGround, T.snowGround); d(shared.uSunVis, T.sunVis);
  d(shared.uMoonVis, T.moonVis); d(shared.uAurora, T.aurora);
  d(shared.uCloudCover, T.cloudsFrac); d(shared.uShaftI, T.shaftI);
  shared.uWindDir.value.set(0.85, 0.53).normalize().multiplyScalar(1);

  cabin.setGlow(T.windowGlow);
  cabin.setLantern(clamp(T.lantern, 0, 1));
  fx.setFirefly(T.firefly);
  fx.setRain(T.rain * (isReducedMotion() ? 0.5 : 1));
  fx.setSnow(T.snow * (isReducedMotion() ? 0.5 : 1));
  clouds.setCover(T.cloudsFrac);
  if (post) post.setGrade(T.grade, T.gradeAmt);
}

// ---------- UI: ink theme, phase line, marker ----------
function updateUI(h) {
  // ink adapts to palette luminance
  tmpC.copy(T.hor).lerp(T.zen, 0.45);
  const lum = tmpC.r * 0.2126 + tmpC.g * 0.7152 + tmpC.b * 0.0722;
  const theme = lum > 0.42 ? 'dark-ink' : 'light-ink';
  if (document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--protect',
      theme === 'dark-ink' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0)');
  }

  const W = effectiveWeather();
  const name = PHASE_LABELS[time.sample(h).name];
  const isNight = T.night > 0.5;
  const pool = PHRASES[W.cond] || PHRASES.partly;
  const dayKey = W.isDay && !isNight ? 'day' : 'night';
  const arr = pool[dayKey] || pool.day;
  const daySeed = Math.floor(time.previewedNow() / 86400000);
  const phrase = arr[Math.abs(daySeed + W.cond.length * 7) % arr.length];
  const temp = settings.unit === 'f' ? Math.round(W.temp * 9 / 5 + 32) : Math.round(W.temp);
  clock.setPhase(`${name} — ${phrase.toLowerCase()}, ${temp}°`);
}

// ---------- intro ----------
function intro() {
  document.body.classList.add('ready');
  setTimeout(() => document.body.classList.add('mark-in'), 900);
  setTimeout(() => { document.body.classList.add('time-in'); clock.reveal(); }, 1400);
  setTimeout(() => document.body.classList.add('timeline-in'), 2000);
  setTimeout(() => document.body.classList.add('ui-in'), 2400);
}

// ---------- keyboard shortcuts ----------
const keyHint = $('key-hint');
function updateKeyHint() {
  const lines = [];
  if (previewCond) lines.push(`Weather preview: ${COND_LABELS[previewCond]} (W)`);
  if (previewSeason) lines.push(`Season preview: ${SEASONS[previewSeason].label} (T)`);
  if (lines.length) { keyHint.hidden = false; keyHint.textContent = lines.join('\n'); }
  else keyHint.hidden = true;
}
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k2 = e.key.toLowerCase();
  if (k2 === 'p') {
    quality.toggleHud();
    $('hud').hidden = !quality.hudVisible;
  } else if (k2 === 'w') {
    const i = WEATHER_CYCLE.indexOf(previewCond);
    previewCond = WEATHER_CYCLE[(i + 1) % WEATHER_CYCLE.length];
    updateKeyHint(); atmosphereDirty = true;
  } else if (k2 === 't') {
    const i = SEASON_CYCLE.indexOf(previewSeason);
    previewSeason = SEASON_CYCLE[(i + 1) % SEASON_CYCLE.length];
    updateKeyHint(); atmosphereDirty = true;
  }
});

// ---------- resize / visibility ----------
let resizeTimer = 0;
function applySize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h || !renderer) return; // degenerate size (hidden pane transition) — keep last good state
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
// so the camera and render targets recover as soon as real dimensions exist.
function syncSize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return;
  const pr = renderer.getPixelRatio();
  const wantW = Math.floor(w * pr), wantH = Math.floor(h * pr);
  if (Math.abs(camera.aspect - w / h) > 1e-4 || renderer.domElement.width !== wantW || renderer.domElement.height !== wantH) {
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
  if (v) { lastFrameTick = performance.now(); lastT = lastFrameTick; }
}
document.addEventListener('visibilitychange', () => {
  setRunning(!document.hidden);
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
  if (on) $('vignette').hidden = false;
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

// ---------- slow tick (250 ms) + 1 Hz clock ----------
let lastSlow = 0;
let lastSec = 0;
let lastWeatherCheck = 0;
let lastFlash = 0;
let lastAudioPush = 0;
let lastWinH = -1;
function slowTick(nowMs) {
  if (nowMs - lastSlow < 250) return;
  lastSlow = nowMs;
  computeAtmosphere();

  // fallback scene palette
  if (fallbackMode) {
    const st = document.documentElement.style;
    st.setProperty('--fb-zen', '#' + T.zen.getHexString());
    st.setProperty('--fb-hor', '#' + T.hor.getHexString());
    st.setProperty('--fb-fog', '#' + T.fog.getHexString());
    st.setProperty('--fb-far', '#' + T.fog.clone().multiplyScalar(0.55).getHexString());
    st.setProperty('--fb-near', '#' + T.fog.clone().multiplyScalar(0.3).getHexString());
  }

  if (nowMs - lastSec >= 1000) {
    lastSec = nowMs;
    clock.update(time.displayParts(settings.h24));
    // default sun window until the API provides real ones
    if (!weather.state.sunrise && nowMs - lastWeatherCheck > 30000) {
      const w = time.computedSunWindow(time.now());
      time.setSunWindow(w.sunriseH, w.sunsetH);
    }
    if (nowMs - lastWeatherCheck > 60000) {
      lastWeatherCheck = nowMs;
      if (weather.isStale) weather.refresh();
    }
    if (nowMs - lastAudioPush > 1000) {
      lastAudioPush = nowMs;
      const sr = time.sunriseH;
      audio.update(1, {
        wind: T.wind, rain: T.rain, night: T.night,
        dawn: Math.max(0, 1 - wrapDist(time.dayHours(), sr) / 1.2) * (T.night < 0.6 ? 1 : 0.3),
      });
    }
  }

  // scrubber marker + tick window
  const h = time.dayHours();
  scrubber.setMarker(h, T.night > 0.5);
  if (Math.abs(time.sunriseH - lastWinH) > 0.001) {
    scrubber.setWindow(time.sunriseH, time.sunsetH);
    lastWinH = time.sunriseH;
  }

  updateUI(h);

  // thunder hook
  if (shared.uFlash.value > 0.45 && lastFlash <= 0.45) audio.thunder();
  lastFlash = shared.uFlash.value;

  if (quality.hudVisible && renderer) $('hud').textContent = quality.hudText(renderer.info);
}

// ---------- main loop ----------
let lastT = performance.now();
let lastFrameTick = performance.now();
let lastRender = 0;
function loop() {
  const nowMs = performance.now();
  const dtMs = Math.max(0, nowMs - lastFrameTick);
  lastFrameTick = nowMs;
  const dt = Math.min(dtMs / 1000, 0.05);
  const t = nowMs / 1000;

  quality.frame(dtMs, nowMs);
  // unfocused or idle > 60 s -> throttle to ~30 fps
  const idle = nowMs - lastInteract > 60000;
  if (!quality.shouldRender(nowMs, lastRender, idle)) return;

  shared.uTime.value = t;
  if (atmosphereDirty) computeAtmosphere();
  dampAll(dt);
  syncSize();

  rig.update(dt, t);
  sky.update(dt, t, camera);
  fx.update(dt, t, T.storm);
  stars.update(dt, t, camera, T.cloud01);
  birds.update(dt, t, T.birdsOn && !isReducedMotion());

  slowTick(nowMs);

  if (renderer) {
    renderer.info.reset();
    post.render();
    lastRender = nowMs;
  }
}

// ---------- boot ----------
document.body.classList.toggle('reduced-motion', isReducedMotion());
applyTierAll(quality.tier);
if (renderer) {
  // settle the atmosphere before the first frame so the fade-in starts on-palette
  computeAtmosphere();
  for (let i = 0; i < 90; i++) dampAll(1 / 30);
  renderer.info.autoReset = false;
  renderer.compile(scene, camera);
  renderer.render(scene, camera); // warm-up frame behind the black overlay
  quality.startBenchmark();
  setRunning(true);
} else {
  // no WebGL: run the UI-only loop
  setInterval(() => { slowTick(performance.now()); computeAtmosphere(); }, 250);
}
setTimeout(() => { clock.update(time.displayParts(settings.h24)); }, 60);
intro();

// ---------- PWA ----------
if ('serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
