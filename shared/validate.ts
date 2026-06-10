// Content validation: zod schema conformance plus cross-reference checks.
// Used by scripts/validate-content.ts (CLI/predeploy) and the admin server.
import fs from 'fs';
import path from 'path';
import { FILE_SCHEMAS } from './schema';

export function validateContent(dataDir: string): string[] {
  const errors: string[] = [];
  const files: Record<string, any> = {};

  for (const name of Object.keys(FILE_SCHEMAS)) {
    try {
      files[name] = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
    } catch (e: any) {
      errors.push(`${name}: cannot read/parse — ${e.message}`);
      continue;
    }
    const res = FILE_SCHEMAS[name].safeParse(files[name]);
    if (!res.success) {
      for (const issue of res.error.issues.slice(0, 20)) {
        errors.push(`${name}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }
  if (errors.length > 0) return errors;

  const items = new Set(Object.keys(files['items.json']));
  const npcs = new Set(Object.keys(files['npcs.json']));
  const objs = new Set(Object.keys(files['objects.json'].objs));
  const itemRef = (where: string, id: string) => { if (!items.has(id)) errors.push(`${where}: unknown item '${id}'`); };
  const npcRef = (where: string, id: string) => { if (!npcs.has(id)) errors.push(`${where}: unknown npc '${id}'`); };
  const objRef = (where: string, id: string) => { if (!objs.has(id)) errors.push(`${where}: unknown object '${id}'`); };

  for (const [k, v] of Object.entries<any>(files['items.json'])) if (v.id !== k) errors.push(`items.json: key '${k}' != id '${v.id}'`);
  for (const [k, v] of Object.entries<any>(files['npcs.json'])) if (v.id !== k) errors.push(`npcs.json: key '${k}' != id '${v.id}'`);
  for (const [k, v] of Object.entries<any>(files['objects.json'].objs)) if (v.id !== k) errors.push(`objects.json: key '${k}' != id '${v.id}'`);

  for (const [nid, n] of Object.entries<any>(files['npcs.json'])) {
    for (const d of n.drops) itemRef(`npcs.json ${nid} drops`, d.item);
    if (n.pickpocket) for (const l of n.pickpocket.loot) itemRef(`npcs.json ${nid} pickpocket`, l.item);
  }
  for (const [oid, so] of Object.entries<any>(files['objects.json'].skillObjs)) {
    objRef(`objects.json skillObjs key`, oid);
    itemRef(`objects.json skillObjs ${oid}`, so.item);
  }
  const r = files['recipes.json'];
  for (const c of r.cookables) { itemRef('recipes cookables', c.raw); itemRef('recipes cookables', c.cooked); itemRef('recipes cookables', c.burnt); }
  for (const s of r.smeltables) { itemRef('recipes smeltables', s.bar); for (const i of s.inputs) itemRef('recipes smeltables', i.item); }
  for (const s of r.smithables) { itemRef('recipes smithables', s.output); itemRef('recipes smithables', s.bar); }
  for (const f of r.fletchables) { itemRef('recipes fletchables', f.output); for (const i of f.inputs) itemRef('recipes fletchables', i.item); }
  for (const c of r.craftables) { itemRef('recipes craftables', c.output); for (const i of c.inputs) itemRef('recipes craftables', i.item); }
  for (const g of r.gemCuts) { itemRef('recipes gemCuts', g.uncut); itemRef('recipes gemCuts', g.cut); }
  for (const h of r.herbs) { itemRef('recipes herbs', h.grimy); itemRef('recipes herbs', h.clean); }
  for (const p of r.potions) { itemRef('recipes potions', p.output); itemRef('recipes potions', p.herb); itemRef('recipes potions', p.secondary); }
  for (const s of r.seeds) { itemRef('recipes seeds', s.seed); itemRef('recipes seeds', s.produce); }
  for (const [sid, shop] of Object.entries<any>(files['shops.json'])) {
    for (const st of shop.stock) itemRef(`shops.json ${sid}`, st.item);
  }
  if (!files['shops.json'].general) errors.push(`shops.json: required shop 'general' is missing (SHOP_STOCK alias)`);
  const m = files['magic.json'];
  for (const s of m.spells) for (const ru of s.runes) itemRef(`magic spells ${s.id}`, ru.item);
  for (const t of m.slayerTargets) npcRef('magic slayerTargets', t.npc);

  const map = files['map.json'];
  const bytes = Buffer.from(map.terrain, 'base64');
  if (bytes.length !== map.width * map.height) errors.push(`map.json: terrain is ${bytes.length} bytes, expected ${map.width * map.height}`);
  for (const b of bytes) if (b > 16) { errors.push('map.json: terrain contains invalid tile code > 16'); break; }
  const seen = new Set<number>();
  for (const o of map.objects) {
    objRef('map.json objects', o.type);
    if (o.x >= map.width || o.y >= map.height) errors.push(`map.json: object ${o.type} out of bounds at ${o.x},${o.y}`);
    const k = o.y * map.width + o.x;
    if (seen.has(k)) errors.push(`map.json: two objects share tile ${o.x},${o.y}`);
    seen.add(k);
  }

  const sp = files['spawns.json'];
  for (const s of sp.npcSpawns) {
    npcRef('spawns.json npcSpawns', s.id);
    if (s.x >= map.width || s.y >= map.height) errors.push(`spawns.json: npc spawn ${s.id} out of bounds`);
  }
  for (const s of sp.groundSpawns) {
    itemRef('spawns.json groundSpawns', s.item);
    if (s.x >= map.width || s.y >= map.height) errors.push(`spawns.json: ground spawn ${s.item} out of bounds`);
  }
  return errors;
}
