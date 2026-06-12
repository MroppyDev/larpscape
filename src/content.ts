// Skill content: registers handlers for all skills via the game.ts registries.
// Imported for side effects by main.ts.

import {
  state, msg, events, startDialogue, showOptions, requestMake, startAction,
  registerObjectAction, registerNpcAction, registerItemAction,
  registerItemOnObject, registerItemOnItem, registerTickHook,
  invCount, hasItem, hasTool, freeSlots,
  level, openShop, openBank, rechargePrayer, sendInteract, sendIntent,
  requestIntent,
  Npc, MakeOption,
} from './game';
import {
  ITEMS, NPCS, SKILL_OBJS, COOKABLES, SMELTABLES, SMITHABLES, FLETCHABLES,
  CRAFTABLES, HERBS, POTIONS, SEEDS, CONSTRUCTION_BUILDS,
  SkillName,
} from './defs';
import { objects, objectAt, key, addObject, removeObject, terrain, T, blocked, WorldObject } from './world';
import { audio } from './audio';

// ---------------- helpers ----------------

// Chance per tick interpolated from `low` (at the requirement level) to `high` (at 99).
function successRoll(lvl: number, reqLevel: number, low: number, high: number): boolean {
  return Math.random() < successRollChance(lvl, reqLevel, low, high);
}
// The per-tick success probability (used for the cosmetic depletion estimate now
// that the actual grant roll happens server-side).
function successRollChance(lvl: number, reqLevel: number, low: number, high: number): number {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return low + (high - low) * t;
}

// Message once per started action (handlers run every tick while adjacent).
let lastMsgAction: unknown = null;
function onceMsg(text: string) {
  if (state.player.action !== lastMsgAction) {
    lastMsgAction = state.player.action;
    msg(text);
  }
}

function randInt(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }

function itemName(id: string) { return ITEMS[id]?.name ?? id; }
function lowName(id: string) { return itemName(id).toLowerCase(); }

// Run a per-tick job while standing at an object (used after a Make-X choice).
function startObjJob(o: WorldObject, step: () => boolean) {
  startAction({ type: 'interact-obj', obj: o, handler: () => (step() ? 'continue' : 'done') }, o.x, o.y);
}

// Nudge the player one tile off their current spot (after lighting fires / laying snares).
function stepAside() {
  const p = state.player;
  const dirs = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    if (!blocked(p.x + dx, p.y + dy)) { p.path = [{ x: p.x + dx, y: p.y + dy }]; return; }
  }
}

// ============================================================================
// WOODCUTTING
// ============================================================================
for (const type of ['tree', 'oak', 'willow']) {
  const data = SKILL_OBJS[type];
  registerObjectAction(type, 'Chop down', (o) => {
    if (o.depletedUntil > 0) { msg('Someone has chopped this tree down.'); return 'done'; }
    if (!hasTool('bronze_axe')) { msg('You need an axe to chop down this tree.'); return 'done'; }
    const lvl = level('Woodcutting');
    if (lvl < data.level) { msg(`You need a Woodcutting level of ${data.level} to chop this tree.`); return 'done'; }
    if (freeSlots() === 0) { msg("Your inventory is too full to hold any more logs."); return 'done'; }
    onceMsg('You swing your axe at the tree...');
    audio.sfx('chop');
    // Server-authoritative: request the gather; the server rolls success and
    // grants the log + Woodcutting xp, echoed in game.ts (the item appears + an
    // xp drop shows). The local roll below is now COSMETIC: it only drives the
    // tree-depletion animation (the server validates the object, not depletion).
    if (!sendIntent('gather', { obj: type, x: o.x, y: o.y })) { msg('You are not connected to the server.'); return 'done'; }
    if (Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
      o.depletedUntil = state.tick + data.respawn;
      o.depletedAs = 'stump';
      return 'done';
    }
    return 'continue';
  });
}

// ============================================================================
// MINING
// ============================================================================
for (const type of ['rocks_copper', 'rocks_tin', 'rocks_iron', 'rocks_coal', 'rocks_essence']) {
  const data = SKILL_OBJS[type];
  registerObjectAction(type, 'Mine', (o) => {
    if (o.depletedUntil > 0) { msg('There is no ore left in this rock.'); return 'done'; }
    if (!hasTool('bronze_pickaxe')) { msg('You need a pickaxe to mine this rock.'); return 'done'; }
    const lvl = level('Mining');
    if (lvl < data.level) { msg(`You need a Mining level of ${data.level} to mine this rock.`); return 'done'; }
    if (freeSlots() === 0) { msg('Your inventory is too full to hold any more ore.'); return 'done'; }
    onceMsg('You swing your pick at the rock...');
    audio.sfx('mine');
    // Server-authoritative gather: the server rolls + grants the ore + Mining xp.
    if (!sendIntent('gather', { obj: type, x: o.x, y: o.y })) { msg('You are not connected to the server.'); return 'done'; }
    if (data.depleteChance > 0 && Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
      o.depletedUntil = state.tick + data.respawn;
      o.depletedAs = 'rocks_empty';
      return 'done';
    }
    return 'continue';
  });
}

// ============================================================================
// FISHING
// ============================================================================
registerObjectAction('fishing_spot', 'Net', (o) => {
  if (!hasTool('small_net')) { msg('You need a small fishing net to fish here.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space to hold the fish."); return 'done'; }
  onceMsg('You cast out your net...');
  audio.sfx('splash');
  // Server-authoritative: the server rolls the catch table + grants fish + xp.
  if (!sendIntent('fish', { spot: 'net', x: o.x, y: o.y })) { msg('You are not connected to the server.'); return 'done'; }
  return 'continue';
});

registerObjectAction('rod_fishing_spot', 'Bait', (o) => {
  if (!hasTool('fishing_rod')) { msg('You need a fishing rod to fish here.'); return 'done'; }
  if (!hasItem('fishing_bait')) { msg("You don't have any fishing bait left."); return 'done'; }
  const lvl = level('Fishing');
  if (lvl < 5) { msg('You need a Fishing level of 5 to bait-fish here.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space to hold the fish."); return 'done'; }
  onceMsg('You cast out your line...');
  audio.sfx('splash');
  // Server-authoritative: the server consumes the bait + grants fish + xp.
  if (!sendIntent('fish', { spot: 'bait', x: o.x, y: o.y })) { msg('You are not connected to the server.'); return 'done'; }
  return 'continue';
});

// ============================================================================
// FIREMAKING
// ============================================================================
const FIREMAKING: { log: string; level: number; xp: number }[] = [
  { log: 'logs', level: 1, xp: 40 },
  { log: 'oak_logs', level: 15, xp: 60 },
  { log: 'willow_logs', level: 30, xp: 90 },
];
for (const fm of FIREMAKING) {
  registerItemAction(fm.log, 'Light', async () => {
    const p = state.player;
    if (!hasTool('tinderbox')) { msg('You need a tinderbox to light a fire.'); return; }
    if (level('Firemaking') < fm.level) { msg(`You need a Firemaking level of ${fm.level} to light these logs.`); return; }
    const t = terrain[key(p.x, p.y)];
    if (t === T.FLOOR || objectAt.has(key(p.x, p.y))) { msg("You can't light a fire here."); return; }
    msg('You attempt to light the logs...');
    // Server-authoritative: the server consumes the log + grants Firemaking xp.
    // The fire object + step-aside are cosmetic and only play on success.
    const echo = await requestIntent('firemake', { log: fm.log });
    if (!echo.ok) return;
    const fire = addObject('fire', p.x, p.y);
    fire.expiresAt = state.tick + 100;
    audio.sfx('fire');
    msg('The fire catches and the logs begin to burn.');
    stepAside();
  });
}

// ============================================================================
// COOKING
// ============================================================================
function startCookJob(o: WorldObject, raw: string, qty: number) {
  const c = COOKABLES.find((cc) => cc.raw === raw);
  if (!c) return;
  let left = qty;
  let busy = false;
  startObjJob(o, () => {
    if (left <= 0 || !hasItem(c.raw)) return false;
    if (level('Cooking') < c.level) { msg(`You need a Cooking level of ${c.level} to cook this.`); return false; }
    if (busy) return true;
    // Server-authoritative: the server checks the recipe + level, rolls the burn,
    // consumes the raw and grants cooked|burnt + Cooking xp. We reflect via the echo.
    busy = true;
    audio.sfx('fire');
    left--;
    void requestIntent('cook', { raw: c.raw }).then((echo) => {
      busy = false;
      if (!echo.ok) { left = 0; return; }
      if (echo.burned) msg(`You accidentally burn the ${lowName(c.cooked)}.`);
      else msg(`You roast the ${lowName(c.raw).replace(/^raw /, '')}. It looks delicious.`);
    });
    return left > 0 && hasItem(c.raw);
  });
}

function openCookPicker(o: WorldObject) {
  const opts: MakeOption[] = [];
  for (const c of COOKABLES) {
    if (!hasItem(c.raw)) continue;
    opts.push({
      id: c.raw, label: itemName(c.raw), icon: c.raw,
      disabled: level('Cooking') < c.level ? `Requires Cooking level ${c.level}.` : undefined,
    });
  }
  if (opts.length === 0) { msg("You don't have anything to cook."); return; }
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    startCookJob(o, id, qty);
  });
}

for (const station of ['range', 'fire']) {
  registerObjectAction(station, 'Cook', (o) => { openCookPicker(o); return 'done'; });
  for (const c of COOKABLES) {
    registerItemOnObject(c.raw, station, (_slot, o) => startCookJob(o, c.raw, invCount(c.raw)));
  }
}

// ============================================================================
// SMITHING — smelting + smithing
// ============================================================================
registerObjectAction('furnace', 'Smelt', (o) => {
  const opts: MakeOption[] = SMELTABLES.map((s) => {
    let disabled: string | undefined;
    if (level('Smithing') < s.level) disabled = `Requires Smithing level ${s.level}.`;
    else if (!s.inputs.every((i) => hasItem(i.item, i.qty))) {
      disabled = `You need ${s.inputs.map((i) => `${i.qty} ${lowName(i.item)}`).join(' and ')}.`;
    }
    return { id: s.bar, label: itemName(s.bar), icon: s.bar, disabled };
  });
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const s = SMELTABLES.find((ss) => ss.bar === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (level('Smithing') < s.level) { msg(`You need a Smithing level of ${s.level} to smelt this.`); return false; }
      if (!s.inputs.every((i) => hasItem(i.item, i.qty))) { msg("You don't have enough ore to smelt this."); return false; }
      if (busy) return true;
      // Server-authoritative: the server validates level + inputs, consumes the
      // ore, rolls the iron-smelt success, and grants the bar + Smithing xp.
      busy = true;
      left--;
      audio.sfx('smelt');
      void requestIntent('produce', { recipe: 'smelt', output: s.bar }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        if (echo.burned) msg('The iron ore is too impure and you fail to refine it.');
        else msg(`You smelt the ore into ${aOrAnWord(lowName(s.bar))} ${lowName(s.bar)}.`);
      });
      return left > 0;
    });
  });
  return 'done';
});

function aOrAnWord(s: string) { return /^[aeiou]/.test(s) ? 'an' : 'a'; }

registerObjectAction('anvil', 'Smith', (o) => {
  if (!hasTool('hammer')) { msg('You need a hammer to work the metal with.'); return 'done'; }
  const barsHeld = new Set(SMITHABLES.map((s) => s.bar).filter((b) => hasItem(b)));
  if (barsHeld.size === 0) { msg("You don't have any metal bars to smith."); return 'done'; }
  const opts: MakeOption[] = SMITHABLES.filter((s) => barsHeld.has(s.bar)).map((s) => {
    let disabled: string | undefined;
    if (level('Smithing') < s.level) disabled = `Requires Smithing level ${s.level}.`;
    else if (!hasItem(s.bar, s.bars)) disabled = `You need ${s.bars} ${lowName(s.bar)}${s.bars > 1 ? 's' : ''}.`;
    return {
      id: s.output,
      label: `${itemName(s.output)}${s.outputQty ? ` (${s.outputQty})` : ''}`,
      icon: s.output, disabled,
    };
  });
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const s = SMITHABLES.find((ss) => ss.output === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (!hasTool('hammer')) { msg('You need a hammer to work the metal with.'); return false; }
      if (level('Smithing') < s.level) { msg(`You need a Smithing level of ${s.level} to make this.`); return false; }
      if (!hasItem(s.bar, s.bars)) { msg(`You don't have enough ${lowName(s.bar)}s.`); return false; }
      if (busy) return true;
      // Server-authoritative: validates hammer + level + bars, consumes bars,
      // grants the smithed item + Smithing xp.
      busy = true;
      audio.sfx('smith');
      left--;
      void requestIntent('produce', { recipe: 'smith', output: s.output }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        msg(`You hammer the metal into ${aOrAnWord(lowName(s.output))} ${lowName(s.output)}.`);
      });
      return left > 0;
    });
  });
  return 'done';
});

// ============================================================================
// FLETCHING
// ============================================================================
async function doFletch(f: (typeof FLETCHABLES)[number], qty: number) {
  let made = 0;
  for (let n = 0; n < qty; n++) {
    if (level('Fletching') < f.level) { msg(`You need a Fletching level of ${f.level} to make this.`); break; }
    if (!f.inputs.every((i) => hasItem(i.item, i.qty))) {
      if (n === 0) msg("You don't have the materials to make that.");
      break;
    }
    // Server-authoritative: validates level + inputs, consumes them, grants the
    // fletched output + Fletching xp.
    const echo = await requestIntent('produce', { recipe: 'fletch', output: f.output });
    if (!echo.ok) break;
    made++;
  }
  if (made > 0) msg(`You carefully craft ${lowName(f.output)}${(f.outputQty ?? 1) > 1 ? 's' : ''}.`);
}

// knife on logs -> arrow shafts or an unstrung shortbow
registerItemOnItem('knife', 'logs', () => {
  const choices = FLETCHABLES.filter((f) =>
    f.inputs.length === 1 && f.inputs[0].item === 'logs');
  const opts: MakeOption[] = choices.map((f) => ({
    id: f.output,
    label: `${itemName(f.output)}${f.outputQty ? ` (${f.outputQty})` : ''}`,
    icon: f.output,
    disabled: level('Fletching') < f.level ? `Requires Fletching level ${f.level}.` : undefined,
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const f = choices.find((ff) => ff.output === id)!;
    doFletch(f, qty);
  });
});

// stringing and arrow assembly
function fletchCombo(a: string, b: string, output: string) {
  const f = FLETCHABLES.find((ff) => ff.output === output)!;
  registerItemOnItem(a, b, () => {
    const maxQty = Math.min(...f.inputs.map((i) => Math.floor(invCount(i.item) / i.qty)));
    doFletch(f, Math.max(1, maxQty));
    audio.sfx('bow');
  });
}
fletchCombo('bowstring', 'shortbow_u', 'shortbow');
fletchCombo('bowstring', 'oak_logs', 'oak_shortbow');
fletchCombo('arrow_shaft', 'feather', 'headless_arrow');
fletchCombo('headless_arrow', 'bronze_arrowtips', 'bronze_arrow');
fletchCombo('headless_arrow', 'iron_arrowtips', 'iron_arrow');

// ============================================================================
// CRAFTING
// ============================================================================
registerNpcAction('sheep', 'Shear', (n: Npc) => {
  if (!hasTool('shears')) { msg('You need a pair of shears to shear this sheep.'); return 'done'; }
  if (n.meta.sheared) { msg('This sheep has already been sheared. Give the wool a moment to grow back.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space."); return 'done'; }
  // wool state is shared world state: the server validates and replies 'shorn'
  if (!sendInteract(n, 'Shear')) msg('You are not connected to the server.');
  return 'done';
});

registerObjectAction('spinning_wheel', 'Spin', (o) => {
  const choices = CRAFTABLES.filter((c) => c.station === 'spinning_wheel');
  const opts: MakeOption[] = choices.map((c) => ({
    id: c.output, label: itemName(c.output), icon: c.output,
    disabled: level('Crafting') < c.level ? `Requires Crafting level ${c.level}.`
      : !c.inputs.every((i) => hasItem(i.item, i.qty)) ? `You need ${lowName(c.inputs[0].item)} to spin.` : undefined,
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const c = choices.find((cc) => cc.output === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (level('Crafting') < c.level) { msg(`You need a Crafting level of ${c.level} to spin this.`); return false; }
      if (!c.inputs.every((i) => hasItem(i.item, i.qty))) { msg(`You have run out of ${lowName(c.inputs[0].item)}.`); return false; }
      if (busy) return true;
      // Server-authoritative: validates level + inputs, consumes them, grants the
      // spun output + Crafting xp.
      busy = true;
      left--;
      void requestIntent('produce', { recipe: 'craft', output: c.output }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        msg(`You spin the ${lowName(c.inputs[0].item)} into ${aOrAnWord(lowName(c.output))} ${lowName(c.output)}.`);
      });
      return left > 0;
    });
  });
  return 'done';
});

// Tanner
registerNpcAction('tanner', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Tanner', text: 'Hides! Fresh hides! Bring me cowhides and a coin apiece, and I\'ll turn them into fine leather.' },
    { speaker: state.player.name, text: 'Good to know. The cows will be thrilled.' },
  ]);
  return 'done';
});
registerNpcAction('tanner', 'Tan-hides', () => {
  const hides = invCount('cowhide');
  if (hides === 0) { msg("You don't have any cowhides to tan."); return 'done'; }
  if (invCount('coins') === 0) { msg('The tanner charges one coin per hide, and you have no coins.'); return 'done'; }
  // Server-authoritative: the server computes the affordable batch, debits coins +
  // hides, and grants the leather. Wealth-shaped, so it is gated by ECONOMY_FROZEN.
  void requestIntent('tan').then((echo) => {
    if (!echo.ok) return;
    const n = echo.granted?.find((g) => g.id === 'leather')?.qty ?? 0;
    audio.sfx('coins');
    msg(`The tanner tans ${n} cowhide${n > 1 ? 's' : ''} into leather for you.`);
  });
  return 'done';
});

// Needle on leather -> leatherwork picker (consumes thread)
registerItemOnItem('needle', 'leather', () => {
  if (!hasItem('thread')) { msg('You need some thread to sew the leather.'); return; }
  const choices = CRAFTABLES.filter((c) => c.station === null);
  const opts: MakeOption[] = choices.map((c) => ({
    id: c.output, label: itemName(c.output), icon: c.output,
    disabled: level('Crafting') < c.level ? `Requires Crafting level ${c.level}.` : undefined,
  }));
  requestMake(opts, async (id, qty) => {
    if (!id || qty <= 0) return;
    const c = choices.find((cc) => cc.output === id)!;
    for (let n = 0; n < qty; n++) {
      if (level('Crafting') < c.level) { msg(`You need a Crafting level of ${c.level} to make this.`); return; }
      if (!c.inputs.every((i) => hasItem(i.item, i.qty)) || !hasItem('thread')) {
        if (n === 0) msg("You don't have the materials to make that.");
        return;
      }
      // Server-authoritative: the leather craft recipe (station===null) folds the
      // thread into its inputs server-side; it consumes leather + thread, grants
      // the stitched item + Crafting xp.
      const echo = await requestIntent('produce', { recipe: 'craft', output: c.output });
      if (!echo.ok) return;
      msg(`You stitch the leather into ${aOrAnWord(lowName(c.output))} ${lowName(c.output)}.`);
    }
  });
});

// Flax picking (feeds bowstring crafting)
registerObjectAction('flax_plant', 'Pick', () => {
  if (freeSlots() === 0) { msg("You don't have enough inventory space."); return 'done'; }
  // Server-authoritative single-item gather.
  void requestIntent('pick', { what: 'flax' }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('plant');
    msg('You pick some flax.');
  });
  return 'done';
});

// ============================================================================
// HERBLORE
// ============================================================================
for (const h of HERBS) {
  registerItemAction(h.grimy, 'Clean', () => {
    if (level('Herblore') < h.level) { msg(`You need a Herblore level of ${h.level} to clean this herb.`); return; }
    // Server-authoritative: the 'clean' recipe class consumes the grimy herb and
    // grants the clean herb + Herblore xp.
    void requestIntent('produce', { recipe: 'clean', output: h.clean }).then((echo) => {
      if (!echo.ok) return;
      msg(`You clean the dirt from the ${lowName(h.clean)}.`);
    });
  });
}

for (const p of POTIONS) {
  registerItemOnItem('vial_of_water', p.herb, () => {
    if (level('Herblore') < p.level) { msg(`You need a Herblore level of ${p.level} to brew this potion.`); return; }
    if (!hasItem(p.secondary)) { msg(`You need ${aOrAnWord(lowName(p.secondary))} ${lowName(p.secondary)} to finish this potion.`); return; }
    // Server-authoritative: the 'potion' recipe consumes vial + herb + secondary
    // and grants the potion + Herblore xp.
    void requestIntent('produce', { recipe: 'potion', output: p.output }).then((echo) => {
      if (!echo.ok) return;
      msg(`You mix the ${lowName(p.herb)} and ${lowName(p.secondary)} into ${aOrAnWord(lowName(p.output))} ${lowName(p.output)}.`);
    });
  });
}

registerItemAction('attack_potion', 'Drink', (slot) => {
  // Server-authoritative: the 'consume' intent removes the potion (flavor-only).
  void requestIntent('consume', { item: 'attack_potion', invSlot: slot }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('eat');
    msg('You drink the attack potion. You feel stronger.');
  });
});
registerItemAction('defence_potion', 'Drink', (slot) => {
  void requestIntent('consume', { item: 'defence_potion', invSlot: slot }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('eat');
    msg('You drink the defence potion. Your skin feels tougher.');
  });
});

// ============================================================================
// RUNECRAFT
// ============================================================================
registerObjectAction('air_altar', 'Craft-rune', () => {
  if (invCount('rune_essence') === 0) { msg('You need some rune essence to craft runes here.'); return 'done'; }
  // Server-authoritative: the server binds ALL held essence into air runes,
  // applying the level multiplier + Runecraft xp.
  void requestIntent('runecraft', { altar: 'air' }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('spell');
    msg('You bind the temple\'s power into air runes.');
  });
  return 'done';
});

// ============================================================================
// PRAYER
// ============================================================================
registerObjectAction('altar', 'Pray-at', () => {
  rechargePrayer();
  return 'done';
});

// ============================================================================
// AGILITY
// ============================================================================
const AGILITY_COURSE: { type: string; level: number; xp: number; doing: string; done: string }[] = [
  { type: 'agility_log', level: 1, xp: 12, doing: 'You carefully walk across the slippery log...', done: 'You make it across without falling in.' },
  { type: 'agility_rope', level: 5, xp: 15, doing: 'You grab the rope and swing across...', done: 'You land neatly on the other side.' },
  { type: 'agility_wall', level: 10, xp: 18, doing: 'You haul yourself up the rough wall...', done: 'You climb over and drop down the far side.' },
  { type: 'agility_ledge', level: 15, xp: 20, doing: 'You edge along the narrow ledge...', done: 'You reach the end with your dignity intact.' },
];
let agilityProgress = 0;

for (let idx = 0; idx < AGILITY_COURSE.length; idx++) {
  const ob = AGILITY_COURSE[idx];
  const verb = { agility_log: 'Walk-across', agility_rope: 'Swing-on', agility_wall: 'Climb', agility_ledge: 'Balance-across' }[ob.type]!;
  registerObjectAction(ob.type, verb, (o) => {
    if (level('Agility') < ob.level) { msg(`You need an Agility level of ${ob.level} to attempt this obstacle.`); return 'done'; }
    const p = state.player;
    // course runs north-south: cross to the far side based on approach direction
    const dirY = p.y <= o.y ? 1 : -1;
    let destY = o.y + 2 * dirY;
    for (let tryY = destY; Math.abs(tryY - o.y) <= 4; tryY += dirY) {
      if (!blocked(o.x, tryY)) { destY = tryY; break; }
    }
    msg(ob.doing);
    audio.sfx('agility');
    p.prevX = p.x; p.prevY = p.y;
    p.x = o.x; p.y = destY;
    p.path = [];
    // Server-authoritative: the obstacle's Agility xp is granted by the 'train'
    // intent (data-keyed by obstacle type — the client never names the amount).
    void requestIntent('train', { obstacle: ob.type, x: o.x, y: o.y });
    msg(ob.done);
    // lap tracking
    if (idx === agilityProgress) agilityProgress++;
    else agilityProgress = idx === 0 ? 1 : 0;
    if (agilityProgress >= AGILITY_COURSE.length) {
      agilityProgress = 0;
      void requestIntent('train', { obstacle: 'agility_lap', x: o.x, y: o.y });
      msg('You complete a lap of the course and feel nimbler for it.', 'level');
    }
    return 'done';
  });
}

// ============================================================================
// THIEVING
// ============================================================================
let stunnedUntil = 0;

registerNpcAction('man', 'Pickpocket', (n: Npc) => {
  const pp = NPCS.man.pickpocket!;
  if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't pickpocket right now."); return 'done'; }
  const lvl = level('Thieving');
  if (lvl < pp.level) { msg(`You need a Thieving level of ${pp.level} to pickpocket the man.`); return 'done'; }
  msg('You attempt to pick the man\'s pocket...');
  // Server-authoritative: the server rolls success + loot (npc-keyed from
  // npcs.json) and grants coins + Thieving xp. A miss returns ok with an empty
  // grant; we play the stun cosmetic locally (the stun is not persisted state).
  void requestIntent('thieve', { target: 'man' }).then((echo) => {
    if (!echo.ok) return;
    if (echo.granted && echo.granted.length > 0) {
      audio.sfx('thieve');
      msg('You pick the man\'s pocket.');
    } else {
      msg('You fail to pick the man\'s pocket.');
      msg(`${n.def.name}: 'Oi! What do you think you're doing?'`);
      const p = state.player;
      p.hitsplat = { dmg: pp.stunDmg, until: performance.now() + 900 };
      audio.sfx('hit');
      stunnedUntil = state.tick + 3;
      events.onStatsChange();
    }
  });
  return 'done';
});

registerObjectAction('bake_stall', 'Steal-from', (o) => {
  if (o.depletedUntil > 0) { msg('The stall has been picked clean. The baker is restocking.'); return 'done'; }
  const lvl = level('Thieving');
  if (lvl < 5) { msg('You need a Thieving level of 5 to steal from the bake stall.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space."); return 'done'; }
  // Server-authoritative: validates stall@tile + level, rolls the loot table,
  // grants the food + Thieving xp. The depletion cosmetic stays client-side.
  void requestIntent('thieve', { target: 'bake_stall', x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) return;
    const got = echo.granted?.[0]?.id;
    if (got) { audio.sfx('thieve'); msg(`You steal ${aOrAnWord(lowName(got))} ${lowName(got)} from the bake stall.`); }
  });
  o.depletedUntil = state.tick + 12;
  return 'done';
});

// ============================================================================
// FARMING
// ============================================================================
registerObjectAction('farming_patch', 'Inspect', (o) => {
  const stage = o.meta?.stage;
  if (stage === 'raked') msg('The patch has been raked and is ready for seeds.');
  else if (stage === 'seedling') msg(`Some ${lowName(SEEDS.find((s) => s.seed === o.meta!.seed)?.produce ?? 'crops')} seedlings are growing here.`);
  else if (stage === 'grown') msg(`The ${lowName(o.meta!.produce)} crop is fully grown and ready to harvest.`);
  else msg('A bare patch of soil, choked with weeds. It could use a rake.');
  return 'done';
});

registerObjectAction('farming_patch', 'Harvest', (o) => {
  if (o.meta?.stage !== 'grown') { msg('There is nothing here to harvest yet.'); return 'done'; }
  const produce = o.meta!.produce as string;
  if (freeSlots() === 0 && !hasItem(produce)) { msg("You don't have enough inventory space."); return 'done'; }
  // Server-authoritative: the server rolls the yield (3-5), grants the produce +
  // Farming xp. The patch's grow/clear state is world cosmetic the client owns.
  void requestIntent('farm-harvest', { produce, x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) return;
    const n = echo.granted?.find((g) => g.id === produce)?.qty ?? 0;
    audio.sfx('plant');
    const pname = lowName(produce);
    msg(`You harvest the patch and gather ${n} ${pname}${pname.endsWith('o') ? 'es' : 's'}.`);
  });
  o.meta = {};
  return 'done';
});

registerItemOnObject('rake', 'farming_patch', (_slot, o) => {
  const stage = o.meta?.stage;
  if (stage === 'raked') { msg('The patch is already raked.'); return; }
  if (stage === 'seedling' || stage === 'grown') { msg('There are crops growing here; best leave the rake out of it.'); return; }
  void requestIntent('farm-rake', { x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) return;
    o.meta = { stage: 'raked' };
    audio.sfx('plant');
    msg('You rake the patch clear of weeds. It is ready for planting.');
  });
});

for (const s of SEEDS) {
  registerItemOnObject(s.seed, 'farming_patch', (slot, o) => {
    if (!hasTool('seed_dibber')) { msg('You need a seed dibber to plant seeds.'); return; }
    if (o.meta?.stage === 'seedling' || o.meta?.stage === 'grown') { msg('Something is already growing in this patch.'); return; }
    if (o.meta?.stage !== 'raked') { msg('The patch needs raking before you can plant anything.'); return; }
    if (level('Farming') < s.level) { msg(`You need a Farming level of ${s.level} to plant this seed.`); return; }
    // Server-authoritative: the server consumes the seed + grants plant xp; the
    // seedling/grow state is world cosmetic the client owns.
    void requestIntent('farm-plant', { seed: s.seed, x: o.x, y: o.y }).then((echo) => {
      if (!echo.ok) return;
      o.meta = { stage: 'seedling', seed: s.seed, plantedAt: state.tick };
      audio.sfx('plant');
      msg(`You plant the ${lowName(s.seed)} in the patch.`);
    });
  });
}

registerTickHook(() => {
  for (const o of objects) {
    if (o.type !== 'farming_patch') continue;
    const m = o.meta;
    if (m?.stage !== 'seedling') continue;
    const s = SEEDS.find((ss) => ss.seed === m.seed);
    if (!s) continue;
    if (state.tick >= (m.plantedAt ?? 0) + s.growTicks) {
      m.stage = 'grown';
      m.produce = s.produce;
    }
  }
});

// ============================================================================
// HUNTER
// ============================================================================
registerItemAction('bird_snare', 'Lay', () => {
  const p = state.player;
  const t = terrain[key(p.x, p.y)];
  if (t !== T.GRASS && t !== T.FLOWERS) { msg('You can only set a bird snare on open grass.'); return; }
  if (objectAt.has(key(p.x, p.y))) { msg("There isn't enough room to set the snare here."); return; }
  // Server-authoritative: the server consumes the snare item; the placed trap +
  // its catch timer are world cosmetic the client owns.
  void requestIntent('snare-lay', { x: p.x, y: p.y }).then((echo) => {
    if (!echo.ok) return;
    const o = addObject('snare_set', p.x, p.y);
    o.meta = { laidAt: state.tick, catchAt: state.tick + randInt(15, 40) };
    audio.sfx('plant');
    msg('You set the bird snare and step back to wait.');
    stepAside();
  });
});

registerTickHook(() => {
  for (const o of objects) {
    if (o.type !== 'snare_set' || o.depletedAs === 'snare_caught' || !o.meta) continue;
    if (state.tick >= o.meta.catchAt) {
      o.depletedAs = 'snare_caught';
      o.depletedUntil = state.tick + 1_000_000; // held until checked
    }
  }
});

registerObjectAction('snare_set', 'Check', (o) => {
  if (freeSlots() < 3) { msg("You don't have enough inventory space to dismantle the snare."); return 'done'; }
  // Server-authoritative: caught roll + loot are server-side.
  void requestIntent('snare-check', { x: o.x, y: o.y }).then((echo) => {
    const caught = !!(echo.granted?.some((g) => g.id === 'raw_bird_meat'));
    if (!echo.ok) return;
    if (caught) msg('You\'ve caught a bird! You retrieve the snare, the meat and a few feathers.');
    else msg('Nothing has wandered into the snare yet. You dismantle it.');
  });
  removeObject(o);
  return 'done';
});

// Slayer task loop lives in src/packs/slayer_tasks.ts (server-authoritative).

// ============================================================================
// CONSTRUCTION
// ============================================================================
registerObjectAction('workbench', 'Build', (o) => {
  if (!hasTool('hammer')) { msg('You need a hammer to build anything.'); return 'done'; }
  const opts: MakeOption[] = CONSTRUCTION_BUILDS.map((b) => {
    let disabled: string | undefined;
    if (level('Construction') < b.level) disabled = `Requires Construction level ${b.level}.`;
    else if (!hasItem('plank', b.planks) || !hasItem('nails', b.nails)) {
      disabled = `You need ${b.planks} planks and ${b.nails} nails.`;
    }
    return { id: b.name, label: b.name, icon: 'plank', disabled };
  });
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const b = CONSTRUCTION_BUILDS.find((bb) => bb.name === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (!hasTool('hammer')) { msg('You need a hammer to build anything.'); return false; }
      if (level('Construction') < b.level) { msg(`You need a Construction level of ${b.level} to build this.`); return false; }
      if (!hasItem('plank', b.planks) || !hasItem('nails', b.nails)) { msg(`You need ${b.planks} planks and ${b.nails} nails to build this.`); return false; }
      if (busy) return true;
      // Server-authoritative: the 'build' recipe class consumes planks + nails and
      // grants Construction xp (no item — the build is donated).
      busy = true;
      left--;
      void requestIntent('produce', { recipe: 'build', output: b.name }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        audio.sfx('smith');
        msg(`You build a sturdy ${b.name.toLowerCase()} and donate it to the castle.`);
      });
      return left > 0;
    });
  });
  return 'done';
});

registerNpcAction('carpenter', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Carpenter Lenny', text: 'Planks, nails and elbow grease — that\'s all furniture is. I\'ll saw your logs into planks for ten coins apiece.' },
  ], () => {
    showOptions([
      {
        label: 'Buy planks (10 coins per log).',
        fn: () => {
          // Server-authoritative: the server saws up to 5 logs into planks at 10
          // coins apiece (wealth-shaped, gated by ECONOMY_FROZEN).
          void requestIntent('saw-planks').then((echo) => {
            if (!echo.ok) { msg('Carpenter Lenny: \'No logs or no coins? Then no planks.\''); return; }
            const made = echo.granted?.find((g) => g.id === 'plank')?.qty ?? 0;
            if (made === 0) msg('Carpenter Lenny: \'No logs or no coins? Then no planks.\'');
            else { audio.sfx('coins'); msg(`Carpenter Lenny saws ${made} of your logs into planks.`); }
          });
        },
      },
      { label: 'Just admiring the sawdust.', fn: () => msg('Carpenter Lenny: \'Mind where you sneeze.\'') },
    ]);
  });
  return 'done';
});

// ============================================================================
// SHOPS / BANK / MISC
// ============================================================================
registerNpcAction('shopkeeper', 'Trade', () => { openShop('general'); return 'done'; });

registerNpcAction('magic_tutor', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Mira the Magic Tutor', text: 'Runes are just bottled weather, dear. Buy some from me, or bind your own at the air altar across the river.' },
  ]);
  return 'done';
});
registerNpcAction('magic_tutor', 'Trade', () => { openShop('magic'); return 'done'; });

registerNpcAction('gardener', 'Trade', () => { openShop('gardener'); return 'done'; });

registerNpcAction('banker', 'Bank', () => { openBank(); return 'done'; });
registerObjectAction('bank_booth', 'Bank', () => { openBank(); return 'done'; });

registerNpcAction('cow', 'Milk', () => {
  if (!hasItem('bucket')) { msg('You need an empty bucket to milk the cow.'); return 'done'; }
  // Server-authoritative: the server swaps a bucket for a bucket_of_milk.
  void requestIntent('pick', { what: 'milk' }).then((echo) => {
    if (!echo.ok) return;
    msg('You milk the cow.');
  });
  return 'done';
});

export {};
