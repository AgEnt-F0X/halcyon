# HALCYON — Architectural Core

**Halcyon is the name of this website framework itself — it is not a project.**
It powers the *Infinite Architectural Core & System Matrix* portfolio for
[`AgEnt-F0X`](https://github.com/AgEnt-F0X): a real-time WebGL developer matrix
where every public repository becomes an architectural server-rack node with a
data beam, and selecting it teleports the camera along its lane.

## Run it

The app uses ES modules, so serve it over HTTP (not `file://`). From this
folder:

```bash
python devserver.py
# → http://localhost:8430  (set PORT=xxxx to change)
```

`devserver.py` is stdlib-only and doubles as the telemetry backend:

| Endpoint | What it does |
| --- | --- |
| `GET /api/projects` | Public repos for `AgEnt-F0X`, enriched with language, topics, stars, forks, size, last push, the latest GitHub Actions status (when `GITHUB_TOKEN` is set via env or `.env`) **and the raw README.md text** for every repo. Identity repos (`halcyon`, the owner account) are filtered out server-side. Cached to `.cache/` with a 10-minute TTL and stale-cache fallback on API failure. |
| `GET /api/tree` | `?repo=NAME` — full recursive file tree from the GitHub trees API, cached 10 min. |
| `GET /api/file` | `?repo=NAME&path=PATH` — raw text file content (capped at 400 KB), cached 10 min. |
| `GET/POST /api/pulse` | Visitor "boost" reactions per project, persisted to `.cache/pulse.json`. |

Any static server also works (`python -m http.server`, `npx serve`, GitHub
Pages): the client automatically falls back to calling `api.github.com`
directly, then to a localStorage cache, then to an offline seed — the matrix is
never empty. Identity filtering (`halcyon` / `AgEnt-F0X`) is enforced again
client-side in `js/github-service.js`.

## Architecture

- `js/main.js` — bootstrap + render loop. `THREE.WebGLRenderer` runs with
  `powerPreference: "high-performance"` (forces the discrete GPU on hybrid
  laptops) and the pixel ratio is **locked at 1.0** — resolution rescaling is
  the primary stutter source on i5-7200U / 920MX-class hardware.
- `js/scene/matrix.js` — the Global Grid Matrix: infinite shader grid, ambient
  data-node particles, distant monolith skyline and the central Architectural
  Core. Everything batched: ~7 draw calls for the whole environment.
- `js/scene/nodes.js` — project racks. All server racks merge into one solid
  mesh + one line mesh + one beam mesh (3 draw calls), with per-vertex accent
  colours and node ids. DOM pins project names into screen space.
- `js/scene/camera.js` — spring-damped teleportation rig: selecting a node
  glides the camera down its data lane to the rack. Cursor parallax, drag
  look, free orbit around the core.
- `js/scene/materials.js` — one shared uniform family; tier changes only ever
  touch uniforms and draw ranges, never shader recompiles.
- `js/quality.js` — 45-frame rolling FPS buffer, tier stepping
  (potato/low/medium/high), eco throttling, low-spec governor. Pixel ratio
  stays locked; tiers gate features only.
- `js/github-service.js` — data layer: repos + README parsing (executive
  summary, features, tech stack), a minimal markdown renderer for the Live
  README tab, lazy tree/file loading, identity filter.
- `js/ui/showcase.js` — left telemetry panel, right tech deck (Architecture /
  Live README / Files), bottom command dock (node rail + system clock) and the
  `Ctrl+K` command palette.
- `js/ui/interactions.js` — magnetic cursor, rack raycast hover/teleport,
  wheel-to-step node navigation, pointer parallax.

## Keys

`1-9` jump to node · `←/→` step nodes · `wheel` step nodes · `O` orbit ·
`Z` zen · `P` perf HUD · `Ctrl+K` command palette · `Esc` close overlays
