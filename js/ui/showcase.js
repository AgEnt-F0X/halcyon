// The editorial system UI: left telemetry panel, right interactive tech deck
// (Architecture / Live README / Files), bottom command dock (node rail,
// system clock, Ctrl+K palette). Selecting a node — by chip, pin, palette,
// arrow key or dock button — dispatches `halcyon:project-select` and main.js
// teleports the camera to that rack in the matrix.

import { CATEGORIES, IDENTITY } from '../config.js';
import { GitHubService, renderMarkdown } from '../github-service.js';

const $ = (id) => document.getElementById(id);

function hexToRgba(hex, a) {
  const h = String(hex || '#4DA6FF').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); }
function fmtSize(kb) {
  if (!kb) return '—';
  return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
}
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// signal-chain template per category: three architectural stages
const SIGNAL_CHAINS = {
  'AI/ML': [
    ['SENSORS / DATA', 'ingestion · datasets · pre-processing'],
    ['MODEL INFERENCE', 'the trained network deciding in real time'],
    ['DECISION OUTPUT', 'labels · actions · operator readout'],
  ],
  'Web': [
    ['CLIENT SURFACE', 'the interface people touch'],
    ['SERVICE LOGIC', 'state · APIs · business rules'],
    ['PERSISTENCE', 'storage · sync · history'],
  ],
  'Systems': [
    ['TELEMETRY IN', 'live signals · timing · capture'],
    ['CORE ENGINE', 'algorithms · the heavy lifting'],
    ['ANALYSIS OUT', 'visualisation · decisions · exports'],
  ],
  'Creative': [
    ['INPUT EVENTS', 'gestures · pointers · sound'],
    ['GENERATIVE CORE', 'systems painting with math'],
    ['RENDER', 'canvas · pixels on screen'],
  ],
};

export function createShowcase(ctx) {
  const { document: doc, quality, isReducedMotion } = ctx;
  const gh = new GitHubService();

  let projects = [];
  let focused = null;
  let focusIndex = -1;
  let boostPending = false;
  let readmeCache = new Map();   // name -> rendered html
  let treeLoaded = new Set();    // names whose tree rendered

  // ------------------------------------------------------------------ accent
  function setAccent(hex) {
    doc.documentElement.style.setProperty('--accent', hex);
    doc.documentElement.style.setProperty('--accent-soft', hexToRgba(hex, 0.14));
  }

  // ------------------------------------------------------------------ toasts
  function toast(msg, { ms = 2600 } = {}) {
    const box = $('toasts');
    const t = doc.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 340); }, ms);
    return t;
  }

  // ------------------------------------------------------------------ panels
  function renderTelemetry(p, index) {
    setAccent(p.accent);
    const total = String(projects.length).padStart(2, '0');
    $('tele-index').textContent = `NODE ${String(index + 1).padStart(2, '0')}/${total}`;
    $('status-node').textContent = `${String(index + 1).padStart(2, '0')}/${total}`;
    $('tele-category').textContent = (CATEGORIES[p.category] || CATEGORIES.Web).label;
    $('tele-name').textContent = p.name;
    $('tele-tagline').textContent = p.description || p.tagline || '';
    $('tele-summary').textContent = p.summary || p.description || 'No summary published for this repository.';
    $('tele-src').textContent = p.hasReadme ? '· README' : '· API';
    $('tele-features').innerHTML = (p.features && p.features.length)
      ? p.features.map(f => `<li>${esc(f)}</li>`).join('')
      : '<li>Documentation pending — inspect the LIVE README and FILES tabs.</li>';

    const boosted = gh.pulses[p.name] || 0;
    $('tele-stats').innerHTML = `
      <div class="stat"><b>${esc(p.language)}</b><span>LANGUAGE</span></div>
      <div class="stat"><b>${fmtNum(p.stars)}</b><span>STARS</span></div>
      <div class="stat"><b>${fmtSize(p.size)}</b><span>SIZE</span></div>
      <div class="stat"><b>${fmtDate(p.updatedAt)}</b><span>PUSHED</span></div>`;
    $('tele-clone').textContent = `git clone ${p.cloneUrl}`;
    $('tele-boost-count').textContent = boosted ? `BOOST · ${boosted}` : 'BOOST';
    $('tele-open').href = p.htmlUrl;
  }

  function archHTML(p) {
    const chain = SIGNAL_CHAINS[p.category] || SIGNAL_CHAINS.Web;
    const chainRows = chain.map(([name, desc], i) => `
      <div class="arch-node-row">
        <span class="arch-node-name">${name}</span>
        <span class="arch-node-desc">${desc}</span>
      </div>`).join('');
    const featureRows = (p.features && p.features.length)
      ? p.features.map((f, i) => `
          <div class="arch-node-row">
            <span class="arch-node-name">${String(i + 1).padStart(2, '0')}</span>
            <span class="arch-node-desc">${esc(f)}</span>
          </div>`).join('')
      : '<div class="arch-node-row"><span class="arch-node-desc">No feature list in the README — check the FILES tab.</span></div>';
    const stack = (p.stack && p.stack.length ? p.stack : p.topics.slice(0, 4));
    return `
      <div class="arch-section">
        <p class="arch-label">SIGNAL CHAIN — ${(CATEGORIES[p.category] || CATEGORIES.Web).label}</p>
        <div class="arch-nodes">${chainRows}</div>
      </div>
      <div class="arch-section">
        <p class="arch-label">CAPABILITY NODES</p>
        <div class="arch-nodes">${featureRows}</div>
      </div>
      <div class="arch-section">
        <p class="arch-label">STACK</p>
        <div class="stack-chips">${stack.map(s => `<span class="stack-chip">${esc(s)}</span>`).join('')}</div>
      </div>
      <div class="arch-section">
        <p class="arch-label">TELEMETRY</p>
        <div class="arch-metrics">
          <div class="metric"><b>${fmtNum(p.stars)}</b><span>STARS</span></div>
          <div class="metric"><b>${fmtNum(p.forks)}</b><span>FORKS</span></div>
          <div class="metric"><b>${fmtSize(p.size)}</b><span>REPO SIZE</span></div>
          <div class="metric"><b class="badge ${p.actions}">${String(p.actions).toUpperCase()}</b><span>CI STATUS</span></div>
        </div>
      </div>`;
  }

  function renderDeck(p) {
    $('panel-arch').innerHTML = archHTML(p);
    if (!readmeCache.has(p.name)) readmeCache.set(p.name, renderMarkdown(p.readmeRaw));
    $('readme-body').innerHTML = readmeCache.get(p.name);
    if (!treeLoaded.has(p.name)) {
      treeLoaded.add(p.name);
      renderTreeLoading();
      loadTreeInto(p);
    }
    $('deck-foot').innerHTML = `
      <span>SRC <b>${gh.source.toUpperCase()}</b></span>
      <span>BRANCH <b>${esc(p.branch)}</b></span>
      <span>${p.fullName}</span>`;
  }

  // ---- files tab -----------------------------------------------------------
  function renderTreeLoading() {
    $('file-tree').innerHTML = '<div class="fv-loading">INDEXING REPOSITORY TREE…</div>';
    $('file-view').hidden = true;
  }

  async function loadTreeInto(p) {
    const tree = await gh.loadTree(p.name);
    if (focused && focused.name !== p.name) return; // user moved on
    const box = $('file-tree');
    if (!tree.length) {
      box.innerHTML = '<div class="fv-loading">TREE UNAVAILABLE — OFFLINE OR EMPTY REPO.</div>';
      return;
    }
    const dirs = tree.filter(t => t.type === 'tree').sort((a, b) => a.path.localeCompare(b.path));
    const files = tree.filter(t => t.type !== 'tree').sort((a, b) => a.path.localeCompare(b.path));
    const rows = [];
    rows.push(`<div class="file-root">REPOSITORY ROOT — <b>${esc(p.name)}</b> · ${tree.length} ENTRIES</div>`);
    for (const d of dirs) {
      rows.push(fileRowHTML(d, p));
    }
    for (const f of files) {
      rows.push(fileRowHTML(f, p));
    }
    const CAP = 420;
    box.innerHTML = rows.slice(0, CAP).join('') +
      (rows.length > CAP ? `<div class="fv-loading">… ${rows.length - CAP} MORE ENTRIES</div>` : '');
  }

  function fileRowHTML(item, p) {
    const isDir = item.type === 'tree';
    const depth = item.path.split('/').length - 1;
    const name = item.path.split('/').pop();
    const glyph = isDir ? '▸' : '·';
    const size = isDir ? '' : fmtSize(item.size || 0);
    return `<button class="file-row${isDir ? ' is-dir' : ''}" type="button" data-path="${esc(item.path)}" data-dir="${isDir ? 1 : 0}">
      <span class="f-glyph">${glyph}</span>
      <span class="f-name" style="--indent:${depth * 12}px">${esc(name)}</span>
      <span class="f-size">${size}</span>
    </button>`;
  }

  async function openFile(p, path) {
    const view = $('file-view');
    const code = $('fv-code');
    view.hidden = false;
    $('fv-path').textContent = path;
    $('fv-size').textContent = '';
    code.innerHTML = '<span class="fv-loading">STREAMING FILE…</span>';
    code.classList.add('fv-loading');
    const data = await gh.loadFile(p.name, path);
    if (focused && focused.name !== p.name) return;
    code.classList.remove('fv-loading');
    if (data.content == null) {
      code.textContent = `// unable to load ${path}\n// ${data.error || 'unknown error'}`;
      $('fv-size').textContent = 'ERROR';
      return;
    }
    $('fv-size').textContent = data.truncated ? 'TRUNCATED' : fmtSize(Math.ceil(data.content.length / 1024));
    code.textContent = data.content;
    code.scrollTop = 0;
  }

  // delegated events for the files tab
  $('panel-files').addEventListener('click', (e) => {
    if (e.target.closest('#fv-close')) { $('file-view').hidden = true; return; }
    const row = e.target.closest('.file-row');
    if (!row || row.dataset.dir === '1') return;
    if (!focused) return;
    box_selectFileRow(row);
    openFile(focused, row.dataset.path);
  });
  function box_selectFileRow(row) {
    $('file-tree').querySelectorAll('.file-row').forEach(r => r.classList.toggle('is-active', r === row));
  }

  // ------------------------------------------------------------------ focus
  function focusProject(p, { fly = true, index = null } = {}) {
    if (!p) return;
    const idx = index !== null ? index : gh.projects.findIndex(x => x.name === p.name);
    if (idx < 0) return;
    focused = p;
    focusIndex = idx;
    renderTelemetry(p, idx);
    renderDeck(p);
    // rail chips
    doc.querySelectorAll('.rail-chip').forEach(c =>
      c.classList.toggle('is-active', c.dataset.name === p.name));
    const chip = doc.querySelector(`.rail-chip[data-name="${CSS.escape(p.name)}"]`);
    if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (fly) {
      window.dispatchEvent(new CustomEvent('halcyon:project-select', {
        detail: { project: p, index: idx },
      }));
    }
  }

  function stepNode(delta) {
    if (!projects.length) return;
    const next = (focusIndex + delta + projects.length) % projects.length;
    focusProject(projects[next], { fly: true, index: next });
  }

  // ------------------------------------------------------------------ dock
  function buildRail() {
    const rail = $('node-rail');
    rail.textContent = '';
    projects.forEach((p, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'rail-chip';
      b.dataset.name = p.name;
      b.style.setProperty('--pc', p.accent);
      b.setAttribute('data-magnetic', '');
      b.setAttribute('data-cursor-label', 'TELEPORT');
      b.innerHTML = `${String(i + 1).padStart(2, '0')}<span>${esc(p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name)}</span>`;
      b.addEventListener('click', () => focusProject(p, { fly: true, index: i }));
      rail.appendChild(b);
    });
  }

  $('dock-prev').addEventListener('click', () => stepNode(-1));
  $('dock-next').addEventListener('click', () => stepNode(1));

  // ---- system clock (real time — the matrix runs on the operator's clock) --
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function tickClock() {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    $('clock-time').textContent = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    $('clock-date').textContent = `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  setInterval(tickClock, 1000);
  tickClock();

  // ------------------------------------------------------------------ boost
  async function boostProject(p, btn) {
    if (boostPending) return;
    boostPending = true;
    const n = await gh.boost(p.name);
    boostPending = false;
    $('tele-boost-count').textContent = `BOOST · ${n}`;
    if (btn) {
      btn.classList.add('is-pulsing');
      setTimeout(() => btn.classList.remove('is-pulsing'), 600);
    }
    toast(`⚡ BOOSTED ${p.name.toUpperCase()} — ${n}`);
  }
  $('tele-boost').addEventListener('click', () => { if (focused) boostProject(focused, $('tele-boost')); });

  $('tele-copy').addEventListener('click', async () => {
    const text = $('tele-clone').textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = doc.createElement('textarea');
      ta.value = text; doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); } catch { }
      ta.remove();
    }
    const b = $('tele-copy');
    b.textContent = 'COPIED';
    b.classList.add('done');
    setTimeout(() => { b.textContent = 'COPY'; b.classList.remove('done'); }, 1400);
  });

  // ------------------------------------------------------------------ tabs
  const tabs = [...doc.querySelectorAll('.deck-tab')];
  tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  function setTab(tab) {
    tabs.forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    doc.querySelectorAll('.deck-panel').forEach(p =>
      p.classList.toggle('is-on', p.dataset.panel === tab));
  }

  // ------------------------------------------------------------------ palette
  const palette = $('palette');
  const palInput = $('palette-input');
  const palResults = $('palette-results');
  const pal = { open: false, items: [], sel: 0 };

  const COMMANDS = [
    { name: 'orbit', desc: 'Free-orbit around the architectural core', run: () => window.dispatchEvent(new CustomEvent('halcyon:orbit-toggle')) },
    { name: 'zen', desc: 'Dissolve the interface — matrix only', run: () => window.dispatchEvent(new CustomEvent('halcyon:zen-toggle')) },
    { name: 'scan', desc: 'Fire a scan pulse across the whole grid', run: () => window.dispatchEvent(new CustomEvent('halcyon:scan-all')) },
    { name: 'quality auto', desc: 'Adaptive tier + dynamic resolution', run: () => setQuality('auto') },
    { name: 'quality potato', desc: 'Survival mode — minimal everything', run: () => setQuality('potato') },
    { name: 'quality low', desc: 'Fixed low tier', run: () => setQuality('low') },
    { name: 'quality medium', desc: 'Fixed medium tier', run: () => setQuality('medium') },
    { name: 'quality high', desc: 'Fixed high tier', run: () => setQuality('high') },
  ];
  function setQuality(q) {
    quality.setMode(q);
    toast(`QUALITY → ${q.toUpperCase()}`);
  }

  function openPalette() {
    pal.open = true;
    palette.classList.add('is-open');
    palette.setAttribute('aria-hidden', 'false');
    palInput.value = '';
    buildPalette('');
    setTimeout(() => palInput.focus(), 40);
  }
  function closePalette() {
    pal.open = false;
    palette.classList.remove('is-open');
    palette.setAttribute('aria-hidden', 'true');
  }
  function togglePalette() { pal.open ? closePalette() : openPalette(); }
  $('palette-btn').addEventListener('click', openPalette);

  function buildPalette(query) {
    pal.items = [];
    let html = '';
    const cmdMode = query.startsWith('>');
    const q = (cmdMode ? query.slice(1) : query).trim();

    if (cmdMode) {
      const cmds = COMMANDS.filter(c => c.name.includes(q.toLowerCase()));
      if (cmds.length) html += '<div class="pal-group">COMMANDS</div>';
      cmds.forEach(c => {
        pal.items.push({ kind: 'cmd', label: c.name, hint: 'RUN', run: c.run });
        html += palItemHTML(c.name, c.desc, 'RUN', pal.items.length - 1);
      });
      if (!cmds.length) html += `<div class="pal-empty">NO COMMAND MATCHING “${esc(q)}”</div>`;
    } else {
      if (projects.length) html += '<div class="pal-group">MATRIX NODES</div>';
      projects.forEach((p, i) => {
        const hay = `${p.name} ${p.description} ${p.language} ${p.stack.join(' ')}`.toLowerCase();
        if (q && !hay.includes(q.toLowerCase()) && !fuzzy(p.name, q)) return;
        pal.items.push({ kind: 'node', label: p.name, project: p, index: i });
        html += palItemHTML(p.name, `${p.category} · ${p.language}`, 'TELEPORT', pal.items.length - 1);
      });
      const cmds = COMMANDS.filter(c => q && c.name.includes(q.toLowerCase()));
      if (cmds.length) {
        html += '<div class="pal-group">COMMANDS — TYPE &gt; TO SKIP NODES</div>';
        cmds.forEach(c => {
          pal.items.push({ kind: 'cmd', label: c.name, hint: 'RUN', run: c.run });
          html += palItemHTML(c.name, c.desc, 'RUN', pal.items.length - 1);
        });
      }
      if (!pal.items.length) html += `<div class="pal-empty">NOTHING IN THE MATRIX MATCHES “${esc(q)}”</div>`;
    }
    palResults.innerHTML = html;
    pal.sel = 0;
    syncPaletteSel();
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
  function palItemHTML(name, desc, hint, i) {
    return `<button class="pal-item" type="button" data-i="${i}">
      <span class="pal-idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="pal-name">${esc(name)}</span>
      <span class="pal-desc">${esc(desc)}</span>
      <span class="pal-hint">${hint}</span>
    </button>`;
  }
  function syncPaletteSel() {
    palResults.querySelectorAll('.pal-item').forEach(el =>
      el.classList.toggle('is-sel', +el.dataset.i === pal.sel));
    const selEl = palResults.querySelector('.pal-item.is-sel');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  }
  function runPaletteItem(i) {
    const item = pal.items[i];
    if (!item) return;
    closePalette();
    if (item.kind === 'node') focusProject(item.project, { fly: true, index: item.index });
    else if (item.run) item.run();
  }

  palInput.addEventListener('input', () => buildPalette(palInput.value));
  palInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { pal.sel = Math.min(pal.sel + 1, pal.items.length - 1); syncPaletteSel(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { pal.sel = Math.max(pal.sel - 1, 0); syncPaletteSel(); e.preventDefault(); }
    else if (e.key === 'Enter') { runPaletteItem(pal.sel); e.preventDefault(); }
    else if (e.key === 'Escape') { closePalette(); }
  });
  palResults.addEventListener('click', (e) => {
    const it = e.target.closest('.pal-item');
    if (it) runPaletteItem(+it.dataset.i);
  });
  palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });

  // ------------------------------------------------------------------ keys
  window.addEventListener('keydown', (e) => {
    const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      togglePalette();
      return;
    }
    if (inField || pal.open) return;
    if (e.key === 'Escape') {
      $('file-view').hidden = true;
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stepNode(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stepNode(-1); }
    else if (/^[1-9]$/.test(e.key)) {
      const i = +e.key - 1;
      if (i < projects.length) focusProject(projects[i], { fly: true, index: i });
    } else if (e.key.toLowerCase() === 'z') {
      doc.body.classList.toggle('zen');
    } else if (e.key.toLowerCase() === 'o') {
      window.dispatchEvent(new CustomEvent('halcyon:orbit-toggle'));
    }
  });

  // node pins (3D labels) select too
  window.addEventListener('halcyon:node-select', (e) => {
    const d = e.detail || {};
    if (d.project) focusProject(d.project, { fly: true, index: d.index });
    else if (typeof d.index === 'number' && projects[d.index]) focusProject(projects[d.index], { fly: true, index: d.index });
  });

  // ------------------------------------------------------------------ boot
  async function boot() {
    await gh.load();
    projects = gh.projects;
    $('status-node').textContent = `--/${String(projects.length).padStart(2, '0')}`;
    buildRail();
    if (gh.source === 'offline') toast('OFFLINE — MATRIX RUNNING ON CACHED DATA', { ms: 3600 });
    if (!projects.length) {
      $('tele-name').textContent = 'NO NODES';
      $('tele-summary').textContent = 'The GitHub API returned no public repositories.';
      return;
    }
    focusProject(projects[0], { fly: false, index: 0 });
    window.dispatchEvent(new CustomEvent('halcyon:project-select', {
      detail: { project: projects[0], index: 0 },
    }));
    // hand the roster to the 3D layer so the racks can be built
    window.dispatchEvent(new CustomEvent('halcyon:projects-ready', { detail: { projects } }));
  }
  boot();

  return {
    focusProject,
    setAccent,
    toast,
    openPalette,
    closePalette,
    stepNode,
    get focused() { return focused; },
    get focusIndex() { return focusIndex; },
    get ready() { return projects.length > 0; },
    get framework() { return IDENTITY.framework; },
  };
}
