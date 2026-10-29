// Clock UI: rolling digits (WAAPI, transform-only), pulsing colon, seconds hairline
// that fills over 60 s, date line, phase line, and a visually hidden live region
// that announces the time once a minute.

const EASE_INOUT = 'cubic-bezier(0.65, 0, 0.35, 1)';

export function createClock(ctx) {
  const { document: doc, isReducedMotion } = ctx;
  const timeEl = doc.getElementById('time');
  const fill = doc.getElementById('seconds-fill');
  const dateLine = doc.getElementById('date-line');
  const phaseLine = doc.getElementById('phase-line');
  const live = doc.getElementById('live');

  let slots = [];        // [{el, inner, kind}]
  let suffixEl = null;
  let lastHM = '';
  let lastSec = 0;

  function build(h24) {
    timeEl.textContent = '';
    slots = [];
    const layout = ['d', 'd', 'colon', 'd', 'd'];
    for (const kind of layout) {
      if (kind === 'colon') {
        const c = doc.createElement('span');
        c.className = 'colon';
        c.textContent = ':';
        timeEl.appendChild(c);
        continue;
      }
      const slot = doc.createElement('span');
      slot.className = 'digit';
      const inner = doc.createElement('span');
      inner.className = 'digit-inner';
      const d = doc.createElement('span');
      d.className = 'd';
      d.textContent = '0';
      inner.appendChild(d);
      slot.appendChild(inner);
      timeEl.appendChild(slot);
      slots.push({ inner, kind });
    }
    suffixEl = doc.createElement('span');
    suffixEl.className = 'suffix';
    suffixEl.style.cssText = 'font-size:0.22em;font-style:italic;margin-left:0.15em;transform:translateY(-0.4em);display:inline-block;letter-spacing:0';
    timeEl.appendChild(suffixEl);
    lastHM = '';
  }

  function roll(slot, ch) {
    const inner = slot.inner;
    const cur = inner.lastElementChild.textContent;
    if (cur === ch) return;
    const d = doc.createElement('span');
    d.className = 'd';
    d.textContent = ch;
    inner.appendChild(d);
    if (isReducedMotion()) {
      while (inner.children.length > 1) inner.firstElementChild.remove();
      return;
    }
    const anim = inner.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-50%)' }],
      { duration: 600, easing: EASE_INOUT, fill: 'forwards' },
    );
    anim.onfinish = () => {
      while (inner.children.length > 1) inner.firstElementChild.remove();
      anim.cancel();
    };
  }

  // parts from TimeEngine.displayParts()
  function update(parts) {
    const hh = String(parts.hour).padStart(2, '0').slice(-2);
    const mm = String(parts.minute).padStart(2, '0');
    const hm = hh + mm;
    if (hm !== lastHM) {
      const chars = (hh + mm).split('');
      if (lastHM === '') {
        // first paint: set directly, no roll
        slots.forEach((s, i) => { s.inner.lastElementChild.textContent = chars[i]; });
      } else {
        for (let i = 0; i < 4; i++) roll(slots[i], chars[i]);
        if (mm !== lastHM.slice(2)) live.textContent = `${hh}:${mm}`;
      }
      lastHM = hm;
    }
    if (suffixEl) suffixEl.textContent = parts.suffix ? parts.suffix.toLowerCase() : '';

    const s = Number(parts.second) || 0;
    if (s < lastSec) { // minute wrap: jump the hairline back without a backwards slide
      fill.style.transition = 'none';
      fill.style.transform = 'scaleX(0)';
      void fill.offsetWidth;
      fill.style.transition = '';
    }
    fill.style.transform = `scaleX(${s / 60})`;
    lastSec = s;

    if (parts.date && dateLine.textContent !== parts.date) dateLine.textContent = parts.date;
  }

  function setPhase(text) {
    if (phaseLine.textContent !== text) phaseLine.textContent = text;
  }

  build(true);

  function reveal() {
    if (isReducedMotion()) return;
    slots.forEach((s, i) => {
      const d = s.inner.lastElementChild;
      d.animate(
        [{ transform: 'translateY(0.85em)' }, { transform: 'translateY(0)' }],
        { duration: 700, easing: 'cubic-bezier(0.22,1,0.36,1)', delay: i * 90, fill: 'backwards' },
      );
    });
    suffixEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 380, fill: 'backwards' });
    document.querySelector('.colon').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 200, fill: 'backwards' });
  }

  return {
    update,
    setPhase,
    reveal,
    rebuild(h24) { build(h24); },
  };
}
