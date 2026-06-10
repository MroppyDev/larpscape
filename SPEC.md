# Larpscape Overhaul Spec (v2)

This document is the binding contract for the multi-agent overhaul. If your prompt and this
file disagree, this file wins. **All art, music, names, and text must be original work** —
we recreate publicly documented game *mechanics and numbers* (tick timing, XP curves,
skill XP values), never copyrighted assets.

## File ownership — never edit a file you don't own

| File | Owner |
|---|---|
| `src/defs.ts` | data agent |
| `src/sprites.ts` | sprite agent |
| `src/render.ts` | render agent |
| `src/world.ts` | world agent |
| `src/audio.ts` | audio agent |
| `src/game.ts`, `src/main.ts` | architect (do not touch) |
| `src/ui.ts`, `src/content.ts`, `src/quests.ts` | phase-3 agents (do not touch in phase 1) |

Other agents are rewriting their files *concurrently*. Code against THIS SPEC, not against
the current contents of files you don't own. Do not run `tsc` against the whole project —
cross-file errors from in-flight work are expected; the architect integrates at the end.

## Equipment slots

`type EquipSlot = 'head' | 'body' | 'legs' | 'weapon' | 'shield' | 'gloves' | 'boots' | 'ammo'`

## Canonical item IDs

Existing (keep, with same ids): coins, bronze_axe, bronze_pickaxe, bronze_sword,
wooden_shield, tinderbox, small_net, logs, oak_logs, raw_shrimps, shrimps, raw_anchovies,
anchovies, burnt_fish, copper_ore, tin_ore, iron_ore, bones, cowhide, raw_beef,
cooked_meat, raw_chicken, cooked_chicken, burnt_meat, feather, bread.

New — weapons/tools: iron_sword, steel_sword, bronze_scimitar, iron_scimitar,
steel_scimitar, shortbow, oak_shortbow, knife, hammer, needle, thread, shears, rake,
seed_dibber, fishing_rod, bucket, vial_of_water, bird_snare.

New — armour: bronze_full_helm, iron_full_helm, steel_full_helm, bronze_platebody,
iron_platebody, steel_platebody, bronze_platelegs, iron_platelegs, steel_platelegs,
bronze_kiteshield, iron_kiteshield, steel_kiteshield, leather_body, leather_gloves,
leather_boots.

New — ammo (stackable, slot 'ammo'): bronze_arrow, iron_arrow.

New — resources/materials: coal, bronze_bar, iron_bar, steel_bar, rune_essence,
air_rune, mind_rune, water_rune, earth_rune, fire_rune (runes stackable), arrow_shaft
(stackable), headless_arrow (stackable), bronze_arrowtips (stackable), iron_arrowtips
(stackable), shortbow_u, flax, bowstring, wool, ball_of_wool, leather, plank, nails
(stackable), willow_logs, eye_of_newt, fishing_bait (stackable).

New — herblore: grimy_guam, guam_leaf, grimy_marrentill, marrentill, attack_potion,
defence_potion.

New — farming/food: potato_seed (stackable), cabbage_seed (stackable), potato, cabbage,
raw_sardine, sardine, raw_herring, herring, egg, bucket_of_milk, cake, raw_bird_meat,
roast_bird_meat.

## Canonical NPC ids

Existing: man, goblin, chicken, cow, giant_rat, shopkeeper, banker.
New (non-attackable unless noted): sheep (option: Shear), tanner, slayer_master
(name "Brogan", a gruff slayer master), magic_tutor (name "Mira the Magic Tutor"),
gardener (name "Old Fen"), cook (name "Cook Edda", in castle kitchen),
carpenter (name "Carpenter Lenny").
`giant_rat` and `goblin` become `aggressive: true`.

## Canonical object type ids

Existing: tree, oak, stump, rocks_copper, rocks_tin, rocks_iron, rocks_empty,
fishing_spot, range, bank_booth, fire.
New: willow (wc 30, 67.5xp), furnace, anvil, spinning_wheel, altar (prayer recharge),
air_altar, rocks_coal (mining 30, 50xp), rocks_essence (mining 1, 5xp, never depletes),
flax_plant (Pick), farming_patch, bake_stall (Steal-from), workbench,
agility_log (Walk-across), agility_rope (Swing-on), agility_wall (Climb),
agility_ledge (Balance-across), rod_fishing_spot (Bait — sardine 20xp lvl 5 / herring
30xp lvl 10, needs fishing_rod + fishing_bait), snare_set (player-placed bird snare;
states via WorldObject.depletedAs: 'snare_caught' when it has a bird).

## Terrain codes (binding for world + render + audio)

`T = { GRASS:0, WATER:1, PATH:2, FLOOR:3, WALL:4, BRIDGE:5, SWAMP:6, FENCE:7, SAND:8, DIRT:9, FLOWERS:10 }`
DIRT = farming soil; FLOWERS = decorative meadow tiles (walkable).

## Map districts (binding coordinates, map is 104×104)

Existing layout is preserved: castle x13–28/y28–46 (entrance gap east wall y36–38),
river x45–52 vertical, bridge y38–40, goblin field x52–70/y22–52, cow pen x54–70/y6–20,
chicken farm x28–38/y8–16, swamp mine x12–32/y58–76, general store x31–39/y46–52,
spawn point (22,38).

New districts (place inside these boxes):
- Chapel room with `altar`: NE corner inside the castle (~x24–27, y29–32).
- Market stalls (`bake_stall` ×2): x30–36, y41–44.
- Smithy building (`furnace` + `anvil`): x32–40, y54–60.
- Carpenter shack (`workbench`, carpenter NPC): x20–26, y50–56.
- Sheep pen (5 sheep) + spinning house (`spinning_wheel`): x14–26, y8–20.
- Flax field (`flax_plant` ×8): x40–44, y14–20.
- Farming patches (`farming_patch` ×2, DIRT tiles) + gardener: x33–39, y20–26.
- Agility course (log → rope → wall → ledge, in a N→S loop): x5–11, y28–50.
- Air altar stone circle (`air_altar`): x60–70, y58–68.
- `rocks_coal` ×2 and `rocks_essence` ×2 added inside the swamp mine.
- Willows (~6) on river banks (x44 and x53), y44–76.
- Hunter meadow (FLOWERS/GRASS mix, open area for snares): x56–72, y70–84.
- Magic tutor hut: x40–44, y28–33 (does not block the road at y37–39).
- `rod_fishing_spot` ×2 on east river bank, y46–60.
- Slayer master stands near castle entrance (~x30, y35).
- Cook stands in castle kitchen near the range.

## Region → music map (audio agent)

castle box → 'Stonecourt'; swamp box → 'Boghollow'; goblin box → 'Goblin Strut';
river band x42–54 → 'Riverside'; sheep/flax/farm north (y<22, x<46) → 'Shepherd's Rest';
market/store/smithy (x29–41, y40–62) → 'Market Day'; air altar box → 'Whispering Stones';
hunter meadow box → 'Quiet Meadow'; default → 'Newbie Meadow'.
Existing five tracks stay; compose four new ORIGINAL tracks for the new names.

## API contracts (must keep compiling for importers)

### defs.ts must export
Everything it exports today (SKILLS, SkillName, TRAINABLE, XP_TABLE, levelForXp, ItemDef,
ITEMS, CookDef, COOKABLES, NpcDef, NPCS, ObjDef, OBJS, SkillObjData, SKILL_OBJS,
SHOP_STOCK, TICK_MS) plus:

```ts
export type EquipSlot = 'head'|'body'|'legs'|'weapon'|'shield'|'gloves'|'boots'|'ammo';
// ItemDef gains: equipSlot?: EquipSlot; rangedBonus?: number; attackSpeed?: number (ticks, weapons);
//   levelReq?: { skill: SkillName; level: number }[];
// NpcDef gains: aggressive?: boolean (already optional); pickpocket?: { level:number; xp:number; loot:{item:string;qty:[number,number]}[]; stunDmg:number };
export const SMELTABLES: { bar:string; level:number; xp:number; inputs:{item:string;qty:number}[]; successChance?:number }[];
export const SMITHABLES: { output:string; outputQty?:number; bar:string; bars:number; level:number; xp:number }[];
export const FLETCHABLES: { output:string; outputQty?:number; level:number; xp:number; inputs:{item:string;qty:number}[] }[];
export const CRAFTABLES:  { output:string; level:number; xp:number; inputs:{item:string;qty:number}[]; station?:'spinning_wheel'|null }[];
export const HERBS: { grimy:string; clean:string; level:number; xp:number }[];
export const POTIONS: { output:string; level:number; xp:number; herb:string; secondary:string }[];
export const SPELLS: { id:string; name:string; level:number; xp:number; maxHit:number; runes:{item:string;qty:number}[] }[]; // wind/water/earth/fire strike
export const PRAYERS: { id:string; name:string; level:number; drain:number; boost:'defence'|'strength'|'attack'; mult:number }[]; // 1.05x style
export const SEEDS: { seed:string; produce:string; level:number; plantXp:number; harvestXp:number; growTicks:number }[];
export const SHOPS: Record<string, { name:string; stock:{item:string;qty:number}[] }>; // 'general', 'magic', 'gardener'
export const SLAYER_TARGETS: { npc:string; level:number }[];
export const CONSTRUCTION_BUILDS: { name:string; level:number; xp:number; planks:number; nails:number }[];
```
Use wiki-faithful levels/XP where they exist; sensible values otherwise. Original examine
text for every item (short, dry, in-world humor welcome — write your own).

### sprites.ts must export
`itemIcon(id): HTMLCanvasElement` (32×32, cached) for EVERY item id above;
`skillIcon(name)` (16×16) for all 23 skills; `tabIcon(name)` (20×20) for tabs:
combat, skills, quests, inventory, equipment, prayer, magic, music, settings, logout;
`copyCanvas(c)`. Quality bar: hand-authored pixel art from palette+string grids
(see prompt), consistent style, dark outlines, 2–3 value ramp shading. Metal-tier items
(bronze/iron/steel) should be palette swaps of shared pixmaps.

### render.ts must keep exports
`TILE`, `camera`, `markTick()`, `render()`, `renderMinimap()`, `buildMinimapBase()`,
`screenToTile(sx,sy)`, `minimapClickToTile(ev)`, `entityPixel(e)`. Must render every
object type and NPC id listed above, terrain codes 0–10, and (defensively, if present)
`state.projectiles: { fromX,fromY,toX,toY,startMs,durMs,kind:'arrow'|'spell' }[]`.

### world.ts must keep exports
`MAP_W`, `MAP_H` (now 104), `T` (as above), `terrain`, `objects`, `objectAt`, `key`,
`addObject`, `removeObject`, `buildWorld`, `blocked`, `findPath`, `WorldObject`,
`GroundItem`. `WorldObject` gains optional `meta?: Record<string, any>` (farming patch
state, snare timers). `blocked()`: fire, fishing_spot, rod_fishing_spot, flax_plant,
farming_patch, snare_set, agility obstacles do NOT block; everything else placed does.

### audio.ts must keep exports
`audio` engine instance (same methods), `TRACKS`, `trackForRegion(x,y)`. New SFX kinds
welcome (keep existing kind names working): add 'smith', 'smelt', 'pray', 'spell',
'bow', 'thieve', 'plant', 'agility'.

### game.ts (architect) will expose — phase 3 agents code against this
Registries: `registerObjectAction(objType, option, handler)`,
`registerNpcAction(npcId, option, handler)`, `registerItemAction(itemId, option, handler)`,
`registerItemOnObject(itemId, objType, handler)`, `registerItemOnItem(idA, idB, handler)`,
`registerTickHook(fn)`. Dialogue: `startDialogue(npcName, lines, opts?)`. Make-X:
`events.onRequestMake(options) -> ui shows picker -> calls back`. Quest state:
`state.player.quests: Record<string, number>`. Prayer: `state.player.prayerPoints`,
`togglePrayer(id)`. Projectiles: `state.projectiles`.

---

# Phase 4 — 3D renderer + SoundFont audio (binding addendum)

## render.ts → full 3D rewrite (renderer agent owns src/render.ts ONLY)

Replace the 2D canvas renderer with a low-poly 3D renderer built on `three` (installed,
v0.184, types available). Target the look of mid-2000s browser MMOs: vertex-colored
low-poly geometry, NO textures (vertex colors + gouraud/Lambert shading only), one warm
directional light + ambient, dark distance fog, chunky models. All art remains original.

MUST keep the exact same exports and signatures as today (main.ts/ui.ts depend on them):
`TILE`, `camera`, `markTick()`, `render()`, `renderMinimap()`, `buildMinimapBase()`,
`screenToTile(sx, sy)` (now via raycast against the terrain — returns tile {x,y}),
`minimapClickToTile(ev)`, `entityPixel(e)` (keep working for any internal callers).
WebGL renders into the existing `#viewport` canvas (CSS 515x336; set internal size with
devicePixelRatio).

Camera (classic MMO orbit):
- Orbits the player's interpolated position. Yaw rotated with LEFT/RIGHT arrows AND
  middle-mouse drag; pitch with UP/DOWN arrows AND middle-mouse vertical drag, clamped
  (~0.25..1.45 rad); scroll wheel zooms (distance ~4..28 tiles). Smooth/inertial feel.
- `#compass` DOM element rotates with yaw (CSS transform); clicking it resets yaw to north.
- Minimap (keep 2D top-down implementation) rotates with camera yaw; minimapClickToTile
  must invert the rotation. Player arrow/dot stays centered.

World geometry:
- Terrain: per-tile quads with subtle height noise on GRASS/FLOWERS/SWAMP (flat on
  PATH/FLOOR/BRIDGE/DIRT; WATER sunken with a semi-transparent animated plane), per-vertex
  color jitter for the classic ground-blend look, merged into chunk meshes.
- WALL tiles: extruded stone boxes (~1.8 tiles tall) with vertex-shaded faces; FENCE:
  post-and-rail; BRIDGE: planks above water.
- Every object type gets a low-poly model (trees: tapered trunk + stacked dark canopy
  blobs; willow drooping; rocks: irregular boulder clusters with ore-color facets;
  furnace glowing mouth; anvil; spinning wheel; altars; standing stones; stalls with
  awnings; workbench; flax; farming patch stages via meta.stage; agility obstacles;
  snare dome w/ bird when caught; bank booths; range/fire with animated flame cones;
  fishing spots as animated ripple rings on the water).
- Entities: low-poly articulated figures (box/cylinder limbs), 4-direction facing from
  movement/lastFacing, walk swing animation, idle bob. Player shows equipment (helm/body/
  leg tint by material tier, held weapon silhouette, shield). Distinct NPC models per id
  (same cast as before). Smooth tile-interpolated movement using markTick timing.
- Hitsplats/health bars/projectiles: camera-facing sprites (canvas textures); arrows fly
  as small 3D darts, spells as glowing orbs.

Performance: merged/instanced geometry; shared materials; object models built once and
cloned. 60fps target on a laptop.

## audio.ts → SoundFont engine (audio agent owns src/audio.ts ONLY)

`spessasynth_lib` v4.3.7 is installed — READ its package (node_modules/spessasynth_lib:
package.json, README, dist/types) to learn the REAL API before writing code. The
soundfont is served at `/soundfont.sf2` (32 MB; fetch as ArrayBuffer; it is the user's
local file — never commit/redistribute it).

Keep the module API exactly: `audio` instance with `init()`, `play(track)`, `stop()`,
`unlock(name)`, `unlocked`, `current`, `onTrackChange`, `setMusicVolume`, `setSfxVolume`,
`sfx(kind)` (all existing kinds), plus `TRACKS` and `trackForRegion(x,y)`.

- Load the soundfont once on init (async, non-blocking); while loading or on failure,
  FALL BACK to the existing oscillator engine so the game always has music.
- Rearrange all nine ORIGINAL compositions for soundfont instruments (the melodies are
  ours — keep them; re-voice them): pick sensible GM-style programs (flutes/strings/harp/
  horns/timpani/choir etc.) per channel per track, with per-channel volume/pan. If the
  soundfont's bank layout is non-GM, enumerate available presets via the lib and map to
  the closest fits.
- Sequencer: schedule noteOn/noteOff events from the existing seq() note grids through
  the synth (keep 8th-note step timing and bpm); loop seamlessly; stop() kills all notes.
- SFX may stay synthesized (Web Audio) — keep them working regardless of soundfont state.

---

# Phase 5 — Multiplayer services + content expansion (binding addendum)

Architecture: client-authoritative sim (game.ts unchanged in authority) + server services:
accounts, character saves, presence relay, chat relay, Grand Exchange. All names, art,
dialogue, and music remain ORIGINAL work.

## File ownership (Phase 5)

| Files | Owner |
|---|---|
| `server/**` (new) | server agent |
| `src/net.ts` (replace stub) | net agent |
| `src/ge.ts` (replace stub) | ge agent |
| `src/tutorial.ts` (replace stub) | tutorial agent |
| `src/audio.ts` | midi agent |
| `src/world.ts` | world agent |
| `src/render.ts` | render agent |
| `src/sprites.ts` | sprites agent |
| `src/defs.ts` | gear agent |
| `src/packs/city.ts` | city agent |
| `src/packs/boss_*.ts` (one each) | 3 boss agents |
| `src/packs/quest_*.ts` (one each) | 4 quest agents |
| everything else (game.ts, main.ts, ui.ts, quests.ts, content.ts, vite.config.ts) | architect — DO NOT TOUCH |

## Architect-provided seams (already in the code — read them)

- `game.ts`: `setSaveProvider({load,save})`, `initGame(savedData?)`, `registerNpcSpawn(id,x,y)`,
  `state.remotePlayers: RemotePlayer[]` ({name,x,y,prevX,prevY,app,chat?}), all Phase-3
  registries (registerObjectAction/NpcAction/ItemAction/ItemOnObject/ItemOnItem/TickHook),
  dialogue tools, `requestMake`.
- `quests.ts`: `registerQuest(QuestDef)` — QuestDef { id, name, doneStage, journal(stage) }.
- `main.ts`: imports `./packs`, `./ge`, `./tutorial`, calls `net.bootstrap()` before
  `initGame(save)`. Pack registration happens at import time — before initGame.
- `vite.config.ts`: proxies `/api` and `/ws` to `http://localhost:8080`.

## Server contract (REST + WS, port 8080)

Stack: express + ws + better-sqlite3 + bcryptjs (all installed). Entry `server/index.ts`,
run with `npx tsx server/index.ts`. DB file `server/data.db` (gitignore it). In production
(`NODE_ENV=production`) also statically serve `../dist`.

REST (JSON; auth via `Authorization: Bearer <token>` — token is a random hex stored in a
sessions table on login/register):
- `POST /api/register {username, password}` -> `{token, username}` (unique username 3-12
  chars alnum, bcrypt hash; auto-login). 409 on taken.
- `POST /api/login {username, password}` -> `{token, username}`; 401 on bad creds.
- `GET /api/character` -> `{save: object|null}`; `PUT /api/character {save}` -> `{ok:true}`.
- `POST /api/ge/offer {kind:'buy'|'sell', item, qty, price}` -> `{offer}` (server-side
  matching on insert: compatible when buy.price >= sell.price, trade at the RESTING
  offer's price, partial fills allowed; track filled qty + escrowed proceeds per offer).
- `GET /api/ge/offers` -> `{offers:[{id,kind,item,qty,price,filled,collectedQty,coinsOwed,
  itemsOwed,active}]}` (caller's offers).
- `POST /api/ge/abort {id}` -> remaining qty cancelled, escrow released to owed.
- `POST /api/ge/collect {id}` -> `{items:[{id,qty}], coins}` and zeroes the owed amounts.
- `GET /api/ge/price/:item` -> `{last: number|null}` (most recent trade price).
Client-authoritative note: sell offers remove items client-side before posting; buy offers
remove coins client-side; collect adds returned goods client-side. The server just runs
the book honestly.

WS `/ws?token=...`:
- client->server: `{t:'pos', x, y, app}` (app = equipment ids; send only on change or
  move, max ~2/s), `{t:'chat', text}` (<=80 chars).
- server->client: `{t:'players', players:[{name,x,y,app}]}` (~every 600ms, excludes self),
  `{t:'chat', from, text}`, `{t:'hello', name}`.

`package.json` scripts (server agent owns adding): `"server": "tsx server/index.ts"`,
`"start": "NODE_ENV=production tsx server/index.ts"` (after `npm run build`).

## net.ts contract (replaces the stub; ge.ts + tutorial may import it)

Keep the stub's exported shape: `net = { online, username, token, bootstrap(), sendChat(text),
api(path, body?) }`. bootstrap(): builds a login panel inside `#welcome-screen` (above the
name input): username + password fields, Login / Register / Play offline buttons, error
line. On success: store token in localStorage('bs-token'), `setSaveProvider` to server
PUT/GET (debounced PUT, fire-and-forget), fetch save, open WS, resolve(save). Token in
localStorage -> try session resume silently. Offline -> resolve(null) and leave the local
provider. WS keeps `state.remotePlayers` updated (smooth: copy old x/y into prevX/prevY on
update so render interpolates), shows remote chat via `msg('Name: text','player-msg')` and
sets `remotePlayers[i].chat = {text, until: performance.now()+4000}` for overhead text.
Hook the existing chatbox: when the local player sends chat (ui dispatches a CustomEvent
'bs-player-chat' on window with {detail:{text}} — ALREADY ADDED? NO: instead poll-free
approach: net wraps `events.onMessage`? Cleanest: net.ts listens for the 'keydown' Enter on
#chat-input in capture phase to also send to server. Position updates: setInterval 600ms
reading state.player.

## ge.ts contract (replaces stub)

Registers object action on type 'ge_booth' ('Exchange') opening a Grand Exchange modal
(own DOM, styled like the bank): 4 offer slots view from GET /api/ge/offers, new buy offer
flow (pick item by typing name with suggestions from ITEMS, qty, price; coins removed
client-side), new sell offer flow (pick from inventory, qty, price; items removed),
collect buttons, abort, last-price lookup. Offline (net.online false): booth says the
exchange is closed. Also registerNpcSpawn for 2 'ge_clerk' NPCs if defined by gear agent
(optional — booths alone are fine).

## tutorial.ts contract (replaces stub)

A guided sequence for fresh characters (no quests completed, total level 32): registerQuest
'getting_started' (doneStage 6) + a small dismissible overlay panel (own DOM, top-left of
viewport) showing the current step with a ✓ checklist: 1 walk somewhere, 2 open inventory
tab, 3 chop a tree (gain WC xp), 4 light a fire, 5 cook shrimps or eat food, 6 talk to any
NPC. Detect via polling registries/state each second (xp deltas, activeTab via observing
#panel? simplest: hook events.onXpDrop chain — wrap existing handlers carefully WITHOUT
clobbering ui's handlers: poll state.player.xp instead). Reward at the end: 3 bread +
50 coins + completion message. Auto-hides for veterans and after completion
(quests.getting_started=6 persisted via save).

## MIDI player (audio agent)

Add to audio.ts: custom MIDI track support. `TRACKS` entries gain optional `midiUrl`.
At init, fetch `/music/manifest.json` (array of {name, file}) — if present, append those
as unlocked-by-default tracks named from the manifest. Playing a midiUrl track uses
spessasynth_lib's MIDI sequencer (read its docs in node_modules for the Sequencer class /
MIDI parsing API of v4.3.7) through the same synth + musicGain; stop() must stop it;
region auto-switch must NOT override a manually selected custom track (audio gains
`manualLock: boolean` set true when play() is called from the music tab UI — expose
`audio.playManual(track)`; ui already calls audio.play on click: ALSO export play(track,
manual=false) overload and have the music tab path use audio.play(t, true); architect will
wire ui if needed — actually ui.ts calls audio.play(t): keep that working; add
audio.play(t, manual?) optional param, main.ts region switcher checks audio.manualLock).
Create `public/music/manifest.json` as an EMPTY array `[]` with a README note in
`public/music/README.txt`: drop personal .mid files here + add entries; do not ship
copyrighted music publicly.

## World expansion (world agent) — map grows to 168x168 (existing coords unchanged)

New terrain codes: `T.CAVE=11` (dark rock floor, walkable), `T.LAVA=12` (blocks, glows).
Districts:
- East city 'Aldgate' x76-130, y8-56: walled city (gate on the west wall facing the
  existing east road at y37-39 — extend that road east to the gate), paved PATH streets,
  6-10 buildings (use WALL/FLOOR), a central plaza with 4 'ge_booth' objects + 2
  'bank_booth', fountain object 'fountain' (decorative, Examine only), market stalls
  (2 more 'bake_stall'), lamp posts optional.
- Warlord fort x132-160, y10-34: palisade (FENCE) fort, gate, arena clearing for the boss.
- Deep bog x8-40, y80-110: darker SWAMP expanse, dead trees ('tree' is fine), boss clearing.
- Cavern x60-150, y110-160: CAVE floor bounded by WALL, stalagmite objects ('stalagmite',
  blocks), LAVA pools, mithril + adamantite rocks ('rocks_mithril' x3, 'rocks_adamantite'
  x2), drake lair at the far end. Entrance: a 'cave_mouth' marker object at the south edge
  of the swamp mine (~x22,y76) plus a CAVE-floor corridor running south/east connecting to
  the cavern (overworld-style, no z-levels).
- groundSpawns: +2 in city (egg? no — 'bread' x1 plaza bench, 'vial_of_water' x1), keep existing.
Objects must remain reachable; keep all existing coordinates intact; extend trackForRegion?
NO — audio agent owns that; region boxes for new areas listed below.

## Music regions (midi agent also updates trackForRegion)

city box -> 'Aldgate Streets' (NEW original track, bustling), fort box -> 'Warbanner'
(NEW, drums+brass menace), deep bog -> 'Boghollow' (reuse), cavern box -> 'Underdeep'
(NEW, low drones + drips). Compose the three new ORIGINAL tracks.

## Gear + data (gear agent owns defs.ts)

New metal tiers, classic-feeling: mithril (Attack/Defence 20, smith ~level 50s, mine
mithril_ore at 55 for 80xp, smelt mithril_bar at 50 w/ 4 coal for 30xp) and adamant
(Attack/Defence 30, smith ~70s, mine adamantite_ore at 70 for 95xp, smelt at 70 w/ 6 coal
for 37.5xp). Items per tier: sword, scimitar, full_helm, platebody, platelegs, kiteshield,
arrow, arrowtips, bar (+ ores). Boss drops: warlord_helm (head, def between steel and
mithril, flavor), drake_sword (best weapon, Attack 40), drake_scale (resource, high value),
horror_hide (resource), plus quest items: warlord_banner, bog_heart, ember_crystal.
New NPCs in NPCS: 'goblin_warlord' (boss: combatLevel 28, hp 60, big stats, size 1.6,
aggressive, respawn ~200 ticks, drops incl. warlord_helm 10%, coins, mithril items rare),
'bog_horror' (lvl 45, hp 90, size 1.8, drops horror_hide always + herbs/seeds),
'shadow_drake' (lvl 70, hp 150, size 2.2, drops drake_scale always, drake_sword 5%),
'city_guard' (lvl 21, attackable, man-like drops), 'ge_clerk' (non-attackable, Exchange
option handled by ge.ts via registerNpcAction? ge agent registers it), 'innkeeper'
(non-attackable). Add NpcDef.boss?: boolean = true for the three bosses (render shows a
big top-of-screen HP bar). New OBJS entries: ge_booth ('Exchange'), fountain, stalagmite,
cave_mouth, rocks_mithril ('Mine'), rocks_adamantite ('Mine'). SKILL_OBJS entries for the
two new rocks. SHOPS: add 'aldgate_armoury' (steel + a couple mithril pieces, pricey) and
'aldgate_food' (bread, cake, cooked_meat). Mining/smithing/smithables tables extended for
both new bars (all six smithables each + arrowtips).

## Boss packs (one agent each: src/packs/boss_warlord.ts / boss_bog.ts / boss_drake.ts)

Each pack: registerNpcSpawn in its lair (coords inside the district boxes above),
mechanics via registerTickHook operating on its npc instances (find by def id):
- warlord: every ~8 ticks in combat, 'slam' — if player adjacent, heavy hit (up to 8) with
  msg warning the tick before ('The warlord raises his blade...').
- bog_horror: poison spit at range <=3: applies a poison state (module-level: 1 dmg every
  5 ticks x4, msg 'You have been poisoned!'), plus heals itself 5 hp if player not adjacent.
- shadow_drake: fire breath at range <=2 every ~10 ticks (up to 12 dmg, halved if a prayer
  is active — any prayer counts as bracing), msg telegraph one tick before.
Content gates: drake lair needs 'ember_crystal'?? NO — keep open; quests provide the story.
Also each boss pack registers a 'Look-at' npc action with a flavor dialogue.

## Quest packs (one agent each)

- quest_city.ts 'Streets of Aldgate' (innkeeper): fetch 3 logs + 1 plank for repairs,
  reward coins + Construction xp + unlocks innkeeper idle chatter.
- quest_warlord.ts 'The Warlord's Banner' (city_guard captain — use a registerNpcSpawn'd
  'city_guard' near the gate, dialogue via registerNpcAction on city_guard... CAREFUL:
  multiple guards share the id; acceptable — any guard gives the quest): kill
  goblin_warlord, bring warlord_banner (warlord always drops it during the quest stage —
  pack adds the drop conditionally via tick-hook on death? simpler: gear agent puts
  warlord_banner in warlord drops at 100% and the quest consumes it), reward Attack xp + coins.
- quest_bog.ts 'Heart of the Bog' (Old Fen): kill bog_horror, bring bog_heart (always
  drops), reward Herblore + Farming xp, potions.
- quest_drake.ts 'Embers Below' (Brogan): mine an ember_crystal (special: 'rocks_essence'?
  NO — the drake always drops ember_crystal; quest: slay the drake, return crystal),
  reward Slayer + Smithing xp + a mithril_sword? (use mithril scimitar) + big coins.
Each: registerQuest + dialogue with accept/decline + stage-aware journal + kill detection
via tick-hook dead-edge polling (same pattern as quests.ts 'seeds_kills').

## Render additions (render agent owns render.ts)

- Remote players: draw state.remotePlayers as player-style figures (appearance from .app
  equipment ids), interpolated via prevX/prevY + markTick timing, name label sprite above
  (small canvas sprite), overhead chat text when .chat && now < chat.until.
- New terrain: CAVE (dark grey rock, no height noise, dim), LAVA (emissive orange,
  animated), city paving variation.
- New object models: ge_booth (grand gilded booth), fountain (tiered, animated water
  ring), stalagmite, cave_mouth (dark arch), rocks_mithril (blue-tinted glints),
  rocks_adamantite (green-tinted glints).
- Boss rendering: scale by NpcDef.size (verify it already does), distinct models for
  goblin_warlord (armored goblin, banner on back), bog_horror (hulking moss mound with
  glowing eyes), shadow_drake (low-poly dragon: body, neck, head, folded wings, tail),
  city_guard (armored man), ge_clerk, innkeeper. When any NpcDef.boss npc has
  lastDamagedAt within 12 ticks, draw a large boss HP bar sprite pinned above it (wider,
  with name).
- Cavern ambience: darker fog locally is hard — acceptable to skip; LAVA emissive provides mood.

## Sprites additions (sprites agent owns sprites.ts)

Icons for every new item id (mithril = cool blue-steel palette swap, adamant = deep green
palette swap on the existing metal grids; ores with matching glints; warlord_helm (horned),
drake_sword (flame-tinged blade), drake_scale, horror_hide, warlord_banner, bog_heart,
ember_crystal, plus any quest items above). Keep the magenta fallback for unknowns.

---

# Phase 6 — Organic graphics + mega content (binding addendum)

Iterative rounds. ALL art/music/names/text ORIGINAL, classic-MMO mechanics/numbers only.

## Round 6 file ownership

Round A: render.ts (organic agent), world.ts (expansion agent), defs.ts (data agent),
sprites.ts (icon agent). Round B: src/packs/region_*.ts + src/packs/quest6_*.ts +
src/packs/skills_gathering.ts + src/packs/skills_production.ts (one agent each),
audio.ts, worldmap.ts. Architect owns game.ts/ui.ts/main.ts (neck+ring slots already added).

## Terrain codes (additions)

`T.ROCK=13` (mountain stone, walkable), `T.SNOW=14` (walkable), `T.ICE=15` (walkable),
`T.DSAND=16` (desert sand, walkable). Map grows to 224x224; ALL existing coords unchanged.

## New districts (binding boxes)

- Frostpeak Mountains x170-222/y6-104: ROCK base, SNOW north half, ICE patches; foothills
  on the west edge (GRASS) with maple/yew trees + 2 magic_tree; mountain agility course
  (4 obstacles lvl 30+: ice_ledge, rope_bridge, rock_climb, snow_slope); ice trolls +
  ice wolves; Maraza's lair ~(205,20). Reachable from the existing map east edge via a
  mountain pass at ~y50-54 (the old map's east edge x168 opens into the foothills).
- Ashen Depths x152-222/y108-162: CAVE extension of the existing cavern (open at x150-152
  boundary y120-140); rocks_gold x3 + rocks_runite x2 deep; magma_crawler + ash_fiend;
  Korr's lair ~(210,150); more LAVA.
- Sunscorch Desert x6-64/y170-218: DSAND; cactus + dead_tree deco; scorpions + desert
  bandits; bandit camp w/ bandit_king ~(30,200); rocks_gem x2; fire_altar ~(50,180);
  desert nomad shop tent; reachable from the swamp's south edge via a path at ~x20.
- Port Brackwater x70-140/y178-214: coastal village; sea = WATER for ALL x at y216-223
  with SAND beach y212-215; wooden docks (BRIDGE) running into the sea; lobster_spot x2 +
  harpoon_spot x2 on/next to docks; fishmonger + harbormaster; warehouse buildings;
  reachable via a south road from the existing map (extend the old south road).

## Canonical new ids (data agent defines; everyone references)

Fish/tools: lobster_pot, harpoon, raw_lobster/lobster (fish lvl 40/cook 40), raw_swordfish/
swordfish (50/45), raw_shark/shark (76/80 — needs harpoon). Trees: maple/yew/magic_tree
objects -> maple_logs (wc45 100xp), yew_logs (60 175xp), magic_logs (75 250xp); firemaking
135/202.5/303.8xp. Ores: rocks_gold->gold_ore (40, 65xp), rocks_runite->runite_ore (85,
125xp), rocks_gem->uncut_sapphire/emerald/ruby (40, 65xp, random). Bars: gold_bar (40,
22.5xp), rune_bar (85, 50xp, 8 coal). Rune tier gear (Attack/Defence 40): rune_sword,
rune_scimitar, rune_full_helm, rune_platebody, rune_platelegs, rune_kiteshield, rune_arrow,
rune_arrowtips (smith 85-99-ish ladder, 75xp/bar). Jewelry (Crafting at furnace with
gold_bar [+gem]): gold_ring (5, 15xp), sapphire_ring (20, 40xp), ruby_ring (34, 70xp),
gold_amulet (8, 30xp), sapphire_amulet (24, 65xp), ruby_amulet (50, 85xp) — neck/ring
equip slots EXIST now; small original stat bonuses (e.g. ruby_amulet +4 str). Cut gems:
sapphire/emerald/ruby via 'Cut' itemAction with a chisel (new tool item, general store).
Bows: maple_shortbow(_u) fletch 50, yew_shortbow(_u) 65, magic_shortbow(_u) 80; arrows:
rune_arrowtips->rune_arrow fletch 75. Herbs: grimy_ranarr/ranarr_weed (25, 7.5xp),
grimy_irit/irit_leaf (40, 8.8xp); potions: prayer_potion (ranarr, 38, 87.5xp — restores
prayer points!), super_attack (irit, 45, 100xp). Seeds: sweetcorn_seed/sweetcorn (20),
watermelon_seed/watermelon (47). big_bones (buryXp 15). chaos_rune (stackable). Spells:
wind_bolt 17 (maxHit 9), water_bolt 23 (10), earth_bolt 29 (11), fire_bolt 35 (12) — all
cost chaos_rune + elementals; magic shop sells chaos runes. chisel tool.
Monsters: ice_troll (cb 28, big_bones), ice_wolf (38), scorpion (14, aggressive),
desert_bandit (26, pickpocket lvl 35 — coins/gems rare), magma_crawler (54), ash_fiend
(82, aggressive). Bosses (boss:true): ice_queen 'Maraza the Rimebound' (90, hp 180,
size 1.9; drops: ice... original 'rimeglass_blade' weapon Att 45 rare 5%, big_bones,
runite_ore rare), bandit_king 'Saif the Red Smile' (55, hp 120; drops coins big,
sapphire/ruby, 'red_sash' neck item flavor), magma_fiend 'Korr the Molten' (110, hp 250,
size 2.4; drops 'molten_core' quest item 100%, rune items rare, 'emberhide_cape'? NO cape
slot — make it 'molten_gauntlets' gloves item). Friendly NPCs: fishmonger (shop
'brackwater_fish': lobster_pot, harpoon, fishing supplies + cooked fish), harbormaster
(quest), mountain_guide (agility flavor + quest?), desert_nomad (shop 'nomad_supplies':
waterskins? keep simple: food + chisel + gem hint), gem_trader (shop 'gem_stall' buys gems
well + 'gem_stall' OBJECT Steal-from lvl 30 — name object 'gem_stall', npc 'gem_trader').
Deco objects (non-blocking unless noted): bush, fern, boulder_small, mushroom_patch,
reeds, lilypad, driftwood, barrel (blocks), crate (blocks), cactus (blocks), ice_spike
(blocks), snow_pine (blocks), dead_tree_deco (blocks). Agility objects: ice_ledge,
rope_bridge, rock_climb, snow_slope (non-blocking, lvl 30, xp ~25-35 each, lap bonus).
fire_altar object ('Craft-rune': essence -> fire_rune, lvl 14, 7xp).

## Organic graphics goals (render agent, round A)

The world must stop reading as a tile grid: cross-tile vertex color blending (corner
colors averaged from the 4 surrounding tile types), 2-3 octave height noise with smoothed
normals, irregular shorelines (water depth tinting + animated shore foam following the
actual coast shape), per-instance object variation (random rotation, ±20% scale, slight
hue jitter — seeded from coords), richer tree canopies (3-5 offset blobs, varied greens),
ground clutter rendering for the new deco object types, soft warm directional light +
subtle hemisphere light, gentler fog. Snow/ice/desert/rock terrain (codes 13-16) with
appropriate blending (snowline gradient on ROCK->SNOW). Performance budget unchanged
(merged chunks, cloned templates).

## Music regions (round B audio agent)

Frostpeak -> 'Rimewind' (cold, sparse, high strings), Desert -> 'Sunscorch' (modal,
hand-drum feel), Port -> 'Brackwater Tide' (rolling shanty-ish 6/8 — ORIGINAL melody),
Depths -> 'Ashfall' (low drones, deep percussion). Four new ORIGINAL tracks.

---

# Phase 7 — 1000x1000 organic world + deploy (binding addendum)

All layout/names ORIGINAL. The map is generated procedurally with noise — organic
coastlines, no rectangular biome boxes. The EXISTING 224x224 region is preserved
tile-for-tile at (0,0) (every legacy coordinate keeps working); its outer edges blend
organically into the new continent.

## World layout (world agent; rough territories, organic boundaries via noise)

MAP 1000x1000. Sea surrounds the continent (15-60 tile border, bays/peninsulas/fjords,
2-4 offshore islands). The legacy south sea strip (y216-223) becomes "The Brackstrait" —
a channel from the west sea inland to ~x300 where it feeds a great central lake
'Mirrormere' (~x350-450,y250-350, organic shore); add 2 crossings (bridge ~x180, ford at
the lake outlet) so the south is reachable. Territories (blend, don't box):
- Central plains/farmland belt (~x250-550, y150-450): village hub 'Eldermere'.
- 'The Tanglewood' great forest (~x300-700, y400-750): dense trees incl. maple/yew + 2-3
  magic_tree, mushroom glades, a dark heart clearing.
- Northern range (y<160, x250-900): ROCK/SNOW/ICE ridges connected to legacy Frostpeak;
  outpost 'Stonewatch' (~x550,y80); ore clusters (coal/mithril/adamantite/runite sparse).
- Eastern marshes (~x700-950, y300-550): SWAMP, herbs, reeds.
- Southern desert expansion (~x100-450, y600-950): DSAND dunes, oases, 'Sunken Ruins'
  POI (~x300,y800) with broken WALL fragments.
- SE savanna/plains (~x550-950, y600-950).
- Volcanic isle 'Cinderholm' offshore SE (~x880,y880; CAVE/LAVA/ROCK, bridge or causeway).
- Pirate isle 'Gullswreck Cove' off the west coast (~x60,y420 area, no land bridge —
  reached ONLY by ferry).
- 2-3 meandering rivers (random-walk, 2-4 tiles wide) from the north range to the lake/sea,
  with fords/bridges where they cross walking routes.
Content fill: biome-appropriate trees/rocks/fishing spots/deco everywhere (target 30-60k
total objects; forests dense, plains sparse); fishing spots on lake/river/coast edges;
farming patches near Eldermere; fire-lit waypoints along main paths.

## New world.ts exports (binding)

- `biomeAt(x,y): string` — 'sea'|'coast'|'plains'|'forest'|'mountain'|'marsh'|'desert'|
  'savanna'|'volcanic'|'lake'|'legacy' (legacy = inside the old 224 box).
- `POIS: { id, name, kind, x, y }[]` — at least: eldermere (village), stonewatch
  (outpost), tanglewood_heart, sunken_ruins, gullswreck_cove, cinderholm, mirrormere
  (lake), brackstrait_bridge. Deterministic coords (fixed, not noise-dependent, so packs
  can target them).
- `WILD_SPAWNS: { npc, x, y }[]` — ~100-160 biome-appropriate entries using the Phase 7
  NPC ids below (bear/dire_wolf/forest_spider in forest, ruin_wraith at ruins, pirate at
  cove, cinder_imp on Cinderholm, scorpion in desert, ice_wolf/ice_troll in the range,
  giant_rat in marshes, cow/chicken/sheep near Eldermere farmland).
- Pathfinding hardening (world agent owns): module-level reusable scratch buffers (no
  per-call 1M allocations) and a visited-node cap (~150k; return null past it). Existing
  signature unchanged.

## Phase 7 data (defs agent)

NPCs: bear (cb 21), dire_wolf (25, aggressive), forest_spider (24, aggressive),
ruin_wraith (45, drops big_bones + grave_dust 100%), pirate (30, pickpocket lvl 45),
pirate_captain 'Captain Saltjaw' (60, hp 130, boss:true, drops wreck_chart 100% +
boarding_cutlass 10%), cinder_imp (35, aggressive), village_elder, boatman, trapper,
wayfarer (traveling merchant). Items: bear_fur, spider_silk, grave_dust (herblore-flavor
secondary, sellable), boarding_cutlass (weapon, att ~25, original flavor), wreck_chart
(quest), elder_charm (neck, small bonuses, quest reward). Shops: 'eldermere_general'
(broad basics), 'stonewatch_trapper' (snares, harpoon, fur-trade buys bear_fur/
spider_silk well), 'wayfarer' (eclectic: runes, seeds, a gem). SLAYER_TARGETS +=
forest_spider, ruin_wraith, pirate, cinder_imp.

## Round B packs (one agent each, own file only)

- packs/hub_eldermere.ts: village NPCs (village_elder, wayfarer, man x3, farm animals via
  WILD_SPAWNS — do NOT respawn those), elder Talk-to lore, wayfarer Trade, QUEST
  'The Tanglewood Toll' (elder, 'Ask-about-the-road'): kill 6 forest_spider (dead-edge
  tracking) + bring 3 spider_silk -> 900 Slayer xp + 700 Crafting xp + elder_charm + 1200
  coins.
- packs/hub_stonewatch.ts: trapper NPC + Trade -> 'stonewatch_trapper', campfire flavor,
  QUEST 'Furs for the Watch' (trapper, 'Ask-about-work'): bring 4 bear_fur + 2 wool ->
  1000 Hunter xp + 600 Crafting xp + 800 coins + 3 bird_snare.
- packs/hub_gullswreck.ts: boatman at Port Brackwater dock (~coords from world POIS +
  port docks) with 'Ferry' option -> dialogue -> teleports player to Gullswreck Cove
  (and a boatman at the cove ferries back); pirates + Captain Saltjaw mechanics (rallying
  shout: heals 8 + calls a pirate every ~12 ticks below half hp), QUEST 'Wreck of the
  Gull' (boatman, 'Ask-about-the-wreck'): defeat Saltjaw, bring wreck_chart -> 1500
  Attack xp + 1000 Fishing xp + boarding_cutlass + 2500 coins.
- packs/wildlife.ts: registerNpcSpawn for every WILD_SPAWNS entry; ruins wraith ambience
  msg hook; desert ruins QUEST 'Whispers in the Sand' (desert_nomad, 'Ask-about-ruins',
  gated on red_smile complete): kill 5 ruin_wraith + bring 3 grave_dust -> 1200 Prayer xp
  + 900 Herblore xp + 2 prayer_potion + 1500 coins.
- audio: 2 new ORIGINAL tracks at the Phase-6 composer craft bar — 'Tanglewood' (deep
  forest: dark woodwinds, harp, hush) and "Wrecker's Jig" (pirate cove: rowdy 6/8 fiddle/
  accordion, stomp percussion). trackForRegion REWRITTEN to use biomeAt(): legacy box
  first (keep ALL current behavior inside x<224&&y<224 — call the existing logic), then
  biome map: plains/savanna->Newbie Meadow, forest->Tanglewood, mountain->Rimewind,
  marsh->Boghollow, desert->Sunscorch, coast/sea->Brackwater Tide, cove
  isle->Wrecker's Jig (biome check + near gullswreck POI), volcanic->Ashfall,
  lake->Riverside.
- worldmap (round A): adaptive SCALE so canvas <= 2048px, zoom buttons (1x/2x/4x re-render),
  ImageData-based terrain blit for speed, region labels generated from world POIS export
  + legacy labels, biome tint legend.
- deploy agent: scripts/predeploy-check.mjs (FAILS if public/soundfont.sf2 or
  public/music/*.mid exist — personal-use audio must not ship; warns if server/data.db
  exists), Dockerfile (node:22-alpine multi-stage: install, vite build, run tsx server),
  docker-compose.yml, deploy/nginx.conf.sample (TLS notes + WS upgrade for /ws),
  DEPLOY.md (VPS steps: clone, npm ci, predeploy check, build, systemd unit sample OR
  docker path, reverse proxy, firewall note). VERIFY: run npm run build + NODE_ENV=production
  server boot + curl / and /api health, then kill. May add a "predeploy" script to
  package.json.

## Render perf (render agent, round A — binding budgets)

1M tiles / ~50k objects / ~250 NPCs must hold 60fps and < ~400MB:
- Object culling must NOT iterate all objects per frame: bucket static objects by 26x26
  chunk at first render; dynamic objects (fire, snare_set) tracked in a small separate
  list (detect via objects array scan diff per tick or length change; keep simple).
- Terrain chunks already lazy — verify chunk cache eviction beyond ~radius 6 chunks
  (dispose geometry) so roaming doesn't accumulate unbounded GPU memory.
- buildHeights/corner-color precompute at 1001x1001: use typed arrays only (~Float32 x4);
  water distance-field BFS once (typed arrays).
- Minimap base canvas 2000x2000 is fine; verify no per-frame full redraw.
