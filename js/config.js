// Halcyon configuration — Infinite Architectural Core & System Matrix edition.
// Identity constants, category accents, quality tiers and small math helpers.

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
// World constants of the matrix
// ---------------------------------------------------------------------------
export const MATRIX = {
  bg: 0x04060a,
  fogColor: 0x04060a,
  fogDensity: 0.0075,
  camPos: [0, 26, 92],          // overview: high atrium shot of the core
  camTarget: [0, 10, 0],
  fov: 50,
  gridHalf: 900,                // half-extent of the ground plane (shader grid)
  nodeRadius: 46,               // spiral radius where project racks stand
  nodeY: 7.2,                   // rack deck height
  ringGap: 16,                  // radial gap between concentric node rings
  ivory: 0xf4f1ea,
};

// Category system: each project gets a functional domain and a cybernetic accent.
export const CATEGORIES = {
  'AI/ML':   { accent: '#3DFFA2', label: 'INTELLIGENCE' },   // terminal green
  'Web':     { accent: '#4DA6FF', label: 'INTERFACE' },      // cyber blue
  'Systems': { accent: '#FFB45E', label: 'APEX' },           // apex amber
  'Creative':{ accent: '#C9A2FF', label: 'SYNTHESIS' },      // spectral violet
};

// Keyword routing: repo name/topics/language -> category.
// Short keywords use word boundaries — 'art' must light up inside
// 'kaamsarthi', and 'ai' must not match 'maintain'.
const CATEGORY_RULES = [
  { cat: 'AI/ML', kw: ['ai', 'ml', 'recognition', 'vision', 'neural', 'detector', 'classifier', 'opencv', 'pytorch', 'tensorflow', 'jupyter', 'sorter'] },
  { cat: 'Systems', kw: ['os', 'engine', 'telemetry', 'runtime', 'kernel', 'apex', 'cli', 'server'] },
  { cat: 'Creative', kw: ['scribbl', 'canvas', 'art', 'generative', 'creative', 'visual'] },
];

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

// Curated overrides for known repositories (case-insensitive via lookup()).
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
// Quality tiers — matrix edition. Draw calls are already tiny (batched grid,
// racks, beams and particles), so tiers mainly gate particle counts, the
// distant skyline, node detail and the post pass. Pixel ratio is LOCKED at
// 1.0 globally (hybrid-GPU laptops stutter on resolution rescaling).
// ---------------------------------------------------------------------------
export const TIERS = {
  potato: { name: 'Potato', pr: 1.0, post: false, msaa: 0, particles: 140, nodes: 0.5, skyline: 0,  beams: false, cap30: true,  shadows: false },
  low:    { name: 'Low',    pr: 1.0, post: false, msaa: 0, particles: 260, nodes: 0.75, skyline: 10, beams: false, cap30: false, shadows: false },
  medium: { name: 'Medium', pr: 1.0, post: true,  msaa: 0, particles: 420, nodes: 1.0,  skyline: 18, beams: true,  cap30: false, shadows: false },
  high:   { name: 'High',   pr: 1.0, post: true,  msaa: 4, particles: 640, nodes: 1.0,  skyline: 30, beams: true,  cap30: false, shadows: false },
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Frame-rate-independent damping: value += (target - value) * (1 - exp(-lambda * dt))
export function damp(value, target, lambda, dt) {
  return value + (target - value) * (1 - Math.exp(-lambda * dt));
}

export function hexToRgba(hex, a) {
  const h = String(hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Deterministic RNG so the matrix is identical on every load.
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
const KEY = 'halcyon.settings.v2';

export const DEFAULT_SETTINGS = {
  quality: 'auto',       // auto | potato | low | medium | high
  reducedMotion: null,   // null = follow prefers-reduced-motion
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
