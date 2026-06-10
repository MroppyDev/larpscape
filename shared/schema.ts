// Zod schemas for the data/*.json content catalog. Used by the admin app's
// editors (form validation) and by scripts/validate-content.ts (predeploy gate).
import { z } from 'zod';

export const SKILL_NAMES = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing', 'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Gun',
] as const;

export const EQUIP_SLOTS = ['head', 'body', 'legs', 'weapon', 'shield', 'gloves', 'boots', 'ammo', 'neck', 'ring'] as const;

export const TERRAIN_NAMES = [
  'GRASS', 'WATER', 'PATH', 'FLOOR', 'WALL', 'BRIDGE', 'SWAMP', 'FENCE', 'SAND',
  'DIRT', 'FLOWERS', 'CAVE', 'LAVA', 'ROCK', 'SNOW', 'ICE', 'DSAND',
] as const;

const id = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, 'snake_case id');
const qtyRange = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
const itemQty = z.object({ item: id, qty: z.number().int().positive() });

export const ItemDefSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  examine: z.string().min(1).max(200),
  stackable: z.boolean().optional(),
  value: z.number().int().min(0),
  equipSlot: z.enum(EQUIP_SLOTS).optional(),
  attBonus: z.number().optional(),
  strBonus: z.number().optional(),
  defBonus: z.number().optional(),
  rangedBonus: z.number().optional(),
  gunBonus: z.number().optional(),
  attackSpeed: z.number().int().positive().optional(),
  levelReq: z.array(z.object({ skill: z.enum(SKILL_NAMES), level: z.number().int().min(1).max(99) })).optional(),
  edible: z.object({ heals: z.number().positive() }).optional(),
  buryXp: z.number().positive().optional(),
  restoresPrayer: z.number().positive().optional(),
});

export const NpcDefSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  examine: z.string().min(1).max(200),
  combatLevel: z.number().int().min(0),
  hitpoints: z.number().int().min(1),
  attack: z.number().int().min(1),
  strength: z.number().int().min(1),
  defence: z.number().int().min(1),
  attackSpeed: z.number().int().positive(),
  aggressive: z.boolean().optional(),
  boss: z.boolean().optional(),
  pickpocket: z.object({
    level: z.number().int().min(1).max(99),
    xp: z.number().positive(),
    loot: z.array(z.object({ item: id, qty: qtyRange })),
    stunDmg: z.number().int().min(0),
  }).optional(),
  option: z.string().optional(),
  respawnTicks: z.number().int().positive(),
  drops: z.array(z.object({ item: id, qty: qtyRange, chance: z.number().min(0).max(1) })),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().positive(),
  attackable: z.boolean(),
});

export const ObjDefSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  examine: z.string().min(1).max(200),
  action: z.string().optional(),
  blocks: z.boolean(),
});

export const SkillObjSchema = z.object({
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  item: id,
  depleteChance: z.number().min(0).max(1),
  respawn: z.number().int().min(0),
  lowRate: z.number().min(0).max(1),
  highRate: z.number().min(0).max(1),
});

export const RecipesSchema = z.object({
  cookables: z.array(z.object({ raw: id, cooked: id, burnt: id, level: z.number().int().min(1).max(99), xp: z.number().positive(), stopBurn: z.number().int() })),
  smeltables: z.array(z.object({ bar: id, level: z.number().int().min(1).max(99), xp: z.number().positive(), inputs: z.array(itemQty), successChance: z.number().min(0).max(1).optional() })),
  smithables: z.array(z.object({ output: id, outputQty: z.number().int().positive().optional(), bar: id, bars: z.number().int().positive(), level: z.number().int().min(1).max(99), xp: z.number().positive() })),
  fletchables: z.array(z.object({ output: id, outputQty: z.number().int().positive().optional(), level: z.number().int().min(1).max(99), xp: z.number().positive(), inputs: z.array(itemQty) })),
  craftables: z.array(z.object({ output: id, level: z.number().int().min(1).max(99), xp: z.number().positive(), inputs: z.array(itemQty), station: z.enum(['spinning_wheel']).nullable().optional() })),
  gemCuts: z.array(z.object({ uncut: id, cut: id, level: z.number().int().min(1).max(99), xp: z.number().positive() })),
  herbs: z.array(z.object({ grimy: id, clean: id, level: z.number().int().min(1).max(99), xp: z.number().positive() })),
  potions: z.array(z.object({ output: id, level: z.number().int().min(1).max(99), xp: z.number().positive(), herb: id, secondary: id })),
  seeds: z.array(z.object({ seed: id, produce: id, level: z.number().int().min(1).max(99), plantXp: z.number().positive(), harvestXp: z.number().positive(), growTicks: z.number().int().positive() })),
  constructionBuilds: z.array(z.object({ name: z.string().min(1), level: z.number().int().min(1).max(99), xp: z.number().positive(), planks: z.number().int().positive(), nails: z.number().int().min(0) })),
});

export const ShopsSchema = z.record(z.string(), z.object({
  name: z.string().min(1).max(60),
  stock: z.array(itemQty),
}));

export const MagicSchema = z.object({
  spells: z.array(z.object({ id, name: z.string().min(1), level: z.number().int().min(1).max(99), xp: z.number().positive(), maxHit: z.number().int().min(0), runes: z.array(itemQty) })),
  prayers: z.array(z.object({ id, name: z.string().min(1), level: z.number().int().min(1).max(99), drain: z.number().positive(), boost: z.enum(['defence', 'strength', 'attack']), mult: z.number().min(1) })),
  slayerTargets: z.array(z.object({ npc: id, level: z.number().int().min(1).max(99) })),
});

export const MapSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  terrain: z.string().min(1), // base64 Uint8Array, width*height bytes
  objects: z.array(z.object({ type: id, x: z.number().int().min(0), y: z.number().int().min(0) })),
});

export const SpawnsSchema = z.object({
  npcSpawns: z.array(z.object({ id, x: z.number().int().min(0), y: z.number().int().min(0) })),
  groundSpawns: z.array(z.object({ item: id, x: z.number().int().min(0), y: z.number().int().min(0), respawnTicks: z.number().int().positive() })),
});

export const ItemsFileSchema = z.record(z.string(), ItemDefSchema);
export const NpcsFileSchema = z.record(z.string(), NpcDefSchema);
export const ObjectsFileSchema = z.object({
  objs: z.record(z.string(), ObjDefSchema),
  skillObjs: z.record(z.string(), SkillObjSchema),
});

export const FILE_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'items.json': ItemsFileSchema,
  'npcs.json': NpcsFileSchema,
  'objects.json': ObjectsFileSchema,
  'recipes.json': RecipesSchema,
  'shops.json': ShopsSchema,
  'magic.json': MagicSchema,
  'map.json': MapSchema,
  'spawns.json': SpawnsSchema,
};
