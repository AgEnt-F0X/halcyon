// Tactile layer: dual-ring spring cursor (crisp dot + lagging ring that
// stretches along its velocity vector and snaps magnetically to interactive
// targets), plus the Web Audio sound design — mechanical ticks on phase
// markers, harmonic swells on chapter changes. Everything synthesised, no
// assets, muted by default until the visitor opts in.

export function createInteractions(ctx) {
  const { document: doc, isReducedMotion } = ctx;
  const finePointer = matchMedia('(pointer: fine)').matches;

  // ---------------- pointer target for the shader field -----------------------
  const pointerTarget = { x: 0, y: 0 };

  // ---------------- dual-ring spring cursor -----------------------------------
  const dot = doc.getElementById('cursor-dot');
  const ring = doc.getElementById('cursor-ring');
  const label = doc.getElementById('cursor-label');
  const cur = {
    x: innerWidth / 2, y: innerHeight / 2,      // true pointer
    dx: innerWidth / 2, dy: innerHeight / 2,    // dot (near-instant)
    rx: innerWidth / 2, ry: innerHeight / 2,    // ring (spring)
    rvx: 0, rvy: 0,
  };
  let magnetEl = null;

  function onCursorMove(e) {
    cur.x = e.clientX;
    cur.y = e.clientY;
    pointerTarget.x = (e.clientX / Math.max(innerWidth, 1)) * 2 - 1;
    pointerTarget.y = (e.clientY / Math.max(innerHeight, 1)) * 2 - 1;
    // magnetic snap: nearest [data-magnetic] within range
    const targets = doc.querySelectorAll('[data-magnetic]');
    let best = null, bestD = 78 * 78;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cur.x - cx, dy = cur.y - cy;
      const d2 = dx * dx + dy * dy;
      const range = 78 + Math.max(r.width, r.height) / 2;
      if (d2 < range * range && d2 < bestD) { bestD = d2; best = el; }
    }
    if (best !== magnetEl) {
      magnetEl = best;
      if (best) {
        const text = best.getAttribute('data-cursor-label');
        if (text) {
          label.textContent = text;
          ring.classList.add('is-label');
        } else {
          ring.classList.remove('is-label');
        }
      } else {
        ring.classList.remove('is-label');
      }
    }
  }
  if (finePointer) window.addEventListener('pointermove', onCursorMove, { passive: true });

  // ---------------- Web Audio sound design -------------------------------------
  const audio = {
    enabled: false,
    _ac: null,
    _master: null,
    ensure() {
      if (this._ac) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this._ac = new AC();
      this._master = this._ac.createGain();
      this._master.gain.value = 0.5;
      this._master.connect(this._ac.destination);
      return true;
    },
    setEnabled(v) {
      this.enabled = !!v;
      if (this.enabled) {
        this.ensure();
        if (this._ac && this._ac.state === 'suspended') this._ac.resume();
      }
    },
    // clean mechanical tick — short filtered blip
    tick(freq = 1600, vol = 0.10) {
      if (!this.enabled || !this.ensure()) return;
      const ac = this._ac;
      const t0 = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      osc.connect(g).connect(hp).connect(this._master);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    },
    // soft harmonic chord swell on chapter change
    swell() {
      if (!this.enabled || !this.ensure()) return;
      const ac = this._ac;
      const t0 = ac.currentTime;
      const freqs = [261.63, 329.63, 392.0];
      freqs.forEach((f, i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * (1 + i * 0.0015);
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.045, t0 + 0.35 + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);
        osc.connect(g).connect(this._master);
        osc.start(t0);
        osc.stop(t0 + 2.2);
      });
    },
  };
  ctx.audio = audio;
  if (ctx.settings && ctx.settings.sound) audio.setEnabled(true);

  // ---------------- internal loop (cursor springs) ------------------------------
  let lastT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (finePointer) {
      // dot follows near-instantly
      cur.dx += (cur.x - cur.dx) * Math.min(1, dt * 55);
      cur.dy += (cur.y - cur.dy) * Math.min(1, dt * 55);
      // ring: critically-underdamped spring with velocity squeeze
      const tx = magnetEl ? magnetEl.getBoundingClientRect() : null;
      const gx = tx ? tx.left + tx.width / 2 : cur.x;
      const gy = tx ? tx.top + tx.height / 2 : cur.y;
      const ax = (gx - cur.rx) * 220 - cur.rvx * 22;
      const ay = (gy - cur.ry) * 220 - cur.rvy * 22;
      cur.rvx += ax * dt; cur.rvy += ay * dt;
      cur.rx += cur.rvx * dt; cur.ry += cur.rvy * dt;
      const speed = Math.hypot(cur.rvx, cur.rvy);
      const stretch = Math.min(speed * 0.00045, 0.42);
      const ang = Math.atan2(cur.rvy, cur.rvx) * 180 / Math.PI;
      const scale = magnetEl ? 1.55 : 1;
      ring.style.transform =
        `translate(${cur.rx.toFixed(1)}px, ${cur.ry.toFixed(1)}px) translate(-50%, -50%) ` +
        `rotate(${ang.toFixed(1)}deg) scale(${(scale * (1 + stretch)).toFixed(3)}, ${(scale * (1 - stretch * 0.7)).toFixed(3)})`;
      dot.style.transform = `translate(${cur.dx.toFixed(1)}px, ${cur.dy.toFixed(1)}px) translate(-50%, -50%)`;
    }
    requestAnimationFrame(loop);
  }
  if (finePointer && !isReducedMotion()) requestAnimationFrame(loop);
  else if (finePointer) {
    // reduced motion: cursor without springs, position only
    window.addEventListener('pointermove', (e) => {
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    }, { passive: true });
  }

  return { pointerTarget, audio };
}
