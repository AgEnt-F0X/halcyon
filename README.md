# Halcyon

A living painting that works as a clock. The whole screen is a real-time 3D valley —
pines, a lake, a cabin with a lantern, three hazy ridges and snow peaks — rendered in
WebGL with a painterly low-poly style. The light, sky, water and weather all follow
your **actual local time** and the **current weather** (Open-Meteo, no API key).

## Run it

Because the app uses ES modules, it must be served over HTTP (not opened as a
`file://` page). From this folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S`, `caddy file-server`, …). For development,
`python devserver.py` serves the same thing with cache headers disabled, which avoids
stale module caching while iterating.

Internet access is needed for Three.js (pinned to 0.160.0 via CDN import map) and the
weather API. To vendor Three.js locally for fully offline use, download:

- `three.module.js` from `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` → `vendor/three.module.js`
- `BufferGeometryUtils.js` from `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js` → `vendor/BufferGeometryUtils.js` (edit its `three` import to `../three.module.js`)

and change the import map in `index.html` to `"three": "./vendor/three.module.js"`,
`"three/addons/": "./vendor/"`. A service worker also caches the shell + last weather
response once the site has been visited.

## Controls

| Input | Action |
| --- | --- |
| Move pointer | Subtle parallax |
| Drag on the scene | Look around (±12° yaw / ±6° pitch, auto-recenters after 4 s) |
| Drag the bottom timeline | Preview any time of day — the whole scene follows |
| Double-click timeline / `Esc` | Return to live time |
| `P` | Performance HUD (fps, frame time, draw calls, triangles, tier, DPR) |
| `W` | Cycle weather previews: clear → partly → overcast → fog → rain → storm → snow → live |
| `T` | Cycle season previews: spring → summer → autumn → winter → real |
| Gear / place name (top-right) | Settings: quality, 12/24 h, °C/°F, location search & geolocation, reduced motion, sound |

The place name button also opens the location search. Geolocation is only requested
after an explicit click. Choices persist in `localStorage`.

## Notes

- **Quality** auto-detects via a 2 s startup benchmark plus CPU/memory hints, then
  continuously scales resolution (0.6–1.5 DPR). Low/Medium/High force fixed tiers
  (High adds MSAA + grass; Low skips the post pass and uses a CSS vignette).
- **Reduced motion** honours `prefers-reduced-motion` or can be forced in settings.
- **No WebGL?** The clock, scrubber and settings keep working over a CSS-gradient
  scene; the page recovers automatically if the context is restored.
- Weather is cached for 15 minutes and falls back to the last known state offline.

## Files

```
index.html
css/style.css
js/main.js            bootstrap, loop, visibility, fallback, intro
js/config.js          palettes, tiers, world constants, helpers
js/time.js            timezone display, solar position, moon phase, day phases
js/weather.js         Open-Meteo fetch/cache/mapping, location
js/quality.js         benchmark, tiers, dynamic resolution, HUD
js/audio.js           synthesised ambience (off by default)
js/scene/…            sky, terrain, water, forest, cabin, clouds, weatherfx,
                      stars, birds, camera, post, materials (shared ToonLit)
js/ui/…               clock, scrubber, settings
manifest.json, sw.js  installable PWA
```
