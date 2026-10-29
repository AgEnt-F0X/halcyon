// Timeline scrubber: full-width 24 h line with sunrise/sunset ticks, a sun/moon
// marker, hover phase labels, drag-to-preview, double-click / Escape to return.

import { PHASE_LABELS } from '../config.js';

export function createScrubber(ctx) {
  const { document: doc, time } = ctx;
  const el = doc.getElementById('timeline');
  const ticksBox = el.querySelector('.tl-ticks');
  const marker = doc.getElementById('tl-marker');
  const hover = doc.getElementById('tl-hover');
  const previewLabel = doc.getElementById('preview-label');
  const previewTime = doc.getElementById('preview-time');

  let dragging = false;
  let previewing = false;
  let windowSet = false;

  function fmtH(h) {
    const hh = Math.floor(((h % 24) + 24) % 24);
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function setWindow(sunriseH, sunsetH) {
    ticksBox.textContent = '';
    for (const [h, label] of [[sunriseH, 'Sunrise'], [sunsetH, 'Sunset']]) {
      if (!isFinite(h)) continue;
      const tick = doc.createElement('div');
      tick.className = 'tl-tick';
      tick.style.left = `${(h / 24) * 100}%`;
      ticksBox.appendChild(tick);
      const lab = doc.createElement('div');
      lab.className = 'tl-tick-label';
      lab.style.left = `${(h / 24) * 100}%`;
      lab.textContent = `${label} ${fmtH(h)}`;
      ticksBox.appendChild(lab);
    }
    windowSet = true;
  }

  function setMarker(h, night) {
    marker.style.left = `${(h / 24) * 100}%`;
    marker.classList.toggle('night', !!night);
    el.setAttribute('aria-valuenow', String(Math.round(h * 60)));
  }

  function hFromEvent(e) {
    const r = el.getBoundingClientRect();
    return Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)) * 24;
  }

  function beginPreview(h) {
    if (!previewing) {
      previewing = true;
      previewLabel.hidden = false;
      previewLabel.classList.add('on');
    }
    previewTime.textContent = fmtH(h);
    ctx.onScrub(h);
  }

  function endPreview() {
    dragging = false;
    if (!previewing) return;
    previewing = false;
    previewLabel.classList.remove('on');
    setTimeout(() => { if (!previewing) previewLabel.hidden = true; }, 320);
    ctx.onScrub(null);
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    beginPreview(hFromEvent(e));
  });
  el.addEventListener('pointermove', (e) => {
    const h = hFromEvent(e);
    if (dragging) beginPreview(h);
    const name = PHASE_LABELS[time.sample(h).name] || '';
    hover.hidden = false;
    hover.style.left = `${(h / 24) * 100}%`;
    hover.textContent = `${name} · ${fmtH(h)}`;
  });
  el.addEventListener('pointerup', () => { dragging = false; });
  el.addEventListener('pointerleave', () => { hover.hidden = true; });
  el.addEventListener('dblclick', endPreview);
  el.addEventListener('keydown', (e) => {
    const cur = (time.dayHours() / 24) * 1440;
    if (e.key === 'Escape') { endPreview(); return; }
    let next = null;
    if (e.key === 'ArrowLeft') next = cur - 10;
    if (e.key === 'ArrowRight') next = cur + 10;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = 1439;
    if (next !== null) {
      e.preventDefault();
      beginPreview((next + 1440) % 1440 / 60);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewing) endPreview();
  });

  return {
    setWindow,
    setMarker,
    get previewing() { return previewing; },
    endPreview,
    get ready() { return windowSet; },
  };
}
