# Larpscape Overhaul Plan — "YouTube-ready"

Goal: complete graphics + UX overhaul, very faithful to OSRS (original assets only),
fully playable and polished for a first-hour-gameplay YouTube video.

Decisions (locked 2026-06-11):
- **Models:** procedural in code — upgrade GeoBuilder to rounded low-poly (lathes,
  tapered prisms, icosphere heads). No GLTF pipeline. Vertex colors, no textures.
- **Map:** surgical revert to the handcrafted 224×224 (`a8f65e2` map.json), keep all
  code features added since, then hand-expand to ~300×300. Generator scripts deleted.
- **Viewport:** authentic OSRS fixed mode 765×503, CSS-scaled to fill modern screens.
- **Polish budget:** the new-player route (login → spawn → tutorial quest → early
  skilling → first combat → bank), since that's what the video shows.

## Phases

### Phase 1a — Surgical map revert (do first)
- `data/map.json` ← `a8f65e2` version (last handcrafted, includes Gun Guild/Aldgate).
- Keep ALL code from `f5784ba` (friends, social server, gambling pack, tracks, UI).
- Re-apply starter-town-south (`a59c75d`) map entries; relocate the out-of-bounds
  piece (x≈300) into the legacy area.
- Prune `data/spawns.json` entries outside 224×224; prune/relocate POIs, region music
  and quest hubs that reference expansion zones.
- Delete `scripts/generate-world-500.ts`, `scripts/world-gen-utils.ts`, `world:gen`.
- Server: clamp out-of-bounds saved player positions to spawn on login.

### Phase 1b — Auto-refresh on update
- BUILD_ID (git short hash) baked into client via Vite define; served at
  `/api/version` and in WS hello.
- Client checks on connect + every ~3 min; on mismatch shows "Game has been
  updated!" and reloads at a safe moment.
- nginx: `no-cache` on index.html, immutable long max-age on hashed assets.

### Phase 2 — Character/NPC models (non-cubic low-poly)
Rounded GeoBuilder primitives; rebuilt humanoid rig with real pivots and better
walk/attack/skilling animations; equipment changes silhouette; all creatures/bosses
rebuilt in the same style.

### Phase 3 — World objects + environment
~30 object archetypes remodeled (trees, rocks, buildings with sloped roofs...);
directional shadow map; better water; per-region fog; particles (smoke, sparks,
splashes, leaves); tree-fall and item-drop animations.

### Phase 4 — OSRS-faithful UI + scaled fixed mode
Pixel-faithful stone/parchment skin, hover text + left-click priority, minimap dot
colors + rotating compass + click flag, chat filter tabs, dialogue heads, original
bitmap font, CSS-scaled fixed mode, interface/skilling/combat sounds.

### Phase 5 — Organic map expansion (~300×300)
2–3 handcrafted connected regions (port town, danger zone, farmland); winding roads,
rivers that go somewhere; authored via admin MapEditor; music/POIs/spawns wired.

### Phase 6 — First-hour polish pass
Playtest the exact video route end-to-end and fix everything on it; clean login,
music transitions, level-up fireworks, stable framerate, zero console errors.
