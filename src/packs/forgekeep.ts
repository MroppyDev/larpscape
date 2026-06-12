// FORGEKEEP CONCORD — the artisan quarter (smithing / crafting / fletching
// expansion). A walled maker's town where every station sits within a few
// tiles of the bank: the Anvil-Choir (8 anvils + 6 furnaces), the Weaver's
// Hush (wheels + the new loom + tanning vat), the Stavewright's Gallery
// (fletching nook + flax), the Gem Corner, and Quartermaster Doram's
// maker's-mark reward exchange.
//
// NOTE on what is intentionally NOT here (already dynamic over the merged
// recipe catalogs, re-registering would duplicate menus/handlers):
//   - Smelt/Smith on furnace/anvil (content.ts iterates SMELTABLES/SMITHABLES)
//     -> the orikon/dawnsteel tiers and all new heads/limbs/studs appear free.
//   - Spin on spinning_wheel (content.ts filters station==='spinning_wheel')
//     -> resonance_thread appears free.
//   - Craft-jewellery on furnace (skills_production filters station===null +
//     gold_bar input) -> emerald/diamond/dragonstone jewelry appears free.
//     (Silver jewelry is station:null + silver_bar, surfaced here instead.)
//   - Chisel-on-gem / 'Cut' (skills_production iterates GEM_CUTS at load)
//     -> diamond/dragonstone cuts appear free.
//   - knife-on-logs / yew_logs / magic_logs menus (content.ts +
//     skills_production filter single-log fletchables) -> longbow_u,
//     yew_longbow_u, magic_longbow_u appear free. Only knife-on-oak_logs is
//     new (nobody registered it; oak shortbows string straight off the log).
//
// This pack owns: the loom (Weave), the tanning vat (Tan / Tan-hard via the
// 'forgekeep' server domain), the gem bench (Cut-gems convenience menu), the
// Great Bellows-Organ (flavour), all NEW item-on-item fletching combos
// (longbow stringing, orikon arrows, javelins, darts, bolts, crossbow
// assembly), the artisan NPCs + their shops, and Doram's reward exchange.
//
// Imported for side effects via src/packs/index.ts.

import {
  msg, requestMake, startAction,
  registerObjectAction, registerNpcAction, registerItemOnItem,
  invCount, hasItem, hasTool,
  level, MakeOption, requestIntent, openShop,
  startDialogue, showOptions, DialogueLine, Npc,
} from '../game';
import { ITEMS, CRAFTABLES, FLETCHABLES, GEM_CUTS } from '../defs';
import { WorldObject } from '../world';
import { audio } from '../audio';

// ---------------- local helpers (mirrors content.ts / skills_production) ----

function itemName(id: string) { return ITEMS[id]?.name ?? id; }
function lowName(id: string) { return itemName(id).toLowerCase(); }
function aOrAnWord(s: string) { return /^[aeiou]/.test(s) ? 'an' : 'a'; }
function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}

// Run a per-tick job while standing at an object (after a Make-X choice).
function startObjJob(o: WorldObject, step: () => boolean) {
  startAction({ type: 'interact-obj', obj: o, handler: () => (step() ? 'continue' : 'done') }, o.x, o.y);
}

// ============================================================================
// THE LOOM — Weave: leather ranged armour (CRAFTABLES with station==='loom').
// Resolves server-side through the existing produce/make intent; the server
// gates on nearObject('loom'), which is exactly where this menu opens.
// ============================================================================
// defs.ts types station as the literal 'spinning_wheel' | null (written before
// the loom existed); widen for the comparison rather than editing the shared type.
const stationOf = (c: { station?: string | null }) => c.station ?? null;

registerObjectAction('loom', 'Weave', (o) => {
  const choices = CRAFTABLES.filter((c) => stationOf(c) === 'loom');
  if (choices.length === 0) { msg('The loom hums to itself. Nothing to weave yet.'); return 'done'; }
  const opts: MakeOption[] = choices.map((c) => {
    let disabled: string | undefined;
    if (level('Crafting') < c.level) disabled = `Requires Crafting level ${c.level}.`;
    else if (!c.inputs.every((i) => hasItem(i.item, i.qty))) {
      disabled = `You need ${c.inputs.map((i) => `${i.qty} ${lowName(i.item)}`).join(' and ')}.`;
    }
    return { id: c.output, label: itemName(c.output), icon: c.output, disabled };
  });
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const c = choices.find((cc) => cc.output === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (level('Crafting') < c.level) { msg(`You need a Crafting level of ${c.level} to make this.`); return false; }
      if (!c.inputs.every((i) => hasItem(i.item, i.qty))) { msg("You don't have the materials to make that."); return false; }
      if (busy) return true;
      busy = true;
      left--;
      void requestIntent('produce', { recipe: 'craft', output: c.output }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        msg(`The loom clatters in time and you work the leather into ${aOrAnWord(lowName(c.output))} ${lowName(c.output)}.`);
      });
      return left > 0 || busy;
    });
  });
  return 'done';
});

// ============================================================================
// THE TANNING VAT — Tan (cowhide+1c -> leather, existing 'tan' domain) and
// Tan-hard (cowhide+3c -> hardleather, 'forgekeep' domain, server-validated
// at the vat). Makes tanning a placeable station instead of NPC-only.
// ============================================================================
registerObjectAction('tanning_vat', 'Tan', () => {
  if (invCount('cowhide') === 0) { msg("You don't have any cowhides to tan."); return 'done'; }
  if (invCount('coins') === 0) { msg('The vat fee is one coin per hide, and you have no coins.'); return 'done'; }
  void requestIntent('tan').then((echo) => {
    if (!echo.ok) return;
    const n = echo.granted?.find((g) => g.id === 'leather')?.qty ?? 0;
    audio.sfx('coins');
    msg(`You work ${n} cowhide${n > 1 ? 's' : ''} through the vat into leather.`);
  });
  return 'done';
});

registerObjectAction('tanning_vat', 'Tan-hard', () => {
  if (invCount('cowhide') === 0) { msg("You don't have any cowhides to tan."); return 'done'; }
  if (invCount('coins') < 3) { msg('Hard leather costs three coins a hide. The vat does not run a tab.'); return 'done'; }
  void requestIntent('forgekeep', { op: 'tan-hard' }).then((echo) => {
    if (!echo.ok) return;
    const n = echo.granted?.find((g) => g.id === 'hardleather')?.qty ?? 0;
    audio.sfx('coins');
    msg(`You cure ${n} hide${n > 1 ? 's' : ''} the slow way. The leather comes out with convictions.`);
  });
  return 'done';
});

// ============================================================================
// THE GEM BENCH — Cut-gems: one menu listing every gem cut, so a full
// inventory can be cut without item-on-item clicking. Resolves through the
// existing 'gemcut' recipe; chisel still required.
// ============================================================================
registerObjectAction('gem_bench', 'Cut-gems', (o) => {
  if (!hasTool('chisel')) { msg('You need a chisel to work at the gem bench. Yael sells them, pointedly.'); return 'done'; }
  const held = GEM_CUTS.filter((g) => hasItem(g.uncut));
  if (held.length === 0) { msg('You have no uncut gems. The bench felt is immaculate and disappointed.'); return 'done'; }
  const opts: MakeOption[] = held.map((g) => ({
    id: g.cut,
    label: `${itemName(g.cut)} (${invCount(g.uncut)})`,
    icon: g.cut,
    disabled: level('Crafting') < g.level ? `Requires Crafting level ${g.level}.` : undefined,
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const g = held.find((gg) => gg.cut === id)!;
    let left = Math.min(qty, invCount(g.uncut));
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (!hasItem(g.uncut)) return false;
      if (busy) return true;
      busy = true;
      left--;
      void requestIntent('produce', { recipe: 'gemcut', output: g.cut }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        audio.sfx('mine');
        msg(`You chip the rough away, revealing ${aOrAnWord(lowName(g.cut))} ${lowName(g.cut)}.`);
      });
      return left > 0 || busy;
    });
  });
  return 'done';
});

// ============================================================================
// THE GREAT BELLOWS-ORGAN — lore centrepiece. Listen; no mechanic.
// ============================================================================
registerObjectAction('resonance_organ', 'Listen', () => {
  audio.sfx('smelt');
  msg('Six furnaces breathe through the pipes. The forge chord rolls over the plaza, and every anvil answers a fifth above.');
  msg('Somewhere in the bass, a bar that was smelted flat quietly corrects itself.', 'level');
  return 'done';
});

// ============================================================================
// FLETCHING — the new combo wiring (longbows, orikon arrows, javelins, darts,
// bolts, crossbow assembly). doFletch mirrors content.ts; combos mirror
// fletchCombo there.
// ============================================================================
async function doFletch(f: (typeof FLETCHABLES)[number], qty: number) {
  let made = 0;
  for (let n = 0; n < qty; n++) {
    if (level('Fletching') < f.level) { msg(`You need a Fletching level of ${f.level} to make this.`); break; }
    if (!f.inputs.every((i) => hasItem(i.item, i.qty))) {
      if (n === 0) msg("You don't have the materials to make that.");
      break;
    }
    const echo = await requestIntent('produce', { recipe: 'fletch', output: f.output });
    if (!echo.ok) break;
    made++;
  }
  if (made > 0) msg(`You carefully craft ${lowName(f.output)}${(f.outputQty ?? 1) > 1 ? 's' : ''}.`);
}

function fletchCombo(a: string, b: string, output: string) {
  const f = FLETCHABLES.find((ff) => ff.output === output);
  if (!f) return; // recipe not merged yet — stay silent rather than crash
  registerItemOnItem(a, b, () => {
    const maxQty = Math.min(...f.inputs.map((i) => Math.floor(invCount(i.item) / i.qty)));
    void doFletch(f, Math.max(1, maxQty));
    audio.sfx('bow');
  });
}

// longbow stringing (the unstrung staves come from the dynamic knife menus)
fletchCombo('bowstring', 'longbow_u', 'longbow');
fletchCombo('bowstring', 'oak_longbow_u', 'oak_longbow');
fletchCombo('bowstring', 'yew_longbow_u', 'yew_longbow');
fletchCombo('bowstring', 'magic_longbow_u', 'magic_longbow');

// orikon arrows
fletchCombo('headless_arrow', 'orikon_arrowtips', 'orikon_arrow');

// javelins (heads on shafts)
fletchCombo('arrow_shaft', 'bronze_javelin_heads', 'bronze_javelin');
fletchCombo('arrow_shaft', 'steel_javelin_heads', 'steel_javelin');
fletchCombo('arrow_shaft', 'rune_javelin_heads', 'rune_javelin');

// darts + bolts (tips on feathers)
fletchCombo('bronze_dart_tip', 'feather', 'bronze_dart');
fletchCombo('adamant_dart_tip', 'feather', 'adamant_dart');
fletchCombo('bronze_bolt_tips', 'feather', 'bronze_bolts');
fletchCombo('runite_bolt_tips', 'feather', 'runite_bolts');

// crossbow assembly: limbs on stock, then string the result
fletchCombo('bronze_limbs', 'wooden_stock', 'bronze_crossbow_u');
fletchCombo('steel_limbs', 'wooden_stock', 'steel_crossbow_u');
fletchCombo('rune_limbs', 'wooden_stock', 'rune_crossbow_u');
fletchCombo('bowstring', 'bronze_crossbow_u', 'bronze_crossbow');
fletchCombo('bowstring', 'steel_crossbow_u', 'steel_crossbow');
fletchCombo('bowstring', 'rune_crossbow_u', 'rune_crossbow');

// knife on oak logs -> oak fletching menu (oak_longbow_u / wooden_stock).
// content.ts only wires knife on plain 'logs'; oak shortbows string straight
// off the log, so nobody owned this pairing until now.
registerItemOnItem('knife', 'oak_logs', () => {
  const choices = FLETCHABLES.filter((f) =>
    f.inputs.length === 1 && f.inputs[0].item === 'oak_logs');
  if (choices.length === 0) { msg('Nothing interesting happens.'); return; }
  const opts: MakeOption[] = choices.map((f) => ({
    id: f.output,
    label: `${itemName(f.output)}${f.outputQty ? ` (${f.outputQty})` : ''}`,
    icon: f.output,
    disabled: level('Fletching') < f.level ? `Requires Fletching level ${f.level}.` : undefined,
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const f = choices.find((ff) => ff.output === id)!;
    void doFletch(f, qty);
  });
});

// ============================================================================
// SILVER JEWELLERY — surfaced at the furnace alongside gold. skills_production
// only lists gold_bar craftables, so the silver rows (station:null +
// silver_bar) need their own menu entry point.
// ============================================================================
const SILVERWORK = () => CRAFTABLES.filter((c) =>
  c.station === null && c.inputs.some((i) => i.item === 'silver_bar'));

registerObjectAction('furnace', 'Craft-silver', (o) => {
  const choices = SILVERWORK();
  if (!hasItem('silver_bar')) { msg('You need a silver bar to craft silverware.'); return 'done'; }
  if (choices.length === 0) { msg('Nothing interesting happens.'); return 'done'; }
  const opts: MakeOption[] = choices.map((c) => ({
    id: c.output, label: itemName(c.output), icon: c.output,
    disabled: level('Crafting') < c.level ? `Requires Crafting level ${c.level}.`
      : !c.inputs.every((i) => hasItem(i.item, i.qty)) ? 'You need a silver bar.' : undefined,
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const c = choices.find((cc) => cc.output === id)!;
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
        msg(`You pour the silver into the mould and craft ${aOrAnWord(lowName(c.output))} ${lowName(c.output)}.`);
      });
      return left > 0 || busy;
    });
  });
  return 'done';
});

// ============================================================================
// THE ARTISAN NPCS — trainers, shops, and the reward exchange.
// ============================================================================

const BRANNA = 'Smith-Cantor Branna';
registerNpcAction('smith_cantor_branna', 'Talk-to', () => {
  startDialogue([
    ...say(BRANNA, 'Welcome to the Anvil-Choir. Eight anvils, one pitch, no excuses.'),
    ...say(BRANNA, 'Past rune there is orikon — warm amber, smelts at ninety-two with eight coal — and past orikon there is dawnsteel, if you can afford the flux and the humility.'),
    ...say(BRANNA, 'I sell coal, flux and studs. The hammer is one coin because a smith without a hammer is a tourist.'),
  ]);
  return 'done';
});
registerNpcAction('smith_cantor_branna', 'Trade', () => { openShop('forgekeep_smith'); return 'done'; });

const ISEULT = 'Weaver Iseult';
registerNpcAction('weaver_iseult', 'Talk-to', () => {
  startDialogue([
    ...say(ISEULT, 'Softly, please. The loom is concentrating.'),
    ...say(ISEULT, 'Bring leather and thread and the loom will give you cowls, vambraces and chaps. Bring steel studs and it will give your leather a spine.'),
    ...say(ISEULT, 'At sixty Crafting the wheels will spin you resonance thread — two balls of wool, one flax, and a steady hand.'),
  ]);
  return 'done';
});
registerNpcAction('weaver_iseult', 'Trade', () => { openShop('forgekeep_weaver'); return 'done'; });

const ORLIN = 'Stavewright Orlin';
registerNpcAction('stavewright_orlin', 'Talk-to', () => {
  startDialogue([
    ...say(ORLIN, 'Shortbows are for people in a hurry. The Gallery deals in longbows — slower draw, harder argument.'),
    ...say(ORLIN, 'Crossbows? Smith the limbs, carve a stock from oak, fit them together, then string it. Three trades in one weapon, which is why it is the best one.'),
    ...say(ORLIN, 'Javelins are arrow shafts with ambition, and darts are feathers with a grudge. I sell the strings and the staves.'),
  ]);
  return 'done';
});
registerNpcAction('stavewright_orlin', 'Trade', () => { openShop('forgekeep_fletcher'); return 'done'; });

const YAEL = 'Gemcutter Yael';
registerNpcAction('gemcutter_yael', 'Talk-to', () => {
  startDialogue([
    ...say(YAEL, 'Every stone has one true face. My job is to take away everything that is not it.'),
    ...say(YAEL, 'Diamonds cut at forty-three, dragonstone at fifty-five. The bench is two steps from a furnace on purpose — cut, then craft, then bank. The plaza does the walking for you.'),
  ]);
  return 'done';
});
registerNpcAction('gemcutter_yael', 'Trade', () => { openShop('forgekeep_gems'); return 'done'; });

const HALLE = 'Ore-Broker Halle';
registerNpcAction('ore_broker_halle', 'Talk-to', () => {
  startDialogue([
    ...say(HALLE, 'Orikon ore, fresh from the deep pits — well. Fresh from a cart that was once near the deep pits.'),
    ...say(HALLE, 'Stock is small and the price is honest by brokerage standards. Mine your own if you disagree; the pits take all comers and return most of them.'),
  ]);
  return 'done';
});
registerNpcAction('ore_broker_halle', 'Trade', () => { openShop('forgekeep_ore'); return 'done'; });

const MAULD = 'Tanner Mauld';
registerNpcAction('concord_tanner', 'Talk-to', () => {
  startDialogue([
    ...say(MAULD, 'Hides in, leather out. One coin the soft way, three coins the hard way.'),
    ...say(MAULD, 'The vat does the work. I provide the smell.'),
  ]);
  return 'done';
});
registerNpcAction('concord_tanner', 'Tan-hides', () => {
  if (invCount('cowhide') === 0) { msg("You don't have any cowhides to tan."); return 'done'; }
  void requestIntent('tan').then((echo) => {
    if (!echo.ok) return;
    const n = echo.granted?.find((g) => g.id === 'leather')?.qty ?? 0;
    audio.sfx('coins');
    msg(`Mauld tans ${n} cowhide${n > 1 ? 's' : ''} into leather for you.`);
  });
  return 'done';
});

// ============================================================================
// QUARTERMASTER DORAM — the maker's-mark / resonant-shard reward exchange.
// SERVER-AUTHORITATIVE: the deal table lives in server/intent-forgekeep.ts;
// the client names only the deal INDEX. Labels/costs here are menu copy and
// MUST match REWARD_DEALS indices over there.
// ============================================================================
const DORAM = 'Quartermaster Doram';
interface RewardDeal { label: string; flavor: string }
const REWARD_MENU: RewardDeal[] = [
  { label: '5 shards — 1 maker\'s mark', flavor: 'Shards prove the mine rang. Marks prove you did.' },
  { label: '8 shards + 2 marks — an uncut dragonstone', flavor: 'Came up the shaft warm. Cut it somewhere with good light.' },
  { label: '10 shards + 3 marks — the Tuner\'s Apron', flavor: 'Scorch-marks included at no extra charge. Wear it loud.' },
  { label: '15 shards + 5 marks — the Master chisel', flavor: 'Yael\'s own pattern. The gems open like they were waiting.' },
  { label: '15 shards + 5 marks — the True hammer', flavor: 'Forged in key. The bars behave because they can hear it.' },
];

function openRewardExchange() {
  const shards = invCount('resonant_shard');
  const marks = invCount('makers_mark');
  showOptions([
    ...REWARD_MENU.map((deal, idx) => ({
      label: deal.label,
      fn: () => {
        void (async () => {
          const echo = await requestIntent('forgekeep', { op: 'reward', deal: idx });
          if (!echo.ok) {
            startDialogue(say(DORAM,
              echo.error === 'inventory full' ? 'Your pack is full. The ledger notes everything, including that.'
                : 'The ledger says you are short. Come back ringing.'));
            return;
          }
          audio.sfx('coins');
          startDialogue(say(DORAM, deal.flavor));
        })();
      },
    })),
    { label: `Never mind. (${shards} shards, ${marks} marks)`, fn: () => { /* close */ } },
  ]);
}

registerNpcAction('concord_quartermaster', 'Talk-to', () => {
  startDialogue([
    ...say(DORAM, 'Quartermaster Doram, Concord ledger. I take resonant shards and maker\'s marks; I give out the things the Concord is proud of.'),
    ...say(DORAM, 'Shards come up from the Untuned Mine. Marks I will stamp for you at five shards apiece — proof of work, transferable once.'),
    ...say(DORAM, 'The apron is for showing off. The chisel and the hammer are for working in front of people who notice.'),
  ]);
  return 'done';
});
registerNpcAction('concord_quartermaster', 'Exchange', (_n: Npc) => {
  startDialogue(
    say(DORAM, 'Marks on the slate, prizes off it. What are you owed?'),
    () => openRewardExchange(),
  );
  return 'done';
});

export {};
