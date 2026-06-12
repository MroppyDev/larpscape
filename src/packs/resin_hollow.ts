// RESIN HOLLOW — the forestry hamlet on the Tanglewood's edge (woodcutting +
// firemaking expansion, docs/specs/woodcutting-firemaking.json). The Chordwood
// grove is the dense tiered training stand (tree -> oak -> willow -> maple ->
// yew -> magic -> chordwood, a player drifts inward as they level); the
// Emberyard is the bonfire commons west of it (bonus-XP burning, an open
// cook-fire, and Quill's charcoal pit).
//
// This pack owns the client side:
//   - chordwood chopping (mirrors the maple/yew/magic loop in
//     skills_gathering.ts; the server's generic 'gather' intent grants)
//   - hasAnyAxe(): the axe tier ladder acceptance (exported for
//     skills_gathering.ts / content.ts per the integration sharedEdits)
//   - the Emberyard bonfire: 'Add-logs' burn loop (server 'bonfire' intent:
//     xp*1.25 + chorale tokens) and 'Cook' (server cook intent — requires the
//     intents.ts cook-guard sharedEdit accepting 'bonfire' as a station)
//   - the charcoal pit: 2 logs -> 1 charcoal (server 'quench' intent)
//   - the four forester NPCs: Bole's axe shop, Ysolde's chorale-token reward
//     shop (server 'forestry-buy' intent owns the cost table), Tamsin's
//     sawmill stores, Quill's coal scuttle
//
// Server counterpart: server/intent-forestry.ts. Data: the
// woodcutting-firemaking fragment (items/objs/skillObjs/shops/spawns).

import {
  state, msg, startDialogue, showOptions, requestMake, startAction,
  registerObjectAction, registerNpcAction, registerItemOnObject,
  invCount, hasItem, hasTool, freeSlots,
  level, openShop, requestIntent,
  MakeOption,
} from '../game';
import { ITEMS, SKILL_OBJS, COOKABLES } from '../defs';
import { WorldObject } from '../world';
import { audio } from '../audio';

// ---------------- helpers (mirrored from content.ts) ----------------

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

function itemName(id: string) { return ITEMS[id]?.name ?? id; }
function lowName(id: string) { return itemName(id).toLowerCase(); }

function startObjJob(o: WorldObject, step: () => boolean) {
  startAction({ type: 'interact-obj', obj: o, handler: () => (step() ? 'continue' : 'done') }, o.x, o.y);
}

// ============================================================================
// AXE TIER LADDER — any axe satisfies the chop gate; chop SPEED is the server's
// business (axeBonus in server/intents.ts mirrors pickaxeBonus). Exported so
// content.ts / skills_gathering.ts can swap their hasTool('bronze_axe') checks
// for this per the integration sharedEdits.
// ============================================================================
export const AXE_IDS = [
  'bronze_axe', 'iron_axe', 'steel_axe', 'mithril_axe',
  'adamant_axe', 'rune_axe', 'resonant_axe',
];
export function hasAnyAxe(): boolean { return AXE_IDS.some((id) => hasTool(id)); }

// ============================================================================
// WOODCUTTING — chordwood (the resonant top-tier stand at the grove's heart).
// Mirrors the maple/yew/magic_tree loop in skills_gathering.ts; the local
// depletion roll is COSMETIC, the server's generic gather intent grants.
// ============================================================================
{
  const data = SKILL_OBJS['chordwood'];
  if (data) {
    registerObjectAction('chordwood', 'Chop down', (o) => {
      if (o.depletedUntil > 0) { msg('Someone has chopped this tree down. The stump is still humming the chord.'); return 'done'; }
      if (!hasAnyAxe()) { msg('You need an axe to chop down this tree.'); return 'done'; }
      const lvl = level('Woodcutting');
      if (lvl < data.level) { msg(`You need a Woodcutting level of ${data.level} to chop this tree.`); return 'done'; }
      if (freeSlots() === 0) { msg('Your inventory is too full to hold any more logs.'); return 'done'; }
      onceMsg('You swing your axe at the chordwood. The grain rings back...');
      audio.sfx('chop');
      void requestIntent('gather', { obj: 'chordwood', x: o.x, y: o.y });
      if (Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
        o.depletedUntil = state.tick + data.respawn;
        o.depletedAs = 'stump';
        return 'done';
      }
      return 'continue';
    });
  }
}

// ============================================================================
// FIREMAKING — the Emberyard bonfire. Burn table mirrors the FIREMAKING arrays
// (server/intents.ts + src/content.ts + server/intent-forestry.ts); the server
// applies the 1.25x bonfire bonus and grants the chorale tokens.
// ============================================================================
const BURNS: { log: string; level: number }[] = [
  { log: 'logs', level: 1 },
  { log: 'oak_logs', level: 15 },
  { log: 'willow_logs', level: 30 },
  { log: 'maple_logs', level: 45 },
  { log: 'yew_logs', level: 60 },
  { log: 'chordwood_logs', level: 65 },
  { log: 'magic_logs', level: 75 },
];

function startBonfireJob(o: WorldObject, log: string, qty: number) {
  const b = BURNS.find((bb) => bb.log === log);
  if (!b) return;
  let left = qty;
  let busy = false;
  startObjJob(o, () => {
    if (left <= 0 || !hasItem(b.log)) return false;
    if (level('Firemaking') < b.level) { msg(`You need a Firemaking level of ${b.level} to burn these logs.`); return false; }
    if (busy) return true;
    busy = true;
    left--;
    audio.sfx('fire');
    // Server-authoritative: consumes the log, grants Firemaking xp * 1.25 and
    // the chorale token(s); we narrate from the echo.
    void requestIntent('bonfire', { log: b.log }).then((echo) => {
      busy = false;
      if (!echo.ok) { left = 0; return; }
      const tokens = echo.granted?.find((g) => g.id === 'chorale_token')?.qty ?? 0;
      if (log === 'chordwood_logs' && tokens > 1) {
        msg('The chordwood releases its held note in a full chord — Ysolde stamps you an extra token on the spot.', 'level');
      } else {
        msg(`The bonfire pools the ${lowName(b.log)}' note into the chord.`);
      }
    });
    return left > 0 && hasItem(b.log);
  });
}

function openBonfirePicker(o: WorldObject) {
  const opts: MakeOption[] = [];
  for (const b of BURNS) {
    if (!hasItem(b.log)) continue;
    opts.push({
      id: b.log, label: itemName(b.log), icon: b.log,
      disabled: level('Firemaking') < b.level ? `Requires Firemaking level ${b.level}.` : undefined,
    });
  }
  if (opts.length === 0) { msg("You don't have any logs to feed the bonfire."); return; }
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    startBonfireJob(o, id, qty);
  });
}

registerObjectAction('bonfire', 'Add-logs', (o) => { openBonfirePicker(o); return 'done'; });

// Cook on the bonfire — the open cook-fire of the Emberyard (the cooking link).
// Mirrors content.ts startCookJob; the server-side cook station OR-guard
// sharedEdit (range || fire || bonfire) makes the intent pass here.
function startBonfireCookJob(o: WorldObject, raw: string, qty: number) {
  const c = COOKABLES.find((cc) => cc.raw === raw);
  if (!c) return;
  let left = qty;
  let busy = false;
  startObjJob(o, () => {
    if (left <= 0 || !hasItem(c.raw)) return false;
    if (level('Cooking') < c.level) { msg(`You need a Cooking level of ${c.level} to cook this.`); return false; }
    if (busy) return true;
    busy = true;
    audio.sfx('fire');
    left--;
    void requestIntent('cook', { raw: c.raw }).then((echo) => {
      busy = false;
      if (!echo.ok) { left = 0; return; }
      if (echo.burned) msg(`You accidentally burn the ${lowName(c.cooked)}. The bonfire forgives nothing.`);
      else msg(`You roast the ${lowName(c.raw).replace(/^raw /, '')} over the chord-fire. It looks delicious.`);
    });
    return left > 0 && hasItem(c.raw);
  });
}

registerObjectAction('bonfire', 'Cook', (o) => {
  const opts: MakeOption[] = [];
  for (const c of COOKABLES) {
    if (!hasItem(c.raw)) continue;
    opts.push({
      id: c.raw, label: itemName(c.raw), icon: c.raw,
      disabled: level('Cooking') < c.level ? `Requires Cooking level ${c.level}.` : undefined,
    });
  }
  if (opts.length === 0) { msg("You don't have anything to cook."); return 'done'; }
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    startBonfireCookJob(o, id, qty);
  });
  return 'done';
});

// use-log-on-bonfire and use-raw-food-on-bonfire shortcuts
for (const b of BURNS) {
  registerItemOnObject(b.log, 'bonfire', (_slot, o) => startBonfireJob(o, b.log, invCount(b.log)));
}
for (const c of COOKABLES) {
  registerItemOnObject(c.raw, 'bonfire', (_slot, o) => startBonfireCookJob(o, c.raw, invCount(c.raw)));
}

// ============================================================================
// CHARCOAL PIT — 2 logs of one tier -> 1 charcoal (server 'quench' intent).
// ============================================================================
const QUENCH_LOGS_IN = 2;

function startQuenchJob(o: WorldObject, log: string, qty: number) {
  let left = qty;
  let busy = false;
  startObjJob(o, () => {
    if (left <= 0 || !hasItem(log, QUENCH_LOGS_IN)) return false;
    if (busy) return true;
    busy = true;
    left--;
    audio.sfx('fire');
    void requestIntent('quench', { log }).then((echo) => {
      busy = false;
      if (!echo.ok) { left = 0; return; }
      msg(`You bank the ${lowName(log)} into the pit. They come out as charcoal, much quieter about it.`);
    });
    return left > 0 && hasItem(log, QUENCH_LOGS_IN);
  });
}

registerObjectAction('charcoal_pit', 'Make-charcoal', (o) => {
  const opts: MakeOption[] = [];
  for (const b of BURNS) {
    const have = invCount(b.log);
    if (have === 0) continue;
    opts.push({
      id: b.log, label: `${itemName(b.log)} (${Math.floor(have / QUENCH_LOGS_IN)} charcoal)`, icon: b.log,
      disabled: have < QUENCH_LOGS_IN ? `You need ${QUENCH_LOGS_IN} logs per charcoal.` : undefined,
    });
  }
  if (opts.length === 0) { msg("You don't have any logs to quench. The pit smoulders on without you."); return 'done'; }
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    startQuenchJob(o, id, Math.min(qty, Math.floor(invCount(id) / QUENCH_LOGS_IN)));
  });
  return 'done';
});

// ============================================================================
// NPCs
// ============================================================================

const BOLE = 'Bole the Feller';
const YSOLDE = 'Cinder-Warden Ysolde';
const TAMSIN = 'Sawwright Tamsin';
const QUILL = 'Old Quill the Coalman';

// ---- Bole the Feller — the axe tier ladder, bronze to rune -----------------
registerNpcAction('bole_the_feller', 'Talk-to', () => {
  startDialogue([
    { speaker: BOLE, text: 'Bole. I sell axes. Bronze through rune, every metal the duchy will license and one or two it pretends not to know about.' },
    { speaker: BOLE, text: 'Any axe fells any tree your level allows — but a better head finishes the chord sooner. More logs an hour. The trees notice. They cope.' },
    { speaker: state.player.name, text: 'Do you name them?' },
    { speaker: BOLE, text: 'Every one. Then I sell them. Attachment is for stumps.' },
  ]);
  return 'done';
});
registerNpcAction('bole_the_feller', 'Trade', () => { openShop('bole_axes'); return 'done'; });

// ---- Cinder-Warden Ysolde — bonfire keeper + chorale-token reward shop -----
// Labels/costs mirror FORESTRY_REWARDS in server/intent-forestry.ts; the
// server independently validates tokens + room and owns the cost table.
interface Reward { id: string; cost: number; flavor: string }
const REWARDS: Reward[] = [
  { id: 'resonant_axe', cost: 300, flavor: 'Tuned to the grove\'s own key. One chime per cut, no encores.' },
  { id: 'sapglass_lantern', cost: 120, flavor: 'Sap-glass holds the note as well as the light. Mind the hum.' },
  { id: 'hollow_forester_hat', cost: 90, flavor: 'The cap. Resin-proof, mostly.' },
  { id: 'hollow_forester_top', cost: 90, flavor: 'The jerkin. Pre-dusted with sawdust at no extra charge.' },
  { id: 'hollow_forester_legs', cost: 90, flavor: 'The breeches. Kneel by all the stumps you like.' },
  { id: 'ashen_brand_hood', cost: 80, flavor: 'The hood. The smoke smell is structural.' },
  { id: 'ashen_brand_top', cost: 80, flavor: 'The tabard. Stand near the bonfire and watch the seams agree with it.' },
];

function openRewardShop() {
  const have = invCount('chorale_token');
  showOptions([
    ...REWARDS.map((r) => ({
      label: `${itemName(r.id)} — ${r.cost} tokens`,
      fn: () => {
        if (invCount('chorale_token') < r.cost) {
          startDialogue([{ speaker: YSOLDE, text: `That one is ${r.cost} tokens and you are carrying ${invCount('chorale_token')}. The bonfire is right there. It takes logs, not excuses.` }]);
          return;
        }
        void (async () => {
          const echo = await requestIntent('forestry-buy', { item: r.id });
          if (!echo.ok) {
            startDialogue([{ speaker: YSOLDE, text: echo.error === 'inventory full'
              ? 'Your pack is full. Even the bonfire makes room before it takes more.'
              : 'The ledger says no. Burn a little more and come back.' }]);
            return;
          }
          audio.sfx('coins');
          startDialogue([{ speaker: YSOLDE, text: r.flavor }]);
        })();
      },
    })),
    { label: `Never mind. (you have ${have} chorale tokens)`, fn: () => { /* close */ } },
  ]);
}

registerNpcAction('cinder_warden_ysolde', 'Talk-to', () => {
  startDialogue([
    { speaker: YSOLDE, text: 'Cinder-Warden Ysolde. I keep the Emberyard bonfire lit, and it has not gone out since before you were a rumour.' },
    { speaker: YSOLDE, text: 'Feed it logs and it pools your note into the chord — richer Firemaking than any lonely little campfire, and you can cook your supper on the coals while you stand there.' },
    { speaker: YSOLDE, text: 'Every log you give it earns a chorale token. Enough tokens and I will dress you for the forest, or hand you the resonant axe. The bonfire pays better than most barons.' },
  ]);
  return 'done';
});
registerNpcAction('cinder_warden_ysolde', 'Claim-rewards', () => {
  startDialogue(
    [{ speaker: YSOLDE, text: 'Tokens on the rail, then. What is the chord buying you today?' }],
    () => openRewardShop(),
  );
  return 'done';
});

// ---- Sawwright Tamsin — sawmill lore + log buyer (sell to her shop) --------
registerNpcAction('sawwright_tamsin', 'Talk-to', () => {
  startDialogue([
    { speaker: TAMSIN, text: 'Mind the wheel. She ticks four to the bar and she has never once rushed, which is more than I can say for any feller in this hamlet.' },
    { speaker: TAMSIN, text: 'I buy timber — any timber. Sell it through the mill counter and it becomes beams, barrels and the duchy\'s problem.' },
    { speaker: TAMSIN, text: 'New to the Hollow? Chop on the east side, then take two steps west and burn on Ysolde\'s bonfire. Chop, step, burn. The whole trade is three tiles long.' },
  ]);
  return 'done';
});
registerNpcAction('sawwright_tamsin', 'Trade', () => { openShop('sawmill_stores'); return 'done'; });

// ---- Old Quill the Coalman — charcoal pit minder + coal scuttle ------------
registerNpcAction('quill_the_coalman', 'Talk-to', () => {
  startDialogue([
    { speaker: QUILL, text: 'Two logs in, one charcoal out. The pit keeps the heat and lets the song go. Some logs are relieved, I think.' },
    { speaker: QUILL, text: 'Charcoal burns hotter than it sings — smiths take it gladly, and I will buy your spare logs besides.' },
    { speaker: state.player.name, text: 'Doesn\'t the quiet bother you?' },
    { speaker: QUILL, text: 'Lad, I have minded this pit for forty years. The quiet is the wages.' },
  ]);
  return 'done';
});
registerNpcAction('quill_the_coalman', 'Trade', () => { openShop('emberyard_coal'); return 'done'; });

export {};
