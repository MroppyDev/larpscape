// Core game state + 600ms tick simulation: movement, combat, NPCs, registries.
// Skill content lives in content.ts/quests.ts and plugs in via the registries below.

import {
  SKILLS, SkillName, levelForXp, XP_TABLE, ITEMS, NPCS, NpcDef,
  TICK_MS, EquipSlot, SPELLS, PRAYERS, type SpecDef,
} from './defs';
import {
  buildWorld, blocked, findPath, objects, objectAt, removeObject,
  WorldObject, GroundItem, key, MAP_W, MAP_H,
} from './world';
import { audio, trackForRegion, TRACKS } from './audio';

export interface ItemStack { id: string; qty: number; }

// Client-side mirror of a server NPC. The server owns position/hp/death;
// this object exists so render.ts/ui.ts can keep working unchanged.
export interface Npc {
  sid: number;               // server NPC id
  def: NpcDef;
  x: number; y: number;
  prevX: number; prevY: number;
  spawnX: number; spawnY: number;
  hp: number;
  dead: boolean;
  respawnAt: number;
  target: 'player' | null;   // 'player' = targeting ME (drives attack anims)
  attackCooldown: number;
  wanderCooldown: number;
  // kind colors the splat: 'hit' (default red/blue), 'poison' green, 'burn'
  // orange, 'bleed' dark red, 'spec' gold — see docs/EFFECTS.md
  hitsplat: { dmg: number; until: number; kind?: string } | null;
  lastDamagedAt: number;
  updatedAt?: number; // performance.now() when the server last moved this NPC — drives interpolation
  meta: Record<string, any>;
}

export type CombatStyle = 'accurate' | 'aggressive' | 'defensive';

// Generic interaction handler: called once per tick while adjacent; return 'done' to stop.
export type InteractResult = 'done' | 'continue';
export type ObjectHandler = (o: WorldObject) => InteractResult;
export type NpcHandler = (n: Npc) => InteractResult;

export interface PendingAction {
  type: 'attack' | 'attack-player' | 'pickup' | 'interact-obj' | 'interact-npc';
  obj?: WorldObject;
  npc?: Npc;
  playerName?: string;
  ground?: GroundItem;
  handler?: ObjectHandler | NpcHandler;
  onTop?: boolean; // action requires standing on the tile (non-blocking objects)
}

export interface Projectile { fromX: number; fromY: number; toX: number; toY: number; startMs: number; durMs: number; kind: 'arrow' | 'bullet' | 'spell'; }

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'body', 'legs', 'weapon', 'shield', 'gloves', 'boots', 'ammo', 'neck', 'ring'];

export interface Player {
  name: string;
  x: number; y: number;
  prevX: number; prevY: number;
  path: { x: number; y: number }[];
  run: boolean;
  energy: number;
  specEnergy: number;   // special attack energy 0..100 (persisted)
  specArmed: boolean;   // next eligible swing consumes the spec (not persisted)
  xp: number[];
  curHp: number;
  prayerPoints: number;
  activePrayers: Set<string>;
  inventory: (ItemStack | null)[];
  equipment: Record<EquipSlot, ItemStack | null>;
  bank: ItemStack[];
  quests: Record<string, number>;
  // first-time obtains of collection-worthy items: itemId -> tick first obtained
  collectionLog: Record<string, number>;
  slayerTask: { npc: string; remaining: number } | null;
  action: PendingAction | null;
  attackCooldown: number;
  combatStyle: CombatStyle;
  autocastSpell: string | null;
  hitsplat: { dmg: number; until: number } | null;
  dead: boolean;
  lastFacing: { dx: number; dy: number };
}

export interface XpDrop { skill: SkillName; amount: number; }

export interface DialogueLine { speaker: string; text: string; }
export interface DialogueState {
  lines: DialogueLine[];
  idx: number;
  options: { label: string; fn: () => void }[] | null;
  onDone: (() => void) | null;
}

export interface MakeOption { id: string; label: string; icon: string; disabled?: string; }

// other players in the shared world (filled by net.ts, drawn by render.ts)
export interface RemotePlayer {
  name: string;
  x: number; y: number;
  prevX: number; prevY: number;
  updatedAt?: number; // performance.now() when the position last changed — drives interpolation
  app: Record<string, string | null>; // equipment ids for appearance
  tag?: string | null; // guild tag, shown as [TAG] on the name label
  chat?: { text: string; until: number };
  cb?: number;
  hp?: number;
  maxHp?: number;
  dead?: boolean;
  hitsplat?: { dmg: number; until: number } | null;
  lastDamagedAt?: number;
}

export const state = {
  tick: 0,
  player: null as unknown as Player,
  remotePlayers: [] as RemotePlayer[],
  npcs: [] as Npc[],
  groundItems: [] as GroundItem[],
  projectiles: [] as Projectile[],
  messages: [] as { text: string; cls: string }[],
  bankOpen: false,
  shopOpen: null as string | null,
  dialogue: null as DialogueState | null,
  usingSlot: null as number | null, // "Use item ->" selection
  started: false,
};

export const events = {
  onMessage: (() => {}) as (text: string, cls: string) => void,
  onXpDrop: (() => {}) as (drop: XpDrop) => void,
  onLevelUp: (() => {}) as (skill: SkillName, level: number) => void,
  onInvChange: (() => {}) as () => void,
  onStatsChange: (() => {}) as () => void,
  onBankShopChange: (() => {}) as () => void,
  onDialogueChange: (() => {}) as () => void,
  onCollection: (() => {}) as () => void,
  // ui assigns: shows a make-X picker; calls cb with chosen option id + quantity (0 = cancel)
  onRequestMake: ((_opts, cb) => cb(null, 0)) as (opts: MakeOption[], cb: (id: string | null, qty: number) => void) => void,
};

export function msg(text: string, cls = 'game') {
  state.messages.push({ text, cls });
  if (state.messages.length > 120) state.messages.shift();
  events.onMessage(text, cls);
}

// ---------------- Registries (content.ts / quests.ts plug in here) ----------------
export interface ActionEntry<H> { option: string; handler: H; }
export const objectActions = new Map<string, ActionEntry<ObjectHandler>[]>();
export const npcActions = new Map<string, ActionEntry<NpcHandler>[]>();
export const itemActions = new Map<string, { option: string; handler: (slot: number) => void }[]>();
export const itemOnObject = new Map<string, (slot: number, o: WorldObject) => void>();   // `${itemId}|${objType}`
// keyed by sorted `${a}|${b}`; firstId remembers registration order so handlers
// always receive (slotOfFirstRegisteredId, slotOfSecond)
export const itemOnItem = new Map<string, { firstId: string; handler: (slotA: number, slotB: number) => void }>();
const tickHooks: (() => void)[] = [];

export function registerObjectAction(objType: string, option: string, handler: ObjectHandler) {
  const list = objectActions.get(objType) ?? [];
  list.push({ option, handler });
  objectActions.set(objType, list);
}
export function registerNpcAction(npcId: string, option: string, handler: NpcHandler) {
  const list = npcActions.get(npcId) ?? [];
  list.push({ option, handler });
  npcActions.set(npcId, list);
}
export function registerItemAction(itemId: string, option: string, handler: (slot: number) => void) {
  const list = itemActions.get(itemId) ?? [];
  list.push({ option, handler });
  itemActions.set(itemId, list);
}
export function registerItemOnObject(itemId: string, objType: string, handler: (slot: number, o: WorldObject) => void) {
  itemOnObject.set(`${itemId}|${objType}`, handler);
}
export function registerItemOnItem(a: string, b: string, handler: (slotA: number, slotB: number) => void) {
  itemOnItem.set([a, b].sort().join('|'), { firstId: a, handler });
}
export function registerTickHook(fn: () => void) { tickHooks.push(fn); }

// ---------------- Server connection hooks (set by net.ts) ----------------
// game.ts never imports net.ts (net imports game); the websocket sender is
// injected here once the connection is up.
export const netLink = { send: null as null | ((m: any) => boolean) };
function netSend(m: any): boolean {
  if (!netLink.send) return false;
  return netLink.send(m);
}
// raw websocket send for UI features (trading etc.); false when offline
export function sendWs(m: any): boolean { return netSend(m); }

// PvP is disabled everywhere for now. The combat plumbing (attack option,
// swing intents, pvp* net events) stays in place behind this one switch.
export const ENABLE_PVP = false;

// fx events from the server (boss telegraphs etc.) — packs register renderers.
// `data` is the raw fx message; some fx carry extra payload (telegraph tiles).
export type FxHandler = (npc: Npc | null, data?: any) => void;
const fxHandlers = new Map<string, FxHandler>();
export function registerFx(kind: string, h: FxHandler) { fxHandlers.set(kind, h); }

// damage modifiers by fx kind (prayer halving, movement dodges) — applied
// client-side because the server can't observe prayers or sub-tick movement
export type DamageModifier = (dmg: number, npc: Npc | null) => number;
const damageModifiers = new Map<string, DamageModifier>();
export function registerDamageModifier(kind: string, m: DamageModifier) { damageModifiers.set(kind, m); }

// kill notifications (quest + slayer tracking)
const killListeners: ((defId: string) => void)[] = [];
export function onKill(fn: (defId: string) => void) { killListeners.push(fn); }

export function requestMake(opts: MakeOption[], cb: (id: string | null, qty: number) => void) {
  events.onRequestMake(opts, cb);
}

// ---------------- Dialogue ----------------
export function startDialogue(lines: DialogueLine[], onDone?: () => void) {
  state.dialogue = { lines, idx: 0, options: null, onDone: onDone ?? null };
  events.onDialogueChange();
}
export function showOptions(options: { label: string; fn: () => void }[]) {
  state.dialogue = { lines: [], idx: 0, options, onDone: null };
  events.onDialogueChange();
}
export function advanceDialogue() {
  const d = state.dialogue;
  if (!d || d.options) return;
  d.idx++;
  if (d.idx >= d.lines.length) {
    const done = d.onDone;
    state.dialogue = null;
    events.onDialogueChange();
    done?.();
  } else events.onDialogueChange();
}
export function chooseOption(i: number) {
  const d = state.dialogue;
  if (!d?.options) return;
  const fn = d.options[i]?.fn;
  state.dialogue = null;
  events.onDialogueChange();
  fn?.();
}
export function closeDialogue() {
  state.dialogue = null;
  events.onDialogueChange();
}

// ---------------- Skills ----------------
export function skillIdx(name: SkillName) { return SKILLS.indexOf(name); }
export function level(name: SkillName) { return levelForXp(state.player.xp[skillIdx(name)]); }
export function totalLevel() { return SKILLS.reduce((s, n) => s + level(n), 0); }

export function combatLevel(): number {
  const base = 0.25 * (level('Defence') + level('Hitpoints') + Math.floor(level('Prayer') / 2));
  const melee = 0.325 * (level('Attack') + level('Strength'));
  const range = 0.325 * Math.floor(level('Ranged') * 1.5);
  const gun = 0.325 * Math.floor(level('Gun') * 1.5);
  const mage = 0.325 * Math.floor(level('Magic') * 1.5);
  return Math.floor(base + Math.max(melee, range, gun, mage));
}

function aOrAn(s: string) { return /^[AEIOU]/.test(s) ? 'an' : 'a'; }

// ---------------- APPLY-BOUNDARY (docs/CONVERSION-CONTRACT.md) ----------------
// Owned state (xp, items, coins, bank, equipment, quest stage, collectionLog,
// specEnergy, slayerTask/points, curHp/prayer) is SERVER-AUTHORITATIVE. The
// functions below are the internal `_apply*` mutators: they are the ONLY code
// that writes owned state, and they run ONLY on the server-apply path
// (applyGrant ← netIntent/netGranted, plus game.ts's own combat-echo handlers
// which are themselves server confirmations). Content code (src/content.ts,
// src/packs/**, src/quests.ts) must NEVER call these — it calls requestIntent()
// and reflects the authoritative echo. scripts/lint-no-client-grants.ts enforces
// this; it is the objective proof of zero client-authored owned data.
//
// `addXp`/`addItem`/`removeItem` remain exported as thin aliases so game.ts's
// own server-echo paths read naturally; the lint forbids the content files from
// referencing ANY of these names (alias or _apply*).
export function _applyXp(name: SkillName, amount: number) {
  const i = skillIdx(name);
  const before = levelForXp(state.player.xp[i]);
  state.player.xp[i] = Math.min(200_000_000, state.player.xp[i] + amount);
  const after = levelForXp(state.player.xp[i]);
  events.onXpDrop({ skill: name, amount });
  if (after > before) {
    if (name === 'Hitpoints') state.player.curHp += after - before;
    if (name === 'Prayer') state.player.prayerPoints = Math.min(after, state.player.prayerPoints + (after - before));
    audio.sfx('levelup');
    msg(`Congratulations, you just advanced ${aOrAn(name)} ${name} level.`, 'level');
    msg(`Your ${name} level is now ${after}.`, 'level');
    events.onLevelUp(name, after);
  }
  events.onStatsChange();
}

// ---------------- Inventory ----------------
export function invCount(id: string): number {
  return state.player.inventory.reduce((s, it) => s + (it && it.id === id ? it.qty : 0), 0);
}
export function freeSlots(): number {
  return state.player.inventory.filter((s) => s === null).length;
}
export function hasItem(id: string, qty = 1): boolean { return invCount(id) >= qty; }
export function hasTool(id: string): boolean {
  return hasItem(id) || Object.values(state.player.equipment).some((e) => e?.id === id);
}

export function _applyItem(id: string, qty = 1): boolean {
  const def = ITEMS[id];
  const inv = state.player.inventory;
  if (def.stackable) {
    const slot = inv.find((s) => s && s.id === id);
    if (slot) { slot.qty += qty; recordCollectible(id); events.onInvChange(); return true; }
    const i = inv.indexOf(null);
    if (i < 0) return false;
    inv[i] = { id, qty };
    recordCollectible(id);
    events.onInvChange();
    return true;
  }
  for (let n = 0; n < qty; n++) {
    const i = inv.indexOf(null);
    if (i < 0) { if (n > 0) recordCollectible(id); events.onInvChange(); return n > 0; }
    inv[i] = { id, qty: 1 };
  }
  recordCollectible(id);
  events.onInvChange();
  return true;
}

// ---------------- Collection log ----------------
// Collection-worthy = any item that appears as an NPC drop with chance <= 5%.
// Categories come from the dropping NPC: boss flag -> Bosses, the Untuned Mine
// roster -> Dungeon, the slayer task pool -> Slayer, everything else -> Misc.
export type CollectionCategory = 'Bosses' | 'Slayer' | 'Dungeon' | 'Misc';
export const COLLECTION_CATEGORIES: CollectionCategory[] = ['Bosses', 'Slayer', 'Dungeon', 'Misc'];

// Untuned Mine instance roster (mirrors server/dungeon.ts SPAWN_SET defs).
const DUNGEON_NPC_IDS = new Set([
  'discord_mote', 'untuned_golem', 'seam_creeper', 'foreman_echo', 'crystal_heart', 'the_dissonant',
]);
// Slayer assignment pool (mirrors TASK_POOL in src/packs/slayer_tasks.ts).
const SLAYER_NPC_IDS = new Set([
  'chicken', 'cow', 'giant_rat', 'goblin', 'scorpion', 'forest_spider',
  'ice_wolf', 'dire_wolf', 'bear', 'desert_bandit', 'pirate', 'ice_troll',
  'magma_crawler', 'ash_fiend', 'ruin_wraith', 'discord_wisp',
  'hollow_miner', 'manor_revenant',
]);

const COLLECTIBLE_CHANCE = 0.05;
const CAT_PRIORITY: Record<CollectionCategory, number> = { Bosses: 0, Dungeon: 1, Slayer: 2, Misc: 3 };

export const COLLECTIBLES: Map<string, CollectionCategory> = (() => {
  const map = new Map<string, CollectionCategory>();
  for (const def of Object.values(NPCS)) {
    for (const d of def.drops ?? []) {
      if (d.chance > COLLECTIBLE_CHANCE || !ITEMS[d.item]) continue;
      const cat: CollectionCategory = def.boss ? 'Bosses'
        : DUNGEON_NPC_IDS.has(def.id) ? 'Dungeon'
        : SLAYER_NPC_IDS.has(def.id) ? 'Slayer'
        : 'Misc';
      const prev = map.get(d.item);
      if (!prev || CAT_PRIORITY[cat] < CAT_PRIORITY[prev]) map.set(d.item, cat);
    }
  }
  return map;
})();

function recordCollectible(id: string) {
  const p = state.player;
  if (!p || !COLLECTIBLES.has(id)) return;
  if (!p.collectionLog) p.collectionLog = {};
  if (p.collectionLog[id] !== undefined) return;
  p.collectionLog[id] = state.tick;
  audio.sfx('levelup');
  msg(`New item added to your collection log: ${ITEMS[id].name}.`, 'collection');
  events.onCollection();
}

export function _applyRemove(id: string, qty = 1): boolean {
  const inv = state.player.inventory;
  if (invCount(id) < qty) return false;
  let left = qty;
  for (let i = 0; i < inv.length && left > 0; i++) {
    const s = inv[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take; left -= take;
    if (s.qty <= 0) inv[i] = null;
  }
  events.onInvChange();
  return true;
}

export function _applyRemoveFromSlot(slot: number, qty = 1) {
  const it = state.player.inventory[slot];
  if (!it) return;
  it.qty -= qty;
  if (it.qty <= 0) state.player.inventory[slot] = null;
  events.onInvChange();
}

// Public aliases. These delegate to the _apply* mutators and are used ONLY by
// game.ts's own server-apply/echo paths (combat youHit, pickup, etc.). Content
// code must not reference them — lint enforces that boundary.
export const addXp = _applyXp;
export const addItem = _applyItem;
export const removeItem = _applyRemove;
export const removeFromSlot = _applyRemoveFromSlot;

// ---------------- Init / save / load ----------------
const SAVE_KEY = 'larpscape-save-v2';

// Pluggable persistence: localStorage by default; net.ts swaps in server storage on login.
export interface SaveProvider {
  load: () => any | null;            // resolved save object or null
  save: (data: any) => void;         // may be async fire-and-forget internally
}
export let saveProvider: SaveProvider = {
  load: () => {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  save: (data) => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* blocked */ }
  },
};
export function setSaveProvider(p: SaveProvider) { saveProvider = p; }

function freshPlayer(): Player {
  const xp = SKILLS.map(() => 0);
  xp[skillIdx('Hitpoints')] = XP_TABLE[10];
  const equipment = {} as Record<EquipSlot, ItemStack | null>;
  for (const s of EQUIP_SLOTS) equipment[s] = null;
  return {
    name: 'Adventurer',
    x: 22, y: 38, prevX: 22, prevY: 38,
    path: [], run: false, energy: 100,
    specEnergy: 100, specArmed: false,
    xp, curHp: 10,
    prayerPoints: 1,
    activePrayers: new Set(),
    inventory: new Array(28).fill(null),
    equipment,
    bank: [{ id: 'coins', qty: 25 }],
    quests: {},
    collectionLog: {},
    slayerTask: null,
    action: null, attackCooldown: 0,
    combatStyle: 'accurate',
    autocastSpell: null,
    hitsplat: null, dead: false,
    lastFacing: { dx: 0, dy: 1 },
  };
}

export function saveGame() {
  const p = state.player;
  if (!p) return;
  const data = {
    name: p.name, x: p.x, y: p.y, xp: p.xp, curHp: p.curHp,
    prayerPoints: p.prayerPoints, run: p.run, energy: p.energy,
    specEnergy: p.specEnergy,
    inventory: p.inventory, equipment: p.equipment, bank: p.bank,
    quests: p.quests, slayerTask: p.slayerTask, combatStyle: p.combatStyle,
    collectionLog: p.collectionLog,
    autocastSpell: p.autocastSpell,
    music: [...audio.unlocked],
  };
  saveProvider.save(data);
}

export function hasSave(): boolean {
  return saveProvider.load() !== null;
}

export function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
}

function loadSave(p: Player, provided?: any): boolean {
  const d = provided ?? saveProvider.load();
  if (!d) return false;
  try {
    p.name = d.name ?? p.name;
    p.x = d.x ?? p.x; p.y = d.y ?? p.y; p.prevX = p.x; p.prevY = p.y;
    if (Array.isArray(d.xp)) {
      if (d.xp.length === SKILLS.length) p.xp = d.xp;
      else if (d.xp.length === SKILLS.length - 1) p.xp = [...d.xp, 0];
    }
    p.curHp = d.curHp ?? p.curHp;
    p.prayerPoints = d.prayerPoints ?? p.prayerPoints;
    if (Array.isArray(d.activePrayers)) p.activePrayers = new Set(d.activePrayers);
    p.run = d.run ?? false; p.energy = d.energy ?? 100;
    p.specEnergy = typeof d.specEnergy === 'number' ? Math.max(0, Math.min(100, d.specEnergy)) : 100;
    if (Array.isArray(d.inventory)) p.inventory = d.inventory;
    if (d.equipment) for (const s of EQUIP_SLOTS) p.equipment[s] = d.equipment[s] ?? null;
    if (Array.isArray(d.bank)) p.bank = d.bank;
    p.quests = d.quests ?? {};
    p.slayerTask = d.slayerTask ?? null;
    p.collectionLog = (d.collectionLog && typeof d.collectionLog === 'object') ? d.collectionLog : {};
    p.combatStyle = d.combatStyle ?? 'accurate';
    p.autocastSpell = d.autocastSpell ?? null;
    for (const m of d.music ?? []) audio.unlocked.add(m);
    // drop unknown items from older saves
    p.inventory = p.inventory.map((s) => (s && ITEMS[s.id] ? s : null));
    p.bank = p.bank.filter((s) => ITEMS[s.id]);
    for (const s of EQUIP_SLOTS) if (p.equipment[s] && !ITEMS[p.equipment[s]!.id]) p.equipment[s] = null;
    return true;
  } catch { return false; }
}

export function initGame(savedData?: any) {
  buildWorld();
  state.player = freshPlayer();
  const loaded = loadSave(state.player, savedData);
  // Rescue saves from removed map regions (the old generated 500×500 zones)
  // or otherwise-invalid tiles by snapping to spawn.
  if (
    state.player.x < 0 || state.player.y < 0 ||
    state.player.x >= MAP_W || state.player.y >= MAP_H ||
    blocked(state.player.x, state.player.y)
  ) { state.player.x = 22; state.player.y = 38; }
  // NPCs + ground items are server-authoritative: the mirrors fill in when the
  // websocket delivers the world snapshot (net.ts -> netWorldSnapshot).
  msg(loaded ? `Welcome back to Larpscape, ${state.player.name}.` : 'Welcome to Larpscape.');
}

// ---------------- Server world mirror ----------------
// state.npcs / state.groundItems mirror the authoritative server sim. Objects
// are kept stable across updates so render.ts instance caches stay valid.
const npcBySid = new Map<number, Npc>();

interface NpcWire { i: number; d: string; x: number; y: number; hp: number; dead: boolean; sh: boolean; t: string | null; }
interface GroundWire { g: number; item: string; qty: number; x: number; y: number; }

function applyNpcWire(w: NpcWire) {
  let n = npcBySid.get(w.i);
  if (!n) {
    const def = NPCS[w.d];
    if (!def) return;
    n = {
      sid: w.i, def, x: w.x, y: w.y, prevX: w.x, prevY: w.y, spawnX: w.x, spawnY: w.y,
      hp: w.hp, dead: w.dead, respawnAt: 0, target: null,
      attackCooldown: 0, wanderCooldown: 0, hitsplat: null, lastDamagedAt: -100,
      updatedAt: performance.now(), meta: {},
    };
    npcBySid.set(w.i, n);
    state.npcs.push(n);
  }
  if (w.x !== n.x || w.y !== n.y) {
    const jump = Math.max(Math.abs(w.x - n.x), Math.abs(w.y - n.y));
    if (jump > 3 || n.dead) { n.prevX = w.x; n.prevY = w.y; } // teleport/respawn: snap
    else { n.prevX = n.x; n.prevY = n.y; }
    n.x = w.x; n.y = w.y;
    n.updatedAt = performance.now();
  }
  n.hp = w.hp;
  if (w.dead && !n.dead) {
    n.hitsplat = null;
    if (state.player?.action?.npc === n) state.player.action = null;
  }
  if (!w.dead && n.dead) { n.meta = {}; n.hitsplat = null; } // respawned
  n.dead = w.dead;
  n.target = w.t !== null && w.t === state.player?.name ? 'player' : null;
  if (w.sh) {
    n.meta.sheared = true;
    n.meta.shearedUntil = Infinity; // server owns the timer; cleared on next delta
  } else {
    delete n.meta.sheared;
    n.meta.shearedUntil = 0;
  }
}

function applyGroundWire(w: GroundWire) {
  if (state.groundItems.some((g) => g.gid === w.g)) return;
  state.groundItems.push({ gid: w.g, item: w.item, qty: w.qty, x: w.x, y: w.y, expiresAt: Infinity });
}

export function netWorldSnapshot(data: { npcs: NpcWire[]; ground: GroundWire[] }) {
  // full resync (connect/reconnect): rebuild, keeping existing objects stable
  const seen = new Set<number>();
  for (const w of data.npcs ?? []) { applyNpcWire(w); seen.add(w.i); }
  for (let i = state.npcs.length - 1; i >= 0; i--) {
    if (!seen.has(state.npcs[i].sid)) {
      npcBySid.delete(state.npcs[i].sid);
      state.npcs.splice(i, 1);
    }
  }
  state.groundItems.length = 0;
  for (const w of data.ground ?? []) applyGroundWire(w);
}

export function netWorldDelta(data: { n?: NpcWire[]; ga?: GroundWire[]; gr?: number[] }) {
  for (const w of data.n ?? []) applyNpcWire(w);
  for (const w of data.ga ?? []) applyGroundWire(w);
  for (const gid of data.gr ?? []) {
    const i = state.groundItems.findIndex((g) => g.gid === gid);
    if (i >= 0) {
      if (state.player?.action?.ground === state.groundItems[i]) state.player.action = null;
      state.groundItems.splice(i, 1);
    }
  }
}

// someone (possibly me) hit an NPC — show the splat + update hp everywhere
export function netHit(msg: { npc: number; dmg: number; hp: number; by: string; kind?: string }) {
  const n = npcBySid.get(msg.npc);
  if (!n) return;
  n.hp = msg.hp;
  n.hitsplat = { dmg: msg.dmg, until: performance.now() + 900, kind: msg.kind ?? 'hit' };
  n.lastDamagedAt = state.tick;
  if (msg.by === state.player?.name) audio.sfx(msg.dmg > 0 ? 'hit' : 'miss');
}

// my swing landed — server grants xp/runes/ammo; reflect the authoritative echo
export function netYouHit(msg: {
  npc: number; dmg: number; mode: 'melee' | 'ranged' | 'gun' | 'magic';
  heal?: number; hp?: number; spec?: number;
  xp?: { skill: SkillName; amount: number }[];
  removed?: { id: string; qty: number; slot?: number }[];
  equip?: Record<string, { id: string; qty: number } | null>;
}) {
  const p = state.player;
  if (!p) return;
  if (typeof msg.spec === 'number') {
    p.specEnergy = Math.max(0, Math.min(100, Math.floor(msg.spec)));
  }
  applyGrant({
    ok: true,
    kind: 'youHit',
    xp: msg.xp,
    removed: msg.removed,
    equip: msg.equip,
    hp: typeof msg.hp === 'number' ? msg.hp : (
      msg.heal && msg.heal > 0 && !p.dead
        ? Math.min(level('Hitpoints'), p.curHp + msg.heal)
        : undefined
    ),
  });
}

// an NPC hit me — server owns HP; splat shows the actual HP lost, not a client-only modifier
export function netNpcHitYou(msg: { npc: number; dmg: number; fx?: string; hp?: number; maxHp?: number }) {
  const p = state.player;
  if (!p || p.dead) return;
  const n = npcBySid.get(msg.npc) ?? null;
  const prevHp = p.curHp;
  if (typeof msg.hp === 'number') p.curHp = msg.hp;
  else if (msg.dmg > 0) p.curHp = Math.max(0, p.curHp - msg.dmg);
  else return;
  const splatDmg = Math.max(0, prevHp - p.curHp);
  if (msg.fx && splatDmg > 0) {
    const mod = damageModifiers.get(msg.fx);
    if (mod) mod(splatDmg, n); // flavor messages only — HP already came from the server
  }
  p.hitsplat = { dmg: splatDmg, until: performance.now() + 900 };
  audio.sfx(splatDmg > 0 ? 'hit' : 'miss');
  events.onStatsChange();
}

// Server-authoritative death + respawn (sim.ts killPlayer).
export function netDeath(m: { hp: number; maxHp?: number; x: number; y: number }) {
  const p = state.player;
  if (!p) return;
  p.activePrayers.clear();
  msg('Oh dear, you are dead!');
  p.dead = true;
  p.curHp = 0;
  p.hitsplat = null;
  events.onStatsChange();
  window.setTimeout(() => {
    p.x = m.x; p.y = m.y; p.prevX = m.x; p.prevY = m.y;
    p.path = []; p.action = null;
    p.curHp = m.hp;
    p.dead = false;
    p.energy = 100;
    for (const n of state.npcs) if (n.target === 'player') n.target = null;
    events.onStatsChange();
  }, 2000);
}

export function netHpSync(msg: { hp: number; maxHp?: number }) {
  const p = state.player;
  if (!p || p.dead) return;
  p.curHp = Math.max(0, Math.floor(msg.hp));
  events.onStatsChange();
}

export function netSpecSync(msg: { spec: number }) {
  const p = state.player;
  if (!p) return;
  p.specEnergy = Math.max(0, Math.min(100, Math.floor(msg.spec)));
  events.onStatsChange();
}

// I got the killing blow — slayer credit is server-owned; quest kill listeners only
export function netYouKilled(m: { npc: number; def: string }) {
  if (!state.player) return;
  for (const fn of killListeners) fn(m.def);
}

// ---------------- Server-authoritative progression intents ----------------
// (docs/ECONOMY-AUTHORITY.md §2). For every owned-state gain/loss the client
// now REQUESTS an intent; the server validates + rolls + applies, and the
// {t:'intent'}/{t:'granted'} echo is applied here. The client no longer authors
// xp/items for these paths — addItem/addXp below run only as the SERVER echo.

// The authoritative echo shape (mirrors server/intents.ts IntentResult). The
// client REPLACES its optimistic owned-state with this; it never authors values.
export interface IntentEcho {
  ok: boolean;
  kind: string;
  error?: string;
  id?: number;            // correlation id echoed back for requestIntent()
  granted?: { id: string; qty: number }[];
  removed?: { id: string; qty: number; slot?: number }[];
  xp?: { skill: SkillName; amount: number }[];
  coins?: number;         // authoritative carried-coin balance after the mutation
  stage?: number;         // quest advance: resulting monotonic stage
  quest?: string;         // quest id the stage/reward applies to (quest kinds only)
  questSet?: Record<string, number>; // server-owned quest-progress keys to mirror
                          // (sub-stage counters/bitmasks: gd1_rings, gd1_rats, …).
                          // Reflected monotonically (max) — counters/bitmasks only grow.
  equip?: Record<string, { id: string; qty: number } | null>; // changed equip slots
  burned?: boolean;
  source?: string;
  hp?: number;            // authoritative curHp after eat/heal
  healed?: boolean;       // heal intent: whether HP actually changed
  prayerPoints?: number;  // authoritative prayer points after recharge/consume
  activePrayers?: string[]; // toggled prayers after pray-toggle / drain
}

// ---- requestIntent: the ONE entry point content code uses to change owned ----
// state. It sends `{t:'intent', kind, id, ...payload}` over the websocket and
// returns a promise that resolves with the authoritative echo when the server
// replies (correlated by id), or rejects/resolves-not-ok on refusal/timeout.
// Content code calls requestIntent(...) instead of addItem/addXp/removeItem; the
// echo is applied by applyGrant (below), so the client only ever REFLECTS
// server-granted state. Migration helper for domain agents:
//
//   // before (client-authored — now forbidden):
//   removeItem('logs', 1); addXp('Firemaking', 40);
//   // after (server-validated):
//   requestIntent('firemake', { log: 'logs' });
//
// Fire-and-forget callers that don't need the result can ignore the promise;
// the echo is still applied centrally via applyGrant.
let nextIntentId = 1;
const pendingIntents = new Map<number, { resolve: (e: IntentEcho) => void; timer: ReturnType<typeof setTimeout>; kind: string }>();

// Settle every awaiting intent on websocket disconnect: net.ts calls this from
// ws.onclose so callers don't hang up to the 8s timeout and timers don't leak.
export function rejectPendingIntents() {
  for (const [id, p] of pendingIntents) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, kind: p.kind, error: 'offline', id });
  }
  pendingIntents.clear();
}

export function requestIntent(kind: string, payload: Record<string, unknown> = {}): Promise<IntentEcho> {
  const id = nextIntentId++;
  // Flush the CURRENT player position over the same socket immediately before
  // the intent. Position is otherwise only synced on a 600ms heartbeat
  // (src/net.ts posTimer), so an intent fired the instant the player arrives at
  // a stall/resource races ahead of its own position update and the server's
  // range check runs against a tile 1-2 behind — producing intermittent silent
  // 'out of range' rejections (the bake-stall steal bug). WS message ordering
  // guarantees this pos lands before the intent dispatches.
  if (state.player) {
    netSend({ t: 'pos', x: state.player.x, y: state.player.y, app: undefined, d: state.player.dead });
  }
  if (!netSend({ t: 'intent', kind, id, ...payload })) {
    return Promise.resolve({ ok: false, kind, error: 'offline', id });
  }
  return new Promise<IntentEcho>((resolve) => {
    const timer = setTimeout(() => {
      pendingIntents.delete(id);
      resolve({ ok: false, kind, error: 'timeout', id });
    }, 8000);
    pendingIntents.set(id, { resolve, timer, kind });
  });
}

// Backwards-compatible thin wrapper kept for any caller that only needs to fire
// an intent without awaiting (returns false when offline).
export function sendIntent(kind: string, payload: Record<string, unknown>): boolean {
  return netSend({ t: 'intent', kind, id: nextIntentId++, ...payload });
}

// applyGrant: the SINGLE server-apply sink. Every owned-state echo (skilling,
// shop, bank, equip, produce, quest, pickup, scripted-grant, domain intents)
// flows through here. removed first, then grants, then xp (so level-up messages
// fire with the new inventory already reflected), then equip/coins/quest deltas.
// This is the only place outside game.ts's combat-echo handlers that mutates
// owned state, and it does so exclusively from server-authoritative data.
export function applyGrant(m: IntentEcho) {
  if (m.removed) for (const r of m.removed) {
    if (typeof r.slot === 'number') _applyRemoveFromSlot(r.slot, r.qty);
    else _applyRemove(r.id, r.qty);
  }
  if (m.granted) for (const g of m.granted) {
    _applyItem(g.id, g.qty);
    if (g.id === 'coins') audio.sfx('coins');
  }
  if (m.xp) for (const x of m.xp) _applyXp(x.skill, x.amount);
  if (m.equip) {
    for (const slot of Object.keys(m.equip)) {
      if ((EQUIP_SLOTS as string[]).includes(slot)) {
        state.player.equipment[slot as EquipSlot] = m.equip[slot];
      }
    }
    events.onInvChange(); events.onStatsChange();
  }
  if (typeof m.stage === 'number' && typeof m.quest === 'string' && state.player) {
    // quest stage is server-owned + monotonic; reflect the server-granted stage
    // into the local quests mirror so journals/dialogue gates read true. This is
    // the apply-boundary (game.ts) writing owned state from authoritative data —
    // content code may never write the quests map (lint-enforced); it only ever
    // requests a 'quest-stage' intent and reflects the echo through here.
    if (!state.player.quests || typeof state.player.quests !== 'object') state.player.quests = {} as Record<string, number>;
    const prev = state.player.quests[m.quest] ?? 0;
    state.player.quests[m.quest] = Math.max(prev, m.stage);
    events.onStatsChange();
  }
  if (typeof m.hp === 'number' && state.player) {
    state.player.curHp = Math.max(0, Math.floor(m.hp));
    events.onStatsChange();
  }
  if (typeof m.prayerPoints === 'number' && state.player) {
    state.player.prayerPoints = Math.max(0, Math.floor(m.prayerPoints));
    events.onStatsChange();
  }
  if (Array.isArray(m.activePrayers) && state.player) {
    state.player.activePrayers = new Set(m.activePrayers);
    events.onStatsChange();
  }
  if (m.questSet && state.player) {
    // server-owned quest-progress sub-keys (kill counters / sounding bitmasks).
    // Same apply-boundary rule: only game.ts writes the quests mirror, and only
    // from the authoritative echo. Monotonic max keeps a stale echo from
    // rewinding a counter/bitmask (they only ever grow within a quest).
    if (!state.player.quests || typeof state.player.quests !== 'object') state.player.quests = {} as Record<string, number>;
    for (const k of Object.keys(m.questSet)) {
      const prev = state.player.quests[k] ?? 0;
      state.player.quests[k] = Math.max(prev, m.questSet[k]);
    }
    events.onStatsChange();
  }
}

// Back-compat name retained for existing callers/tests.
export const applyIntentEcho = applyGrant;

// WS {t:'intent'} reply handler. Resolves any pending requestIntent promise,
// surfaces refusals, and applies the authoritative grant.
export function netIntent(m: IntentEcho) {
  if (typeof m.id === 'number') {
    const p = pendingIntents.get(m.id);
    if (p) { clearTimeout(p.timer); pendingIntents.delete(m.id); p.resolve(m); }
  }
  if (!m.ok) {
    // Surface the server's refusal once (rate-limited by the action loop).
    if (m.error && m.error !== 'inventory full') {
      // 'inventory full'/empty rolls are common; only show meaningful refusals
      if (!/full|no character|out of range|no such|frozen|offline|timeout/.test(m.error)) msg(serverError(m.error));
    } else if (m.error === 'inventory full') {
      msg("You don't have enough inventory space.");
    }
    return;
  }
  applyGrant(m);
  if (m.kind === 'slayer') {
    void import('./packs/slayer_tasks').then((s) => s.onSlayerEcho?.(m));
  }
}

// pickup/drop authoritative echo ({t:'granted'} from sim.ts).
export function netGranted(m: { source?: string; items?: { id: string; qty: number }[]; removed?: { id: string; qty: number; slot?: number }[] }) {
  if (m.items) applyGrant({ ok: true, kind: 'granted', granted: m.items });
  if (m.removed?.length && m.source === 'drop') {
    applyGrant({ ok: true, kind: 'granted', removed: m.removed });
  }
  if (m.source === 'shear' && m.items) netShorn();
}

function serverError(e: string): string {
  // Make the server's terse error human-friendly for the chat log.
  return e.charAt(0).toUpperCase() + e.slice(1) + '.';
}

// boss telegraphs and other server fx
export function netFx(m: { npc: number; kind: string; [k: string]: any }) {
  const n = npcBySid.get(m.npc) ?? null;
  fxHandlers.get(m.kind)?.(n, m);
}

export function npcBySidLookup(sid: number): Npc | undefined { return npcBySid.get(sid); }

// shared-state NPC interactions go through the server (currently: shearing)
export function sendInteract(npc: Npc, option: string): boolean {
  return netSend({ t: 'interact', npc: npc.sid, option });
}

export function netShorn() {
  msg('You get some wool.');
}

export function netDeny(m: { what: string }) {
  if (m.what === 'shear') msg('This sheep has already been sheared. Give the wool a moment to grow back.');
  else if (m.what === 'swing') msg("You can't attack right now.");
}

export function netPvpHitYou(m: { from: string; dmg: number; hp: number; maxHp?: number }) {
  const p = state.player;
  if (!p || p.dead) return;
  p.curHp = m.hp;
  p.hitsplat = { dmg: m.dmg, until: performance.now() + 900 };
  audio.sfx(m.dmg > 0 ? 'hit' : 'miss');
  events.onStatsChange();
  if (p.curHp <= 0) playerDeath();
}

export function netPvpYouHit(_m: { target: string; dmg: number; mode: AttackMode }) {
  // PvP XP is not yet server-owned; PvP is disabled server-side.
}

export function netPvpHit(m: { from: string; target: string; dmg: number; hp: number; maxHp?: number }) {
  const rp = remoteByName(m.target);
  if (!rp) return;
  rp.hp = m.hp;
  if (m.maxHp) rp.maxHp = m.maxHp;
  rp.hitsplat = { dmg: m.dmg, until: performance.now() + 900 };
  rp.lastDamagedAt = state.tick;
}

export function netPvpDeath(m: { who: string; by?: string }) {
  if (m.who === state.player?.name) return; // local death handled by pvpHitYou
  const rp = remoteByName(m.who);
  if (rp) {
    rp.dead = true;
    rp.hp = 0;
    msg(`${m.who} was defeated by ${m.by ?? 'someone'}.`, 'game');
  }
}

export function netPvpKill(m: { target: string }) {
  msg(`You have defeated ${m.target}!`, 'game');
}

// ---------------- Click handling ----------------
export function walkTo(tx: number, ty: number) {
  const p = state.player;
  p.action = null;
  const path = findPath(p.x, p.y, tx, ty);
  if (path) p.path = path;
  else msg("I can't reach that!");
}

export function startAction(action: PendingAction, tx: number, ty: number) {
  const p = state.player;
  if (p.dead) return;
  p.action = action;
  const onTop = action.onTop ?? false;
  if (!onTop && Math.abs(p.x - tx) <= 1 && Math.abs(p.y - ty) <= 1 && !(p.x === tx && p.y === ty)) {
    p.path = [];
    return;
  }
  if (onTop && p.x === tx && p.y === ty) { p.path = []; return; }
  const path = findPath(p.x, p.y, tx, ty, !onTop);
  if (path) p.path = path;
  else { msg("I can't reach that!"); p.action = null; }
}

export function interactWithObject(o: WorldObject, option: string) {
  const entry = objectActions.get(o.type)?.find((e) => e.option === option);
  if (!entry) return;
  const nonBlocking = !blocked(o.x, o.y) && objectAt.get(key(o.x, o.y)) === o;
  startAction({ type: 'interact-obj', obj: o, handler: entry.handler, onTop: nonBlocking && isOnTopType(o.type) }, o.x, o.y);
}
function isOnTopType(t: string) {
  return ['fishing_spot', 'rod_fishing_spot', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge'].includes(t) === false
    && ['snare_set'].includes(t) === false; // adjacent is fine for all of these; stand-on not required
}

export function interactWithNpc(n: Npc, option: string) {
  const entry = npcActions.get(n.def.id)?.find((e) => e.option === option);
  if (!entry) return;
  startAction({ type: 'interact-npc', npc: n, handler: entry.handler }, n.x, n.y);
}

export function attackNpc(n: Npc) {
  startAction({ type: 'attack', npc: n }, n.x, n.y);
}

export function attackPlayer(name: string) {
  if (!ENABLE_PVP) { msg("You can't attack other adventurers."); return; }
  const rp = state.remotePlayers.find((r) => r.name === name);
  if (!rp) { msg('They are no longer here.'); return; }
  startAction({ type: 'attack-player', playerName: name }, rp.x, rp.y);
}

export function pickupItem(gi: GroundItem) {
  const p = state.player;
  p.action = { type: 'pickup', ground: gi };
  const path = findPath(p.x, p.y, gi.x, gi.y, false);
  if (path) p.path = path; else { msg("I can't reach that!"); p.action = null; }
}

// "Use" an inventory item on an object / npc / another item
export function useItemOnObject(slot: number, o: WorldObject) {
  const it = state.player.inventory[slot];
  if (!it) return;
  const handler = itemOnObject.get(`${it.id}|${o.type}`);
  if (!handler) { msg('Nothing interesting happens.'); return; }
  const wrapped: ObjectHandler = (obj) => { handler(slot, obj); return 'done'; };
  startAction({ type: 'interact-obj', obj: o, handler: wrapped }, o.x, o.y);
}
export function useItemOnItem(slotA: number, slotB: number) {
  const a = state.player.inventory[slotA], b = state.player.inventory[slotB];
  if (!a || !b) return;
  const entry = itemOnItem.get([a.id, b.id].sort().join('|'));
  if (!entry) { msg('Nothing interesting happens.'); return; }
  // handler always receives (slot of first-registered id, slot of second)
  if (a.id === entry.firstId) entry.handler(slotA, slotB);
  else entry.handler(slotB, slotA);
}

// ---------------- Tick ----------------
export function gameTick() {
  state.tick++;
  const p = state.player;

  for (const o of objects) {
    if (o.depletedUntil > 0 && state.tick >= o.depletedUntil) { o.depletedUntil = 0; o.depletedAs = undefined; }
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.expiresAt && state.tick >= o.expiresAt) removeObject(o);
  }
  // ground items + NPCs are server-owned mirrors; only visuals expire locally
  state.projectiles = state.projectiles.filter((pr) => performance.now() < pr.startMs + pr.durMs + 200);

  if (p.dead) return;

  if (state.tick % 2 === 0 && p.energy < 100 && p.path.length === 0) p.energy = Math.min(100, p.energy + 1);
  // special attack energy: +10 every 30s (50 ticks)
  // HP + spec + prayer regen/drain are server-owned (hpSync/specSync/prayerSync).

  movePlayer();
  performAction();
  for (const fn of tickHooks) fn();

  if (p.attackCooldown > 0) p.attackCooldown--;

  const tr = trackForRegion(p.x, p.y);
  if (audio.unlock(tr)) {
    msg(`You have unlocked a new music track: ${tr}.`);
    events.onBankShopChange();
  }

  if (state.tick % 25 === 0) saveGame();
}

function movePlayer() {
  const p = state.player;
  p.prevX = p.x; p.prevY = p.y;
  if (p.path.length === 0) return;
  let steps = p.run && p.energy > 0 ? 2 : 1;
  while (steps-- > 0 && p.path.length > 0) {
    const next = p.path[0];
    if (blocked(next.x, next.y)) { p.path = []; break; }
    p.lastFacing = { dx: Math.sign(next.x - p.x), dy: Math.sign(next.y - p.y) };
    p.x = next.x; p.y = next.y;
    p.path.shift();
    if (p.run && p.energy > 0) p.energy = Math.max(0, p.energy - 0.6);
  }
}

function adjacentTo(x: number, y: number): boolean {
  const p = state.player;
  return Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1 && !(p.x === x && p.y === y);
}

function performAction() {
  const p = state.player;
  const a = p.action;
  if (!a) return;

  if (a.type === 'pickup' && a.ground) {
    const gi = a.ground;
    if (!state.groundItems.includes(gi)) { p.action = null; return; }
    if (p.x === gi.x && p.y === gi.y) {
      const def = ITEMS[gi.item];
      if (freeSlots() === 0 && !(def?.stackable && hasItem(gi.item))) {
        msg("You don't have enough inventory space.");
      } else if (!netSend({ t: 'pickup', gid: gi.gid })) {
        msg('You are not connected to the server.');
      }
      // the item arrives via the server's 'got' reply; removal via ground delta
      p.action = null;
    }
    return;
  }

  if (a.type === 'attack' && a.npc) { tickPlayerCombat(a.npc); return; }
  if (a.type === 'attack-player' && a.playerName) { tickPlayerCombatPvp(a.playerName); return; }

  if (a.type === 'interact-npc' && a.npc && a.handler) {
    const n = a.npc;
    if (n.dead) { p.action = null; return; }
    if (!adjacentTo(n.x, n.y)) {
      if (p.path.length === 0) {
        const path = findPath(p.x, p.y, n.x, n.y, true);
        if (path && path.length) p.path = path; else { msg("I can't reach that!"); p.action = null; }
      }
      return;
    }
    p.path = [];
    p.lastFacing = { dx: Math.sign(n.x - p.x), dy: Math.sign(n.y - p.y) };
    if ((a.handler as NpcHandler)(n) === 'done') p.action = null;
    return;
  }

  if (a.type === 'interact-obj' && a.obj && a.handler) {
    const o = a.obj;
    if (!objects.includes(o)) { p.action = null; return; }
    const arrived = a.onTop ? (p.x === o.x && p.y === o.y) : (adjacentTo(o.x, o.y) || (p.x === o.x && p.y === o.y));
    if (!arrived) {
      if (p.path.length === 0) {
        const path = findPath(p.x, p.y, o.x, o.y, !a.onTop);
        if (path && path.length) p.path = path; else { msg("I can't reach that!"); p.action = null; }
      }
      return;
    }
    p.path = [];
    if (!(p.x === o.x && p.y === o.y)) p.lastFacing = { dx: Math.sign(o.x - p.x), dy: Math.sign(o.y - p.y) };
    if ((a.handler as ObjectHandler)(o) === 'done') p.action = null;
    return;
  }
}

// ---------------- Prayer ----------------
export function togglePrayer(id: string) {
  const def = PRAYERS.find((pr) => pr.id === id);
  if (!def) return;
  if (level('Prayer') < def.level) { msg(`You need a Prayer level of ${def.level} to use ${def.name}.`); return; }
  const wasOn = state.player.activePrayers.has(id);
  void requestIntent('pray-toggle', { id }).then((echo) => {
    if (!echo.ok) {
      if (echo.error === 'empty') msg('You have run out of prayer points; you can recharge at an altar.');
      return;
    }
    if (!wasOn && echo.activePrayers?.includes(id)) audio.sfx('pray');
  });
}

export function netPrayerSync(m: { prayerPoints: number; activePrayers?: string[] }) {
  const p = state.player;
  if (!p) return;
  p.prayerPoints = Math.max(0, Math.floor(m.prayerPoints));
  if (Array.isArray(m.activePrayers)) p.activePrayers = new Set(m.activePrayers);
  if (p.prayerPoints <= 0 && p.activePrayers.size) {
    p.activePrayers.clear();
    msg('You have run out of prayer points; you can recharge at an altar.');
  }
  events.onStatsChange();
}

function prayerMult(boost: 'attack' | 'strength' | 'defence'): number {
  for (const id of state.player.activePrayers) {
    const def = PRAYERS.find((pr) => pr.id === id);
    if (def?.boost === boost) return def.mult;
  }
  return 1;
}

export function rechargePrayer() {
  void requestIntent('recharge-prayer').then((echo) => {
    if (!echo.ok) return;
    audio.sfx('pray');
    msg('You recharge your prayer points.');
  });
}

// ---------------- Items: generic behaviors ----------------
export function eatFood(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def.edible) return;
  void requestIntent('eat', { item: it.id, invSlot: slot }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('eat');
    msg(`You eat the ${def.name.toLowerCase()}. It heals some health.`);
  });
}

export function buryBones(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it || !ITEMS[it.id].buryXp) return;
  msg('You dig a hole in the ground...');
  void requestIntent('bury', { item: it.id, invSlot: slot }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('bury');
    msg('You bury the bones.');
  });
}

// Equip is server-authoritative (docs/CONVERSION-CONTRACT §2.1): the client
// REQUESTS an equip; the server validates levelReq vs SERVER xp, moves the item
// out of the inventory, swaps in, and returns the previously-worn item. The
// `equip`/`granted`/`removed` echo is applied centrally by applyGrant — the
// client never writes the equipment/inventory itself. The local level pre-check
// only surfaces the message instantly; the server independently re-checks.
export function equipItem(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def.equipSlot) return;
  for (const req of def.levelReq ?? []) {
    if (level(req.skill) < req.level) {
      msg(`You need ${aOrAn(req.skill)} ${req.skill} level of ${req.level} to wear this.`);
      return;
    }
  }
  const verb = def.equipSlot === 'weapon' ? 'wield' : 'wear';
  void requestIntent('equip', { op: 'equip', slot: def.equipSlot, item: it.id, source: 'inventory', invSlot: slot })
    .then((echo) => {
      if (echo.ok) msg(`You ${verb} the ${def.name}.`);
      else if (echo.error && echo.error !== 'inventory full') msg(echo.error);
    });
}

export function unequip(slotName: EquipSlot) {
  const p = state.player;
  const it = p.equipment[slotName];
  if (!it) return;
  // Server-authoritative: request the unequip; the granted item + cleared slot
  // come back in the echo and are applied by applyGrant.
  void requestIntent('equip', { op: 'unequip', slot: slotName, item: it.id, source: 'inventory' })
    .then((echo) => {
      if (!echo.ok && echo.error) {
        msg(echo.error === 'inventory full' ? "You don't have enough inventory space." : echo.error);
      }
    });
}

export function dropItem(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it) return;
  // server owns ground items: only drop while connected, or the item is lost
  if (!netSend({ t: 'drop', item: it.id, qty: it.qty, invSlot: slot })) {
    msg('You cannot drop items while disconnected.');
    return;
  }
}

// ---------------- Combat ----------------
export function equipBonus(kind: 'att' | 'str' | 'def' | 'ranged' | 'gun'): number {
  let b = 0;
  for (const it of Object.values(state.player.equipment)) {
    if (!it) continue;
    const d = ITEMS[it.id];
    b += kind === 'att' ? d.attBonus ?? 0
      : kind === 'str' ? d.strBonus ?? 0
      : kind === 'ranged' ? d.rangedBonus ?? 0
      : kind === 'gun' ? d.gunBonus ?? 0
      : d.defBonus ?? 0;
  }
  return b;
}

// ---------------- Weapon effects + special attack (docs/EFFECTS.md) ----------------
// Equipped items that carry combat effects or a spec, sent with each swing as
// plain ids; the server re-reads the actual effect data from its own item
// catalog, so the client can never invent effects.
export function effectGear(): string[] {
  const ids: string[] = [];
  for (const it of Object.values(state.player.equipment)) {
    if (!it) continue;
    const d = ITEMS[it.id];
    if ((d?.effects?.length || d?.spec) && !ids.includes(it.id)) ids.push(it.id);
  }
  return ids;
}

// The spec the player can currently fire: weapon first, then shield slot.
export function specItem(): { itemId: string; spec: SpecDef } | null {
  const p = state.player;
  for (const slot of ['weapon', 'shield'] as EquipSlot[]) {
    const it = p.equipment[slot];
    const spec = it ? ITEMS[it.id]?.spec : undefined;
    if (it && spec) return { itemId: it.id, spec };
  }
  return null;
}

// Arm/disarm the special attack (spec bar click). The next melee/ranged/gun
// swing consumes the energy and fires the spec.
export function toggleSpecAttack() {
  const p = state.player;
  const s = specItem();
  if (!s) { msg('Your equipment has no special attack.'); return; }
  if (!p.specArmed && p.specEnergy < s.spec.energy) {
    msg(`You need ${s.spec.energy}% special attack energy to use ${s.spec.name}.`);
    return;
  }
  p.specArmed = !p.specArmed;
  events.onStatsChange();
}

// Consume the armed spec for an outgoing swing; returns the spec item id (sent
// on the wire so the server knows whose spec def to run) or null.
function consumeSpec(): string | null {
  const p = state.player;
  if (!p.specArmed) return null;
  // offline: the swing intent can't reach the server — keep the energy and
  // stay armed rather than burning the spec on a dropped packet
  if (!netLink.send) return null;
  p.specArmed = false;
  const s = specItem();
  if (!s || p.specEnergy < s.spec.energy) { events.onStatsChange(); return null; }
  msg(`You unleash ${s.spec.name}!`, 'level');
  events.onStatsChange();
  return s.itemId;
}

export type AttackMode = 'melee' | 'ranged' | 'gun' | 'magic';
export function currentAttackMode(): AttackMode {
  const p = state.player;
  if (p.autocastSpell) {
    const spell = SPELLS.find((s) => s.id === p.autocastSpell);
    if (spell && spell.runes.every((r) => invCount(r.item) >= r.qty)) return 'magic';
  }
  const w = p.equipment.weapon ? ITEMS[p.equipment.weapon.id] : null;
  if (w && (w.id.includes('pistol') || w.id === 'glock_18')) return 'gun';
  if (w && (w.id.includes('shortbow') || w.id === 'shortbow')) return 'ranged';
  return 'melee';
}

function weaponSpeed(): number {
  const w = state.player.equipment.weapon;
  return (w ? ITEMS[w.id].attackSpeed : undefined) ?? 4;
}

function playerMaxHit(): number {
  const styleBonus = state.player.combatStyle === 'aggressive' ? 3 : 0;
  const effStr = Math.floor(level('Strength') * prayerMult('strength')) + styleBonus + 8;
  return Math.floor(0.5 + effStr * (equipBonus('str') + 64) / 640);
}
function rangedMaxHit(): number {
  const eff = level('Ranged') + 8;
  return Math.floor(0.5 + eff * (equipBonus('ranged') + 64) / 640);
}
function gunMaxHit(): number {
  const eff = level('Gun') + 8;
  return Math.floor(0.5 + eff * (equipBonus('gun') + 64) / 640);
}

// Combat resolution is server-authoritative: the client paths into range,
// consumes ammo/runes, plays the swing, and sends an intent. Hit rolls, NPC
// hp, deaths and drops all happen on the server (see server/sim.ts); xp lands
// when the server's youHit event comes back.
function remoteByName(name: string): RemotePlayer | undefined {
  return state.remotePlayers.find((r) => r.name === name);
}

function tickPlayerCombatPvp(targetName: string) {
  const p = state.player;
  const rp = remoteByName(targetName);
  if (!rp || rp.dead) { p.action = null; return; }
  const mode = currentAttackMode();
  const reach = mode === 'melee' ? 1 : 6;
  const dist = Math.max(Math.abs(p.x - rp.x), Math.abs(p.y - rp.y));
  if (dist > reach || (mode !== 'melee' && dist === 0)) {
    if (p.path.length === 0) {
      const path = findPath(p.x, p.y, rp.x, rp.y, true);
      if (path) p.path = path; else { p.action = null; }
    }
    return;
  }
  p.path = [];
  p.lastFacing = { dx: Math.sign(rp.x - p.x), dy: Math.sign(rp.y - p.y) };
  if (p.attackCooldown > 0) return;

  if (mode === 'magic') return castOnPlayer(targetName, rp);
  if (mode === 'ranged') return shootPlayer(targetName, rp);
  if (mode === 'gun') return shootPlayerGun(targetName, rp);

  p.attackCooldown = weaponSpeed();
  const styleAtt = p.combatStyle === 'accurate' ? 3 : 0;
  const effAtt = Math.floor(level('Attack') * prayerMult('attack')) + styleAtt;
  netSend({
    t: 'swing', target: targetName, mode: 'melee',
    eff: effAtt, bonus: equipBonus('att'), maxHit: playerMaxHit(), speed: weaponSpeed(),
  });
}

function shootPlayer(targetName: string, rp: RemotePlayer) {
  const p = state.player;
  const ammo = p.equipment.ammo;
  if (!ammo || !ammo.id.endsWith('_arrow')) { msg('You have no arrows equipped.'); p.action = null; return; }
  p.attackCooldown = weaponSpeed();
  const ammoId = ammo.id;
  ammo.qty--;
  if (ammo.qty <= 0) p.equipment.ammo = null;
  events.onInvChange();
  audio.sfx('bow');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: rp.x, toY: rp.y, startMs: performance.now(), durMs: 300, kind: 'arrow' });
  netSend({
    t: 'swing', target: targetName, mode: 'ranged',
    eff: level('Ranged'), bonus: equipBonus('ranged'), maxHit: rangedMaxHit(), speed: weaponSpeed(),
    ammo: ammoId,
  });
}

function shootPlayerGun(targetName: string, rp: RemotePlayer) {
  const p = state.player;
  const ammo = p.equipment.ammo;
  if (!ammo || !ammo.id.endsWith('_round')) { msg('You have no rounds equipped.'); p.action = null; return; }
  p.attackCooldown = weaponSpeed();
  const ammoId = ammo.id;
  ammo.qty--;
  if (ammo.qty <= 0) p.equipment.ammo = null;
  events.onInvChange();
  audio.sfx('gun');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: rp.x, toY: rp.y, startMs: performance.now(), durMs: 180, kind: 'bullet' });
  netSend({
    t: 'swing', target: targetName, mode: 'gun',
    eff: level('Gun'), bonus: equipBonus('gun'), maxHit: gunMaxHit(), speed: weaponSpeed(),
    ammo: ammoId,
  });
}

function castOnPlayer(targetName: string, rp: RemotePlayer) {
  const p = state.player;
  const spell = SPELLS.find((s) => s.id === p.autocastSpell);
  if (!spell) { p.action = null; return; }
  if (!spell.runes.every((r) => invCount(r.item) >= r.qty)) { msg("You don't have enough runes to cast this spell."); p.autocastSpell = null; p.action = null; return; }
  if (level('Magic') < spell.level) { msg(`You need a Magic level of ${spell.level} to cast ${spell.name}.`); p.autocastSpell = null; p.action = null; return; }
  p.attackCooldown = 5;
  audio.sfx('spell');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: rp.x, toY: rp.y, startMs: performance.now(), durMs: 400, kind: 'spell' });
  netSend({
    t: 'swing', target: targetName, mode: 'magic',
    eff: level('Magic'), bonus: 0, maxHit: spell.maxHit, speed: 5,
  });
}

function tickPlayerCombat(npc: Npc) {
  const p = state.player;
  if (npc.dead) { p.action = null; return; }
  const mode = currentAttackMode();
  const reach = mode === 'melee' ? 1 : 6; // ranged + gun share tile reach
  const dist = Math.max(Math.abs(p.x - npc.x), Math.abs(p.y - npc.y));
  if (dist > reach || (mode !== 'melee' && dist === 0)) {
    if (p.path.length === 0) {
      const path = findPath(p.x, p.y, npc.x, npc.y, true);
      if (path) p.path = path; else { p.action = null; }
    }
    return;
  }
  p.path = [];
  p.lastFacing = { dx: Math.sign(npc.x - p.x), dy: Math.sign(npc.y - p.y) };
  npc.target = 'player'; // optimistic; the server delta confirms
  if (p.attackCooldown > 0) return;

  if (mode === 'magic') return castOnNpc(npc);
  if (mode === 'ranged') return shootNpc(npc);
  if (mode === 'gun') return shootGun(npc);

  p.attackCooldown = weaponSpeed();
  const styleAtt = p.combatStyle === 'accurate' ? 3 : 0;
  const effAtt = Math.floor(level('Attack') * prayerMult('attack')) + styleAtt;
  const specId = consumeSpec();
  netSend({
    t: 'swing', npc: npc.sid, mode: 'melee',
    eff: effAtt, bonus: equipBonus('att'), maxHit: playerMaxHit(), speed: weaponSpeed(),
    gear: effectGear(), ...(specId ? { spec: specId } : {}),
  });
}

function shootNpc(npc: Npc) {
  const p = state.player;
  const ammo = p.equipment.ammo;
  if (!ammo || !ammo.id.endsWith('_arrow')) { msg('You have no arrows equipped.'); p.action = null; return; }
  p.attackCooldown = weaponSpeed();
  const ammoId = ammo.id;
  audio.sfx('bow');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: npc.x, toY: npc.y, startMs: performance.now(), durMs: 300, kind: 'arrow' });
  const specId = consumeSpec();
  netSend({
    t: 'swing', npc: npc.sid, mode: 'ranged',
    eff: level('Ranged'), bonus: equipBonus('ranged'), maxHit: rangedMaxHit(), speed: weaponSpeed(),
    ammo: ammoId, gear: effectGear(), ...(specId ? { spec: specId } : {}),
  });
}

function shootGun(npc: Npc) {
  const p = state.player;
  const ammo = p.equipment.ammo;
  if (!ammo || !ammo.id.endsWith('_round')) { msg('You have no rounds equipped.'); p.action = null; return; }
  p.attackCooldown = weaponSpeed();
  const ammoId = ammo.id;
  audio.sfx('gun');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: npc.x, toY: npc.y, startMs: performance.now(), durMs: 180, kind: 'bullet' });
  const specId = consumeSpec();
  netSend({
    t: 'swing', npc: npc.sid, mode: 'gun',
    eff: level('Gun'), bonus: equipBonus('gun'), maxHit: gunMaxHit(), speed: weaponSpeed(),
    ammo: ammoId, gear: effectGear(), ...(specId ? { spec: specId } : {}),
  });
}

function castOnNpc(npc: Npc) {
  const p = state.player;
  const spell = SPELLS.find((s) => s.id === p.autocastSpell);
  if (!spell) { p.action = null; return; }
  if (!spell.runes.every((r) => invCount(r.item) >= r.qty)) { msg("You don't have enough runes to cast this spell."); p.autocastSpell = null; p.action = null; return; }
  if (level('Magic') < spell.level) { msg(`You need a Magic level of ${spell.level} to cast ${spell.name}.`); p.autocastSpell = null; p.action = null; return; }
  p.attackCooldown = 5;
  audio.sfx('spell');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: npc.x, toY: npc.y, startMs: performance.now(), durMs: 400, kind: 'spell' });
  netSend({
    t: 'swing', npc: npc.sid, mode: 'magic',
    eff: level('Magic'), bonus: 0, maxHit: spell.maxHit, speed: 5,
    gear: effectGear(), // gear effects (lifesteal etc.) apply; specs are melee/ranged/gun only
  });
}

export function playerDeath() {
  const p = state.player;
  if (p.dead) return;
  p.dead = true;
  p.curHp = 0;
  p.activePrayers.clear();
  msg('Oh dear, you are dead!');
  events.onStatsChange();
  window.setTimeout(() => {
    p.x = 22; p.y = 38; p.prevX = 22; p.prevY = 38;
    p.path = []; p.action = null;
    p.curHp = level('Hitpoints');
    p.dead = false;
    p.energy = 100;
    for (const n of state.npcs) if (n.target === 'player') n.target = null;
    events.onStatsChange();
    saveGame();
  }, 2000);
}

// Combat snapshot the server uses for NPC retaliation rolls + aggro checks.
export function combatSnapshot() {
  const p = state.player;
  const maxHp = level('Hitpoints');
  return {
    t: 'stats',
    cb: combatLevel(),
    effDef: Math.floor(level('Defence') * prayerMult('defence')) + (p.combatStyle === 'defensive' ? 3 : 0),
    defBonus: equipBonus('def'),
    hp: p.curHp,
    maxHp,
    d: p.dead,
  };
}

// ---------------- Bank / shop ----------------
// Bank + shop are server-authoritative (docs/CONVERSION-CONTRACT §2). The client
// resolves the item id from the clicked slot, REQUESTS the intent, and the
// server validates possession/coins/stock and returns the inv<->bank /
// coins<->item delta which applyGrant reflects. The client never moves owned
// items itself; only the presentation-only shop stock counter is updated locally
// on a successful echo. The deposit/withdraw qty is recomputed + clamped server
// side — the client-supplied number is just a hint.
export function bankDeposit(slot: number, qty: number | 'all') {
  const it = state.player.inventory[slot];
  if (!it) return;
  void requestIntent('bank', { op: 'deposit', item: it.id, qty, invSlot: slot });
}

export function bankWithdraw(bankIdx: number, qty: number | 'all') {
  const b = state.player.bank[bankIdx];
  if (!b) return;
  void requestIntent('bank', { op: 'withdraw', item: b.id, qty })
    .then((echo) => {
      if (!echo.ok && echo.error === 'inventory full') msg("You don't have enough inventory space.");
    });
}

// per-shop live stock, keyed by shop id
import { SHOPS } from './defs';
export const shopStocks: Record<string, { item: string; qty: number }[]> = {};
export function getShopStock(shopId: string) {
  if (!shopStocks[shopId]) shopStocks[shopId] = (SHOPS[shopId]?.stock ?? []).map((s) => ({ ...s }));
  return shopStocks[shopId];
}

export function shopBuy(shopId: string, itemId: string) {
  const stock = getShopStock(shopId);
  const entry = stock.find((s) => s.item === itemId);
  if (!entry || entry.qty <= 0) { msg('The shop has run out of stock.'); return; }
  // Server validates stock membership, price, coins, and room; the coins<->item
  // delta is applied by applyGrant. Only the local presentation stock counter is
  // decremented here, on success.
  void requestIntent('shop', { op: 'buy', shop: shopId, item: itemId })
    .then((echo) => {
      if (echo.ok) { entry.qty--; audio.sfx('coins'); events.onBankShopChange(); }
      else if (echo.error === 'not enough coins') msg("You don't have enough coins.");
      else if (echo.error === 'inventory full') msg("You don't have enough inventory space.");
      else if (echo.error === 'frozen') msg('The shops are closed for business.');
    });
}

export function shopSell(shopId: string, slot: number) {
  const it = state.player.inventory[slot];
  if (!it || it.id === 'coins') return;
  const stock = getShopStock(shopId);
  const itemId = it.id;
  // Server validates possession and computes the proceeds; applyGrant credits the
  // coins and removes the item. Only the presentation stock counter is bumped
  // locally, on success.
  void requestIntent('shop', { op: 'sell', shop: shopId, item: itemId, invSlot: slot })
    .then((echo) => {
      if (echo.ok) {
        const entry = stock.find((s) => s.item === itemId);
        if (entry) entry.qty++; else stock.push({ item: itemId, qty: 1 });
        audio.sfx('coins');
        events.onBankShopChange();
      } else if (echo.error === 'frozen') {
        msg('The shops are closed for business.');
      }
    });
}

export function openBank() { state.bankOpen = true; events.onBankShopChange(); }
export function openShop(shopId: string) { state.shopOpen = shopId; events.onBankShopChange(); }
