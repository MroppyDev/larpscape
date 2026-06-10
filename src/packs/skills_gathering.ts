// Phase 6 gathering content: high-tier trees (maple/yew/magic), gold/runite/gem
// rocks, and Drink wiring for the new potions. Mirrors the chop/mine handlers in
// src/content.ts. region_port.ts owns lobster/harpoon spots; farming for the new
// seeds (sweetcorn/watermelon) is already covered because content.ts iterates
// SEEDS from defs.ts at registration time, and big-bones burying is data-driven
// via ItemDef.buryXp (game.ts buryBones + ui.ts 'Bury' option). Nothing new for
// Hunter. Imported for side effects via src/packs/index.ts.

import {
  state, msg, events,
  registerObjectAction, registerItemAction,
  addItem, removeFromSlot, freeSlots,
  addXp, level, hasTool,
} from '../game';
import { ITEMS, SKILL_OBJS } from '../defs';
import { audio } from '../audio';

// ---------------- helpers (mirrored from content.ts) ----------------

function successRoll(lvl: number, reqLevel: number, low: number, high: number): boolean {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return Math.random() < low + (high - low) * t;
}

let lastMsgAction: unknown = null;
function onceMsg(text: string) {
  if (state.player.action !== lastMsgAction) {
    lastMsgAction = state.player.action;
    msg(text);
  }
}

function lowName(id: string) { return (ITEMS[id]?.name ?? id).toLowerCase(); }
function aOrAn(s: string) { return /^[aeiou]/.test(s) ? 'an' : 'a'; }

// ============================================================================
// WOODCUTTING — maple / yew / magic tree
// ============================================================================
for (const type of ['maple', 'yew', 'magic_tree']) {
  const data = SKILL_OBJS[type];
  registerObjectAction(type, 'Chop down', (o) => {
    if (o.depletedUntil > 0) { msg('Someone has chopped this tree down.'); return 'done'; }
    if (!hasTool('bronze_axe')) { msg('You need an axe to chop down this tree.'); return 'done'; }
    const lvl = level('Woodcutting');
    if (lvl < data.level) { msg(`You need a Woodcutting level of ${data.level} to chop this tree.`); return 'done'; }
    if (freeSlots() === 0) { msg('Your inventory is too full to hold any more logs.'); return 'done'; }
    onceMsg('You swing your axe at the tree...');
    audio.sfx('chop');
    if (successRoll(lvl, data.level, data.lowRate, data.highRate)) {
      addItem(data.item);
      addXp('Woodcutting', data.xp);
      msg(`You get some ${lowName(data.item)}.`);
      if (Math.random() < data.depleteChance) {
        o.depletedUntil = state.tick + data.respawn;
        o.depletedAs = 'stump';
        return 'done';
      }
    }
    return 'continue';
  });
}

// ============================================================================
// MINING — gold / runite rocks
// ============================================================================
for (const type of ['rocks_gold', 'rocks_runite']) {
  const data = SKILL_OBJS[type];
  registerObjectAction(type, 'Mine', (o) => {
    if (o.depletedUntil > 0) { msg('There is no ore left in this rock.'); return 'done'; }
    if (!hasTool('bronze_pickaxe')) { msg('You need a pickaxe to mine this rock.'); return 'done'; }
    const lvl = level('Mining');
    if (lvl < data.level) { msg(`You need a Mining level of ${data.level} to mine this rock.`); return 'done'; }
    if (freeSlots() === 0) { msg('Your inventory is too full to hold any more ore.'); return 'done'; }
    onceMsg('You swing your pick at the rock...');
    audio.sfx('mine');
    if (successRoll(lvl, data.level, data.lowRate, data.highRate)) {
      addItem(data.item);
      addXp('Mining', data.xp);
      msg(`You manage to mine some ${lowName(data.item)}.`);
      if (data.depleteChance > 0 && Math.random() < data.depleteChance) {
        o.depletedUntil = state.tick + data.respawn;
        o.depletedAs = 'rocks_empty';
        return 'done';
      }
    }
    return 'continue';
  });
}

// ============================================================================
// MINING — gem rocks (weighted random gem instead of a fixed ore)
// ============================================================================
const GEM_ROCK_TABLE: { item: string; weight: number }[] = [
  { item: 'uncut_sapphire', weight: 50 },
  { item: 'uncut_emerald', weight: 30 },
  { item: 'uncut_ruby', weight: 20 },
];

function rollGem(): string {
  let r = Math.random() * GEM_ROCK_TABLE.reduce((s, g) => s + g.weight, 0);
  for (const g of GEM_ROCK_TABLE) {
    r -= g.weight;
    if (r < 0) return g.item;
  }
  return GEM_ROCK_TABLE[0].item;
}

{
  const data = SKILL_OBJS.rocks_gem;
  registerObjectAction('rocks_gem', 'Mine', (o) => {
    if (o.depletedUntil > 0) { msg('There are no gems left in this rock.'); return 'done'; }
    if (!hasTool('bronze_pickaxe')) { msg('You need a pickaxe to mine this rock.'); return 'done'; }
    const lvl = level('Mining');
    if (lvl < data.level) { msg(`You need a Mining level of ${data.level} to mine this rock.`); return 'done'; }
    if (freeSlots() === 0) { msg('Your inventory is too full to hold any more gems.'); return 'done'; }
    onceMsg('You swing your pick at the glittering seam...');
    audio.sfx('mine');
    if (successRoll(lvl, data.level, data.lowRate, data.highRate)) {
      const gem = rollGem();
      addItem(gem);
      addXp('Mining', data.xp);
      msg(`You chip ${aOrAn(lowName(gem))} ${lowName(gem)} out of the rock.`);
      if (data.depleteChance > 0 && Math.random() < data.depleteChance) {
        o.depletedUntil = state.tick + data.respawn;
        o.depletedAs = 'rocks_empty';
        return 'done';
      }
    }
    return 'continue';
  });
}

// ============================================================================
// POTIONS — Drink actions for the new brews
// ============================================================================
registerItemAction('prayer_potion', 'Drink', (slot) => {
  const p = state.player;
  const restore = ITEMS.prayer_potion.restoresPrayer ?? 25;
  removeFromSlot(slot);
  p.prayerPoints = Math.min(level('Prayer'), p.prayerPoints + restore);
  audio.sfx('pray');
  msg('You drink the prayer potion. A calm, chapel-cold feeling restores your spirit.');
  events.onStatsChange();
});

// NOTE: like attack/defence potions in content.ts, this is flavor-only in v1 —
// no real stat boost is applied yet.
registerItemAction('super_attack', 'Drink', (slot) => {
  removeFromSlot(slot);
  audio.sfx('eat');
  msg('You drink the super attack potion. Your arms feel ready for anything.');
});

export {};
