// Core game state + 600ms tick simulation: movement, combat, NPCs, registries.
// Skill content lives in content.ts/quests.ts and plugs in via the registries below.

import {
  SKILLS, SkillName, levelForXp, XP_TABLE, ITEMS, NPCS, NpcDef,
  TICK_MS, EquipSlot, SPELLS, PRAYERS,
} from './defs';
import {
  buildWorld, blocked, findPath, objects, objectAt, removeObject,
  WorldObject, GroundItem, key, groundSpawns,
} from './world';
import { audio, trackForRegion, TRACKS } from './audio';

export interface ItemStack { id: string; qty: number; }

export interface Npc {
  def: NpcDef;
  x: number; y: number;
  prevX: number; prevY: number;
  spawnX: number; spawnY: number;
  hp: number;
  dead: boolean;
  respawnAt: number;
  target: 'player' | null;
  attackCooldown: number;
  wanderCooldown: number;
  hitsplat: { dmg: number; until: number } | null;
  lastDamagedAt: number;
  meta: Record<string, any>;
}

export type CombatStyle = 'accurate' | 'aggressive' | 'defensive';

// Generic interaction handler: called once per tick while adjacent; return 'done' to stop.
export type InteractResult = 'done' | 'continue';
export type ObjectHandler = (o: WorldObject) => InteractResult;
export type NpcHandler = (n: Npc) => InteractResult;

export interface PendingAction {
  type: 'attack' | 'pickup' | 'interact-obj' | 'interact-npc';
  obj?: WorldObject;
  npc?: Npc;
  ground?: GroundItem;
  handler?: ObjectHandler | NpcHandler;
  onTop?: boolean; // action requires standing on the tile (non-blocking objects)
}

export interface Projectile { fromX: number; fromY: number; toX: number; toY: number; startMs: number; durMs: number; kind: 'arrow' | 'spell'; }

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'body', 'legs', 'weapon', 'shield', 'gloves', 'boots', 'ammo', 'neck', 'ring'];

export interface Player {
  name: string;
  x: number; y: number;
  prevX: number; prevY: number;
  path: { x: number; y: number }[];
  run: boolean;
  energy: number;
  xp: number[];
  curHp: number;
  prayerPoints: number;
  activePrayers: Set<string>;
  inventory: (ItemStack | null)[];
  equipment: Record<EquipSlot, ItemStack | null>;
  bank: ItemStack[];
  quests: Record<string, number>;
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
  chat?: { text: string; until: number };
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
  const mage = 0.325 * Math.floor(level('Magic') * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

function aOrAn(s: string) { return /^[AEIOU]/.test(s) ? 'an' : 'a'; }

export function addXp(name: SkillName, amount: number) {
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

export function addItem(id: string, qty = 1): boolean {
  const def = ITEMS[id];
  const inv = state.player.inventory;
  if (def.stackable) {
    const slot = inv.find((s) => s && s.id === id);
    if (slot) { slot.qty += qty; events.onInvChange(); return true; }
    const i = inv.indexOf(null);
    if (i < 0) return false;
    inv[i] = { id, qty };
    events.onInvChange();
    return true;
  }
  for (let n = 0; n < qty; n++) {
    const i = inv.indexOf(null);
    if (i < 0) { events.onInvChange(); return n > 0; }
    inv[i] = { id, qty: 1 };
  }
  events.onInvChange();
  return true;
}

export function removeItem(id: string, qty = 1): boolean {
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

export function removeFromSlot(slot: number, qty = 1) {
  const it = state.player.inventory[slot];
  if (!it) return;
  it.qty -= qty;
  if (it.qty <= 0) state.player.inventory[slot] = null;
  events.onInvChange();
}

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

// Extra NPC spawns registered by content packs before initGame runs.
const extraNpcSpawns: { id: string; x: number; y: number }[] = [];
export function registerNpcSpawn(id: string, x: number, y: number) {
  extraNpcSpawns.push({ id, x, y });
}

function freshPlayer(): Player {
  const xp = SKILLS.map(() => 0);
  xp[skillIdx('Hitpoints')] = XP_TABLE[10];
  const equipment = {} as Record<EquipSlot, ItemStack | null>;
  for (const s of EQUIP_SLOTS) equipment[s] = null;
  return {
    name: 'Adventurer',
    x: 22, y: 38, prevX: 22, prevY: 38,
    path: [], run: false, energy: 100,
    xp, curHp: 10,
    prayerPoints: 1,
    activePrayers: new Set(),
    inventory: new Array(28).fill(null),
    equipment,
    bank: [{ id: 'coins', qty: 25 }],
    quests: {},
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
    inventory: p.inventory, equipment: p.equipment, bank: p.bank,
    quests: p.quests, slayerTask: p.slayerTask, combatStyle: p.combatStyle,
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
    if (Array.isArray(d.xp) && d.xp.length === SKILLS.length) p.xp = d.xp;
    p.curHp = d.curHp ?? p.curHp;
    p.prayerPoints = d.prayerPoints ?? p.prayerPoints;
    p.run = d.run ?? false; p.energy = d.energy ?? 100;
    if (Array.isArray(d.inventory)) p.inventory = d.inventory;
    if (d.equipment) for (const s of EQUIP_SLOTS) p.equipment[s] = d.equipment[s] ?? null;
    if (Array.isArray(d.bank)) p.bank = d.bank;
    p.quests = d.quests ?? {};
    p.slayerTask = d.slayerTask ?? null;
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
  if (!loaded) {
    addItem('bronze_sword'); addItem('wooden_shield'); addItem('bronze_axe');
    addItem('tinderbox'); addItem('small_net'); addItem('bronze_pickaxe');
    addItem('bread'); addItem('coins', 25);
  }
  if (blocked(state.player.x, state.player.y)) { state.player.x = 22; state.player.y = 38; }
  spawnNpcs();
  initGroundSpawns();
  msg(loaded ? `Welcome back to Larpscape, ${state.player.name}.` : 'Welcome to Larpscape.');
}

function spawnNpcs() {
  const spawn = (id: string, x: number, y: number) => {
    const def = NPCS[id];
    if (!def) return;
    state.npcs.push({
      def, x, y, prevX: x, prevY: y, spawnX: x, spawnY: y,
      hp: def.hitpoints, dead: false, respawnAt: 0, target: null,
      attackCooldown: 0, wanderCooldown: 0, hitsplat: null, lastDamagedAt: -100, meta: {},
    });
  };
  for (const [x, y] of [[56, 30], [60, 34], [64, 28], [58, 44], [63, 42], [68, 36], [55, 38]]) spawn('goblin', x, y);
  for (const [x, y] of [[57, 10], [61, 13], [65, 9], [67, 16], [59, 17]]) spawn('cow', x, y);
  for (const [x, y] of [[30, 10], [33, 12], [36, 10], [31, 14], [35, 14]]) spawn('chicken', x, y);
  spawn('man', 32, 36); spawn('man', 25, 34); spawn('man', 38, 42);
  spawn('giant_rat', 18, 62); spawn('giant_rat', 26, 72); spawn('giant_rat', 22, 67);
  spawn('shopkeeper', 35, 49);
  spawn('banker', 17, 31);
  // overhaul NPCs
  for (const [x, y] of [[17, 12], [20, 15], [23, 11], [18, 17], [22, 14]]) spawn('sheep', x, y);
  spawn('tanner', 37, 56);
  spawn('slayer_master', 30, 35);
  spawn('magic_tutor', 42, 30);
  spawn('gardener', 36, 23);
  spawn('cook', 17, 43);
  spawn('carpenter', 23, 53);
  // pack-registered spawns (bosses, city NPCs, etc.)
  for (const s of extraNpcSpawns) spawn(s.id, s.x, s.y);
}

// respawning ground item spawns (eggs, herbs)
const spawnState: { item: string; x: number; y: number; respawnTicks: number; nextAt: number }[] = [];
function initGroundSpawns() {
  for (const s of groundSpawns ?? []) spawnState.push({ ...s, nextAt: 0 });
}
function tickGroundSpawns() {
  for (const s of spawnState) {
    const present = state.groundItems.some((g) => g.x === s.x && g.y === s.y && g.item === s.item);
    if (present) continue;
    if (s.nextAt === 0) { s.nextAt = state.tick + s.respawnTicks; continue; }
    if (state.tick >= s.nextAt) {
      state.groundItems.push({ item: s.item, qty: 1, x: s.x, y: s.y, expiresAt: Infinity });
      s.nextAt = 0;
    }
  }
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
  state.groundItems = state.groundItems.filter((gi) => state.tick < gi.expiresAt);
  state.projectiles = state.projectiles.filter((pr) => performance.now() < pr.startMs + pr.durMs + 200);
  tickGroundSpawns();

  if (p.dead) return;

  if (state.tick % 2 === 0 && p.energy < 100 && p.path.length === 0) p.energy = Math.min(100, p.energy + 1);
  if (state.tick % 100 === 0 && p.curHp < level('Hitpoints')) { p.curHp++; events.onStatsChange(); }
  tickPrayerDrain();

  movePlayer();
  performAction();
  tickNpcs();
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
      if (addItem(gi.item, gi.qty)) {
        state.groundItems.splice(state.groundItems.indexOf(gi), 1);
        if (gi.item === 'coins') audio.sfx('coins');
      } else msg("You don't have enough inventory space.");
      p.action = null;
    }
    return;
  }

  if (a.type === 'attack' && a.npc) { tickPlayerCombat(a.npc); return; }

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
  const p = state.player;
  const def = PRAYERS.find((pr) => pr.id === id);
  if (!def) return;
  if (level('Prayer') < def.level) { msg(`You need a Prayer level of ${def.level} to use ${def.name}.`); return; }
  if (p.activePrayers.has(id)) p.activePrayers.delete(id);
  else {
    if (p.prayerPoints <= 0) { msg('You have run out of prayer points; you can recharge at an altar.'); return; }
    // only one prayer per boost type
    for (const other of PRAYERS) if (other.boost === def.boost && other.id !== id) p.activePrayers.delete(other.id);
    p.activePrayers.add(id);
    audio.sfx('pray');
  }
  events.onStatsChange();
}

let prayerDrainAcc = 0;
function tickPrayerDrain() {
  const p = state.player;
  if (p.activePrayers.size === 0) return;
  let drain = 0;
  for (const id of p.activePrayers) drain += PRAYERS.find((pr) => pr.id === id)?.drain ?? 0;
  prayerDrainAcc += drain;
  while (prayerDrainAcc >= 100) {
    prayerDrainAcc -= 100;
    p.prayerPoints = Math.max(0, p.prayerPoints - 1);
  }
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
  const p = state.player;
  p.prayerPoints = level('Prayer');
  audio.sfx('pray');
  msg('You recharge your prayer points.');
  events.onStatsChange();
}

// ---------------- Items: generic behaviors ----------------
export function eatFood(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def.edible) return;
  removeFromSlot(slot);
  p.curHp = Math.min(level('Hitpoints'), p.curHp + def.edible.heals);
  audio.sfx('eat');
  msg(`You eat the ${def.name.toLowerCase()}. It heals some health.`);
  events.onStatsChange();
}

export function buryBones(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it || !ITEMS[it.id].buryXp) return;
  const xp = ITEMS[it.id].buryXp!;
  removeFromSlot(slot);
  audio.sfx('bury');
  msg('You dig a hole in the ground...');
  msg('You bury the bones.');
  addXp('Prayer', xp);
}

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
  const cur = p.equipment[def.equipSlot];
  if (def.stackable && cur && cur.id === it.id) {
    cur.qty += it.qty;
    p.inventory[slot] = null;
  } else {
    p.inventory[slot] = cur;
    p.equipment[def.equipSlot] = it;
  }
  msg(`You ${def.equipSlot === 'weapon' ? 'wield' : 'wear'} the ${def.name}.`);
  events.onInvChange(); events.onStatsChange();
}

export function unequip(slotName: EquipSlot) {
  const p = state.player;
  const it = p.equipment[slotName];
  if (!it) return;
  const def = ITEMS[it.id];
  if (def.stackable) {
    if (!addItem(it.id, it.qty) ) { msg("You don't have enough inventory space."); return; }
  } else {
    const i = p.inventory.indexOf(null);
    if (i < 0) { msg("You don't have enough inventory space."); return; }
    p.inventory[i] = it;
  }
  p.equipment[slotName] = null;
  events.onInvChange(); events.onStatsChange();
}

export function dropItem(slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it) return;
  p.inventory[slot] = null;
  state.groundItems.push({ item: it.id, qty: it.qty, x: p.x, y: p.y, expiresAt: state.tick + 200 });
  events.onInvChange();
}

// ---------------- Combat ----------------
export function equipBonus(kind: 'att' | 'str' | 'def' | 'ranged'): number {
  let b = 0;
  for (const it of Object.values(state.player.equipment)) {
    if (!it) continue;
    const d = ITEMS[it.id];
    b += kind === 'att' ? d.attBonus ?? 0
      : kind === 'str' ? d.strBonus ?? 0
      : kind === 'ranged' ? d.rangedBonus ?? 0
      : d.defBonus ?? 0;
  }
  return b;
}

function rollHit(attLvl: number, attBonus: number, defLvl: number, defBonus: number): boolean {
  const attRoll = (attLvl + 8) * (attBonus + 64);
  const defRoll = (defLvl + 8) * (defBonus + 64);
  const chance = attRoll > defRoll ? 1 - (defRoll + 2) / (2 * (attRoll + 1)) : attRoll / (2 * (defRoll + 1));
  return Math.random() < chance;
}

export type AttackMode = 'melee' | 'ranged' | 'magic';
export function currentAttackMode(): AttackMode {
  const p = state.player;
  if (p.autocastSpell) {
    const spell = SPELLS.find((s) => s.id === p.autocastSpell);
    if (spell && spell.runes.every((r) => invCount(r.item) >= r.qty)) return 'magic';
  }
  const w = p.equipment.weapon ? ITEMS[p.equipment.weapon.id] : null;
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

function tickPlayerCombat(npc: Npc) {
  const p = state.player;
  if (npc.dead) { p.action = null; return; }
  const mode = currentAttackMode();
  const reach = mode === 'melee' ? 1 : 6;
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
  npc.target = 'player';
  if (p.attackCooldown > 0) return;

  if (mode === 'magic') return castOnNpc(npc);
  if (mode === 'ranged') return shootNpc(npc);

  p.attackCooldown = weaponSpeed();
  const styleAtt = p.combatStyle === 'accurate' ? 3 : 0;
  const effAtt = Math.floor(level('Attack') * prayerMult('attack')) + styleAtt;
  const hit = rollHit(effAtt, equipBonus('att'), npc.def.defence, 0);
  const dmg = hit ? Math.floor(Math.random() * (playerMaxHit() + 1)) : 0;
  applyDamageToNpc(npc, dmg);
  if (dmg > 0) {
    if (p.combatStyle === 'accurate') addXp('Attack', dmg * 4);
    else if (p.combatStyle === 'aggressive') addXp('Strength', dmg * 4);
    else addXp('Defence', dmg * 4);
    addXp('Hitpoints', dmg * 1.33);
  }
}

function shootNpc(npc: Npc) {
  const p = state.player;
  const ammo = p.equipment.ammo;
  if (!ammo || !ammo.id.endsWith('_arrow')) { msg('You have no arrows equipped.'); p.action = null; return; }
  p.attackCooldown = weaponSpeed();
  ammo.qty--;
  if (ammo.qty <= 0) p.equipment.ammo = null;
  events.onInvChange();
  audio.sfx('bow');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: npc.x, toY: npc.y, startMs: performance.now(), durMs: 300, kind: 'arrow' });
  const hit = rollHit(level('Ranged'), equipBonus('ranged'), npc.def.defence, 0);
  const dmg = hit ? Math.floor(Math.random() * (rangedMaxHit() + 1)) : 0;
  window.setTimeout(() => { /* visual delay only */ }, 0);
  applyDamageToNpc(npc, dmg);
  if (dmg > 0) { addXp('Ranged', dmg * 4); addXp('Hitpoints', dmg * 1.33); }
  // ~20% arrow recovery on the ground
  if (Math.random() < 0.2) state.groundItems.push({ item: ammo.id ?? 'bronze_arrow', qty: 1, x: npc.x, y: npc.y, expiresAt: state.tick + 100 });
}

function castOnNpc(npc: Npc) {
  const p = state.player;
  const spell = SPELLS.find((s) => s.id === p.autocastSpell);
  if (!spell) { p.action = null; return; }
  if (!spell.runes.every((r) => invCount(r.item) >= r.qty)) { msg("You don't have enough runes to cast this spell."); p.autocastSpell = null; p.action = null; return; }
  if (level('Magic') < spell.level) { msg(`You need a Magic level of ${spell.level} to cast ${spell.name}.`); p.autocastSpell = null; p.action = null; return; }
  p.attackCooldown = 5;
  for (const r of spell.runes) removeItem(r.item, r.qty);
  audio.sfx('spell');
  state.projectiles.push({ fromX: p.x, fromY: p.y, toX: npc.x, toY: npc.y, startMs: performance.now(), durMs: 400, kind: 'spell' });
  // magic accuracy: magic level vs flat defence
  const hit = rollHit(level('Magic'), 0, npc.def.defence, 0);
  const dmg = hit ? Math.floor(Math.random() * (spell.maxHit + 1)) : 0;
  applyDamageToNpc(npc, dmg);
  addXp('Magic', spell.xp + dmg * 2);
  if (dmg > 0) addXp('Hitpoints', dmg * 1.33);
}

export function applyDamageToNpc(npc: Npc, dmg: number) {
  const p = state.player;
  npc.hp -= dmg;
  npc.hitsplat = { dmg, until: performance.now() + 900 };
  npc.lastDamagedAt = state.tick;
  audio.sfx(dmg > 0 ? 'hit' : 'miss');
  if (npc.hp <= 0) {
    npc.dead = true;
    npc.respawnAt = state.tick + npc.def.respawnTicks;
    npc.target = null;
    if (p.action?.npc === npc) p.action = null;
    // slayer task credit
    const task = p.slayerTask;
    if (task && task.npc === npc.def.id && task.remaining > 0) {
      task.remaining--;
      addXp('Slayer', npc.def.hitpoints);
      if (task.remaining === 0) {
        msg("You've completed your slayer task; return to Brogan for another.", 'level');
        addXp('Slayer', 20);
      }
    }
    for (const d of npc.def.drops) {
      if (Math.random() < d.chance) {
        const qty = d.qty[0] + Math.floor(Math.random() * (d.qty[1] - d.qty[0] + 1));
        state.groundItems.push({ item: d.item, qty, x: npc.x, y: npc.y, expiresAt: state.tick + 200 });
      }
    }
  }
}

function tickNpcs() {
  const p = state.player;
  const playerCb = combatLevel();
  for (const n of state.npcs) {
    n.prevX = n.x; n.prevY = n.y;
    if (n.dead) {
      if (state.tick >= n.respawnAt) {
        n.dead = false; n.hp = n.def.hitpoints;
        n.x = n.spawnX; n.y = n.spawnY; n.prevX = n.x; n.prevY = n.y;
        n.target = null; n.meta = {};
      }
      continue;
    }
    if (n.attackCooldown > 0) n.attackCooldown--;

    // aggression
    if (!n.target && n.def.aggressive && !p.dead && playerCb <= n.def.combatLevel * 2 + 1) {
      const dist = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
      if (dist <= 4) n.target = 'player';
    }

    if (n.target === 'player' && !p.dead) {
      const dist = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
      const distFromSpawn = Math.max(Math.abs(n.spawnX - n.x), Math.abs(n.spawnY - n.y));
      if (dist > 12 || distFromSpawn > 16) { n.target = null; continue; }
      if (dist > 1) {
        const dx = Math.sign(p.x - n.x), dy = Math.sign(p.y - n.y);
        const tryMoves = [[dx, dy], [dx, 0], [0, dy]];
        for (const [mx, my] of tryMoves) {
          if ((mx || my) && !blocked(n.x + mx, n.y + my, true) && !(n.x + mx === p.x && n.y + my === p.y)) {
            n.x += mx; n.y += my; break;
          }
        }
      } else if (n.attackCooldown === 0) {
        n.attackCooldown = n.def.attackSpeed;
        const effDef = Math.floor(level('Defence') * prayerMult('defence')) + (p.combatStyle === 'defensive' ? 3 : 0);
        const hit = rollHit(n.def.attack, 0, effDef, equipBonus('def'));
        const maxHit = Math.floor(0.5 + (n.def.strength + 8) * 64 / 640) + 1;
        const dmg = hit ? Math.floor(Math.random() * (maxHit + 1)) : 0;
        p.curHp -= dmg;
        p.hitsplat = { dmg, until: performance.now() + 900 };
        audio.sfx(dmg > 0 ? 'hit' : 'miss');
        events.onStatsChange();
        if (p.curHp <= 0) playerDeath();
      }
    } else {
      if (n.wanderCooldown > 0) { n.wanderCooldown--; continue; }
      if (Math.random() < 0.2) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = n.x + dx, ny = n.y + dy;
        if (Math.abs(nx - n.spawnX) <= 5 && Math.abs(ny - n.spawnY) <= 5 && !blocked(nx, ny, true) && !(nx === p.x && ny === p.y)) {
          n.x = nx; n.y = ny;
        }
        n.wanderCooldown = 2 + Math.floor(Math.random() * 4);
      }
    }
  }
}

function playerDeath() {
  const p = state.player;
  p.dead = true;
  p.curHp = 0;
  p.activePrayers.clear();
  msg('Oh dear, you are dead!');
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

// ---------------- Bank / shop ----------------
export function bankDeposit(slot: number, qty: number | 'all') {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it) return;
  const id = it.id;
  const have = invCount(id);
  const n = qty === 'all' ? have : Math.min(qty, have);
  if (n <= 0) return;
  removeItem(id, n);
  const b = p.bank.find((s) => s.id === id);
  if (b) b.qty += n; else p.bank.push({ id, qty: n });
  events.onInvChange(); events.onBankShopChange();
}

export function bankWithdraw(bankIdx: number, qty: number | 'all') {
  const p = state.player;
  const b = p.bank[bankIdx];
  if (!b) return;
  const def = ITEMS[b.id];
  const want = qty === 'all' ? b.qty : Math.min(qty, b.qty);
  let took = 0;
  if (def.stackable) {
    if (addItem(b.id, want)) took = want;
    else msg("You don't have enough inventory space.");
  } else {
    for (let i = 0; i < want; i++) {
      if (freeSlots() === 0) { if (took === 0) msg("You don't have enough inventory space."); break; }
      addItem(b.id, 1); took++;
    }
  }
  b.qty -= took;
  if (b.qty <= 0) p.bank.splice(bankIdx, 1);
  events.onInvChange(); events.onBankShopChange();
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
  const price = Math.max(1, Math.ceil(ITEMS[itemId].value));
  if (invCount('coins') < price) { msg("You don't have enough coins."); return; }
  if (freeSlots() === 0 && !(ITEMS[itemId].stackable && hasItem(itemId))) { msg("You don't have enough inventory space."); return; }
  removeItem('coins', price);
  addItem(itemId, 1);
  entry.qty--;
  audio.sfx('coins');
  events.onBankShopChange();
}

export function shopSell(shopId: string, slot: number) {
  const p = state.player;
  const it = p.inventory[slot];
  if (!it || it.id === 'coins') return;
  const stock = getShopStock(shopId);
  const price = Math.max(1, Math.floor(ITEMS[it.id].value * 0.4));
  removeFromSlot(slot, ITEMS[it.id].stackable ? it.qty : 1);
  addItem('coins', price * (ITEMS[it.id].stackable ? 1 : 1));
  const entry = stock.find((s) => s.item === it.id);
  if (entry) entry.qty++; else stock.push({ item: it.id, qty: 1 });
  audio.sfx('coins');
  events.onBankShopChange();
}

export function openBank() { state.bankOpen = true; events.onBankShopChange(); }
export function openShop(shopId: string) { state.shopOpen = shopId; events.onBankShopChange(); }
