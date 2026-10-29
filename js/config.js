// Halcyon configuration: palettes, quality tiers, world constants, small helpers.

export const WORLD = {
  waterY: 8,
  lake: { x0: -130, x1: 130, z0: -120, z1: -10 },
  cabin: { x: -22, z: 8 },
  camPos: [0, 14, 62],
  camTarget: [0, 12, -90],
  fov: 42,
  skyRadius: 1000,
  cloudWrap: 520, // x/z half-range clouds drift within
};

// Day phases. t = hours-of-day anchor, filled in by time.js from real sunrise/sunset.
// Colors: zenith / horizon / fog, sun light, ambient sky+ground, ground & water albedo tints.
export const PHASES = {
  night:   { zen: 0x05071a, hor: 0x1b2250, fog: 0x11163a, sun: 0x2a3a66, ambS: 0x414d80, ambG: 0x0e1226, ground: 0x656f92, water: 0x1a2344, sunI: 0.12, rim: 0.15, night: 1.0, grade: 0x9aa8cc, gradeAmt: 0.16 },
  predawn: { zen: 0x141a4a, hor: 0x7d5a9e, fog: 0x4a3f78, sun: 0xd08aa8, ambS: 0x5a5a9a, ambG: 0x201c38, ground: 0x6a6280, water: 0x28285a, sunI: 0.45, rim: 0.7, night: 0.7, grade: 0xb494c4, gradeAmt: 0.2 },
  sunrise: { zen: 0x3b5ea8, hor: 0xff9a6b, fog: 0xf2a98b, sun: 0xffc08a, ambS: 0x7a92c8, ambG: 0x463a50, ground: 0x9a8a7e, water: 0x4a5a82, sunI: 1.0, rim: 1.0, night: 0.12, grade: 0xffd0a8, gradeAmt: 0.22 },
  morning: { zen: 0x4f9be8, hor: 0xbfe3ff, fog: 0xcfe6f5, sun: 0xfff2d8, ambS: 0x9ac4e8, ambG: 0x64745e, ground: 0xb4bcae, water: 0x3f7fb8, sunI: 1.1, rim: 0.35, night: 0, grade: 0xfff4e0, gradeAmt: 0.1 },
  midday:  { zen: 0x2f86e8, hor: 0xa9d8ff, fog: 0xbddcf2, sun: 0xfff8ea, ambS: 0xa8d0f0, ambG: 0x6c7c62, ground: 0xc0c6b6, water: 0x2f7fd0, sunI: 1.15, rim: 0.22, night: 0, grade: 0xf4f8ff, gradeAmt: 0.08 },
  golden:  { zen: 0x4a86d0, hor: 0xffc477, fog: 0xf4c896, sun: 0xffd898, ambS: 0x8aa8d8, ambG: 0x645c46, ground: 0xbca88a, water: 0x4a6a9c, sunI: 1.05, rim: 0.9, night: 0, grade: 0xffe2b0, gradeAmt: 0.18 },
  sunset:  { zen: 0x3a3f8f, hor: 0xff6a4d, fog: 0xd9788a, sun: 0xff9a68, ambS: 0x6a6ab0, ambG: 0x342e4c, ground: 0x8a7080, water: 0x3a4478, sunI: 0.9, rim: 1.0, night: 0.22, grade: 0xffb8a0, gradeAmt: 0.2 },
  dusk:    { zen: 0x1b2160, hor: 0xa64d8a, fog: 0x5b3f80, sun: 0xd88ab0, ambS: 0x4a4a90, ambG: 0x181432, ground: 0x5a5470, water: 0x242a56, sunI: 0.4, rim: 0.6, night: 0.55, grade: 0xc490bc, gradeAmt: 0.18 },
};

export const PHASE_LABELS = {
  night: 'Night', predawn: 'Pre-dawn', sunrise: 'Sunrise', morning: 'Morning',
  midday: 'Midday', golden: 'Golden hour', sunset: 'Sunset', dusk: 'Dusk',
};

// Season tints multiply foliage; snowM weights ground snow; blossom weights spring bloom.
export const SEASONS = {
  spring: { tint: [1.0, 1.06, 0.94], snow: 0.0, blossom: 0.55, water: [1.0, 1.0, 1.0], label: 'Spring' },
  summer: { tint: [0.94, 1.05, 0.88], snow: 0.0, blossom: 0.0, water: [1.0, 1.0, 1.0], label: 'Summer' },
  autumn: { tint: [1.18, 0.9, 0.62], snow: 0.0, blossom: 0.0, water: [1.05, 0.95, 0.9], label: 'Autumn' },
  winter: { tint: [0.85, 0.9, 0.95], snow: 0.85, blossom: 0.0, water: [0.85, 0.95, 1.1], label: 'Winter' },
};

export function seasonFor(date, lat) {
  const m = date.getUTCMonth();
  let s = (m >= 2 && m <= 4) ? 'spring' : (m >= 5 && m <= 7) ? 'summer' : (m >= 8 && m <= 10) ? 'autumn' : 'winter';
  if (lat < 0) s = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }[s];
  return s;
}

export const TIERS = {
  low:    { name: 'Low',    pr: 0.75, post: false, msaa: 0, grass: false, cap30: true,  pines: 350,  rocks: 40,  grassN: 0,    stars: 700,  clouds: 6,  fireflies: 30,  fxMul: 0.55 },
  medium: { name: 'Medium', pr: 1.0,  post: true,  msaa: 0, grass: false, cap30: false, pines: 800,  rocks: 80,  grassN: 0,    stars: 1500, clouds: 10, fireflies: 70,  fxMul: 1.0 },
  high:   { name: 'High',   pr: 1.5,  post: true,  msaa: 4, grass: true,  cap30: false, pines: 1500, rocks: 160, grassN: 3000, stars: 2500, clouds: 16, fireflies: 140, fxMul: 1.4 },
};

// WMO weather_code -> condition key
export function wmoToCond(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'partly';
}

export const COND_LABELS = {
  clear: 'Clear', partly: 'Partly cloudy', overcast: 'Overcast', fog: 'Fog',
  drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm',
};

// Short poetic lines, varied by condition and day/night. Picked stably per day.
export const PHRASES = {
  clear: {
    day: ['Clear sky', 'Not a cloud', 'Sunlit and still', 'Wide open sky'],
    night: ['Clear night', 'Star-filled sky', 'Cold and clear'],
  },
  partly: {
    day: ['Loose cloud', 'Broken cloud', 'Passing clouds'],
    night: ['Clouds over the moon', 'Broken cloud'],
  },
  overcast: {
    day: ['Low grey cloud', 'Flat grey sky', 'Cloud pressed close'],
    night: ['Low grey cloud', 'Moon behind cloud'],
  },
  fog: {
    day: ['Fog on the water', 'Fog in the valley', 'Muted by fog'],
    night: ['Fog over the water', 'Fog and lantern light'],
  },
  drizzle: {
    day: ['Fine drizzle', 'Light rain settling', 'Thin grey rain'],
    night: ['Fine drizzle', 'Rain on the lake'],
  },
  rain: {
    day: ['Steady rain', 'Rain sweeping through', 'Rain on the water'],
    night: ['Steady rain', 'Rain in the dark'],
  },
  snow: {
    day: ['Snow falling', 'Snow drifting in', 'Quiet snow'],
    night: ['Snow after dark', 'Quiet snow'],
  },
  storm: {
    day: ['Thunder rolling in', 'Storm over the ridge', 'Heavy rain and thunder'],
    night: ['Thunder in the dark', 'Storm over the ridge'],
  },
};

// Frame-rate-independent damping: value += (target - value) * (1 - exp(-lambda * dt))
export function damp(value, target, lambda, dt) {
  return value + (target - value) * (1 - Math.exp(-lambda * dt));
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Deterministic RNG so the world is identical on every load.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WEATHER_CYCLE = ['clear', 'partly', 'overcast', 'fog', 'rain', 'storm', 'snow', null];
export const SEASON_CYCLE = ['spring', 'summer', 'autumn', 'winter', null];

// ---------- persisted settings ----------
const KEY = 'halcyon.settings.v1';

export const DEFAULT_SETTINGS = {
  quality: 'auto',       // auto | low | medium | high
  h24: true,
  unit: 'c',             // c | f
  place: null,           // { name, lat, lon, tz }
  reducedMotion: null,   // null = follow prefers-reduced-motion
  sound: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
