// HALCYON — Architectural Core configuration: identity, chapter palettes,
// formation routing, quality tiers, scroll constants and math helpers.

// ---------------------------------------------------------------------------
// IDENTITY: Halcyon is the name of this website framework itself — it is NOT
// a project. Repos named `halcyon` (or the owner account) must never surface
// as project cards anywhere in the pipeline.
// ---------------------------------------------------------------------------
export const IDENTITY = {
  framework: 'Halcyon',
  edition: 'ARCHITECTURAL CORE',
  owner: 'AgEnt-F0X',
  ownerLower: 'agent-f0x',
};

export function isIdentityRepo(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return false;
  return k === 'halcyon' || k === IDENTITY.ownerLower || k.includes('halcyon') || k.includes(IDENTITY.ownerLower);
}

// ---------------------------------------------------------------------------
// Chapter palettes — the whole world (GLSL flow field, particle stream, UI
// accents) morphs between these as the visitor scrolls between chapters.
// [background ink, primary glow, secondary accent]
// ---------------------------------------------------------------------------
export const PALETTES = {
  hero:         { bg: '#06070A', main: '#F4F1EA', accent: '#E5A93C', label: 'OBSIDIAN' },
  apex:         { bg: '#07080C', main: '#FF3366', accent: '#9D4EDD', label: 'APEX' },
  studypulse:   { bg: '#060B14', main: '#00F5D4', accent: '#6366F1', label: 'FOCUS' },
  kaamsaarthi:  { bg: '#0B0A09', main: '#F97316', accent: '#10B981', label: 'ROUTE' },
  asl:          { bg: '#050A0E', main: '#10F587', accent: '#38BDF8', label: 'NEURAL' },
  bin:          { bg: '#050B0A', main: '#2DD4BF', accent: '#F59E0B', label: 'OPTICS' },
  posture:      { bg: '#070610', main: '#A78BFA', accent: '#34D399', label: 'POSTURE' },
  playtime:     { bg: '#060A08', main: '#4ADE80', accent: '#F472B6', label: 'PLAYTIME' },
  scribbl:      { bg: '#0A0709', main: '#F472B6', accent: '#60A5FA', label: 'SKETCH' },
};

const PALETTE_RULES = [
  { key: 'apex',        kw: ['apex', 'f1', 'telemetry', 'race'] },
  { key: 'studypulse',  kw: ['studypulse', 'study', 'pomodoro'] },
  { key: 'kaamsaarthi', kw: ['kaamsaarthi', 'kaamsarthi', 'sarthi'] },
  { key: 'asl',         kw: ['asl', 'recognition', 'hand', 'vision', 'sign'] },
  { key: 'bin',         kw: ['bin', 'sorter', 'waste', 'optics'] },
  { key: 'posture',     kw: ['posture'] },
  { key: 'playtime',    kw: ['playtime', 'tracker', 'activity'] },
  { key: 'scribbl',     kw: ['scribbl', 'sketch', 'canvas'] },
];

function hashHue(name) {
  let h = 5381;
  const s = String(name || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Any repo without a curated palette gets a distinct harmonious trio derived
// from a hash hue (matching saturation/lightness craft of the curated ones).
export function paletteFor(name, topics = []) {
  const hay = [String(name || ''), ...topics.map(t => String(t))].join(' ').toLowerCase();
  for (const r of PALETTE_RULES) {
    if (r.kw.some(k => hay.includes(k))) return PALETTES[r.key];
  }
  const h = hashHue(name);
  return {
    bg: `hsl(${h}, 40%, 4%)`,
    main: `hsl(${h}, 88%, 62%)`,
    accent: `hsl(${(h + 42) % 360}, 82%, 60%)`,
    label: 'SIGNAL',
  };
}

// ---------------------------------------------------------------------------
// Curl-noise particle formations — one per chapter mood.
// 0 hero vortex ribbon · 1 apex wind-tunnel · 2 study helix lattice
// 3 kaamsaarthi geodesic network · 4 neural synapse cloud · 5 orbital ring field
// ---------------------------------------------------------------------------
export const FORMATIONS = {
  HERO: 0, TUNNEL: 1, HELIX: 2, GEODESIC: 3, NEURAL: 4, ORBITAL: 5,
};
export const MAX_FORMATION = 5;

const FORMATION_RULES = [
  { f: 1, kw: ['apex', 'f1', 'telemetry', 'race', 'os'] },
  { f: 2, kw: ['studypulse', 'study', 'pomodoro', 'focus'] },
  { f: 3, kw: ['kaamsaarthi', 'kaamsarthi', 'sarthi', 'route', 'match'] },
  { f: 4, kw: ['asl', 'recognition', 'hand', 'vision', 'sign', 'neural', 'ai', 'ml'] },
  { f: 5, kw: ['bin', 'sorter', 'waste', 'optics'] },
];

export function formationFor(name, topics = [], language = '') {
  const hay = [String(name || ''), ...topics.map(t => String(t)), String(language || '')].join(' ').toLowerCase();
  for (const r of FORMATION_RULES) {
    if (r.kw.some(k => hay.includes(k))) return r.f;
  }
  if (/python|jupyter/.test(hay)) return 4;
  return 5;
}

export const FORMATION_LABELS = ['VORTEX RIBBON', 'WIND TUNNEL', 'HELIX LATTICE', 'GEODESIC NET', 'NEURAL CLOUD', 'ORBITAL FIELD'];

// ---------------------------------------------------------------------------
// Category system (chips / labels)
// ---------------------------------------------------------------------------
export const CATEGORIES = {
  'AI/ML':   { accent: '#3DFFA2', label: 'INTELLIGENCE' },
  'Web':     { accent: '#4DA6FF', label: 'INTERFACE' },
  'Systems': { accent: '#FFB45E', label: 'APEX' },
  'Creative':{ accent: '#C9A2FF', label: 'SYNTHESIS' },
};

const KW_CACHE = new Map();
function kwMatches(hay, kw) {
  let re = KW_CACHE.get(kw);
  if (!re) {
    const src = kw.length <= 3 ? `\\b${kw}\\b` : `\\b${kw}`;
    re = new RegExp(src, 'i');
    KW_CACHE.set(kw, re);
  }
  return re.test(hay);
}

const CATEGORY_RULES = [
  { cat: 'AI/ML', kw: ['ai', 'ml', 'recognition', 'vision', 'neural', 'detector', 'classifier', 'opencv', 'pytorch', 'tensorflow', 'jupyter', 'sorter'] },
  { cat: 'Systems', kw: ['os', 'engine', 'telemetry', 'runtime', 'kernel', 'apex', 'cli', 'server'] },
  { cat: 'Creative', kw: ['scribbl', 'canvas', 'art', 'generative', 'creative', 'visual'] },
];

export function categoryFor(name, topics = [], language = '') {
  const hay = [String(name || ''), ...topics.map(t => String(t)), String(language || '')].join(' ');
  for (const r of CATEGORY_RULES) {
    if (r.kw.some(k => kwMatches(hay, k))) return r.cat;
  }
  if (/javascript|typescript|html|css|web/i.test(hay)) return 'Web';
  if (/python|jupyter/i.test(hay)) return 'AI/ML';
  if (/c\+\+|rust|\bc\b|java/i.test(hay)) return 'Systems';
  return 'Web';
}

// Curated taglines/stacks for known repositories (offline seed + polish).
export const FEATURED_PROJECTS = {
  'StudyPulse': {
    tagline: 'Premium lightweight game activity & playtime tracking for desktops',
    stack: ['JavaScript', 'Chrome APIs', 'Storage', 'Charts'],
  },
  'ASL-Recognition-System': {
    tagline: 'Real-time American Sign Language recognition with computer vision',
    stack: ['Python', 'Jupyter', 'Computer Vision', 'Deep Learning'],
  },
  'bin-sorter': {
    tagline: 'Offline AI-assisted waste-segregation kiosk for smart bins',
    stack: ['Python', 'Edge AI', 'Hardware', 'OpenCV'],
  },
  'apexos': {
    tagline: 'APEX//OS — F1 spatial race intelligence engine',
    stack: ['C++', 'Telemetry', 'Spatial Data', 'Realtime'],
  },
  'posture-pal': {
    tagline: 'Ambient posture coach with a gamified growing plant',
    stack: ['JavaScript', 'Camera ML', 'Gamification'],
  },
  'playtime-tracker': {
    tagline: 'Game activity and playtime analytics',
    stack: ['JavaScript', 'Analytics', 'Visualisation'],
  },
  'KaamSarthi': {
    tagline: 'Everyday assistance services, rebuilt for Bharat',
    stack: ['TypeScript', 'Product', 'i18n'],
  },
  'digitalscribbl': {
    tagline: 'Digital scribbles and sketch experiments',
    stack: ['Canvas', 'Creative Coding'],
  },
};

// ---------------------------------------------------------------------------
// Quality tiers — matrix edition. The pixel ratio is LOCKED at 1.0 globally;
// tiers gate particle counts, ribbon tessellation and the post pass.
// ---------------------------------------------------------------------------
export const TIERS = {
  potato: { name: 'Potato', pr: 1.0, post: false, msaa: 0, particles: 1400, cap30: true,  shadows: false },
  low:    { name: 'Low',    pr: 1.0, post: false, msaa: 0, particles: 2600, cap30: false, shadows: false },
  medium: { name: 'Medium', pr: 1.0, post: true,  msaa: 0, particles: 4000, cap30: false, shadows: false },
  high:   { name: 'High',   pr: 1.0, post: true,  msaa: 4, particles: 4000, cap30: false, shadows: false },
};

// ---------------------------------------------------------------------------
// Scroll engine constants
// ---------------------------------------------------------------------------
export const SCROLL = {
  DAMP: 0.085,          // currentScroll += (target - current) * DAMP per frame
  SKEW_FACTOR: 0.04,    // deg of skew per px of scroll velocity
  SKEW_MAX: 2.5,        // deg clamp
  VELOCITY_NORM: 1800,  // px/s at which shader velocity saturates
  TRACK_VH: 240,        // per-chapter scroll track height in vh
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function damp(value, target, lambda, dt) {
  return value + (target - value) * (1 - Math.exp(-lambda * dt));
}

export function hexToRgba(hex, a) {
  const h = String(hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Persisted settings
// ---------------------------------------------------------------------------
const KEY = 'halcyon.settings.v3';

export const DEFAULT_SETTINGS = {
  quality: 'auto',
  reducedMotion: null,   // null = follow prefers-reduced-motion
  sound: false,
  turbulence: 1,
  waveSpeed: 1,
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
