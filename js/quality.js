// Quality: startup benchmark, 4-tier profiles (potato/low/medium/high),
// 45-frame rolling-buffer dynamic resolution scaling between 0.55 and
// min(devicePixelRatio, 1.35), eco throttling, low-spec governor and perf HUD.

import { TIERS, damp, clamp } from './config.js';

const PR_MIN = 0.55;          // heavy-load floor (<24 FPS territory)
const PR_MAX_CAP = 1.35;      // never supersample past 1.35
const BUFFER = 45;            // rolling frame-time window

export class QualityManager {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.tierName = 'medium';
    this.tier = TIERS.medium;
    this.prTarget = 1.0;
    this.pr = 1.0;
    this.mode = 'auto';          // auto | potato | low | medium | high
    this.prLocked = false;       // true = pixel ratio stays pinned at 1.0
    this._bench = null;
    this._buffer = new Float32Array(BUFFER);
    this._bufIdx = 0;
    this._bufFill = 0;
    this._frameAvg = 16;
    this._dprCap = Math.min(window.devicePixelRatio || 1, PR_MAX_CAP);
    this._lastSnapped = 1;
    this._lastChange = 0;
    this._autoHighOK = (navigator.hardwareConcurrency || 4) >= 8 && (navigator.deviceMemory || 4) >= 4;
    this._throttle30 = false;
    this._gov = { lowSince: 0, okSince: 0, on: false };
    this.onTierChange = null;       // fn(tier)
    this.onResolutionChange = null; // fn(pr)
    this.hudVisible = false;
  }

  startBenchmark() {
    this._bench = { t0: performance.now(), acc: 0, n: 0 };
  }

  // Feed every rendered frame; resolves the tier when the 2 s benchmark is done.
  frame(dtMs, now) {
    dtMs = Math.max(0, dtMs);
    // rolling 45-frame delta-time buffer
    this._buffer[this._bufIdx] = dtMs;
    this._bufIdx = (this._bufIdx + 1) % BUFFER;
    this._bufFill = Math.min(this._bufFill + 1, BUFFER);

    if (this._bench) {
      const b = this._bench;
      if (now - b.t0 > 400) { b.acc += dtMs; b.n++; } // skip the first shader-heavy frames
      if (now - b.t0 >= 2400) {
        const avg = b.n > 20 ? b.acc / b.n : 16.7;
        this._bench = null;
        this._decideAuto(avg);
      }
      return;
    }

    const avg = this._bufferAvg();
    this._frameAvg = avg;
    this._updateGovernor(now);

    // Matrix edition: the pixel ratio is locked, so tiers gate features only.
    // Be generous on the way down (boot shader-compile spikes would otherwise
    // strand capable GPUs on low) and let any comfortably-fast tier climb.
    if (this.mode === 'auto' && now - this._lastChange > 3500) {
      let acted = false;
      if (avg > 41.7) { // < 24 FPS: shed features
        if (this.tierName === 'high') { this._setTier('medium'); acted = true; }
        else if (this.tierName === 'medium') { this._setTier('low'); acted = true; }
        else if (this.tierName === 'low') { this._setTier('potato'); acted = true; }
      } else if (avg < 18.2) { // > 55 FPS: buy features back
        if (this.tierName === 'potato') { this._setTier('low'); acted = true; }
        else if (this.tierName === 'low') { this._setTier('medium'); acted = true; }
        else if (this.tierName === 'medium' && this._autoHighOK) { this._setTier('high'); acted = true; }
      }
      if (acted) this._lastChange = now;
    }

    // Smoothly approach the target pixel ratio; notify in 0.02 steps so the
    // render target is only recreated a handful of times per transition.
    if (!this.prLocked && Math.abs(this.pr - this.prTarget) > 0.004) {
      this.pr = damp(this.pr, this.prTarget, 3.5, dtMs / 1000);
      const snapped = Math.round(clamp(this.pr, PR_MIN, PR_MAX_CAP) * 50) / 50;
      if (snapped !== this._lastSnapped) {
        this._lastSnapped = snapped;
        this.renderer.setPixelRatio(snapped);
        if (this.onResolutionChange) this.onResolutionChange(snapped);
      }
    }
  }

  _bufferAvg() {
    const n = Math.max(this._bufFill, 1);
    let sum = 0;
    for (let i = 0; i < this._bufFill; i++) sum += this._buffer[i];
    return sum / n;
  }

  _prCeiling() {
    return Math.min(this.tier.pr, this._dprCap);
  }

  _nudgePr(delta, now) {
    this.prTarget = clamp(this.prTarget + delta, PR_MIN, this._prCeiling());
    this._lastChange = now;
  }

  _decideAuto(avg) {
    let tier = 'medium';
    if (avg > 55) tier = 'potato';
    else if (avg > 34) tier = 'low';
    else if (avg < 10 && this._autoHighOK) tier = 'high';
    this._setTier(tier);
  }

  // Rolling FPS governor: below 28 FPS for ~4 s flips body.low-spec-mode
  // (CSS swaps blurred glass panels for crisp solid cards); sustained comfort
  // above 45 FPS for ~8 s lets the site look rich again. Potato/low tiers
  // keep the class permanently.
  _updateGovernor(now) {
    const fps = 1000 / Math.max(this._frameAvg, 1);
    const g = this._gov;
    if (fps < 28) {
      if (!g.lowSince) g.lowSince = now;
      g.okSince = 0;
      if (!g.on && now - g.lowSince > 4000) g.on = true;
    } else {
      g.lowSince = 0;
      if (fps > 45) {
        if (!g.okSince) g.okSince = now;
        if (g.on && now - g.okSince > 8000) g.on = false;
      } else {
        g.okSince = 0;
      }
    }
    this._updateLowSpec();
  }

  _updateLowSpec() {
    const tierLow = this.tierName === 'potato' || this.tierName === 'low';
    document.body.classList.toggle('low-spec-mode', tierLow || this._gov.on);
  }

  get isLowSpec() { return this.tierName === 'potato' || this.tierName === 'low' || this._gov.on; }

  _setTier(name) {
    if (!TIERS[name]) return;
    const changed = this.tierName !== name;
    this.tierName = name;
    this.tier = TIERS[name];
    if (changed) this.prTarget = clamp(this.prTarget, PR_MIN, this._prCeiling());
    this._lastChange = performance.now();
    this._updateLowSpec();
    if (changed && this.onTierChange) this.onTierChange(this.tier);
  }

  // User setting change: auto keeps the dynamic system, else fixed tier.
  setMode(mode) {
    if (mode !== 'auto') { this.mode = mode; this._setTier(mode); }
    else this.mode = 'auto';
  }

  // Eco/idle throttling: 24 FPS when idle, 30 FPS when throttled or capped.
  shouldRender(now, lastRender, idle = false) {
    if (idle) return now - lastRender >= 42;
    if (this.tier.cap30 || this._throttle30) return now - lastRender >= 33;
    return true;
  }

  setThrottle(on) { this._throttle30 = on; }

  hudText(info) {
    if (!this.hudVisible) return '';
    const i = info.render;
    return `fps ${Math.round(1000 / Math.max(this._frameAvg, 1))}  frame ${this._frameAvg.toFixed(1)}ms\n` +
      `calls ${i.calls}  tris ${(i.triangles / 1000).toFixed(1)}k\n` +
      `${this.tier.name}${this.mode === 'auto' ? ' (auto)' : ''}  dpr ${this.pr.toFixed(2)}`;
  }

  // compact badge line for the always-on HUD element
  badgeText() {
    return `${Math.round(1000 / Math.max(this._frameAvg, 1))} FPS · ${this.tier.name.toUpperCase()}${this.mode === 'auto' ? '' : '·FIXED'} · DPR ${this.pr.toFixed(2)}`;
  }

  toggleHud() { this.hudVisible = !this.hudVisible; return this.hudVisible; }
}
