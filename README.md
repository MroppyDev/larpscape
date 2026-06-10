# Larpscape

## Multiplayer

Run `npm run server` (port 8080) alongside `npm run dev`, or for production:
`npm run build && npm start` (serves the built client and the API together — put a
reverse proxy with TLS in front on a VPS; see [server/README.md](server/README.md)).
Accounts are username/password (bcrypt) with characters saved in SQLite; logged-in
players see each other in the world with name labels and overhead chat, and trade
through the Grand Exchange in the Aldgate plaza (order book with partial fills,
escrowed collection, last-price lookups). "Play offline" keeps the old
localStorage-only mode. v1 is client-authoritative: the server runs accounts,
saves, presence, chat, and the GE honestly, but trusts clients about gameplay.

**Before hosting publicly:** do not ship personal `.mid` files in `public/music/` —
those are local-only uploads and must not be distributed.

## Content (Phase 5)

The map is 168×168: the walled city of Aldgate (GE plaza, bank, armoury and food
shops, guards, inn), a goblin warlord's fort, the deep bog, and an underground
cavern with lava, mithril and adamantite rocks. Three bosses with mechanics —
Goblin Warlord (telegraphed slam), Bog Horror (poison spit, self-heal), Shadow
Drake (fire breath, blunted by active prayers) — plus mithril and adamant gear
tiers through the full mine→smelt→smith→fletch chain, four new quests, and a
six-step tutorial checklist for fresh accounts.

## Custom MIDI music

Drop personal `.mid` files into `public/music/` and list them in
`public/music/manifest.json` as `[{"name": "My Track", "file": "mytrack.mid"}]` —
they appear in the Music tab and play through the soundfont. Personal use only.

A fan-made, reduced-scope homage to Old School RuneScape that runs entirely in the browser.
**All assets are original** — sprites, icons, UI art, and music are procedurally generated or
composed for this project. Not affiliated with Jagex. Mechanics and formulas follow the
publicly documented classic game systems.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click play.

## What's faithful

- **600ms game ticks** — all movement, skilling, and combat run on the classic tick cycle
- **The real XP curve** — levels 1–99 using the classic cumulative experience formula
- **Classic fixed-mode layout** — game viewport, minimap with compass and HP/run orbs,
  sidebar tab panels, and a chatbox with game/level-up message colours
- **Right-click context menus** — "Chop down Tree", "Attack Goblin (level-2)", "Walk here",
  "Examine", with the hover action text in the top-left of the viewport
- **28-slot inventory**, two-handed equipment slots with attack/strength/defence bonuses
- **XP drops, hitsplats, health bars, level-up jingle + chat messages**
- **Combat styles** — Accurate/Aggressive/Defensive training Attack/Strength/Defence,
  4 XP per damage plus 1.33 Hitpoints XP, accuracy/max-hit rolls in the classic style
- **Skilling numbers from the wiki** — trees 25xp, oaks 37.5xp at level 15, copper/tin 17.5xp,
  iron 35xp at 15, shrimps 10xp, anchovies 40xp at 15, cooking 30xp with burn rates that
  stop at the right levels, logs 40xp / oak 60xp firemaking, bones 4.5 Prayer xp

## The world

A Lumbridge-inspired starting area: a castle with bank booths and a cooking range, a river
with a bridge, goblins to the east, a fenced cow field and chicken farm to the north, a
general store, net fishing spots on the riverbank, and a swamp mine to the south with
copper, tin, and iron rocks.

## Trainable skills — all 23

Melee (Attack/Strength/Defence/Hitpoints with bronze→iron→steel gear), Ranged (shortbows +
arrows, projectiles), Magic (four strike spells with rune costs and autocast), Prayer
(bury bones, activatable prayers with point drain, altar recharge), Woodcutting (tree/oak/
willow), Firemaking, Mining (copper/tin/iron/coal/rune essence), Smithing (furnace smelting
+ anvil make-X menus), Fishing (net + rod/bait), Cooking (make-X with burn rates),
Fletching (knife-on-logs through arrow assembly), Crafting (shear sheep, spin wool/flax,
tan hides, leather work), Herblore (clean herbs, mix potions), Runecraft (essence → air
runes at the stone circle), Agility (4-obstacle course with lap bonus), Thieving
(pickpocketing + bake stall), Farming (rake/plant/grow/harvest patches), Hunter (bird
snares), Slayer (tasks from the slayer master), and Construction (workbench builds with
planks from the carpenter).

## Quests, dialogue, and persistence

Two quests with full dialogue trees and a journal ("The Empty Larder", "Seeds of
Trouble"), NPC Talk-to dialogue throughout, three shops (general, magic, gardener),
aggressive goblins and rats, an item "Use" system (item-on-item and item-on-object),
and autosaving to localStorage with name entry on the welcome screen.

## 3D renderer

The world renders in low-poly 3D (three.js): vertex-colored gouraud-shaded terrain with
height noise, extruded walls, distance fog, articulated character models that show your
equipment, and a classic orbit camera — middle-mouse drag or arrow keys to rotate/pitch,
scroll to zoom, click the compass to face north. The minimap rotates with the camera.

## Music

Sixteen original compositions play through a SoundFont synthesizer (spessasynth_lib) using
the bundled OSRS-style GM soundfont at `public/soundfont.sf2` (~32 MB, shipped with the
game). While the font is downloading or if it fails to load, the engine falls back to the
built-in oscillator synth so music always plays. Tracks unlock as you
explore regions (Newbie Meadow, Riverside, Goblin Strut, Boghollow, Stonecourt) and the
music switches automatically as you cross region boundaries. Manage playback from the
music tab.

## Controls

- **Left click** — default action (walk, chop, mine, attack, take…)
- **Right click** — full context menu
- **Minimap click** — walk to location
- **Run orb** — toggle run (drains energy at 2 tiles/tick)
- **Inventory left click** — context-sensitive (eat, wield, bury, light, cook)
- **Inventory right click** — full item menu including Drop and Examine
- **Bank** — click items to deposit/withdraw one, right-click for all
