// Merge data/_fragments/*.json into the real data files.
//
// Fragment shape (all keys optional):
//   { "items": [...], "npcs": [...], "objects": [...], "shops": [...],
//     "npcSpawns": [...], "groundSpawns": [...],
//     "mapObjects": [{ "type": "...", "x": N, "y": N }] }
//
// Rules:
//   - items/npcs/objects/shops dedupe by id. If two sources define the same id
//     with different bodies, the FIRST wins and a loud WARN is printed.
//   - npcSpawns/groundSpawns append to data/spawns.json (exact duplicates skipped).
//   - mapObjects append to data/map.json objects after a tile check: the target
//     must not be water/wall/fence/lava terrain and must not already hold an
//     object. Occupied/blocked targets are nudged to the nearest free adjacent
//     tile (spiral out to radius 3) and the move is noted.
//   - dropRemoves [{ npc, item }] remove matching entries from the npc's drops
//     (applied BEFORE dropAdds so a remove+re-add in the same wave works).
//   - dropAdds [{ npc, item, qty:[min,max], chance }] append to the npc's
//     drops array. Unknown npc id is an ERROR (exit 1 at the end).
//   - post-merge sanity: every drop's item id must exist in items.json, and
//     every item's effects/spec payload is validated against docs/EFFECTS.md
//     (shapes, clamp ranges, family_bane family tags present on some NPC).
//
// Run: npx tsx scripts/merge-fragments.ts
// (this script does NOT delete the fragments — the integrator does that after
// reviewing the output)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAG_DIR = path.join(ROOT, 'data', '_fragments');

// Stale placeholders, skipped per docs/QUEST-DESIGN.md:
//   - resonance_stand / conductors_lectern: Q4's fragment carries the surface
//     placeholders at (23,77)/(24,77); the dungeon map already ships the real
//     placements in the Resonance Gallery at (41,288)/(42,288) (Ch4 contract:
//     "the dungeon team relocates it ... pack keys off object type only").
//   - the_dissonant: spawned per-run by server/dungeon.ts at (41,290); a
//     permanent world spawn at the surface placeholder (24,78) would be wrong.
const SKIP_MAP_OBJECTS = new Set(['resonance_stand', 'conductors_lectern']);
const SKIP_NPC_SPAWNS = new Set(['the_dissonant']);

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p: string, v: unknown) =>
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const warn = (msg: string) => console.warn(`\n!!! WARN: ${msg}\n`);

if (!fs.existsSync(FRAG_DIR)) {
  console.log('No data/_fragments directory — nothing to merge.');
  process.exit(0);
}
const fragFiles = fs.readdirSync(FRAG_DIR).filter((f) => f.endsWith('.json')).sort();
if (fragFiles.length === 0) {
  console.log('No fragment files — nothing to merge.');
  process.exit(0);
}

// ---- load targets ----
const itemsPath = path.join(ROOT, 'data', 'items.json');
const npcsPath = path.join(ROOT, 'data', 'npcs.json');
const objectsPath = path.join(ROOT, 'data', 'objects.json');
const shopsPath = path.join(ROOT, 'data', 'shops.json');
const spawnsPath = path.join(ROOT, 'data', 'spawns.json');
const mapPath = path.join(ROOT, 'data', 'map.json');

const items: Record<string, any> = readJson(itemsPath);
const npcs: Record<string, any> = readJson(npcsPath);
const objectsFile: { objs: Record<string, any> } = readJson(objectsPath);
const shops: Record<string, any> = readJson(shopsPath);
const spawns: { npcSpawns: any[]; groundSpawns: any[] } = readJson(spawnsPath);
const map: { width: number; height: number; terrain: string; objects: { type: string; x: number; y: number }[] } =
  readJson(mapPath);

// terrain + occupancy for the mapObjects tile check
const W = map.width, H = map.height;
const terrain = Buffer.from(map.terrain, 'base64');
const T_BLOCKED = new Set([1, 4, 7, 12]); // WATER, WALL, FENCE, LAVA (world.ts blocked())
const occupied = new Set<number>(map.objects.map((o) => o.y * W + o.x));
const tileFree = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H
  && !T_BLOCKED.has(terrain[y * W + x])
  && !occupied.has(y * W + x);

// ---- merge ----
const stats: Record<string, number> = { items: 0, npcs: 0, objects: 0, shops: 0, npcSpawns: 0, groundSpawns: 0, mapObjects: 0, dropAdds: 0, dropRemoves: 0 };
let collisions = 0, skippedDupes = 0;
let errors = 0;
const error = (msg: string) => { errors++; console.error(`\n!!! ERROR: ${msg}\n`); };

function mergeDefs(kind: string, target: Record<string, any>, list: any[] | undefined, src: string, transform?: (e: any) => any) {
  for (const entry of list ?? []) {
    const id = entry.id;
    if (!id) { warn(`${src}: ${kind} entry without id: ${JSON.stringify(entry).slice(0, 80)}`); continue; }
    const body = transform ? transform(entry) : entry;
    if (id in target) {
      if (JSON.stringify(target[id]) === JSON.stringify(body)) { skippedDupes++; continue; }
      collisions++;
      warn(`${kind} id COLLISION '${id}' (${src}) differs from the already-merged body — keeping the first, dropping this one.`);
      continue;
    }
    target[id] = body;
    stats[kind]++;
  }
}

for (const f of fragFiles) {
  const src = `_fragments/${f}`;
  const frag = readJson(path.join(FRAG_DIR, f));

  mergeDefs('items', items, frag.items, src);
  mergeDefs('npcs', npcs, frag.npcs, src);
  mergeDefs('objects', objectsFile.objs, frag.objects, src);
  // shops.json values are { name, stock } keyed by id — strip the id field
  mergeDefs('shops', shops, frag.shops, src, ({ id: _id, ...rest }) => rest);

  for (const s of frag.npcSpawns ?? []) {
    if (SKIP_NPC_SPAWNS.has(s.id)) {
      console.log(`  note: skipped npcSpawn '${s.id}' @ (${s.x},${s.y}) from ${src} — server/dungeon.ts owns this spawn (QUEST-DESIGN Ch4).`);
      continue;
    }
    if (spawns.npcSpawns.some((e) => e.id === s.id && e.x === s.x && e.y === s.y)) { skippedDupes++; continue; }
    spawns.npcSpawns.push(s);
    stats.npcSpawns++;
  }
  for (const s of frag.groundSpawns ?? []) {
    if (spawns.groundSpawns.some((e) => e.item === s.item && e.x === s.x && e.y === s.y)) { skippedDupes++; continue; }
    spawns.groundSpawns.push(s);
    stats.groundSpawns++;
  }

  for (const o of frag.mapObjects ?? []) {
    if (SKIP_MAP_OBJECTS.has(o.type)) {
      console.log(`  note: skipped mapObject '${o.type}' @ (${o.x},${o.y}) from ${src} — already placed in the Resonance Gallery (QUEST-DESIGN Ch4).`);
      continue;
    }
    let { x, y } = o;
    if (!tileFree(x, y)) {
      // spiral out to the nearest free tile (radius 1..3, nearest ring first)
      let found = false;
      outer: for (let r = 1; r <= 3 && !found; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (tileFree(o.x + dx, o.y + dy)) { x = o.x + dx; y = o.y + dy; found = true; break outer; }
          }
        }
      }
      if (!found) {
        warn(`mapObject '${o.type}' @ (${o.x},${o.y}) from ${src}: tile blocked and no free tile within radius 3 — DROPPED.`);
        continue;
      }
      console.log(`  note: mapObject '${o.type}' (${src}) nudged (${o.x},${o.y}) -> (${x},${y}) (target tile blocked/occupied).`);
    }
    map.objects.push({ ...o, x, y });
    occupied.add(y * W + x);
    stats.mapObjects++;
  }
}

// ---- drops: removes FIRST (against pre-add state), then adds ----
// A dropRemove is meant to retire an EXISTING drop (e.g. ice_queen's old
// rimeglass_blade rate) — applying removes first lets the same wave re-add the
// item at a new rate without the remove eating the new entry.
const frags = fragFiles.map((f) => ({ src: `_fragments/${f}`, frag: readJson(path.join(FRAG_DIR, f)) }));

for (const { src, frag } of frags) {
  for (const r of frag.dropRemoves ?? []) {
    const npc = npcs[r.npc];
    if (!npc) { error(`${src}: dropRemoves references unknown npc '${r.npc}'`); continue; }
    const drops: any[] = npc.drops ?? [];
    const before = drops.length;
    npc.drops = drops.filter((d) => d.item !== r.item);
    const removed = before - npc.drops.length;
    if (removed === 0) {
      warn(`${src}: dropRemoves { ${r.npc}, ${r.item} } matched nothing.`);
    } else {
      stats.dropRemoves += removed;
      console.log(`  drop removed: ${r.npc} -x ${r.item} (${removed}) [${src}]`);
    }
  }
}
for (const { src, frag } of frags) {
  for (const a of frag.dropAdds ?? []) {
    const npc = npcs[a.npc];
    if (!npc) { error(`${src}: dropAdds references unknown npc '${a.npc}'`); continue; }
    if (!a.item || !Array.isArray(a.qty) || a.qty.length !== 2 || typeof a.chance !== 'number' || a.chance <= 0 || a.chance > 1) {
      error(`${src}: malformed dropAdd ${JSON.stringify(a)}`); continue;
    }
    npc.drops = npc.drops ?? [];
    if (npc.drops.some((d: any) => d.item === a.item && d.qty?.[0] === a.qty[0] && d.qty?.[1] === a.qty[1] && d.chance === a.chance)) {
      skippedDupes++; continue;
    }
    if (npc.drops.some((d: any) => d.item === a.item)) {
      warn(`dropAdd ${a.npc} -> ${a.item} (${src}): npc already drops this item at a different rate — appending anyway, review.`);
    }
    npc.drops.push({ item: a.item, qty: a.qty, chance: a.chance });
    stats.dropAdds++;
  }
}

// ---- post-merge sanity ----
// 1. every drop item id exists
for (const [nid, npc] of Object.entries(npcs)) {
  for (const d of npc.drops ?? []) {
    if (!(d.item in items)) error(`npc '${nid}' drops unknown item '${d.item}'`);
  }
}

// 2. effects/spec shapes per docs/EFFECTS.md
const FAMILIES = new Set(Object.values(npcs).map((n: any) => n.family).filter(Boolean));
const DOT_KINDS = new Set(['poison', 'burn', 'bleed']);
const SPEC_KINDS = new Set(['double_hit', 'heavy_hit', 'aoe_adjacent', 'stun', 'drain_def', 'warcry_aoe_debuff', 'guaranteed_dot']);
const inRange = (v: any, lo: number, hi: number) => typeof v === 'number' && v >= lo && v <= hi;

function checkEffect(owner: string, e: any, ctx = 'effects') {
  const bad = (why: string) => error(`item '${owner}' ${ctx}: ${why} — ${JSON.stringify(e)}`);
  if (!e || typeof e !== 'object') return bad('not an object');
  if (DOT_KINDS.has(e.type)) {
    if (ctx === 'effects' && !inRange(e.chance, 0, 1)) bad('chance must be 0..1');
    if (!inRange(e.dmg, 1, 10)) bad('dmg must be 1..10');
    if (!inRange(e.hits, 1, 20)) bad('hits must be 1..20');
    if (!inRange(e.every, 1, 20)) bad('every must be 1..20');
    if (e.maxStacks !== undefined && !inRange(e.maxStacks, 1, 99)) bad('maxStacks must be >=1');
  } else if (e.type === 'freeze') {
    if (!inRange(e.chance, 0, 1)) bad('chance must be 0..1');
    if (!inRange(e.holdTicks, 1, 16)) bad('holdTicks must be 1..16');
  } else if (e.type === 'lifesteal') {
    if (!inRange(e.pct, 0, 1)) bad('pct must be 0..1');
  } else if (e.type === 'family_bane') {
    if (!FAMILIES.has(e.family)) bad(`family '${e.family}' is not tagged on any npc`);
    if (e.accMult !== undefined && !inRange(e.accMult, 0.1, 5)) bad('accMult out of range');
    if (e.dmgMult !== undefined && !inRange(e.dmgMult, 0.1, 5)) bad('dmgMult out of range');
  } else {
    bad(`unknown effect type '${e.type}'`);
  }
}

for (const [iid, item] of Object.entries(items)) {
  if (item.effects !== undefined) {
    if (!Array.isArray(item.effects)) { error(`item '${iid}': effects is not an array`); }
    else for (const e of item.effects) checkEffect(iid, e);
  }
  const s = item.spec;
  if (s !== undefined) {
    const bad = (why: string) => error(`item '${iid}' spec: ${why}`);
    if (!s || typeof s !== 'object') { bad('not an object'); continue; }
    if (typeof s.name !== 'string' || !s.name) bad('missing name');
    if (!inRange(s.energy, 25, 100)) bad('energy must be 25..100');
    if (typeof s.desc !== 'string' || !s.desc) bad('missing desc');
    if (!SPEC_KINDS.has(s.kind)) { bad(`unknown kind '${s.kind}'`); continue; }
    const p = s.params ?? {};
    if (s.kind === 'heavy_hit' && p.accMult !== undefined && !inRange(p.accMult, 0.25, 3)) bad('heavy_hit accMult must be 0.25..3');
    if (s.kind === 'heavy_hit' && p.dmgMult !== undefined && !inRange(p.dmgMult, 0, 3)) bad('heavy_hit dmgMult must be 0..3');
    if (s.kind === 'aoe_adjacent' && p.radius !== undefined && !inRange(p.radius, 1, 3)) bad('aoe radius must be 1..3');
    if (s.kind === 'stun' && p.holdTicks !== undefined && !inRange(p.holdTicks, 1, 8)) bad('stun holdTicks must be 1..8');
    if (s.kind === 'drain_def' && p.amount !== undefined && !inRange(p.amount, 1, 30)) bad('drain_def amount must be 1..30');
    if (s.kind === 'warcry_aoe_debuff') {
      if (p.radius !== undefined && !inRange(p.radius, 1, 5)) bad('warcry radius must be 1..5');
      if (p.atkMult !== undefined && !inRange(p.atkMult, 0.25, 1)) bad('warcry atkMult must be 0.25..1');
      if (p.ticks !== undefined && !inRange(p.ticks, 1, 50)) bad('warcry ticks must be 1..50');
    }
    if (s.kind === 'guaranteed_dot') {
      if (!p.dot || !DOT_KINDS.has(p.dot.type)) bad('guaranteed_dot needs params.dot with a DoT type');
      else checkEffect(iid, p.dot, 'spec.params.dot');
    }
  }
}

// ---- write ----
if (errors > 0) {
  console.error(`\n${errors} ERROR(S) — NOT writing data files. Fix the fragments and re-run.`);
  process.exit(1);
}
writeJson(itemsPath, items);
writeJson(npcsPath, npcs);
writeJson(objectsPath, objectsFile);
writeJson(shopsPath, shops);
writeJson(spawnsPath, spawns);
writeJson(mapPath, map);

console.log(`\nMerged ${fragFiles.length} fragment file(s):`);
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: +${v}`);
console.log(`  identical duplicates skipped: ${skippedDupes}`);
console.log(`  collisions (first kept): ${collisions}`);
