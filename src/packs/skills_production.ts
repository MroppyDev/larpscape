// Phase 6 production skill content: jewelry crafting at the furnace, gem
// cutting with a chisel, high-tier fletching (maple/yew/magic bows, mithril/
// adamant/rune arrows), potion drinking for the new potions, and firemaking
// for the new log tiers.
//
// NOTE on what is intentionally NOT here (content.ts already covers it
// dynamically over the defs.ts catalogs): cooking (COOKABLES — lobster/
// swordfish/shark), smelting (SMELTABLES — gold_bar/rune_bar), smithing
// (SMITHABLES — full rune ladder), herb cleaning (HERBS — ranarr/irit) and
// potion mixing (POTIONS — prayer_potion/super_attack). Re-registering any of
// those here would duplicate menu entries/handlers.
//
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, events, requestMake, startAction,
  registerObjectAction, registerItemAction, registerItemOnItem,
  invCount, hasItem, hasTool,
  level, MakeOption, requestIntent,
} from '../game';
import { ITEMS, CRAFTABLES, FLETCHABLES, GEM_CUTS } from '../defs';
import { addObject, objectAt, key, terrain, T, blocked, WorldObject } from '../world';
import { audio } from '../audio';

// ---------------- local helpers (mirrors content.ts patterns) ----------------

function itemName(id: string) { return ITEMS[id]?.name ?? id; }
function lowName(id: string) { return itemName(id).toLowerCase(); }
function aOrAnWord(s: string) { return /^[aeiou]/.test(s) ? 'an' : 'a'; }

// Run a per-tick job while standing at an object (used after a Make-X choice).
function startObjJob(o: WorldObject, step: () => boolean) {
  startAction({ type: 'interact-obj', obj: o, handler: () => (step() ? 'continue' : 'done') }, o.x, o.y);
}

// Nudge the player one tile off their current spot (after lighting fires).
function stepAside() {
  const p = state.player;
  const dirs = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    if (!blocked(p.x + dx, p.y + dy)) { p.path = [{ x: p.x + dx, y: p.y + dy }]; return; }
  }
}

// ============================================================================
// JEWELRY — Craft-jewellery at the furnace (gold_bar [+ cut gem] per CRAFTABLES)
// ============================================================================
const JEWELRY = CRAFTABLES.filter((c) =>
  c.station === null && c.inputs.some((i) => i.item === 'gold_bar'));

registerObjectAction('furnace', 'Craft-jewellery', (o) => {
  if (!hasItem('gold_bar')) { msg('You need a gold bar to craft jewellery.'); return 'done'; }
  const opts: MakeOption[] = JEWELRY.map((c) => {
    let disabled: string | undefined;
    if (level('Crafting') < c.level) disabled = `Requires Crafting level ${c.level}.`;
    else if (!c.inputs.every((i) => hasItem(i.item, i.qty))) {
      disabled = `You need ${c.inputs.map((i) => `${i.qty} ${lowName(i.item)}`).join(' and ')}.`;
    }
    return { id: c.output, label: itemName(c.output), icon: c.output, disabled };
  });
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const c = JEWELRY.find((cc) => cc.output === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (level('Crafting') < c.level) { msg(`You need a Crafting level of ${c.level} to make this.`); return false; }
      if (!c.inputs.every((i) => hasItem(i.item, i.qty))) { msg("You don't have the materials to make that."); return false; }
      if (busy) return true;
      busy = true;
      audio.sfx('smelt');
      left--;
      void requestIntent('produce', { recipe: 'craft', output: c.output }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        msg(`You pour the gold into the mould and craft ${aOrAnWord(lowName(c.output))} ${lowName(c.output)}.`);
      });
      return left > 0 || busy;
    });
  });
  return 'done';
});

// ============================================================================
// GEM CUTTING — chisel on uncut gem, plus a 'Cut' item action when chisel held
// ============================================================================
async function cutGem(g: (typeof GEM_CUTS)[number]) {
  if (!hasTool('chisel')) { msg('You need a chisel to cut this gem.'); return; }
  if (level('Crafting') < g.level) { msg(`You need a Crafting level of ${g.level} to cut this gem.`); return; }
  if (!hasItem(g.uncut)) return;
  const echo = await requestIntent('produce', { recipe: 'gemcut', output: g.cut });
  if (!echo.ok) return;
  audio.sfx('mine');
  msg(`You carefully chip away the rough stone, revealing ${aOrAnWord(lowName(g.cut))} ${lowName(g.cut)}.`);
}

for (const g of GEM_CUTS) {
  registerItemOnItem('chisel', g.uncut, () => { void cutGem(g); });
  registerItemAction(g.uncut, 'Cut', () => { void cutGem(g); });
}

// ============================================================================
// FLETCHING — new tiers (content.ts only wires normal logs + oak/bronze/iron)
// ============================================================================
async function doFletch(f: (typeof FLETCHABLES)[number], qty: number) {
  let made = 0;
  for (let n = 0; n < qty; n++) {
    if (level('Fletching') < f.level) { msg(`You need a Fletching level of ${f.level} to make this.`); return; }
    if (!f.inputs.every((i) => hasItem(i.item, i.qty))) {
      if (n === 0) msg("You don't have the materials to make that.");
      return;
    }
    const echo = await requestIntent('produce', { recipe: 'fletch', output: f.output });
    if (!echo.ok) break;
    made++;
  }
  if (made > 0) msg(`You carefully craft ${lowName(f.output)}${(f.outputQty ?? 1) > 1 ? 's' : ''}.`);
}

// knife on maple/yew/magic logs -> unstrung shortbow picker
for (const log of ['maple_logs', 'yew_logs', 'magic_logs']) {
  registerItemOnItem('knife', log, () => {
    const choices = FLETCHABLES.filter((f) =>
      f.inputs.length === 1 && f.inputs[0].item === log);
    const opts: MakeOption[] = choices.map((f) => ({
      id: f.output,
      label: `${itemName(f.output)}${f.outputQty ? ` (${f.outputQty})` : ''}`,
      icon: f.output,
      disabled: level('Fletching') < f.level ? `Requires Fletching level ${f.level}.` : undefined,
    }));
    if (opts.length === 0) { msg('Nothing interesting happens.'); return; }
    requestMake(opts, (id, qty) => {
      if (!id || qty <= 0) return;
      const f = choices.find((ff) => ff.output === id)!;
      void doFletch(f, qty);
    });
  });
}

// stringing and arrow assembly for the new tiers
function fletchCombo(a: string, b: string, output: string) {
  const f = FLETCHABLES.find((ff) => ff.output === output)!;
  registerItemOnItem(a, b, () => {
    const maxQty = Math.min(...f.inputs.map((i) => Math.floor(invCount(i.item) / i.qty)));
    void doFletch(f, Math.max(1, maxQty));
    audio.sfx('bow');
  });
}
fletchCombo('bowstring', 'maple_shortbow_u', 'maple_shortbow');
fletchCombo('bowstring', 'yew_shortbow_u', 'yew_shortbow');
fletchCombo('bowstring', 'magic_shortbow_u', 'magic_shortbow');
fletchCombo('headless_arrow', 'mithril_arrowtips', 'mithril_arrow');
fletchCombo('headless_arrow', 'adamant_arrowtips', 'adamant_arrow');
fletchCombo('headless_arrow', 'rune_arrowtips', 'rune_arrow');

// ============================================================================
// HERBLORE — drinking the new potions (mixing/cleaning is dynamic in content.ts)
// ============================================================================
registerItemAction('prayer_potion', 'Drink', (slot) => {
  void slot;
  void requestIntent('consume', { item: 'prayer_potion' }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('eat');
    msg('You drink the prayer potion. A cool calm settles over you as your faith returns.');
    events.onStatsChange();
  });
});

registerItemAction('super_attack', 'Drink', (slot) => {
  void slot;
  void requestIntent('consume', { item: 'super_attack' }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('eat');
    msg('You drink the super attack potion. Your sword arm positively itches.');
  });
});

// ============================================================================
// FIREMAKING — new log tiers (content.ts registers 'Light' per log id statically)
// ============================================================================
const NEW_FIREMAKING: { log: string; level: number }[] = [
  { log: 'maple_logs', level: 45 },
  { log: 'yew_logs', level: 60 },
  { log: 'magic_logs', level: 75 },
];
for (const fm of NEW_FIREMAKING) {
  registerItemAction(fm.log, 'Light', async (slot) => {
    const p = state.player;
    if (!hasTool('tinderbox')) { msg('You need a tinderbox to light a fire.'); return; }
    if (level('Firemaking') < fm.level) { msg(`You need a Firemaking level of ${fm.level} to light these logs.`); return; }
    const t = terrain[key(p.x, p.y)];
    if (t === T.FLOOR || objectAt.has(key(p.x, p.y))) { msg("You can't light a fire here."); return; }
    void slot;
    msg('You attempt to light the logs...');
    const echo = await requestIntent('firemake', { log: fm.log });
    if (!echo.ok) return;
    const fire = addObject('fire', p.x, p.y);
    fire.expiresAt = state.tick + 100;
    audio.sfx('fire');
    msg('The fire catches and the logs begin to burn.');
    stepAside();
  });
}

export {};
