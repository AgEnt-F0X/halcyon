// Settings drawer: quality, 12/24 h, units, location (search + geolocation),
// reduced motion, sound. Slim, hairline-divided, keyboard accessible.

import { TIERS } from '../config.js';

export function createSettings(ctx) {
  const { document: doc, settings, weather, onSettingChange, quality } = ctx;
  const drawer = doc.getElementById('settings');
  const gear = doc.getElementById('gear-btn');
  const placeBtn = doc.getElementById('place-btn');
  const placeName = doc.getElementById('place-name');

  drawer.innerHTML = `
    <button id="settings-close" aria-label="Close settings">×</button>
    <h2 class="set-title">Settings</h2>
    <div class="set-section">
      <p class="set-label">Quality</p>
      <div class="set-row" role="group" aria-label="Quality">
        <button class="seg" data-q="auto">Auto</button>
        <button class="seg" data-q="low">Low</button>
        <button class="seg" data-q="medium">Medium</button>
        <button class="seg" data-q="high">High</button>
      </div>
    </div>
    <div class="set-section">
      <p class="set-label">Time</p>
      <div class="set-row" role="group" aria-label="Clock format">
        <button class="seg" data-t="24">24-hour</button>
        <button class="seg" data-t="12">12-hour</button>
      </div>
      <div class="set-row" style="margin-top:8px" role="group" aria-label="Units">
        <button class="seg" data-u="c">°C</button>
        <button class="seg" data-u="f">°F</button>
      </div>
    </div>
    <div class="set-section">
      <p class="set-label">Location</p>
      <input id="loc-input" class="set-input" type="text" placeholder="Search a city…" aria-label="Search a city">
      <ul id="loc-results" class="search-results"></ul>
      <button id="loc-gps" class="link-btn" type="button">Use my location</button>
      <p id="loc-status" class="set-status" role="status"></p>
    </div>
    <div class="set-section">
      <p class="set-label">Motion</p>
      <div class="set-row" role="group" aria-label="Reduced motion">
        <button class="seg" data-m="system">System</button>
        <button class="seg" data-m="on">Reduced</button>
        <button class="seg" data-m="off">Full</button>
      </div>
    </div>
    <div class="set-section">
      <p class="set-label">Sound</p>
      <div class="set-row" role="group" aria-label="Ambient sound">
        <button class="seg" data-s="off">Off</button>
        <button class="seg" data-s="on">On</button>
      </div>
      <p class="set-status">Synthesised ambience — wind, rain, crickets. Starts only after you switch it on.</p>
    </div>
  `;

  const closeBtn = drawer.querySelector('#settings-close');
  const input = drawer.querySelector('#loc-input');
  const results = drawer.querySelector('#loc-results');
  const status = drawer.querySelector('#loc-status');
  const gpsBtn = drawer.querySelector('#loc-gps');

  let open = false;
  let searchTimer = 0;

  function sync() {
    drawer.querySelectorAll('[data-q]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.q === settings.quality)));
    drawer.querySelectorAll('[data-t]').forEach(b =>
      b.setAttribute('aria-pressed', String((b.dataset.t === '24') === settings.h24)));
    drawer.querySelectorAll('[data-u]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.u === settings.unit)));
    const m = settings.reducedMotion === null ? 'system' : settings.reducedMotion ? 'on' : 'off';
    drawer.querySelectorAll('[data-m]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    drawer.querySelectorAll('[data-s]').forEach(b =>
      b.setAttribute('aria-pressed', String((b.dataset.s === 'on') === settings.sound)));
    if (settings.place) placeName.textContent = settings.place.name;
  }

  function show(msg) { status.textContent = msg; }

  drawer.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.q) { settings.quality = b.dataset.q; quality.setMode(b.dataset.q); onSettingChange('quality'); sync(); }
    if (b.dataset.t) { settings.h24 = b.dataset.t === '24'; onSettingChange('h24'); sync(); }
    if (b.dataset.u) { settings.unit = b.dataset.u; onSettingChange('unit'); sync(); }
    if (b.dataset.m) {
      settings.reducedMotion = b.dataset.m === 'system' ? null : b.dataset.m === 'on';
      onSettingChange('reducedMotion'); sync();
    }
    if (b.dataset.s) { settings.sound = b.dataset.s === 'on'; onSettingChange('sound'); sync(); }
  });

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.textContent = ''; return; }
    searchTimer = setTimeout(async () => {
      show('Searching…');
      try {
        const list = await weather.search(q);
        results.textContent = '';
        show(list.length ? '' : 'No matches.');
        for (const r of list) {
          const li = doc.createElement('li');
          li.setAttribute('role', 'button');
          li.tabIndex = 0;
          li.innerHTML = `<span>${r.name}</span><span class="r-sub">${[r.admin, r.country].filter(Boolean).join(', ')}</span>`;
          const pick = () => {
            settings.place = { name: r.name, lat: r.lat, lon: r.lon, tz: r.tz };
            onSettingChange('place');
            sync();
            show('');
            results.textContent = '';
            input.value = '';
          };
          li.addEventListener('click', pick);
          li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') pick(); });
          results.appendChild(li);
        }
      } catch {
        show('Search failed — offline?');
      }
    }, 350);
  });

  gpsBtn.addEventListener('click', async () => {
    show('Locating…');
    try {
      const pos = await weather.geolocate();
      settings.place = pos;
      onSettingChange('place');
      sync();
      show('');
    } catch (err) {
      show(err && err.code === 1 ? 'Location permission declined.' : 'Location unavailable.');
    }
  });

  function setOpen(v) {
    open = v;
    drawer.classList.toggle('open', v);
    drawer.setAttribute('aria-hidden', String(!v));
    gear.setAttribute('aria-expanded', String(v));
    if (v) setTimeout(() => input.focus({ preventScroll: true }), 120);
    else gear.focus({ preventScroll: true });
  }

  gear.addEventListener('click', () => setOpen(!open));
  placeBtn.addEventListener('click', () => { sync(); setOpen(true); input.focus({ preventScroll: true }); });
  closeBtn.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open && !ctx.scrubbing()) setOpen(false);
  });

  sync();

  return {
    setOpen,
    get open() { return open; },
    setPlaceName(name) { placeName.textContent = name; },
    sync,
  };
}
