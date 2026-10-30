// GitHub data layer for the Architectural Matrix portfolio.
// Resolution order: local telemetry API (/api/projects) -> direct
// api.github.com (static hosting) -> localStorage cache -> offline seed.
// Every payload passes the IDENTITY FILTER: repositories named `halcyon` (or
// the owner account) are the framework itself and never become project cards.
// READMEs are fetched raw and parsed into executive summary / features /
// tech stack so every node shows the repository's true documentation.

import { IDENTITY, isIdentityRepo, categoryFor, CATEGORIES, FEATURED_PROJECTS } from './config.js';

const GH_CACHE_KEY = 'halcyon.ghcache.v2';
const PULSE_KEY = 'halcyon.pulse.v1';
const TTL = 600000; // 10 minutes

function fuzzScore(hay, needle) {
  hay = hay.toLowerCase();
  needle = needle.toLowerCase();
  if (!needle) return 1;
  let hi = 0, streak = 0, best = 0, score = 0;
  for (const ch of needle) {
    const idx = hay.indexOf(ch, hi);
    if (idx === -1) return 0;
    streak = idx === hi ? best + 1 : 1;
    best = streak;
    score += 1 + streak * 0.25;
    hi = idx + 1;
  }
  return score / needle.length;
}

// ---------------------------------------------------------------------------
// README parsing — markdown -> { summary, features, techStack, sections }
// ---------------------------------------------------------------------------
export function parseReadme(md, fallbackDesc = '', language = '', topics = []) {
  const out = { summary: '', features: [], techStack: [], hasReadme: !!md };
  if (!md) {
    out.summary = fallbackDesc || '';
    out.techStack = [language, ...topics].filter(Boolean).slice(0, 6);
    return out;
  }
  let text = String(md)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter(line => !/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) // badge-only lines
    .join('\n');

  const lines = text.split('\n');

  // --- executive summary: first meaty paragraph that isn't markup noise ----
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('!') || line.startsWith('|')) continue;
    if (/^([-*+]|\d+\.)\s/.test(line)) continue;
    const clean = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>]/g, '')
      .trim();
    if (clean.length >= 42) { out.summary = clean; break; }
    if (clean.length >= 18 && !out.summary) out.summary = clean;
  }
  if (!out.summary) out.summary = fallbackDesc || '';

  // --- features: bullets under a features-ish heading, else first list -----
  const isHeading = (l) => /^#{1,6}\s/.test(l.trim());
  let fi = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isHeading(lines[i]) && /feature|highlight|what.+does|capabilit|functionality|key\s+/i.test(lines[i])) { fi = i; break; }
  }
  const collectBullets = (start) => {
    const items = [];
    for (let i = start + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (isHeading(raw) || /^```/.test(raw.trim())) break;
      const m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(raw);
      if (!m) { if (raw.trim() === '' && items.length) break; continue; }
      const clean = m[1]
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .trim();
      if (clean && clean.length > 2) items.push(clean.slice(0, 160));
      if (items.length >= 8) break;
    }
    return items;
  };
  if (fi >= 0) out.features = collectBullets(fi);
  if (out.features.length < 3) {
    for (let i = 0; i < lines.length && out.features.length < 3; i++) {
      if (/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]) && !isHeading(lines[i])) {
        const items = collectBullets(i - 1);
        if (items.length >= 3) out.features = items;
      }
    }
  }

  // --- tech stack: dedicated section, else inline code spans + badges -------
  let ti = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isHeading(lines[i]) && /tech|built with|stack|requirement|installation|getting started/i.test(lines[i])) { ti = i; break; }
  }
  const found = new Set();
  const addTech = (s) => {
    const t = s.trim().replace(/[.,;]$/, '');
    if (t && t.length <= 28 && found.size < 8) found.add(t);
  };
  if (ti >= 0) {
    for (let i = ti + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (isHeading(raw)) break;
      for (const m of raw.matchAll(/`([^`]+)`/g)) addTech(m[1]);
      const bullet = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(raw);
      if (bullet) {
        const clean = bullet[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
        if (clean && clean.split(/[\s/|,]+/).length <= 3) addTech(clean);
      }
      if (found.size >= 6) break;
    }
  }
  if (found.size < 3) {
    for (const m of text.matchAll(/`([A-Za-z][A-Za-z0-9.+#\- ]{1,18})`/g)) addTech(m[1]);
    for (const t of topics) addTech(t);
    if (language) addTech(language);
  }
  out.techStack = [...found].slice(0, 8);
  if (!out.techStack.length) out.techStack = [language, ...topics].filter(Boolean).slice(0, 6);
  return out;
}

// ---------------------------------------------------------------------------
// Minimal markdown -> HTML renderer for the Live README Reader tab
// ---------------------------------------------------------------------------
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inline(s) {
  return s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<a class="md-img" href="$2" target="_blank" rel="noopener">[image: $1 || $2]</a>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|\W)\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|\W)_([^_\s][^_]*)_/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');
}

export function renderMarkdown(md) {
  if (!md) return '<p class="md-empty">No README published for this repository.</p>';
  const lines = esc(String(md)).split('\n');
  const html = [];
  let inCode = false, codeBuf = [], listMode = null; // 'ul' | 'ol'
  const closeList = () => { if (listMode) { html.push(`</${listMode}>`); listMode = null; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line.trim())) {
      if (inCode) {
        html.push(`<pre class="md-code"><code>${codeBuf.join('\n')}</code></pre>`);
        codeBuf = []; inCode = false;
      } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    const t = line.trim();
    if (!t) { closeList(); continue; }
    const hm = /^(#{1,6})\s+(.*)$/.exec(t);
    if (hm) {
      closeList();
      const lvl = Math.min(hm[1].length + 2, 6); // h3..h6 inside the deck
      html.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); html.push('<hr>'); continue; }
    const qm = /^&gt;\s?(.*)$/.exec(t);
    if (qm) { closeList(); html.push(`<blockquote>${inline(qm[1])}</blockquote>`); continue; }
    const ul = /^[-*+]\s+(.*)$/.exec(t);
    if (ul) { if (listMode !== 'ul') { closeList(); html.push('<ul>'); listMode = 'ul'; } html.push(`<li>${inline(ul[1])}</li>`); continue; }
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ol) { if (listMode !== 'ol') { closeList(); html.push('<ol>'); listMode = 'ol'; } html.push(`<li>${inline(ol[1])}</li>`); continue; }
    closeList();
    html.push(`<p>${inline(t)}</p>`);
  }
  if (inCode && codeBuf.length) html.push(`<pre class="md-code"><code>${codeBuf.join('\n')}</code></pre>`);
  closeList();
  return html.join('');
}

// ---------------------------------------------------------------------------
export class GitHubService {
  constructor() {
    this.projects = [];
    this.source = 'none'; // api | static | cache | offline
    this.pulses = {};
    this.treeCache = new Map();
  }

  async load() {
    this.projects = await this._resolveProjects();
    this.pulses = await this._loadPulses();
    return this;
  }

  async _resolveProjects() {
    let raw = null;
    // 1) local telemetry server
    if (location.protocol === 'http:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      try {
        const res = await fetch('/api/projects', { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.projects)) {
            this.source = data.live === false ? 'cache' : 'api';
            raw = data.projects;
          }
        }
      } catch { /* fall through */ }
    }
    // 2) static-hosting path: localStorage cache, then direct GitHub API
    if (!raw) {
      try {
        const cached = JSON.parse(localStorage.getItem(GH_CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.at < TTL && Array.isArray(cached.projects) && cached.projects.length) {
          this.source = 'cache';
          raw = cached.projects;
        }
      } catch { /* ignore */ }
    }
    if (!raw) {
      try {
        const res = await fetch(`https://api.github.com/users/${IDENTITY.owner}/repos?sort=updated&per_page=100`);
        if (res.ok) {
          const repos = await res.json();
          raw = repos.filter(r => !r.private).map(r => ({
            name: r.name, description: r.description || '', language: r.language || 'Code',
            topics: r.topics || [], stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0,
            size: r.size ?? 0, updatedAt: r.pushed_at || r.updated_at, htmlUrl: r.html_url,
            cloneUrl: r.clone_url, actions: 'unknown', readme: '',
          }));
          this.source = 'static';
          try { localStorage.setItem(GH_CACHE_KEY, JSON.stringify({ at: Date.now(), projects: raw })); } catch { }
        }
      } catch { /* fall through */ }
    }
    // 3) offline seed so the matrix is never empty
    if (!raw) {
      this.source = 'offline';
      const seeded = new Set(Object.keys(FEATURED_PROJECTS));
      raw = [...seeded].map(name => ({
        name,
        description: FEATURED_PROJECTS[name].tagline || '',
        language: (FEATURED_PROJECTS[name].stack || ['Code'])[0],
        topics: FEATURED_PROJECTS[name].stack || [],
        stars: 0, forks: 0, size: 0, updatedAt: null,
        htmlUrl: `https://github.com/${IDENTITY.owner}/${name}`,
        cloneUrl: `https://github.com/${IDENTITY.owner}/${name}.git`,
        actions: 'unknown', readme: '',
      }));
    }
    return raw.filter(p => p && p.name && !isIdentityRepo(p.name)).map(p => this._normalise(p));
  }

  _normalise(raw) {
    const topics = (raw.topics || []).map(t => String(t).toLowerCase());
    const language = raw.language || 'Code';
    const category = categoryFor(raw.name, topics, language);
    const curated = FEATURED_PROJECTS[Object.keys(FEATURED_PROJECTS)
      .find(k => k.toLowerCase() === String(raw.name).toLowerCase())] || null;
    const readme = parseReadme(raw.readme || '', raw.description || curated?.tagline || '', language, topics);
    return {
      name: raw.name,
      fullName: raw.fullName || `${IDENTITY.owner}/${raw.name}`,
      branch: raw.branch || 'main',
      description: raw.description || readme.summary,
      language,
      topics,
      stars: raw.stars ?? raw.stargazers_count ?? 0,
      forks: raw.forks ?? raw.forks_count ?? 0,
      size: raw.size ?? 0, // KB, straight from the GitHub API
      updatedAt: raw.updatedAt || raw.pushed_at || raw.updated_at || null,
      htmlUrl: raw.htmlUrl || raw.html_url || `https://github.com/${IDENTITY.owner}/${raw.name}`,
      cloneUrl: raw.cloneUrl || raw.clone_url || `https://github.com/${IDENTITY.owner}/${raw.name}.git`,
      actions: raw.actions || 'unknown',
      accent: (CATEGORIES[category] || CATEGORIES.Web).accent,
      category,
      stack: curated?.stack || readme.techStack,
      tagline: curated?.tagline || '',
      summary: readme.summary,
      features: readme.features,
      hasReadme: readme.hasReadme,
      readmeRaw: raw.readme || '',
    };
  }

  // ---- filtering / search / sorting -------------------------------------
  languages() {
    const counts = new Map();
    for (const p of this.projects) counts.set(p.language, (counts.get(p.language) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  categories() {
    const set = new Set();
    for (const p of this.projects) set.add(p.category);
    return [...set].sort();
  }

  filter({ query = '', category = 'All' } = {}) {
    let list = this.projects.slice();
    if (category !== 'All') list = list.filter(p => p.category === category);
    if (query.trim()) {
      const scored = list
        .map(p => {
          const s = Math.max(
            fuzzScore(p.name, query) * 2,
            fuzzScore(p.description, query),
            fuzzScore(p.language, query),
            fuzzScore(p.stack.join(' '), query) * 0.9,
            fuzzScore(p.summary, query),
          );
          return { p, s };
        })
        .filter(x => x.s > 0.45)
        .sort((a, b) => b.s - a.s);
      return scored.map(x => x.p);
    }
    list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return list;
  }

  byName(name) {
    const key = String(name || '').toLowerCase();
    return this.projects.find(p => p.name.toLowerCase() === key) || null;
  }

  // ---- repo tree + file contents (lazy, server-cached) --------------------
  async loadTree(repo) {
    const key = String(repo).toLowerCase();
    if (this.treeCache.has(key)) return this.treeCache.get(key);
    let tree = [];
    try {
      const res = await fetch(`/api/tree?repo=${encodeURIComponent(repo)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tree)) tree = data.tree;
      }
    } catch { /* offline */ }
    this.treeCache.set(key, tree);
    return tree;
  }

  async loadFile(repo, path) {
    try {
      const res = await fetch(`/api/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.content === 'string') return data;
      }
    } catch { /* offline */ }
    return { content: null, error: 'offline or too large' };
  }

  // ---- pulses ("hype" reactions) -----------------------------------------
  async _loadPulses() {
    try {
      const res = await fetch('/api/pulse');
      if (res.ok) {
        const data = await res.json();
        if (data && data.pulses) return data.pulses;
      }
    } catch { /* fall through */ }
    try { return JSON.parse(localStorage.getItem(PULSE_KEY) || '{}'); } catch { return {}; }
  }

  async boost(repo) {
    this.pulses[repo] = (this.pulses[repo] || 0) + 1;
    const local = { ...this.pulses };
    try { localStorage.setItem(PULSE_KEY, JSON.stringify(local)); } catch { }
    try {
      const res = await fetch('/api/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pulses) this.pulses = data.pulses;
      }
    } catch { /* offline: local count stands */ }
    return this.pulses[repo];
  }
}
