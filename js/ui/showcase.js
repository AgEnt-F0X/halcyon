// The Scrollytelling Engine: inertial smooth scroll with velocity skew,
// Remix.run-style pinned project chapters (kinetic title → live sandbox →
// deep architecture), an Ollivere.co bento reel with throwable stickers,
// a persistent timeline rail, the Ctrl+K command palette, the Shader &
// Physics Tuner drawer, and six bespoke interactive canvas simulations —
// one per project, hand-tailored to what each repository actually does.

import {
  CATEGORIES, PALETTES, paletteFor, formationFor, FORMATIONS,
  FORMATION_LABELS, SCROLL, clamp, smooth, hexToRgba,
} from '../config.js';
import { GitHubService } from '../github-service.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelector(sel);

function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); }
function fmtSize(kb) { return !kb ? '—' : kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'; }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
}
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const EXT_LANG = {
  py: 'Python', js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
  cpp: 'C++', cc: 'C++', c: 'C', h: 'C/C++ Header', hpp: 'C++', java: 'Java', rs: 'Rust',
  html: 'HTML', css: 'CSS', ipynb: 'Jupyter', json: 'JSON', md: 'Markdown', go: 'Go',
  sh: 'Shell', bat: 'Batch', yml: 'YAML', yaml: 'YAML', svg: 'SVG', cs: 'C#', kt: 'Kotlin',
};

// ===========================================================================
// LIVE SIMULATIONS — one bespoke sandbox per project
// ===========================================================================

const SIMS = [
  { match: (n) => /apex|f1|telemetry/i.test(n), key: 'apex', label: 'TELEMETRY KERNEL', create: createApexSim },
  { match: (n) => /studypulse|pomodoro|focus/i.test(n), key: 'studypulse', label: 'FOCUS RHYTHM', create: createStudyPulseSim },
  { match: (n) => /kaamsaarthi|kaamsarthi|sarthi|route|match/i.test(n), key: 'kaamsaarthi', label: 'GEO-MATCHING NET', create: createKaamSaarthiSim },
  { match: (n) => /asl|hand|sign|recognition|vision/i.test(n), key: 'asl', label: 'HAND NEURAL NET', create: createASLSim },
  { match: (n) => /bin|sorter|waste|optics/i.test(n), key: 'bin', label: 'OPTICAL CONVEYOR', create: createBinSorterSim },
];
const FALLBACK_SIM = { key: 'graph', label: 'DEPENDENCY GRAPH', create: createDepGraphSim };

function simFor(name) {
  for (const s of SIMS) if (s.match(name)) return s;
  return FALLBACK_SIM;
}

// ---- shared canvas plumbing ------------------------------------------------
function simCtx(canvas) {
  return {
    fit() {
      const w = Math.min(canvas.clientWidth || 640, 780);
      const h = Math.min(canvas.clientHeight || 400, 500);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
      }
      return { w: canvas.width, h: canvas.height };
    },
  };
}

// ---- 1. APEX: live telemetry & kernel stress visualizer ----------------------
function createApexSim(canvas, project, colors) {
  const g = canvas.getContext('2d');
  const fitter = simCtx(canvas);
  const N = 130;
  const rpm = new Float32Array(N), spd = new Float32Array(N), ers = new Float32Array(N);
  let head = 0, acc = 0, speed = 0, drs = false, throttle = 0.35;
  const sectors = [41.82, 38.95, 45.31].map(v => ({ cur: v, best: v - 0.4 - Math.random() * 0.5 }));
  let last = performance.now();

  const controls = document.createElement('div');
  controls.className = 'sb-controls-row';
  controls.innerHTML = `
    <button type="button" class="sb-btn sb-drs">[DRS OVERDRIVE]</button>
    <label class="sb-slider">THROTTLE <input type="range" min="0" max="100" value="35"></label>`;
  const drsBtn = controls.querySelector('.sb-drs');
  const slider = controls.querySelector('input');
  drsBtn.addEventListener('click', () => {
    drs = !drs;
    drsBtn.classList.toggle('is-on', drs);
  });
  slider.addEventListener('input', () => { throttle = slider.value / 100; });

  function frame(dt, t) {
    acc += dt;
    if (acc > 0.05) {
      acc = 0;
      head = (head + 1) % N;
      const target = 3200 + throttle * 6400 + Math.sin(t * 7) * 180 + Math.random() * 120;
      rpm[head] = target;
      speed = Math.min(drs ? 342 : 318, speed + (target / 90 - speed) * 0.08);
      spd[head] = speed;
      ers[head] = clamp(0.45 + Math.sin(t * 1.7) * 0.3 - throttle * 0.15 + (drs ? 0.18 : 0), 0, 1);
      for (const s of sectors) {
        s.cur += (Math.random() - 0.48) * 0.06 * (1 + throttle);
        s.cur = clamp(s.cur, s.best - 1.4, s.best + 3.2);
      }
    }
    const { w, h } = fitter.fit();
    if (!w) return;
    g.clearRect(0, 0, w, h);
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let y = 0; y < h; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }

    const draw = (buf, min, max, color, lw) => {
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const v = buf[(head + 1 + i) % N];
        const x = (i / (N - 1)) * w;
        const y = h - 30 - ((v - min) / (max - min)) * (h - 70);
        if (i === 0) g.moveTo(x, y);
        else {
          const px = ((i - 1) / (N - 1)) * w;
          const py = h - 30 - ((buf[(head + i) % N] - min) / (max - min)) * (h - 70);
          g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        }
      }
      g.strokeStyle = color; g.lineWidth = lw;
      g.shadowColor = color; g.shadowBlur = 8;
      g.stroke(); g.shadowBlur = 0;
    };
    draw(rpm, 2500, 10200, colors.sec, 1.6);
    draw(spd, 0, 360, colors.acc, 1.4);
    draw(ers, 0, 1, 'rgba(244,241,234,0.75)', 1.1);

    // readouts
    g.font = '10px "JetBrains Mono", monospace';
    g.fillStyle = colors.sec;
    g.fillText(`RPM ${Math.round(rpm[head])}`, 12, 18);
    g.fillStyle = colors.acc;
    g.fillText(`SPD ${Math.round(spd[head])} KM/H`, 110, 18);
    g.fillStyle = 'rgba(244,241,234,0.8)';
    g.fillText(`ERS ${(ers[head] * 100).toFixed(0)}%  DRS ${drs ? 'OPEN' : 'CLOSED'}`, 232, 18);
    // sector deltas
    let sx = w - 178;
    sectors.forEach((s, i) => {
      const d = s.cur - s.best;
      g.fillStyle = d < 0.08 ? '#3DFFA2' : d < 0.35 ? '#FFB45E' : '#FF3366';
      g.fillText(`S${i + 1} ${s.cur.toFixed(2)} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`, sx, 18);
      sx += 62;
    });
    // process threads
    const threads = 14;
    const tw = (w - 24) / threads;
    for (let i = 0; i < threads; i++) {
      const load = clamp(0.2 + throttle * 0.7 + Math.sin(t * 5 + i * 1.7) * 0.25, 0.05, 1);
      const bh = 26 * load;
      g.fillStyle = i % 4 === 0 ? colors.acc : 'rgba(244,241,234,0.4)';
      g.fillRect(12 + i * tw, h - 12 - bh, tw - 4, bh);
    }
    g.fillStyle = 'rgba(244,241,234,0.5)';
    g.fillText(`KERNEL THREADS ${threads}/14 · LOAD ${(throttle * 100).toFixed(0)}%`, 12, h - 34);
  }
  return { frame, controls, label: 'DRS · THROTTLE' };
}

// ---- 2. STUDYPULSE: focus rhythm & cohort analytics sandbox ------------------
function createStudyPulseSim(canvas, project, colors) {
  const g = canvas.getContext('2d');
  const fitter = simCtx(canvas);
  const sprints = []; // {start, dur}
  let streak = 0, ciLit = 0, wave = 0;
  const CI_NODES = 5;

  const controls = document.createElement('div');
  controls.className = 'sb-controls-row';
  controls.innerHTML = `<span class="sb-hint-inline">CLICK THE CANVAS TO LAUNCH A POMODORO SPRINT</span>
    <button type="button" class="sb-btn sb-sprint">[SPRINT 25:00]</button>`;
  controls.querySelector('.sb-sprint').addEventListener('click', () => launch());

  function launch() {
    sprints.push({ start: performance.now() / 1000, dur: 8 });
    streak++;
  }
  canvas.addEventListener('pointerdown', () => launch());

  function frame(dt, t) {
    const { w, h } = fitter.fit();
    if (!w) return;
    g.clearRect(0, 0, w, h);
    wave += dt;
    // focus session wave
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const u = x / w;
      const y = h * 0.30
        + Math.sin(u * 9 - wave * 1.4) * 16
        + Math.sin(u * 23 - wave * 2.2) * 6
        + (sprints.some(s => t - s.start < s.dur) ? Math.sin(u * 40 - wave * 6) * 6 : 0);
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = colors.sec; g.lineWidth = 1.8;
    g.shadowColor = colors.sec; g.shadowBlur = 10;
    g.stroke(); g.shadowBlur = 0;

    // active sprint arcs
    for (const s of sprints) {
      const age = t - s.start;
      if (age < s.dur) {
        const p = age / s.dur;
        g.beginPath();
        g.arc(w - 56, h * 0.30, 22, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        g.strokeStyle = colors.acc; g.lineWidth = 3;
        g.stroke();
        g.fillStyle = 'rgba(244,241,234,0.9)';
        g.font = '10px "JetBrains Mono", monospace';
        g.fillText(`${Math.ceil((s.dur - age) * 3.1)}s`, w - 66, h * 0.30 + 4);
      }
    }
    // streak histogram
    const bars = sprints.slice(-14);
    const bw = Math.min(18, (w - 40) / 15);
    bars.forEach((s, i) => {
      const bh = 12 + ((i * 37) % 5) * 8 + (t - s.start < s.dur ? 26 : 0);
      const x = 24 + i * (bw + 6);
      const y = h - 40 - bh;
      g.fillStyle = t - s.start < s.dur ? colors.acc : hexToRgba(colors.sec, 0.55);
      g.fillRect(x, y, bw, bh);
    });
    g.fillStyle = 'rgba(244,241,234,0.55)';
    g.font = '9px "JetBrains Mono", monospace';
    g.fillText('SESSION STREAK', 24, h - 26);
    g.fillStyle = colors.sec;
    g.font = 'bold 13px "JetBrains Mono", monospace';
    g.fillText(`${streak}`, 150, h - 26);
    // CI workflow nodes
    const total = Math.floor(streak / 1);
    for (let i = 0; i < CI_NODES; i++) {
      const x = w - 40 - (CI_NODES - 1 - i) * 44, y = h - 56;
      const lit = i < (total % (CI_NODES + 1));
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2);
      g.fillStyle = lit ? colors.acc : 'rgba(255,255,255,0.12)';
      g.fill();
      if (i < CI_NODES - 1) {
        g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 36, y);
        g.strokeStyle = lit ? hexToRgba(colors.acc, 0.7) : 'rgba(255,255,255,0.1)';
        g.lineWidth = 1.4; g.stroke();
      }
    }
    g.fillStyle = 'rgba(244,241,234,0.5)';
    g.font = '9px "JetBrains Mono", monospace';
    g.fillText('CI WORKFLOW', w - 40 - (CI_NODES - 1) * 44, h - 40);
  }
  return { frame, controls, label: 'CLICK = SPRINT' };
}

// ---- 3. KAAMSAARTHI: live geo-matching network -------------------------------
function createKaamSaarthiSim(canvas, project, colors) {
  const g = canvas.getContext('2d');
  const fitter = simCtx(canvas);
  let W = 0, H = 0;
  const workers = [];
  {
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 12; i++) workers.push({ x: 0.08 + rnd() * 0.84, y: 0.12 + rnd() * 0.76, pulse: 0, loads: Math.floor(rnd() * 5) });
  }
  const jobs = []; // {x, y, t, targets:[i], done}
  let matched = 0, autoT = 2;

  function spawn(x, y) {
    const scored = workers.map((wk, i) => ({ i, d: (wk.x - x) ** 2 + (wk.y - y) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, 3);
    jobs.push({ x, y, t: 0, targets: scored.map(s => s.i) });
  }

  const controls = document.createElement('div');
  controls.className = 'sb-controls-row';
  controls.innerHTML = `<span class="sb-hint-inline">CLICK THE MAP TO DISPATCH A JOB REQUEST</span>
    <span class="sb-count">MATCHED <b>0</b></span>`;
  const countEl = controls.querySelector('b');

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    spawn((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });

  function frame(dt, t) {
    const { w, h } = fitter.fit();
    if (!w) return;
    W = w; H = h;
    g.clearRect(0, 0, w, h);
    autoT -= dt;
    if (autoT < 0) { autoT = 2.6 + Math.random() * 1.6; spawn(0.1 + Math.random() * 0.8, 0.15 + Math.random() * 0.7); }
    // links between nearby workers
    g.strokeStyle = hexToRgba(colors.acc, 0.14);
    g.lineWidth = 1;
    for (let i = 0; i < workers.length; i++) {
      for (let j2 = i + 1; j2 < workers.length; j2++) {
        const a = workers[i], b = workers[j2];
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 0.05) {
          g.beginPath(); g.moveTo(a.x * w, a.y * h); g.lineTo(b.x * w, b.y * h); g.stroke();
        }
      }
    }
    // job arcs
    for (let k = jobs.length - 1; k >= 0; k--) {
      const j = jobs[k];
      j.t += dt * 1.4;
      if (j.t >= 1.35) {
        matched++;
        countEl.textContent = String(matched);
        jobs.splice(k, 1);
        continue;
      }
      for (const ti of j.targets) {
        const wk = workers[ti];
        const mx = (j.x + wk.x) / 2 + (wk.y - j.y) * 0.18;
        const my = (j.y + wk.y) / 2 - (wk.x - j.x) * 0.18;
        const p = Math.min(j.t, 1);
        // partial quadratic bezier
        g.beginPath();
        g.moveTo(j.x * w, j.y * h);
        const steps = 22;
        for (let s2 = 1; s2 <= steps * p; s2++) {
          const u = (s2 / steps) * p;
          const ix = (1 - u) * (1 - u) * j.x + 2 * (1 - u) * u * mx + u * u * wk.x;
          const iy = (1 - u) * (1 - u) * j.y + 2 * (1 - u) * u * my + u * u * wk.y;
          g.lineTo(ix * w, iy * h);
        }
        g.strokeStyle = j.t < 1 ? colors.sec : hexToRgba(colors.sec, 0.25);
        g.lineWidth = 1.6;
        g.shadowColor = colors.sec; g.shadowBlur = 6;
        g.stroke(); g.shadowBlur = 0;
        if (j.t >= 1) wk.pulse = 1;
      }
      // request node
      g.beginPath(); g.arc(j.x * w, j.y * h, 4.5, 0, Math.PI * 2);
      g.fillStyle = colors.sec; g.fill();
    }
    // workers
    for (const wk of workers) {
      wk.pulse = Math.max(0, wk.pulse - dt * 1.8);
      const x = wk.x * w, y = wk.y * h;
      if (wk.pulse > 0) {
        g.beginPath(); g.arc(x, y, 8 + (1 - wk.pulse) * 20, 0, Math.PI * 2);
        g.strokeStyle = hexToRgba(colors.acc, wk.pulse * 0.8);
        g.lineWidth = 1.6; g.stroke();
      }
      g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2);
      g.fillStyle = colors.acc;
      g.shadowColor = colors.acc; g.shadowBlur = wk.pulse > 0 ? 12 : 0;
      g.fill(); g.shadowBlur = 0;
      g.fillStyle = 'rgba(4,6,10,0.9)';
      g.font = '8px "JetBrains Mono", monospace';
      g.fillText(String(wk.loads), x - 2, y + 3);
    }
    g.fillStyle = 'rgba(244,241,234,0.5)';
    g.font = '9px "JetBrains Mono", monospace';
    g.fillText(`NETWORK: 12 WORKER NODES · SHORTEST-PATH DISPATCH`, 12, 16);
  }
  return { frame, controls, label: 'CLICK = JOB PULSE' };
}

// ---- 4. ASL: 21-keypoint hand neural visualizer -------------------------------
function createASLSim(canvas, project, colors) {
  const g = canvas.getContext('2d');
  const fitter = simCtx(canvas);
  const LETTERS = ['A', 'B', 'C', 'V', 'Y'];
  // curls: [thumb, index, middle, ring, pinky] · 0 straight, 1 curled; spread
  const POSES = {
    A: { c: [0.1, 0.95, 0.95, 0.95, 0.95], s: 0.16 },
    B: { c: [0.9, 0.02, 0.02, 0.02, 0.02], s: 0.05 },
    C: { c: [0.25, 0.55, 0.55, 0.55, 0.55], s: 0.14 },
    V: { c: [0.85, 0.02, 0.02, 0.92, 0.92], s: 0.34 },
    Y: { c: [0.02, 0.9, 0.9, 0.9, 0.05], s: 0.22 },
  };
  let target = 'A';
  let cur = { c: [...POSES.A.c], s: POSES.A.s };
  const mouse = { x: 0.5, y: 0.5, active: false };
  const CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

  const controls = document.createElement('div');
  controls.className = 'sb-controls-row';
  controls.innerHTML = LETTERS.map(l => `<button type="button" class="sb-btn sb-asl" data-l="${l}">${l}</button>`).join('') +
    `<span class="sb-conf">MATCH <b>—</b></span>`;
  const confEl = controls.querySelector('b');
  controls.querySelectorAll('.sb-asl').forEach(b => b.addEventListener('click', () => {
    target = b.dataset.l;
    controls.querySelectorAll('.sb-asl').forEach(x => x.classList.toggle('is-on', x === b));
  }));
  controls.querySelector('.sb-asl').classList.add('is-on');

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width;
    mouse.y = (e.clientY - r.top) / r.height;
    mouse.active = true;
  });
  canvas.addEventListener('pointerleave', () => { mouse.active = false; });

  function joints(w, h) {
    // morph current pose toward target
    const P = POSES[target];
    for (let i = 0; i < 5; i++) cur.c[i] += (P.c[i] - cur.c[i]) * 0.14;
    cur.s += (P.s - cur.s) * 0.14;
    const pts = new Array(21);
    const palmX = w * (0.42 + (mouse.active ? (mouse.x - 0.5) * 0.10 : 0));
    const palmY = h * (0.60 + (mouse.active ? (mouse.y - 0.5) * 0.08 : 0));
    const scale = Math.min(w, h) * 0.0052;
    pts[0] = [palmX, palmY + 46 * scale];
    pts[17] = [palmX - 26 * scale, palmY + 30 * scale];
    pts[13] = [palmX - 18 * scale, palmY + 6 * scale];
    pts[9] = [palmX - 6 * scale, palmY];
    pts[5] = [palmX + 10 * scale, palmY + 4 * scale];
    // thumb chain
    const tCurl = cur.c[0];
    let a = -2.35 + tCurl * 0.9, ang = a;
    let x = pts[0][0] + 14 * scale, y = pts[0][1] - 8 * scale;
    pts[1] = [x, y];
    for (let s2 = 0; s2 < 3; s2++) {
      ang = a + s2 * (0.28 + tCurl * 0.62);
      x += Math.cos(ang) * 15 * scale; y += Math.sin(ang) * 15 * scale;
      pts[2 + s2] = [x, y];
    }
    // four fingers
    const baseA = [-0.28, -0.1, 0.08, 0.26];
    for (let f = 0; f < 4; f++) {
      const bx = pts[5 + f * 4][0], by = pts[5 + f * 4][1];
      const spread = (baseA[f] - 0.5) * cur.s * 1.6;
      const segLen = [17, 15, 13][0] * scale * (1 - f * 0.08);
      let fx = bx, fy = by, fang = -Math.PI / 2 + spread * 0.4;
      const curl = cur.c[f + 1];
      for (let s2 = 0; s2 < 3; s2++) {
        fang += (curl * (0.42 + s2 * 0.30)) * (s2 > 0 ? 1.25 : 1);
        fx += Math.cos(fang) * segLen; fy += Math.sin(fang) * segLen;
        pts[6 + f * 4 + s2] = [fx, fy];
      }
    }
    return pts;
  }

  function frame(dt, t) {
    const { w, h } = fitter.fit();
    if (!w) return;
    g.clearRect(0, 0, w, h);
    const pts = joints(w, h);
    // connections
    g.strokeStyle = hexToRgba(colors.sec, 0.9);
    g.lineWidth = 2;
    g.shadowColor = colors.sec; g.shadowBlur = 7;
    for (const [a, b] of CONN) {
      g.beginPath(); g.moveTo(pts[a][0], pts[a][1]); g.lineTo(pts[b][0], pts[b][1]); g.stroke();
    }
    g.shadowBlur = 0;
    // keypoints
    pts.forEach((p, i) => {
      g.beginPath(); g.arc(p[0], p[1], i === 0 ? 6 : 4, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? colors.acc : '#F4F1EA';
      g.shadowColor = colors.acc; g.shadowBlur = 6;
      g.fill();
    });
    g.shadowBlur = 0;
    // confidence bars
    const conf = 0.90 + Math.abs(Math.sin(t * 2.2)) * 0.092;
    confEl.textContent = `${(conf * 100).toFixed(1)}% ${target}`;
    LETTERS.forEach((L, i) => {
      const x = 16, y = h - 74 + i * 14;
      const v = L === target ? conf : Math.abs(Math.sin(t * 1.3 + i * 2.1)) * 0.34;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 26, y, 120, 7);
      g.fillStyle = L === target ? colors.acc : 'rgba(244,241,234,0.4)';
      g.fillRect(x + 26, y, 120 * v, 7);
      g.fillStyle = 'rgba(244,241,234,0.6)';
      g.font = '9px "JetBrains Mono", monospace';
      g.fillText(L, x, y + 7);
      if (L === target) {
        g.fillStyle = colors.acc;
        g.fillText(`${(v * 100).toFixed(1)}% MATCH`, x + 156, y + 7);
      }
    });
    g.fillStyle = 'rgba(244,241,234,0.5)';
    g.fillText('21-KEYPOINT SKELETON · MOVE CURSOR TO FLEX', 16, 16);
  }
  return { frame, controls, label: 'A · B · C · V · Y' };
}

// ---- 5. BIN SORTER: optical conveyor classifier -------------------------------
function createBinSorterSim(canvas, project, colors) {
  const g = canvas.getContext('2d');
  const fitter = simCtx(canvas);
  const TYPES = [
    { name: 'PLASTIC', col: '#4DA6FF' },
    { name: 'ORGANIC', col: '#3DFFA2' },
    { name: 'METAL', col: '#FFB45E' },
    { name: 'PAPER', col: '#F4F1EA' },
  ];
  const items = [];
  let spawnT = 0.6, sorted = 0, accSum = 0, accN = 0;
  const scannerX = 0.55;

  const controls = document.createElement('div');
  controls.className = 'sb-controls-row';
  controls.innerHTML = `<span class="sb-hint-inline">CLICK THE BELT TO DROP AN ITEM</span>
    <span class="sb-count">SORTED <b>0</b> · ACCURACY <i>—</i></span>`;
  const sortedEl = controls.querySelector('b');
  const accEl = controls.querySelector('i');

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0.06, scannerX);
    items.push({ x, type: Math.floor(Math.random() * 4), state: 'belt', t: 0, conf: 0.9 + Math.random() * 0.097 });
  });

  function frame(dt, t) {
    const { w, h } = fitter.fit();
    if (!w) return;
    g.clearRect(0, 0, w, h);
    const beltY = h * 0.52;
    spawnT -= dt;
    if (spawnT < 0) {
      spawnT = 2.1 + Math.random();
      if (items.length < 9) items.push({ x: 0.04, type: Math.floor(Math.random() * 4), state: 'belt', t: 0, conf: 0.9 + Math.random() * 0.097 });
    }
    // belt
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(10, beltY + 10, w - 20, 12);
    for (let x = 10; x < w - 10; x += 18) {
      const off = (t * 40) % 18;
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + off, beltY + 12, 8, 2);
    }
    // scanner gate
    const sx = scannerX * w;
    g.strokeStyle = colors.sec; g.lineWidth = 1.4;
    g.strokeRect(sx - 26, beltY - 74, 52, 78);
    g.fillStyle = hexToRgba(colors.sec, 0.06);
    g.fillRect(sx - 26, beltY - 74, 52, 78);
    g.fillStyle = colors.sec;
    g.font = '8px "JetBrains Mono", monospace';
    g.fillText('OPTIC SCAN', sx - 27, beltY - 80);
    // bins
    TYPES.forEach((T, i) => {
      const bx = w - 210 + i * 50;
      g.strokeStyle = hexToRgba(T.col, 0.8);
      g.strokeRect(bx, beltY + 44, 42, 30);
      g.fillStyle = hexToRgba(T.col, 0.9);
      g.font = '7px "JetBrains Mono", monospace';
      g.fillText(T.name.slice(0, 7), bx + 2, beltY + 42);
    });
    // items
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (it.state === 'belt') {
        it.x += dt * 0.055;
        if (it.x >= scannerX - 0.012) { it.state = 'scan'; it.t = 0; }
        drawItem(it, it.x * w, beltY - 8);
      } else if (it.state === 'scan') {
        it.t += dt;
        drawItem(it, sx, beltY - 8);
        // bounding box + label
        const T = TYPES[it.type];
        g.strokeStyle = T.col; g.lineWidth = 1.4;
        g.strokeRect(sx - 15, beltY - 26, 30, 20);
        g.fillStyle = T.col;
        g.fillText(`${T.name} ${(it.conf * 100).toFixed(1)}%`, sx - 20, beltY - 32);
        if (it.t > 0.7) {
          it.state = 'route'; it.t = 0;
          accSum += it.conf; accN++;
          accEl.textContent = `${(accSum / accN * 100).toFixed(1)}%`;
        }
      } else if (it.state === 'route') {
        it.t += dt * 1.6;
        const bx = w - 210 + it.type * 50 + 21;
        const u = Math.min(it.t, 1);
        const x0 = sx, y0 = beltY - 8;
        const x1 = bx, y1 = beltY + 44;
        const cx2 = (x0 + x1) / 2, cy2 = Math.min(y0, y1) - 60;
        const ix = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx2 + u * u * x1;
        const iy = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy2 + u * u * y1;
        drawItem(it, ix, iy, true);
        if (it.t >= 1) {
          items.splice(k, 1);
          sorted++;
          sortedEl.textContent = String(sorted);
        }
      }
    }
    g.fillStyle = 'rgba(244,241,234,0.5)';
    g.font = '9px "JetBrains Mono", monospace';
    g.fillText('CONVEYOR · CLASSIFY · ROUTE', 12, 16);
  }
  function drawItem(it, x, y, glow) {
    const T = TYPES[it.type];
    g.beginPath();
    g.rect(x - 8, y - 8, 16, 16);
    g.fillStyle = hexToRgba(T.col, glow ? 0.95 : 0.8);
    g.shadowColor = T.col; g.shadowBlur = glow ? 10 : 3;
    g.fill(); g.shadowBlur = 0;
  }
  return { frame, controls, label: 'CLICK = DROP ITEM' };
}

// ---- 6. FALLBACK: live dependency & architecture graph ------------------------
function createDepGraphSim(canvas, project, colors) {
  const g = canvas.getContext('2d');
  const fitter = simCtx(canvas);
  let nodesG = [], links = [];
  let ready = false;
  const drag = { i: -1, ox: 0, oy: 0 };

  async function init(gh) {
    const tree = await gh.loadTree(project.name);
    const dirs = tree.filter(t => t.type === 'tree' && t.path.split('/').length <= 2).slice(0, 9);
    const files = tree.filter(t => t.type !== 'tree').sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 11);
    nodesG = [];
    const dirIdx = new Map();
    dirs.forEach((d, i) => {
      dirIdx.set(d.path, nodesG.length);
      nodesG.push({ label: d.path.split('/').pop(), dir: true, x: 0.5, y: 0.24, tx: 0.12 + (i / Math.max(dirs.length - 1, 1)) * 0.76, ty: 0.16 + (i % 2) * 0.14, fixed: false });
    });
    files.forEach((f) => {
      const parent = f.path.split('/').slice(0, -1).join('/');
      const pi = dirIdx.has(parent) ? dirIdx.get(parent) : (dirIdx.set('__root', nodesG.length), nodesG.push({ label: project.name, dir: true, x: 0.5, y: 0.2, tx: 0.5, ty: 0.12, fixed: false }), dirIdx.get('__root'));
      nodesG.push({
        label: f.path.split('/').pop().slice(0, 18), dir: false,
        x: 0.2 + Math.random() * 0.6, y: 0.55 + Math.random() * 0.3,
        tx: 0, ty: 0, anchor: pi, size: f.size || 0, vx: 0, vy: 0,
      });
    });
    nodesG.forEach((n, i) => { if (!n.dir) links.push([i, n.anchor]); });
    ready = true;
  }
  init(ctxShowcase.gh);

  canvas.addEventListener('pointerdown', (e) => {
    if (!ready) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    let best = -1, bd = 0.004;
    nodesG.forEach((n, i) => {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { drag.i = best; drag.ox = nodesG[best].x - x; drag.oy = nodesG[best].y - y; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag.i < 0) return;
    const r = canvas.getBoundingClientRect();
    nodesG[drag.i].x = clamp((e.clientX - r.left) / r.width + drag.ox, 0.03, 0.97);
    nodesG[drag.i].y = clamp((e.clientY - r.top) / r.height + drag.oy, 0.05, 0.95);
    nodesG[drag.i].vx = 0; nodesG[drag.i].vy = 0;
  });
  window.addEventListener('pointerup', up);
  function up() { drag.i = -1; }

  function frame(dt, t) {
    const { w, h } = fitter.fit();
    if (!w) return;
    g.clearRect(0, 0, w, h);
    if (!ready) {
      g.fillStyle = 'rgba(244,241,234,0.55)';
      g.font = '10px "JetBrains Mono", monospace';
      g.fillText('INDEXING REPOSITORY GRAPH…', 16, 22);
      return;
    }
    // spring physics
    for (const n of nodesG) {
      if (n.dir) {
        n.x += (n.tx - n.x) * Math.min(1, dt * 3);
        n.y += (n.ty - n.y) * Math.min(1, dt * 3);
      } else {
        const a = nodesG[n.anchor];
        n.vx += (a.x - n.x) * 3.2 * dt; n.vy += (a.y - n.y) * 3.2 * dt;
        for (const m of nodesG) {
          if (m === n) continue;
          const dx = n.x - m.x, dy = n.y - m.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.012 && d2 > 1e-6) {
            const f = 0.16 * dt / d2;
            n.vx += dx * f; n.vy += dy * f;
          }
        }
        n.vx *= 0.92; n.vy *= 0.92;
        n.x = clamp(n.x + n.vx * dt, 0.03, 0.97);
        n.y = clamp(n.y + n.vy * dt, 0.06, 0.96);
      }
    }
    // links
    g.strokeStyle = hexToRgba(colors.acc, 0.35);
    g.lineWidth = 1;
    for (const [a, b] of links) {
      g.beginPath();
      g.moveTo(nodesG[a].x * w, nodesG[a].y * h);
      g.lineTo(nodesG[b].x * w, nodesG[b].y * h);
      g.stroke();
    }
    // nodes
    g.font = '8px "JetBrains Mono", monospace';
    nodesG.forEach((n) => {
      const x = n.x * w, y = n.y * h;
      if (n.dir) {
        g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2);
        g.fillStyle = colors.sec; g.shadowColor = colors.sec; g.shadowBlur = 8;
        g.fill(); g.shadowBlur = 0;
      } else {
        g.fillStyle = 'rgba(244,241,234,0.85)';
        g.fillRect(x - 4, y - 4, 8, 8);
      }
      g.fillStyle = n.dir ? colors.acc : 'rgba(244,241,234,0.55)';
      g.fillText(n.label, x + 10, y + 3);
    });
    g.fillStyle = 'rgba(244,241,234,0.5)';
    g.fillText('DRAG NODES — REAL FILE TREE SPRING GRAPH', 16, 16);
  }
  return { frame, controls: null, label: 'DRAG NODES' };
}

// ===========================================================================
// MAIN SHOWCASE — scroll engine + chapters + chrome
// ===========================================================================
export function createShowcase(ctx) {
  const { document: doc, shared, nodes, rig, quality, settings, isReducedMotion } = ctx;
  const gh = new GitHubService();
  ctxShowcase.gh = gh;

  let projects = [];
  let chapters = [];       // { project, el, track, top, height, prevP, built:{deep, sim}, sim, simKey }
  let docHeight = 1;
  let activeIdx = -2;      // -1 hero, 0..n-1 chapter, n bento
  let formationOverride = null;
  let paletteOverride = null;
  let boostPending = false;
  let laserTick = 0;

  // ---- inertial scroll state (exposed to main + shaders) --------------------
  const scroll = {
    target: 0, current: 0,
    velocity: 0,        // px — instantaneous target-current gap
    velNorm: 0,         // signed normalized -1.5..1.5
    progress: 0,        // whole-document 0..1
    chapterFloat: 0,    // damped 0=hero … n+1=bento
    chapterIndex: -1,   // -1 hero
    chapterP: 0,
  };

  // ---- toasts -----------------------------------------------------------------
  function toast(msg, { ms = 2600 } = {}) {
    const box = $('toasts');
    const t = doc.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 340); }, ms);
    return t;
  }

  // ---- boot ---------------------------------------------------------------------
  async function boot() {
    await gh.load();
    projects = gh.projects;
    buildHero();
    await buildChapters();
    buildBento();
    buildRail();
    bindChrome();
    if (gh.source === 'offline') toast('OFFLINE — MATRIX RUNNING ON CACHED DATA', { ms: 3600 });
    window.dispatchEvent(new CustomEvent('halcyon:projects-ready', { detail: { projects } }));
    measure();
    applyScrollImmediate();
  }

  function buildHero() {
    const langs = gh.languages().length;
    const stars = projects.reduce((s, p) => s + p.stars, 0);
    $('hero-stats').innerHTML = `
      <span><b>${projects.length}</b> REPOS</span>
      <span><b>${langs}</b> LANGUAGES</span>
      <span><b>${fmtNum(stars)}</b> STARS</span>
      <span>SOURCE <b>${gh.source.toUpperCase()}</b></span>`;
    splitChars($$('.hero-title h1'));
    requestAnimationFrame(() => $$('.hero-title').classList.add('in'));
  }

  // ---- chapter DOM ----------------------------------------------------------------
  async function buildChapters() {
    const root = $('chapters');
    root.textContent = '';
    const total = String(projects.length).padStart(2, '0');
    chapters = projects.map((p, i) => {
      const pal = paletteFor(p.name, p.topics);
      const formIdx = formationFor(p.name, p.topics, p.language);
      const el = doc.createElement('section');
      el.className = 'chapter';
      el.dataset.name = p.name;
      el.style.setProperty('--csec', pal.main);
      el.style.setProperty('--cacc', pal.accent);
      const cat = CATEGORIES[p.category] || CATEGORIES.Web;
      const idx = String(i + 1).padStart(2, '0');
      el.innerHTML = `
        <div class="track">
          <div class="stage">
            <div class="phase-a">
              <div class="pa-left">
                <p class="ch-kicker">NODE ${idx}/${total} <span class="k-sep">—</span> <span class="ch-cat">${cat.label}</span></p>
                <h2 class="ch-title">${esc(p.name)}</h2>
                <p class="ch-problem">${esc(p.summary || p.description || p.tagline || '')}</p>
                <div class="ch-badges">
                  <span class="chip chip-lang">${esc(p.language)}</span>
                  <span class="chip">${fmtNum(p.stars)} STARS</span>
                  <span class="chip">${fmtSize(p.size)}</span>
                  <span class="chip chip-ci">CI ${String(p.actions).toUpperCase()}</span>
                  <span class="chip chip-form">${FORMATION_LABELS[formIdx]}</span>
                </div>
              </div>
              <svg class="laser" viewBox="0 0 600 320" aria-hidden="true">
                <path class="laser-path" d="M 30 44 H 264 L 306 108 H 560"></path>
                <circle class="laser-dot" r="4"></circle>
              </svg>
            </div>
            <div class="sandbox-wrap">
              <div class="sandbox">
                <div class="sb-head"><span class="sb-dot"></span>LIVE SIMULATION — <b class="sb-label">…</b><span class="sb-hint"></span></div>
                <canvas class="sb-canvas"></canvas>
                <div class="sb-controls"></div>
              </div>
            </div>
            <div class="phase-c">
              <div class="pc-head">
                <span class="pc-title">${esc(p.name)}</span>
                <span class="pc-sub">DEEP ARCHITECTURE · REAL README · REAL FILE TREE</span>
              </div>
              <div class="pc-grid">
                <div class="pc-col">
                  <p class="pc-label">README FEATURES</p>
                  <ul class="pc-features"></ul>
                  <p class="pc-label">LANGUAGE COMPOSITION</p>
                  <div class="pc-langbar"></div>
                  <div class="pc-langlegend"></div>
                  <div class="pc-actions">
                    <button type="button" class="pc-boost"><b>BOOST</b></button>
                    <a class="pc-gh" target="_blank" rel="noopener" href="${esc(p.htmlUrl)}">GITHUB ↗</a>
                  </div>
                  <div class="pc-clone"><code>git clone ${esc(p.cloneUrl)}</code><button type="button" class="pc-copy">COPY</button></div>
                </div>
                <div class="pc-col">
                  <p class="pc-label">REPOSITORY FILE TREE</p>
                  <div class="pc-tree"><div class="pc-tree-loading">INDEXING…</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      root.appendChild(el);

      // split the chapter title into kinetic characters
      splitChars(el.querySelector('.ch-title'));

      // laser path length (for the dash animation)
      const path = el.querySelector('.laser-path');
      const len = path.getTotalLength ? path.getTotalLength() : 800;
      path.style.strokeDasharray = String(len);

      const track = el.querySelector('.track');
      const chapter = {
        project: p, el, track, laserPath: path,
        laserLen: len, laserDot: el.querySelector('.laser-dot'),
        titleEl: el.querySelector('.ch-title'),
        paLeft: el.querySelector('.pa-left'),
        sandbox: el.querySelector('.sandbox-wrap'),
        sandboxInner: el.querySelector('.sandbox'),
        sbCanvas: el.querySelector('.sb-canvas'),
        sbControls: el.querySelector('.sb-controls'),
        sbLabel: el.querySelector('.sb-label'),
        sbHint: el.querySelector('.sb-hint'),
        phaseC: el.querySelector('.phase-c'),
        featuresEl: el.querySelector('.pc-features'),
        langbarEl: el.querySelector('.pc-langbar'),
        langlegendEl: el.querySelector('.pc-langlegend'),
        treeEl: el.querySelector('.pc-tree'),
        top: 0, height: 0, prevP: 0,
        sim: null, deepBuilt: false, treeBuilt: false,
        palette: pal, formation: formIdx,
      };

      // boost + copy wiring
      el.querySelector('.pc-boost').addEventListener('click', async (e) => {
        if (boostPending) return;
        boostPending = true;
        const n = await gh.boost(p.name);
        boostPending = false;
        e.currentTarget.querySelector('b').textContent = `BOOST · ${n}`;
        toast(`⚡ BOOSTED ${p.name.toUpperCase()} — ${n}`);
      });
      el.querySelector('.pc-copy').addEventListener('click', async (e) => {
        const text = `git clone ${p.cloneUrl}`;
        try { await navigator.clipboard.writeText(text); } catch { /* private mode */ }
        e.currentTarget.textContent = 'COPIED';
        setTimeout(() => { e.currentTarget.textContent = 'COPY'; }, 1400);
      });
      return chapter;
    });
  }

  function splitChars(el) {
    if (!el) return;
    const text = el.textContent;
    el.textContent = '';
    // group animated chars into word wrappers so lines still break at spaces
    const words = text.split(' ');
    let charIdx = 0;
    words.forEach((word, wi) => {
      const w = doc.createElement('span');
      w.className = 'word';
      [...word].forEach((ch) => {
        const s = doc.createElement('span');
        s.className = 'ch';
        s.style.transitionDelay = `${Math.min(charIdx * 26, 600)}ms`;
        s.textContent = ch;
        w.appendChild(s);
        charIdx++;
      });
      el.appendChild(w);
      if (wi < words.length - 1) el.appendChild(doc.createTextNode(' '));
    });
  }

  // ---- deep panel: features + language composition + real file tree ----------
  function buildDeep(ch) {
    if (ch.deepBuilt) return;
    ch.deepBuilt = true;
    const p = ch.project;
    const feats = (p.features && p.features.length) ? p.features : ['Documentation pending — open the repository for the full specification.'];
    ch.featuresEl.innerHTML = feats.map(f => `<li>${esc(f)}</li>`).join('');
    // language composition: computed from the REAL repo file tree
    gh.loadTree(p.name).then(tree => {
      if (ch.treeBuilt || !tree.length) return;
      ch.treeBuilt = true;
      const counts = new Map();
      for (const item of tree) {
        if (item.type === 'tree') continue;
        const ext = (item.path.split('.').pop() || '').toLowerCase();
        if (!ext || ext.length > 5) continue;
        counts.set(ext, (counts.get(ext) || 0) + 1);
      }
      const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const total = entries.reduce((s, e) => s + e[1], 0) || 1;
      const cols = [ch.palette.main, ch.palette.accent, '#4DA6FF', '#C9A2FF', '#F4F1EA'];
      ch.langbarEl.innerHTML = entries.map((e, i) =>
        `<i style="width:${Math.max((e[1] / total) * 100, 3)}%;background:${cols[i % cols.length]}"></i>`).join('');
      ch.langlegendEl.innerHTML = entries.map((e, i) => {
        const lang = EXT_LANG[e[0]] || ('.' + e[0]);
        return `<span><i style="background:${cols[i % cols.length]}"></i>${esc(lang)} ${Math.round((e[1] / total) * 100)}%</span>`;
      }).join('');
      // compact real file tree
      const dirs = tree.filter(t => t.type === 'tree').sort((a, b) => a.path.localeCompare(b.path)).slice(0, 10);
      const files = tree.filter(t => t.type !== 'tree').sort((a, b) => a.path.localeCompare(b.path)).slice(0, 26);
      const row = (item) => {
        const isDir = item.type === 'tree';
        const depth = Math.min(item.path.split('/').length - 1, 3);
        return `<div class="pc-file${isDir ? ' is-dir' : ''}" style="--ind:${depth * 14}px">
          <span class="f-glyph">${isDir ? '▸' : '·'}</span>
          <span class="f-name">${esc(item.path.split('/').pop())}</span>
          <span class="f-size">${isDir ? '' : fmtSize(item.size || 0)}</span>
        </div>`;
      };
      ch.treeEl.innerHTML =
        `<div class="pc-tree-root"><b>${esc(p.name)}</b> · ${tree.length} ENTRIES · BRANCH ${esc(p.branch || 'main')}</div>` +
        dirs.map(row).join('') + files.map(row).join('') +
        (tree.length > 36 ? `<div class="pc-tree-more">… ${tree.length - 36} more in the repository</div>` : '');
    }).catch(() => {
      ch.treeEl.innerHTML = '<div class="pc-tree-loading">TREE UNAVAILABLE — OFFLINE.</div>';
    });
  }

  // ---- sandbox lifecycle -------------------------------------------------------
  function ensureSim(ch) {
    if (ch.sim) return ch.sim;
    const def = simFor(ch.project.name);
    ch.sbLabel.textContent = def.label;
    const sim = def.create(ch.sbCanvas, ch.project, { sec: ch.palette.main, acc: ch.palette.accent });
    if (sim.controls) ch.sbControls.appendChild(sim.controls);
    ch.sim = sim;
    ch.simKey = def.key;
    return sim;
  }

  // ---- bento reel ------------------------------------------------------------------
  function buildBento() {
    const grid = $('bento-grid');
    grid.textContent = '';
    projects.forEach((p, i) => {
      const pal = paletteFor(p.name, p.topics);
      const el = doc.createElement('article');
      el.className = 'bento-card';
      el.dataset.name = p.name;
      el.style.setProperty('--bc', pal.main);
      el.style.setProperty('--ba', pal.accent);
      el.setAttribute('data-cursor-label', 'JUMP TO CHAPTER ↗');
      const cat = CATEGORIES[p.category] || CATEGORIES.Web;
      el.innerHTML = `
        <div class="bento-glare"></div>
        <div class="bento-top"><span>${cat.label}</span><span>${esc(p.language)}</span></div>
        <h3 class="bento-name">${esc(p.name)}</h3>
        <p class="bento-desc">${esc(p.summary || p.description || p.tagline || '')}</p>
        <div class="bento-chips">${(p.stack || []).slice(0, 4).map(s => `<span class="bento-chip">${esc(s)}</span>`).join('')}</div>
        <div class="bento-foot"><span><b>${fmtNum(p.stars)}</b> ★ · <b>${gh.pulses[p.name] || 0}</b> ⚡</span><span>NODE ${String(i + 1).padStart(2, '0')}</span></div>`;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.bento-chip')) return;
        scrollToChapter(i);
      });
      grid.appendChild(el);
      wireTilt(el);
    });
    wireStickers();
  }

  function wireTilt(el) {
    if (isReducedMotion()) return;
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-ny * 8).toFixed(2)}deg) rotateY(${(nx * 10).toFixed(2)}deg) translateZ(0)`;
        el.style.setProperty('--gx', `${((nx + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${((ny + 0.5) * 100).toFixed(1)}%`);
      });
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
    });
  }

  // draggable throwable tech stickers (Ollivere tactility)
  function wireStickers() {
    const layer = doc.getElementById('sticker-layer');
    const section = $('bento-section');
    if (!layer || !section || isReducedMotion()) return;
    const seen = new Set();
    const terms = [];
    for (const p of projects) {
      for (const s of (p.stack || [])) {
        const k = s.toLowerCase();
        if (!seen.has(k) && terms.length < 7) { seen.add(k); terms.push(s); }
      }
    }
    terms.forEach((term, i) => {
      const el = doc.createElement('div');
      el.className = 'sticker';
      el.textContent = term;
      el.style.left = `${12 + i * 13}%`;
      el.style.top = `${8 + (i % 3) * 26}%`;
      section.appendChild(el);
      const st = { el, x: 0, y: 0, vx: 0, vy: 0, held: false, trail: [] };
      st.x = parseFloat(el.style.left); st.y = parseFloat(el.style.top);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        st.held = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-held');
        st.trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      });
      el.addEventListener('pointermove', (e) => {
        if (!st.held) return;
        const r = section.getBoundingClientRect();
        st.x = e.clientX - r.left; st.y = e.clientY - r.top;
        st.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (st.trail.length > 6) st.trail.shift();
      });
      const release = (e) => {
        if (!st.held) return;
        st.held = false;
        el.classList.remove('is-held');
        const now = performance.now();
        const old = st.trail.find(p2 => now - p2.t < 130) || st.trail[0];
        const lastP = st.trail[st.trail.length - 1] || old;
        if (old && lastP && lastP.t > old.t) {
          const dts = Math.max((lastP.t - old.t) / 1000, 0.008);
          st.vx = (lastP.x - old.x) / dts * 0.016;
          st.vy = (lastP.y - old.y) / dts * 0.016;
        }
        st.trail = [];
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      stickers.push(st);
    });
  }
  const stickers = [];

  function stickerFrame(dt) {
    const section = $('bento-section');
    if (!section || !stickers.length) return;
    const w = section.clientWidth, h = section.clientHeight;
    for (const s of stickers) {
      if (!s.held) {
        s.vy += 900 * dt * 0.016;
        s.vx *= Math.exp(-dt * 0.5);
        s.x += s.vx; s.y += s.vy;
        if (s.y > h - 40 && s.vy > 0) { s.y = h - 40; s.vy = -s.vy * 0.5; s.vx *= 0.85; }
        if (s.x < 4) { s.x = 4; s.vx = Math.abs(s.vx) * 0.6; }
        if (s.x > w - 90) { s.x = w - 90; s.vx = -Math.abs(s.vx) * 0.6; }
        if (s.y < 4) { s.y = 4; s.vy = Math.abs(s.vy) * 0.3; }
      }
      s.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${(s.vx * 2).toFixed(1)}deg)`;
    }
  }

  // ---- timeline rail -----------------------------------------------------------------
  function buildRail() {
    const rail = $('rail');
    rail.textContent = '';
    const beam = doc.createElement('div');
    beam.className = 'rail-beam';
    beam.id = 'rail-beam';
    rail.appendChild(beam);
    const mk = (label, sub, idx, fn) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'rail-node';
      b.style.setProperty('--rc', label);
      b.innerHTML = `<i></i><span class="rn-label">${esc(label)}<em>${esc(sub)}</em></span>`;
      b.setAttribute('data-cursor-label', 'WARP');
      b.addEventListener('click', fn);
      b.dataset.idx = String(idx);
      rail.appendChild(b);
      return b;
    };
    mk('CORE', 'HERO', -1, () => scrollToOffset(0));
    chapters.forEach((ch, i) => mk(ch.project.name, `NODE ${String(i + 1).padStart(2, '0')}`, i, () => scrollToChapter(i)));
    mk('MATRIX', 'BENTO DECK', chapters.length, () => scrollToOffset(docHeight - window.innerHeight - 4));
  }

  // ---- chrome (clock, sound, palette button, keys) -----------------------------------
  function bindChrome() {
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const tickClock = () => {
      const d = new Date();
      const p2 = (x) => String(x).padStart(2, '0');
      const t = $('clock-time');
      const dEl = $('clock-date');
      if (t) t.textContent = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
      if (dEl) dEl.textContent = `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
    tickClock();
    setInterval(tickClock, 1000);

    $('palette-btn').addEventListener('click', () => openPalette());
    $('tun-close').addEventListener('click', () => closeTuner());
    $('sound-btn').addEventListener('click', () => toggleSound());
    if (settings.sound) $('sound-btn').classList.add('is-on');
    wirePalette();
    wireTuner();

    window.addEventListener('keydown', (e) => {
      const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        paletteOpen ? closePalette() : openPalette();
      } else if (e.key === '`' && !inField) {
        e.preventDefault();
        paletteOpen ? closePalette() : openPalette();
      } else if (e.key === 'Escape') {
        if (paletteOpen) closePalette();
        closeTuner();
      } else if (!inField && /^[1-9]$/.test(e.key)) {
        const i = +e.key - 1;
        if (i < chapters.length) scrollToChapter(i);
      } else if (!inField && e.key === '0') {
        scrollToOffset(0);
      }
    });
  }

  // ---- command palette ------------------------------------------------------------------
  let paletteOpen = false;
  let palItems = [];
  let palSel = 0;

  function openPalette() {
    paletteOpen = true;
    $('palette').classList.add('is-open');
    $('palette').setAttribute('aria-hidden', 'false');
    $('palette-input').value = '';
    buildPalette('');
    setTimeout(() => $('palette-input').focus(), 40);
  }
  function closePalette() {
    paletteOpen = false;
    $('palette').classList.remove('is-open');
    $('palette').setAttribute('aria-hidden', 'true');
  }

  const PAL_COMMANDS = [
    { name: 'tuner', desc: 'Open the Shader & Physics Tuner', run: () => openTuner() },
    { name: 'sound', desc: 'Toggle the reactive sound design', run: () => toggleSound() },
    { name: 'orbit', desc: 'Free-orbit the camera (drag + wheel)', run: () => {
      const on = rig.setOrbit(!rig.isOrbit());
      toast(on ? 'FREE ORBIT — DRAG · WHEEL ZOOMS' : 'SCROLL CHOREOGRAPHY RESTORED');
    } },
    { name: 'top', desc: 'Return to the hero vista', run: () => scrollToOffset(0) },
    { name: 'quality auto', desc: 'Adaptive tier governor', run: () => setQuality('auto') },
    { name: 'quality potato', desc: 'Survival profile', run: () => setQuality('potato') },
    { name: 'quality low', desc: 'Fixed low tier', run: () => setQuality('low') },
    { name: 'quality medium', desc: 'Fixed medium tier', run: () => setQuality('medium') },
    { name: 'quality high', desc: 'Fixed high tier', run: () => setQuality('high') },
  ];
  function setQuality(q) {
    quality.setMode(q);
    toast(`QUALITY → ${q.toUpperCase()}`);
  }

  function fuzzy(hay, needle) {
    hay = hay.toLowerCase(); needle = needle.toLowerCase();
    let hi = 0;
    for (const ch of needle) {
      const idx = hay.indexOf(ch, hi);
      if (idx === -1) return false;
      hi = idx + 1;
    }
    return true;
  }

  function buildPalette(query) {
    palItems = [];
    let html = '';
    const cmdMode = query.startsWith('>');
    const q = (cmdMode ? query.slice(1) : query).trim().toLowerCase();
    if (!cmdMode) {
      const nodes2 = chapters.filter(ch => {
        const p = ch.project;
        const hay = `${p.name} ${p.description} ${p.language} ${(p.stack || []).join(' ')}`.toLowerCase();
        return !q || hay.includes(q) || fuzzy(p.name, q);
      });
      if (nodes2.length) html += '<div class="pal-group">CHAPTERS</div>';
      nodes2.forEach(ch => {
        const i = chapters.indexOf(ch);
        palItems.push({ kind: 'chapter', label: ch.project.name, i });
        html += `<button class="pal-item" data-i="${palItems.length - 1}" type="button">
          <span class="pal-idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="pal-name">${esc(ch.project.name)}</span>
          <span class="pal-desc">${esc(ch.project.language)} · ${esc(ch.project.category || '')}</span>
          <span class="pal-hint">WARP</span></button>`;
      });
    }
    const cmds = PAL_COMMANDS.filter(c => !q || c.name.includes(q));
    if (cmds.length) {
      html += `<div class="pal-group">COMMANDS${cmdMode ? '' : ' — TYPE &gt; TO SKIP CHAPTERS'}</div>`;
      cmds.forEach(c => {
        palItems.push({ kind: 'cmd', run: c.run });
        html += `<button class="pal-item" data-i="${palItems.length - 1}" type="button">
          <span class="pal-idx">›</span>
          <span class="pal-name">${esc(c.name)}</span>
          <span class="pal-desc">${esc(c.desc)}</span>
          <span class="pal-hint">RUN</span></button>`;
      });
    }
    if (!palItems.length) html = `<div class="pal-empty">NOTHING MATCHES “${esc(query)}”</div>`;
    $('palette-results').innerHTML = html;
    palSel = 0;
    syncPalSel();
  }
  function syncPalSel() {
    $('palette-results').querySelectorAll('.pal-item').forEach(el =>
      el.classList.toggle('is-sel', +el.dataset.i === palSel));
    const sel = $('palette-results').querySelector('.pal-item.is-sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function runPalItem(i) {
    const item = palItems[i];
    if (!item) return;
    closePalette();
    if (item.kind === 'chapter') scrollToChapter(item.i);
    else if (item.run) item.run();
  }
  function wirePalette() {
    const input = $('palette-input');
    input.addEventListener('input', () => buildPalette(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, palItems.length - 1); syncPalSel(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); syncPalSel(); e.preventDefault(); }
      else if (e.key === 'Enter') { runPalItem(palSel); e.preventDefault(); }
    });
    $('palette-results').addEventListener('click', (e) => {
      const it = e.target.closest('.pal-item');
      if (it) runPalItem(+it.dataset.i);
    });
    $('palette').addEventListener('click', (e) => { if (e.target === $('palette')) closePalette(); });
  }

  // ---- shader & physics tuner drawer -------------------------------------------------------
  let tunerOpen = false;
  function openTuner() {
    tunerOpen = true;
    $('tuner').classList.add('is-open');
    $('tuner').setAttribute('aria-hidden', 'false');
    toast('SHADER & PHYSICS TUNER — LIVE UNIFORMS');
  }
  function closeTuner() {
    tunerOpen = false;
    $('tuner').classList.remove('is-open');
    $('tuner').setAttribute('aria-hidden', 'true');
  }
  function wireTuner() {
    const turb = $('tun-turb'), speed = $('tun-speed'), size = $('tun-size');
    const form = $('tun-formation'), palSel2 = $('tun-palette');
    turb.value = String(settings.turbulence ?? 1);
    speed.value = String(settings.waveSpeed ?? 1);
    nodes.setTurbulence(parseFloat(turb.value));
    shared.uWaveSpeed.value = parseFloat(speed.value);
    turb.addEventListener('input', () => {
      nodes.setTurbulence(parseFloat(turb.value));
      settings.turbulence = parseFloat(turb.value);
      window.dispatchEvent(new CustomEvent('halcyon:settings-change'));
    });
    speed.addEventListener('input', () => {
      shared.uWaveSpeed.value = parseFloat(speed.value);
      settings.waveSpeed = parseFloat(speed.value);
      window.dispatchEvent(new CustomEvent('halcyon:settings-change'));
    });
    size.addEventListener('input', () => {
      shared.uParticleSize.value = parseFloat(size.value);
    });
    form.addEventListener('change', () => {
      formationOverride = form.value === 'auto' ? null : parseInt(form.value, 10);
    });
    palSel2.addEventListener('change', () => {
      paletteOverride = palSel2.value === 'auto' ? null : (PALETTES[palSel2.value] || null);
    });
  }

  function toggleSound() {
    const btn = $('sound-btn');
    const on = !btn.classList.contains('is-on');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    if (ctx.audio) ctx.audio.setEnabled(on);
    settings.sound = on;
    window.dispatchEvent(new CustomEvent('halcyon:settings-change'));
    toast(on ? 'SOUND DESIGN — ONLINE' : 'SOUND DESIGN — MUTED');
  }

  // ---- navigation ----------------------------------------------------------------------------
  let navTween = null; // setTimeout handle — survives occluded/suspended rAF
  function scrollToOffset(y) {
    const to = clamp(y, 0, docHeight - window.innerHeight);
    const from = window.scrollY;
    if (Math.abs(to - from) < 2) return;
    rig.whipPan(0.6);
    if (isReducedMotion()) { window.scrollTo(0, to); return; }
    if (navTween) clearTimeout(navTween);
    const dur = clamp(500 + Math.abs(to - from) * 0.18, 600, 1500);
    const t0 = performance.now();
    const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const step = () => {
      const u = clamp((performance.now() - t0) / dur, 0, 1);
      window.scrollTo(0, from + (to - from) * ease(u));
      navTween = u < 1 ? setTimeout(step, 16) : null;
    };
    navTween = setTimeout(step, 16);
  }
  function scrollToChapter(i) {
    const ch = chapters[i];
    if (!ch) return;
    scrollToOffset(ch.top + 4);
  }

  // ---- measurement ------------------------------------------------------------------------------
  function measure() {
    docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight + 1);
    for (const ch of chapters) {
      ch.top = ch.track.offsetTop;
      ch.height = ch.track.offsetHeight;
    }
  }
  function applyScrollImmediate() {
    scroll.target = window.scrollY;
    scroll.current = scroll.target;
  }

  // ---- per-frame engine ---------------------------------------------------------------------------

  let lastDomWrite = 0;
  let laserFrame = 0;

  function frame(dt, now) {
    // ---- inertial scroll proxy -------------------------------------------------
    scroll.target = window.scrollY || 0;
    const k = 1 - Math.pow(1 - SCROLL.DAMP, dt * 60);
    scroll.current += (scroll.target - scroll.current) * k;
    scroll.velocity = scroll.target - scroll.current;
    const vn = clamp(scroll.velocity / SCROLL.VELOCITY_NORM, -1.5, 1.5);
    scroll.velNorm += (vn - scroll.velNorm) * Math.min(1, dt * 10);
    scroll.progress = clamp(scroll.current / Math.max(docHeight - window.innerHeight, 1), 0, 1);

    // ---- active chapter ----------------------------------------------------------
    const vh = window.innerHeight;
    let idx = -1; // -1 = hero
    let p = 0;
    if (chapters.length) {
      const first = chapters[0];
      const last = chapters[chapters.length - 1];
      if (scroll.current < first.top - vh * 0.35) {
        idx = -1;
      } else if (scroll.current > last.top + last.height - vh * 0.5) {
        idx = chapters.length; // bento
      } else {
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          p = (scroll.current - ch.top) / Math.max(ch.height - vh, 1);
          if (p >= -0.15 && p < 1.0) { idx = i; break; }
        }
        if (idx === -1) { idx = chapters.length - 1; p = 1; }
        p = clamp(p, 0, 1);
      }
    } else {
      idx = -1;
    }
    if (idx !== activeIdx) {
      // chapter change: swell + particle pulse + status chip
      if (activeIdx !== -2 && ctx.audio) ctx.audio.swell();
      if (nodes && idx >= 0 && idx < chapters.length) nodes.pulse(0.8);
      activeIdx = idx;
      updateStatusChip();
    }

    const chFloatTarget = idx + 1; // hero(-1)→0, chapter i→i+1, bento(n)→n+1
    scroll.chapterFloat += (chFloatTarget - scroll.chapterFloat) * Math.min(1, dt * 2.4);
    scroll.chapterIndex = idx;
    scroll.chapterP = idx >= 0 && idx < chapters.length ? p : 0;

    // ---- palette + formation targets ---------------------------------------------
    let pal;
    let formT;
    if (paletteOverride) {
      pal = paletteOverride;
      formT = formationOverride ?? (idx >= 0 && idx < chapters.length ? chapters[idx].formation : FORMATIONS.HERO);
    } else if (idx >= 0 && idx < chapters.length) {
      pal = chapters[idx].palette;
      formT = formationOverride ?? chapters[idx].formation;
    } else {
      pal = PALETTES.hero;
      formT = formationOverride ?? FORMATIONS.HERO;
    }
    dampColor(shared.uColorPrimary.value, pal.bg, dt);
    dampColor(shared.uColorSecondary.value, pal.main, dt);
    dampColor(shared.uColorAccent.value, pal.accent, dt);
    if (nodes) nodes.setFormation(formT);

    // ---- UI accent variables --------------------------------------------------------
    const root = doc.documentElement;
    root.style.setProperty('--accent', pal.main);
    root.style.setProperty('--accent-2', pal.accent);
    root.style.setProperty('--ink-bg', pal.bg);
    root.style.setProperty('--accent-soft', hexToRgba(pal.main, 0.14));

    // ---- velocity skew -----------------------------------------------------------------
    const skew = clamp(scroll.velocity * SCROLL.SKEW_FACTOR * 0.06, -SCROLL.SKEW_MAX, SCROLL.SKEW_MAX);
    root.style.setProperty('--scroll-skew', `${skew.toFixed(3)}deg`);
    root.style.setProperty('--scroll-prog', scroll.progress.toFixed(4));

    // ---- chapter choreography (only the active chapter gets per-frame writes) --------
    const quiet = Math.abs(scroll.velocity) < 0.08 && !paletteOverride && !formationOverride;
    if (!quiet || now - lastDomWrite > 500) {
      lastDomWrite = now;
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const isActive = i === idx;
        let cp = isActive ? p : clamp((scroll.current - ch.top) / Math.max(ch.height - vh, 1), 0, 1);
        choreograph(ch, cp, isActive, dt);
        // phase marker ticks (0.35 / 0.70)
        if (isActive) {
          if (ch.prevP < 0.35 && cp >= 0.35 && ctx.audio) ctx.audio.tick(1700);
          if (ch.prevP < 0.70 && cp >= 0.70 && ctx.audio) ctx.audio.tick(1150);
        }
        ch.prevP = cp;
      }
      // rail progress + active node
      const beam = $('rail-beam');
      if (beam) beam.style.height = `${(scroll.progress * 100).toFixed(2)}%`;
      const railNodes = $('rail').querySelectorAll('.rail-node');
      railNodes.forEach((n, i) => {
        n.classList.toggle('is-active', i === idx + 1);
      });
    }

    // ---- active simulation ------------------------------------------------------------
    const simCh = (idx >= 0 && idx < chapters.length && p > 0.34 && p < 0.78) ? chapters[idx] : null;
    if (simCh) {
      const sim = ensureSim(simCh);
      sim.frame(dt, now / 1000);
    }

    // ---- stickers ----------------------------------------------------------------------
    if (stickers.length) stickerFrame(dt);
  }

  function choreograph(ch, p, isActive) {
    // Phase A: kinetic title
    const aOn = p > 0.02;
    ch.paLeft.classList.toggle('in', aOn);
    ch.titleEl.classList.toggle('in', aOn);
    // laser trace
    const pa = clamp(p / 0.35, 0, 1);
    ch.laserPath.style.strokeDashoffset = String(ch.laserLen * (1 - pa));
    if (isActive && ++laserFrame % 3 === 0 && ch.laserPath.getPointAtLength) {
      const pt = ch.laserPath.getPointAtLength(ch.laserLen * pa);
      ch.laserDot.setAttribute('cx', pt.x.toFixed(1));
      ch.laserDot.setAttribute('cy', pt.y.toFixed(1));
      ch.laserDot.style.opacity = pa > 0.01 && pa < 0.999 ? '1' : '0';
    }

    // Phase B: sandbox unfold
    const b = smooth(0.35, 0.52, p);
    const wrap = ch.sandbox;
    if (b > 0.001 && b < 0.999) {
      wrap.style.opacity = b.toFixed(3);
      wrap.style.transform = `perspective(1200px) rotateY(${((1 - b) * 62).toFixed(2)}deg) scale(${(0.9 + b * 0.1).toFixed(3)})`;
      wrap.style.pointerEvents = b > 0.6 ? 'auto' : 'none';
    } else {
      wrap.style.opacity = b >= 0.999 ? '1' : '0';
      wrap.style.transform = b >= 0.999 ? 'perspective(1200px) rotateY(0deg) scale(1)' : 'perspective(1200px) rotateY(62deg) scale(0.9)';
      wrap.style.pointerEvents = b >= 0.999 && p < 0.74 ? 'auto' : 'none';
    }

    // Phase C: deep architecture sheet
    const c = smooth(0.68, 0.84, p);
    const pc = ch.phaseC;
    if (c > 0.001) buildDeep(ch);
    pc.style.opacity = c.toFixed(3);
    pc.style.transform = `translate3d(0, ${((1 - c) * 48).toFixed(1)}px, 0)`;
    pc.style.pointerEvents = c > 0.5 ? 'auto' : 'none';
    // sandbox recedes behind the deep sheet
    const dim = 1 - smooth(0.68, 0.84, p) * 0.55;
    ch.sandboxInner.style.filter = c > 0.01 ? `brightness(${(0.45 + dim * 0.55).toFixed(2)})` : '';
  }

  function updateStatusChip() {
    const el = $('status-node');
    if (!el) return;
    const total = String(chapters.length).padStart(2, '0');
    if (activeIdx < 0) el.textContent = `—/${total}`;
    else if (activeIdx >= chapters.length) el.textContent = `MTX/${total}`;
    else el.textContent = `${String(activeIdx + 1).padStart(2, '0')}/${total}`;
  }

  // ---- color damping helper -----------------------------------------------------------
  const tmpTarget = { r: 0, g: 0, b: 0 };
  function dampColor(color, hexOrCss, dt) {
    parseColor(hexOrCss, tmpTarget);
    const k = Math.min(1, dt * 2.1);
    color.r += (tmpTarget.r - color.r) * k;
    color.g += (tmpTarget.g - color.g) * k;
    color.b += (tmpTarget.b - color.b) * k;
  }
  const styleProbe = doc.createElement('div');
  function parseColor(css, out) {
    styleProbe.style.color = css;
    const m = doc.defaultView.getComputedStyle(styleProbe).color.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      out.r = +m[0] / 255; out.g = +m[1] / 255; out.b = +m[2] / 255;
    }
  }

  // ---- public API -------------------------------------------------------------------------
  boot();

  const api = {
    scroll,
    frame,
    measure,
    toast,
    scrollToChapter,
    scrollToOffset,
    openPalette,
    closeTuner,
    toggleSound,
    simActive: () => chapters.some((ch, i) => i === activeIdx && scroll.chapterP > 0.34 && scroll.chapterP < 0.78),
    get ready() { return projects.length > 0; },
    get focused() {
      return activeIdx >= 0 && activeIdx < chapters.length ? chapters[activeIdx].project : null;
    },
  };
  return api;
}

// module-level handle so the fallback sim can reach the service instance
const ctxShowcase = { gh: null };
