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
  freeSlots, requestIntent,
  level, hasTool,
} from '../game';
import { SKILL_OBJS } from '../defs';
import { audio } from '../audio';

// ---------------- helpers (mirrored from content.ts) ----------------

// Per-tick success probability — COSMETIC only now (drives tree/rock depletion
// animation; the server rolls the actual grant).
function successRollChance(lvl: number, reqLevel: number, low: number, high: number): number {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return low + (high - low) * t;
}

let lastMsgAction: unknown = null;
function onceMsg(text: string) {
  if (state.player.action !== lastMsgAction) {
    lastMsgAction = state.player.action;
    msg(text);
  }
}

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
    // Server-authoritative gather: the server validates the tree@tile + tool +
    // level, rolls success, and grants the logs + Woodcutting xp. The depletion
    // below is COSMETIC only.
    void requestIntent('gather', { obj: type, x: o.x, y: o.y });
    if (Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
      o.depletedUntil = state.tick + data.respawn;
      o.depletedAs = 'stump';
      return 'done';
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
    // Server-authoritative gather: server rolls + grants the ore + Mining xp.
    void requestIntent('gather', { obj: type, x: o.x, y: o.y });
    if (data.depleteChance > 0 && Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
      o.depletedUntil = state.tick + data.respawn;
      o.depletedAs = 'rocks_empty';
      return 'done';
    }
    return 'continue';
  });
}

// ============================================================================
// MINING — gem rocks (weighted random gem instead of a fixed ore)
// ============================================================================
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
    // Server-authoritative gem mining: server validates the gem rock tile +
    // level/tool and grants the gem + Mining xp.
    void requestIntent('mine-gem', { x: o.x, y: o.y });
    if (data.depleteChance > 0 && Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
      o.depletedUntil = state.tick + data.respawn;
      o.depletedAs = 'rocks_empty';
      return 'done';
    }
    return 'continue';
  });
}

// ============================================================================
// POTIONS — Drink actions for the new brews
// ============================================================================
registerItemAction('prayer_potion', 'Drink', (slot) => {
  void requestIntent('consume', { item: 'prayer_potion', invSlot: slot }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('pray');
    msg('You drink the prayer potion. A calm, chapel-cold feeling restores your spirit.');
    events.onStatsChange();
  });
});

// NOTE: like attack/defence potions in content.ts, this is flavor-only in v1 —
// no real stat boost is applied yet.
registerItemAction('super_attack', 'Drink', (slot) => {
  void requestIntent('consume', { item: 'super_attack', invSlot: slot }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('eat');
    msg('You drink the super attack potion. Your arms feel ready for anything.');
  });
});

export {};
