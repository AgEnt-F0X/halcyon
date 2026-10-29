// Time, solar position, moon phase and day-phase blending. Pure math, no Three.js.
// One Date.now() sync at construction; afterwards the clock runs off performance.now()
// so the displayed time never drifts with setInterval jitter.

const DEG = Math.PI / 180;
const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // reference new moon

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Minutes the named timezone is ahead of UTC at dateMs.
export function tzOffsetMinutes(tz, dateMs) {
  if (!tz) return -new Date(dateMs).getTimezoneOffset();
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const map = {};
    for (const p of dtf.formatToParts(new Date(dateMs))) if (p.type !== 'literal') map[p.type] = p.value;
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
    return Math.round((asUTC - dateMs) / 60000);
  } catch { return -new Date(dateMs).getTimezoneOffset(); }
}

export class TimeEngine {
  constructor() {
    this.perfBase = performance.now();
    this.dateBase = Date.now();
    this.previewMin = 0;          // scrub offset while previewing; 0 = live
    this.tz = undefined;          // undefined = device timezone
    this.lat = 45; this.lon = 0;  // refined once a place is chosen
    this.sunriseH = 6.5; this.sunsetH = 18.5; // replaced by API values when available
    this._anchors = null;
    this._fmtCache = new Map();
  }

  now() { return this.dateBase + (performance.now() - this.perfBase); }
  previewedNow() { return this.now() + this.previewMin * 60000; }

  setPlace(lat, lon, tz) {
    this.lat = lat; this.lon = lon; this.tz = tz;
  }

  setSunWindow(sunriseH, sunsetH) {
    if (!isFinite(sunriseH) || !isFinite(sunsetH)) return;
    // Guard against polar days where the API returns odd values.
    if (sunsetH - sunriseH < 2 || sunsetH - sunriseH > 22) return;
    this.sunriseH = sunriseH; this.sunsetH = sunsetH;
    this._anchors = null;
  }

  // Local hours-of-day (0..24) in the display timezone, including scrub preview.
  dayHours() {
    const off = tzOffsetMinutes(this.tz, this.previewedNow());
    const d = new Date(this.previewedNow() + off * 60000);
    return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  }

  displayParts(h24) {
    const key = `${this.tz || 'local'}|${h24 ? 24 : 12}`;
    let f = this._fmtCache.get(key);
    if (!f) {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone: this.tz, hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: h24 ? 'h23' : 'h12',
      });
      this._fmtCache.set(key, f);
    }
    const out = { hour: '', minute: '', second: '', suffix: '' };
    for (const p of f.formatToParts(new Date(this.previewedNow()))) {
      if (p.type === 'hour') out.hour = p.value;
      else if (p.type === 'minute') out.minute = p.value;
      else if (p.type === 'second') out.second = p.value;
      else if (p.type === 'dayPeriod') out.suffix = p.value;
    }
    const df = this._fmtCache.get('date|' + (this.tz || 'local')) ||
      this._setDateFmt(this.tz);
    out.date = df.format(new Date(this.previewedNow())).toUpperCase();
    return out;
  }

  _setDateFmt(tz) {
    const df = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    });
    this._fmtCache.set('date|' + (tz || 'local'), df);
    return df;
  }

  // --- solar position (NOAA-style low-precision approximation) ---
  _sunGeo(dateMs) {
    const n = dateMs / 86400000 - 10957.5; // days since J2000
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const eps = 23.439 * DEG;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG;
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    return { dec, ra, gmst };
  }

  _altAz(geo, dateMs) {
    let ha = (geo.gmst + this.lon - geo.ra) % 360;
    if (ha > 180) ha -= 360; if (ha < -180) ha += 360;
    const phi = this.lat * DEG;
    const haR = ha * DEG;
    const alt = Math.asin(Math.sin(phi) * Math.sin(geo.dec) + Math.cos(phi) * Math.cos(geo.dec) * Math.cos(haR));
    const azS = Math.atan2(Math.sin(haR), Math.cos(haR) * Math.sin(phi) - Math.tan(geo.dec) * Math.cos(phi));
    return { alt: alt / DEG, azN: (180 + azS / DEG + 360) % 360 };
  }

  solar(dateMs) { return this._altAz(this._sunGeo(dateMs), dateMs); }

  moonAge(dateMs) {
    const d = (dateMs - REF_NEW_MOON) / 86400000;
    return ((d % SYNODIC) + SYNODIC) % SYNODIC;
  }

  moon(dateMs) {
    const age = this.moonAge(dateMs);
    const phase = age / SYNODIC; // 0 new, 0.5 full
    const n = dateMs / 86400000 - 10957.5;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
    const lamSun = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const lam = lamSun + phase * 2 * Math.PI; // ignore 5.1° inclination: good enough
    const eps = 23.439 * DEG;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / DEG;
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    const { alt, azN } = this._altAz({ dec, ra, gmst }, dateMs);
    return { alt, azN, phase };
  }

  // Fallback sunrise/sunset from latitude + declination (no API needed).
  computedSunWindow(dateMs) {
    const { dec } = this._sunGeo(dateMs);
    const phi = this.lat * DEG;
    const cosH = (Math.sin(-0.833 * DEG) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    const off = tzOffsetMinutes(this.tz, dateMs) / 60;
    if (cosH < -1 || cosH > 1) return { sunriseH: 6.5, sunsetH: 18.5 }; // polar-ish: neutral window
    const H = Math.acos(cosH) / DEG / 15;
    const noon = 12 - this.lon / 15 + off;
    return { sunriseH: (noon - H + 24) % 24, sunsetH: (noon + H + 24) % 24 };
  }

  buildAnchors() {
    const sr = this.sunriseH, ss = this.sunsetH, noon = (sr + ss) / 2;
    return [
      { key: 'night', h: -2 },
      { key: 'night', h: Math.max(0, Math.min(sr - 1.6, 4)) },
      { key: 'predawn', h: sr - 1 },
      { key: 'sunrise', h: sr },
      { key: 'morning', h: sr + 2 },
      { key: 'midday', h: noon },
      { key: 'golden', h: ss - 1.5 },
      { key: 'sunset', h: ss },
      { key: 'dusk', h: ss + 70 / 60 },
      { key: 'night', h: Math.min(24, ss + 2.8) },
      { key: 'night', h: 26 },
    ].sort((a, b) => a.h - b.h);
  }

  // Blend weights between adjacent phase anchors at hours-of-day h.
  sample(h) {
    if (!this._anchors) this._anchors = this.buildAnchors();
    const A = this._anchors;
    if (h <= A[0].h) return { aKey: A[0].key, bKey: A[0].key, f: 0, name: A[0].key };
    for (let i = 0; i < A.length - 1; i++) {
      if (h < A[i + 1].h) {
        const span = Math.max(A[i + 1].h - A[i].h, 0.01);
        const f = smooth(A[i].h, A[i + 1].h, h);
        return { aKey: A[i].key, bKey: A[i + 1].key, f, name: f < 0.5 ? A[i].key : A[i + 1].key };
      }
    }
    return { aKey: 'night', bKey: 'night', f: 0, name: 'night' };
  }

  // Real sky directions, compressed into the painted frame:
  // the sun arc always crosses the visible valley, rising right of centre, setting left.
  _compress(altDeg, azN) {
    const t = clamp((azN - 60) / 240, -0.3, 1.3);
    const x = lerp(0.85, -0.85, t);
    const y = Math.sin(altDeg * DEG) * 0.9 + 0.015;
    const z = -0.62;
    const len = Math.hypot(x, y, z) || 1;
    return { x: x / len, y: y / len, z: z / len };
  }

  skyDirs(dateMs) {
    const s = this.solar(dateMs);
    const m = this.moon(dateMs);
    return {
      sun: this._compress(s.alt, s.azN),
      moon: this._compress(m.alt, m.azN),
      sunAlt: s.alt,
      moonAlt: m.alt,
      moonPhase: this.moonAge(dateMs) / SYNODIC,
    };
  }
}
