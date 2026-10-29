// Quality: startup benchmark, tier selection, dynamic resolution scaling, perf HUD.

import { TIERS, damp } from './config.js';

const PR_STEPS = [0.6, 0.75, 1.0, 1.25, 1.5];

export class QualityManager {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.tierName = 'medium';
    this.tier = TIERS.medium;
    this.prTarget = 1.0;
    this.pr = 1.0;
    this.mode = 'auto';          // auto | low | medium | high
    this._bench = null;
    this._frameAvg = 16;
    this._frames = 0;
    this._goodSince = 0;
    this._lastChange = 0;
    this._throttle30 = false;
    this.onTierChange = null;    // fn(tier)
    this.onResolutionChange = null; // fn(pr)
    this.hudVisible = false;
    this._hudText = '';
  }

  startBenchmark() {
    this._bench = { t0: performance.now(), acc: 0, n: 0 };
  }

  // Feed every rendered frame; resolves the tier when the 2 s benchmark is done.
  frame(dtMs, now) {
    dtMs = Math.max(0, dtMs);
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
    // Dynamic resolution (only in auto mode)
    this._frameAvg = damp(this._frameAvg, dtMs, 0.35, dtMs / 1000);
    this._frames++;
    if (this.mode === 'auto' && this._frames >= 60 && now - this._lastChange > 4000) {
      this._frames = 0;
      const avg = this._frameAvg;
      if (avg > 22 && this.prTarget > PR_STEPS[0]) {
        this._stepPr(-1);
      } else if (avg > 22 && this.prTarget <= PR_STEPS[0] && this.tierName !== 'low') {
        this._setTier('low');
      } else if (avg < 12) {
        if (!this._goodSince) this._goodSince = now;
        if (now - this._goodSince > 5000 && this.prTarget < this.tier.pr) this._stepPr(1);
      } else {
        this._goodSince = 0;
      }
    }
    // Smoothly approach the target pixel ratio; notify in small steps so the
    // render target is only recreated a handful of times per transition.
    if (Math.abs(this.pr - this.prTarget) > 0.005) {
      this.pr = damp(this.pr, this.prTarget, 4, dtMs / 1000);
      const snapped = Math.round(this.pr * 50) / 50;
      if (snapped !== this._lastSnapped) {
        this._lastSnapped = snapped;
        this.renderer.setPixelRatio(snapped);
        if (this.onResolutionChange) this.onResolutionChange(snapped);
      }
    }
  }

  _decideAuto(avg) {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    let tier = 'medium';
    if (avg > 24) tier = 'low';
    else if (avg < 12 && cores >= 8 && mem >= 4) tier = 'high';
    this._setTier(tier);
  }

  _stepPr(dir) {
    const cur = PR_STEPS.reduce((best, s) => (Math.abs(s - this.prTarget) < Math.abs(best - this.prTarget) ? s : best), PR_STEPS[2]);
    let i = PR_STEPS.indexOf(cur) + dir;
    i = Math.max(0, Math.min(PR_STEPS.length - 1, i));
    let target = PR_STEPS[i];
    if (dir > 0) target = Math.min(target, this.tier.pr);
    if (target === this.prTarget) return;
    this.prTarget = target;
    this._lastChange = performance.now();
    this._goodSince = 0;
  }

  _setTier(name) {
    if (this.tierName === name) { this.prTarget = Math.min(this.prTarget, TIERS[name].pr); return; }
    this.tierName = name;
    this.tier = TIERS[name];
    this.prTarget = Math.min(this.prTarget, this.tier.pr);
    this._lastChange = performance.now();
    if (this.onTierChange) this.onTierChange(this.tier);
  }

  // User setting change: auto keeps the dynamic system, else fixed tier.
  setMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') this._setTier(mode);
  }

  // 30 FPS cap on Low tier, plus idle/unfocused throttling.
  shouldRender(now, lastRender, idle = false) {
    if (this.tier.cap30 || this._throttle30 || idle) {
      return now - lastRender >= 30;
    }
    return true;
  }

  setThrottle(on) { this._throttle30 = on; }

  hudText(info) {
    if (!this.hudVisible) return '';
    const i = info.render;
    return `fps ${this._fpsText()}  frame ${this._frameAvg.toFixed(1)}ms\n` +
      `calls ${i.calls}  tris ${(i.triangles / 1000).toFixed(1)}k\n` +
      `${this.tier.name}${this.mode === 'auto' ? ' (auto)' : ''}  dpr ${this.pr.toFixed(2)}`;
  }

  _fpsText() { return Math.round(1000 / Math.max(this._frameAvg, 1)); }

  toggleHud() { this.hudVisible = !this.hudVisible; return this.hudVisible; }
}
