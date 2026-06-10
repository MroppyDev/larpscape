// Core definitions: skills, XP curve, and typed views over the JSON content
// catalog in data/ (items, NPCs, world objects, recipes, magic, shops...).
// The data files are the editable source of truth (managed by the admin app);
// this module loads them and provides the typed interfaces the game uses.
// Mechanics and numbers follow the classic publicly documented formulas;
// all text/art here is original.

import itemsJson from '../data/items.json';
import npcsJson from '../data/npcs.json';
import objectsJson from '../data/objects.json';
import recipesJson from '../data/recipes.json';
import shopsJson from '../data/shops.json';
import magicJson from '../data/magic.json';

export const SKILLS = [
  'Attack', 'Hitpoints', 'Mining',
  'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing',
  'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking',
  'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming',
  'Construction', 'Hunter',
] as const;
export type SkillName = (typeof SKILLS)[number];

// Skills the player can actually train in this build (all of them, as of v2).
export const TRAINABLE = new Set<SkillName>(SKILLS);

// Classic experience table: cumulative XP required for each level 1..99.
export const XP_TABLE: number[] = (() => {
  const t = [0, 0]; // index by level; level 1 = 0 xp
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 99; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) { lvl = i; break; }
  }
  return Math.min(99, lvl);
}

// ---------------- Equipment ----------------
export type EquipSlot = 'head' | 'body' | 'legs' | 'weapon' | 'shield' | 'gloves' | 'boots' | 'ammo' | 'neck' | 'ring';

// ---------------- Items ----------------
export interface ItemDef {
  id: string;
  name: string;
  examine: string;
  stackable?: boolean;
  value: number;            // base shop value in coins
  equipSlot?: EquipSlot;
  attBonus?: number;
  strBonus?: number;
  defBonus?: number;
  rangedBonus?: number;
  attackSpeed?: number;     // in ticks, for weapons
  levelReq?: { skill: SkillName; level: number }[];
  edible?: { heals: number };
  buryXp?: number;          // prayer xp when buried
  restoresPrayer?: number;  // prayer points restored when drunk (content wires drinking)
}

export const ITEMS: Record<string, ItemDef> = itemsJson as unknown as Record<string, ItemDef>;

// ---------------- Cooking ----------------
export interface CookDef { raw: string; cooked: string; burnt: string; level: number; xp: number; stopBurn: number; }
export const COOKABLES: CookDef[] = recipesJson.cookables as CookDef[];

// ---------------- NPCs ----------------
export interface NpcDef {
  id: string;
  name: string;
  examine: string;
  combatLevel: number;
  hitpoints: number;
  attack: number; strength: number; defence: number;
  attackSpeed: number;        // in ticks
  aggressive?: boolean;
  boss?: boolean;             // render shows a big top-of-screen HP bar
  pickpocket?: { level: number; xp: number; loot: { item: string; qty: [number, number] }[]; stunDmg: number };
  option?: string;            // extra context-menu verb, e.g. 'Shear'
  respawnTicks: number;
  drops: { item: string; qty: [number, number]; chance: number }[]; // chance 0..1
  color: string;              // sprite tint
  size: number;               // render scale
  attackable: boolean;
}

export const NPCS: Record<string, NpcDef> = npcsJson as unknown as Record<string, NpcDef>;

// ---------------- World objects ----------------
export interface ObjDef {
  id: string;
  name: string;
  examine: string;
  action?: string;            // context-menu verb, e.g. 'Chop down'
  blocks: boolean;
}
export const OBJS: Record<string, ObjDef> = objectsJson.objs as unknown as Record<string, ObjDef>;

export interface SkillObjData { level: number; xp: number; item: string; depleteChance: number; respawn: number; lowRate: number; highRate: number; }
// success rate: chance per tick interpolated between lowRate (level req) and highRate (level 99)
export const SKILL_OBJS: Record<string, SkillObjData> = objectsJson.skillObjs as unknown as Record<string, SkillObjData>;

// ---------------- Smithing ----------------
export const SMELTABLES: { bar: string; level: number; xp: number; inputs: { item: string; qty: number }[]; successChance?: number }[] =
  recipesJson.smeltables as any;

// xp is per-bar faithful: bronze 12.5/bar, iron 25/bar, steel 37.5/bar.
export const SMITHABLES: { output: string; outputQty?: number; bar: string; bars: number; level: number; xp: number }[] =
  recipesJson.smithables as any;

// ---------------- Fletching ----------------
export const FLETCHABLES: { output: string; outputQty?: number; level: number; xp: number; inputs: { item: string; qty: number }[] }[] =
  recipesJson.fletchables as any;

// ---------------- Crafting ----------------
export const CRAFTABLES: { output: string; level: number; xp: number; inputs: { item: string; qty: number }[]; station?: 'spinning_wheel' | null }[] =
  recipesJson.craftables as any;

// Gem cutting: 'Cut' item action with a chisel in inventory (content wires the action).
export const GEM_CUTS: { uncut: string; cut: string; level: number; xp: number }[] =
  recipesJson.gemCuts as any;

// ---------------- Herblore ----------------
export const HERBS: { grimy: string; clean: string; level: number; xp: number }[] =
  recipesJson.herbs as any;

export const POTIONS: { output: string; level: number; xp: number; herb: string; secondary: string }[] =
  recipesJson.potions as any;

// ---------------- Magic ----------------
export const SPELLS: { id: string; name: string; level: number; xp: number; maxHit: number; runes: { item: string; qty: number }[] }[] =
  magicJson.spells as any;

// ---------------- Prayer ----------------
// drain: prayer points drained per ~12 ticks while active.
export const PRAYERS: { id: string; name: string; level: number; drain: number; boost: 'defence' | 'strength' | 'attack'; mult: number }[] =
  magicJson.prayers as any;

// ---------------- Farming ----------------
export const SEEDS: { seed: string; produce: string; level: number; plantXp: number; harvestXp: number; growTicks: number }[] =
  recipesJson.seeds as any;

// ---------------- Shops ----------------
export const SHOPS: Record<string, { name: string; stock: { item: string; qty: number }[] }> =
  shopsJson as unknown as Record<string, { name: string; stock: { item: string; qty: number }[] }>;

// Legacy alias kept for older importers.
export const SHOP_STOCK = SHOPS.general.stock;

// ---------------- Slayer ----------------
export const SLAYER_TARGETS: { npc: string; level: number }[] = magicJson.slayerTargets as any;

// ---------------- Construction ----------------
export const CONSTRUCTION_BUILDS: { name: string; level: number; xp: number; planks: number; nails: number }[] =
  recipesJson.constructionBuilds as any;

export const TICK_MS = 600;
