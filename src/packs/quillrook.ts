// QUILLROOK, THE TINNITUS RANGE — dense Ranged/Gun training valley.
//
// Canon: when Cantorne was sung, this wind-scoured canyon was the Choir's
// rehearsal hall. The echo-stone cliffs still hold every note ever struck and
// answer back — so the range scores your shot by the NOTE the impact rings,
// not just the hit. Fletcher Wren splits echo-stone-aged reedwood here;
// Gunsmith Ada Brace (Aldgate Gun Guild outpost) mills the wrongnote-tinged
// thunder-shale seam into resonant rounds.
//
// This pack owns the client side of Quillrook:
//   - the sixteen-target firing line (echo_target_novice/keen/master/perfect):
//     SERVER-AUTHORITATIVE via the 'range-shot' intent (server/intent-ranged.ts
//     owns TARGET_TIERS: level gates, xp, ammo consumption, token rolls). The
//     client only names the tile and reports the echo.
//   - reedwood/chimewood stands — real Woodcutting via the existing 'gather'
//     intent (skillObjs + GATHER_REQS entries ship with this expansion).
//   - the fletching bench + item-on-item wiring for the new fletchables
//     (steel/dragon/resonant arrows, composite + chime bows) — all resolved
//     by the existing server 'produce'/fletch path from recipes.json.
//   - Quillrook benchwork ammo: gunpowder on longshot casings / echo-stone
//     shards -> 'quill-load' intent (the Gun Guild loadRounds table only
//     supports 1 powder + 1 casing, so these get their own server table).
//   - the four hub NPCs: Wren (fletcher shop), Brace (gunsmith shop),
//     Range-Master Cole (tutorial), Quartermaster Sable ('quill-rewards'
//     echo-token shop — costs server-owned, client names the reward only).

import {
  state, msg, level, freeSlots, invCount, hasItem, hasTool,
  requestIntent, sendIntent, requestMake, MakeOption,
  registerObjectAction, registerNpcAction, registerItemOnItem,
  openShop, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { ITEMS, FLETCHABLES, SKILL_OBJS } from '../defs';
import { audio } from '../audio';

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
const itemName = (id: string) => ITEMS[id]?.name ?? id;

// ============================================================
// The firing line — echo targets (range-shot intent)
// ============================================================

// Client-side mirror of the server tier table — labels + instant pre-check
// messages ONLY. The server independently validates level/ammo/range and owns
// the real xp/token numbers (TARGET_TIERS in server/intent-ranged.ts).
const TARGET_LEVEL: Record<string, number> = {
  echo_target_novice: 1,
  echo_target_keen: 30,
  echo_target_master: 60,
  echo_target_perfect: 80,
};

function shotMode(): 'ranged' | 'gun' | null {
  const w = state.player.equipment.weapon;
  if (!w) return null;
  if (w.id.includes('pistol') || w.id.includes('rifle') || w.id === 'glock_18') return 'gun';
  if (w.id.includes('shortbow') || w.id.includes('longbow') || w.id === 'shortbow') return 'ranged';
  return null;
}

// The server rate-limits shots (~2 ticks); throttle locally so the action loop
// doesn't burn a request (and a chat-log refusal) on every off-beat tick.
let lastShotSent = 0;
const MISS_LINES = [
  'The cliff rings your shot back flat. Range-Master Cole pretends not to wince.',
  'Wide. The echo repeats the miss, which feels unnecessary.',
  'The target stays silent. The cliff does not.',
];

for (const type of Object.keys(TARGET_LEVEL)) {
  registerObjectAction(type, 'Shoot', (o) => {
    const mode = shotMode();
    if (!mode) { msg('You need a bow, pistol or rifle equipped to shoot the range.'); return 'done'; }
    const skill = mode === 'ranged' ? 'Ranged' : 'Gun';
    if (level(skill as 'Ranged' | 'Gun') < TARGET_LEVEL[type]) {
      msg(`You need a ${skill} level of ${TARGET_LEVEL[type]} to shoot this target.`);
      return 'done';
    }
    const ammo = state.player.equipment.ammo;
    const suffix = mode === 'ranged' ? '_arrow' : '_round';
    if (!ammo || !ammo.id.endsWith(suffix)) {
      msg(mode === 'ranged' ? 'You have no arrows equipped.' : 'You have no rounds equipped.');
      return 'done';
    }

    const now = performance.now();
    if (now - lastShotSent < 1150) return 'continue'; // wait for the beat
    lastShotSent = now;

    audio.sfx(mode === 'gun' ? 'gun' : 'bow');
    void (async () => {
      const echo = await requestIntent('range-shot', { x: o.x, y: o.y });
      if (!echo.ok) return; // refusals surface via the central echo handler
      const e = echo as unknown as { hit?: boolean; saved?: boolean; granted?: { id: string; qty: number }[] };
      if (e.saved) msg('The echo-stone hands your shot back, good as new.');
      if (!e.hit) { msg(MISS_LINES[Math.floor(Math.random() * MISS_LINES.length)]); return; }
      const tokens = e.granted?.find((g) => g.id === 'echo_tokens');
      const shard = e.granted?.find((g) => g.id === 'echo_stone_shard');
      if (tokens) msg(`A clean note! Cole flicks you ${tokens.qty} echo token${tokens.qty > 1 ? 's' : ''}.`, 'level');
      if (shard) msg('A shard of echo-stone shakes loose from the cliff face.', 'level');
    })();
    return 'continue';
  });
}

// ============================================================
// Reedwood + chimewood stands — Woodcutting via the gather intent
// ============================================================

// Cosmetic depletion roll (mirrors content.ts trees); the server rolls the grant.
function successRollChance(lvl: number, reqLevel: number, low: number, high: number): number {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return low + (high - low) * t;
}

for (const type of ['reedwood_stand', 'chimewood_stand']) {
  const data = SKILL_OBJS[type];
  registerObjectAction(type, 'Cut', (o) => {
    if (!data) { msg('Nothing interesting happens.'); return 'done'; }
    if (o.depletedUntil > 0) { msg('The stand is cut back. It is already regrowing — you can hear it.'); return 'done'; }
    if (!hasTool('bronze_axe')) { msg('You need an axe to cut this.'); return 'done'; }
    const lvl = level('Woodcutting');
    if (lvl < data.level) { msg(`You need a Woodcutting level of ${data.level} to cut this.`); return 'done'; }
    if (freeSlots() === 0) { msg('Your inventory is too full to hold any more logs.'); return 'done'; }
    audio.sfx('chop');
    if (!sendIntent('gather', { obj: type, x: o.x, y: o.y })) { msg('You are not connected to the server.'); return 'done'; }
    if (Math.random() < data.depleteChance * successRollChance(lvl, data.level, data.lowRate, data.highRate)) {
      o.depletedUntil = state.tick + data.respawn;
      o.depletedAs = 'stump';
      return 'done';
    }
    return 'continue';
  });
}

// ============================================================
// Fletching — bench menu + item-on-item combos (server 'produce' path)
// ============================================================

const QUILL_FLETCH = [
  'steel_arrow', 'composite_shortbow_u', 'composite_shortbow', 'resonant_arrow',
  'chime_longbow_u', 'chime_longbow', 'dragon_arrow',
];

async function doFletch(output: string, qty: number) {
  const f = FLETCHABLES.find((ff) => ff.output === output);
  if (!f) return;
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
  if (made > 0) {
    audio.sfx('bow');
    msg(`You carefully craft ${itemName(output).toLowerCase()}${(f.outputQty ?? 1) > 1 ? 's' : ''}.`);
  }
}

registerObjectAction('fletch_bench', 'Fletch', () => {
  const choices = FLETCHABLES.filter((f) => QUILL_FLETCH.includes(f.output));
  const opts: MakeOption[] = choices.map((f) => ({
    id: f.output,
    label: `${itemName(f.output)}${(f.outputQty ?? 1) > 1 ? ` (${f.outputQty})` : ''}`,
    icon: f.output,
    disabled: level('Fletching') < f.level ? `Requires Fletching level ${f.level}.` : undefined,
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    void doFletch(id, qty);
  });
  return 'done';
});

// item-on-item shortcuts (mirror skills_production fletchCombo)
function fletchCombo(a: string, b: string, output: string) {
  registerItemOnItem(a, b, () => {
    const f = FLETCHABLES.find((ff) => ff.output === output);
    if (!f) return;
    const maxQty = Math.min(...f.inputs.map((i) => Math.floor(invCount(i.item) / i.qty)));
    void doFletch(output, Math.max(1, maxQty));
  });
}
fletchCombo('headless_arrow', 'steel_arrowtips', 'steel_arrow');
fletchCombo('headless_arrow', 'dragon_arrowtips', 'dragon_arrow');
fletchCombo('headless_arrow', 'echo_stone_shard', 'resonant_arrow');
fletchCombo('reedwood_logs', 'steel_bar', 'composite_shortbow_u');
fletchCombo('knife', 'chimewood_logs', 'chime_longbow_u');
fletchCombo('bowstring', 'composite_shortbow_u', 'composite_shortbow');
fletchCombo('spidersilk_bowstring', 'chime_longbow_u', 'chime_longbow');

// ============================================================
// Quillrook benchwork ammo — 'quill-load' (longshot / resonant)
// ============================================================

function quillLoad(a: string, b: string, what: 'longshot' | 'resonant') {
  registerItemOnItem(a, b, () => {
    void (async () => {
      const echo = await requestIntent('quill-load', { what });
      if (!echo.ok) { if (echo.error) msg(echo.error); return; }
      const batch = (echo as unknown as { batch?: number }).batch ?? 0;
      if (batch > 0) {
        audio.sfx('gun');
        msg(`You load ${batch} ${itemName(what === 'longshot' ? 'longshot_round' : 'resonant_round').toLowerCase()}${batch > 1 ? 's' : ''}.`);
      }
    })();
  });
}
quillLoad('gunpowder', 'longshot_bullet_casing', 'longshot');
quillLoad('gunpowder', 'echo_stone_shard', 'resonant');

// ============================================================
// Fletcher Wren — fletching supplies + bow lore
// ============================================================

const WREN = 'Fletcher Wren';

registerNpcAction('quillrook_fletcher', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(WREN, 'Fletcher Wren. I split echo-stone-aged reedwood by ear — a true shaft whistles in thirds. Anything that whistles in fourths goes on the fire.'),
    ...say(WREN, 'Steel and dragon arrowtips smith at any anvil now; pair them with headless arrows. Reedwood and a steel bar make a composite stave, and chimewood from the grove makes the chime longbow — if you can find a spidersilk string worthy of it.'),
    ...say(WREN, 'Bench is by the firing line. Cut north of here, fletch at the bench, shoot the cliff. You will never walk more than ten steps in this valley. That is the whole design.'),
  ]);
  return 'done';
});
registerNpcAction('quillrook_fletcher', 'Trade', () => { openShop('quillrook_fletcher'); return 'done'; });

// ============================================================
// Gunsmith Ada Brace — rifles + longshot/resonant rounds
// ============================================================

const BRACE = 'Gunsmith Ada Brace';

registerNpcAction('quillrook_gunsmith', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(BRACE, 'Brace & Bore — Aldgate Gun Guild, Quillrook outpost. Flint sells you a pistol for talking fast. I sell you a rifle for getting the last word.'),
    ...say(BRACE, 'Rifles fire a beat slower than a pistol and hit like a dropped chord. They take any round, but smith longshot casings from rune stock and load them with powder for proper reach.'),
    ...say(BRACE, 'And if you pry echo-stone shards off the range: two measures of powder and one shard makes a resonant round. The target hears the shot twice. Only the first one is the bullet.'),
  ]);
  return 'done';
});
registerNpcAction('quillrook_gunsmith', 'Trade', () => { openShop('quillrook_gunsmith'); return 'done'; });

// ============================================================
// Range-Master Cole — the firing-line tutorial
// ============================================================

const COLE = 'Range-Master Cole';

registerNpcAction('quillrook_range_master', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(COLE, 'Welcome to the Tinnitus Range. The cliff is echo-stone — it repeats every shot fired at it, and it scores you by the note the impact rings. I just keep the ledger. And the headaches.'),
    ...say(COLE, 'Sixteen targets on the line: novice, keen, master, perfect, left to right. Bow trains Ranged, pistol or rifle trains Gun. Every shot costs ammunition. Every clean note can shake loose echo tokens — the perfect targets ring richest.'),
    ...say(COLE, 'Bank at either end of the line, bench beside it, pen of live targets to the south if the straw ones bore you. Spend tokens with Quartermaster Sable. Speak up when you talk to her — she\'s been here thirty years.'),
  ], () => {
    showOptions([
      { label: 'Why is it called the Tinnitus Range?', fn: () => {
        startDialogue(say(COLE, 'Stand on that firing line for a decade and ask me again. Louder, please.'));
      }},
      { label: 'What was this place before?', fn: () => {
        startDialogue(say(COLE, 'The Choir\'s rehearsal hall, when Cantorne was sung. The cliffs held every note ever struck here, and they have been answering back ever since. We just gave the echoes something to score.'));
      }},
    ]);
  });
  return 'done';
});

// ============================================================
// Quartermaster Sable — echo-token reward shop ('quill-rewards')
// ============================================================

const SABLE = 'Quartermaster Sable';

// Labels/costs mirror QUILL_REWARDS in server/intent-ranged.ts — the server
// independently validates the token cost and grants the data-defined reward.
interface RewardRow { item: string; label: string; cost: number; flavor: string }
const REWARD_ROWS: RewardRow[] = [
  { item: 'quillrook_quiver', label: 'Quillrook quiver — 400 tokens', cost: 400,
    flavor: 'Echo-stone ribs. Sometimes the cliff hands the shot back. Do not ask it why; it only answers in your own voice.' },
  { item: 'marksmans_earmuffs', label: "Marksman's earmuffs — 180 tokens", cost: 180,
    flavor: 'Standard issue. The ringing stops, the scores improve, the nickname stays.' },
  { item: 'resonance_gloves', label: 'Resonance gloves — 180 tokens', cost: 180,
    flavor: 'You will feel the note before you loose it. Try not to hum along.' },
  { item: 'resonant_arrow', label: '50 resonant arrows — 30 tokens', cost: 30,
    flavor: 'The wound keeps ringing. The fletchers find that poetic. The targets do not.' },
  { item: 'resonant_round', label: '50 resonant rounds — 35 tokens', cost: 35,
    flavor: 'Milled from the wrongnote seam. Brace signs every batch. I count them anyway.' },
];

function openRewards() {
  const have = invCount('echo_tokens');
  showOptions([
    ...REWARD_ROWS.map((r) => ({
      label: r.label,
      fn: () => {
        if (invCount('echo_tokens') < r.cost) {
          startDialogue(say(SABLE, `That is ${r.cost} tokens and you are holding ${invCount('echo_tokens')}. The cliff is patient. Be the cliff.`));
          return;
        }
        void (async () => {
          const echo = await requestIntent('quill-rewards', { item: r.item });
          if (!echo.ok) {
            startDialogue(say(SABLE, echo.error === 'inventory full'
              ? 'Your pack is full. I do not do deliveries.'
              : 'The ledger says no. The ledger is never wrong.'));
            return;
          }
          startDialogue(say(SABLE, r.flavor));
        })();
      },
    })),
    { label: `Never mind. (you have ${have} echo tokens)`, fn: () => { /* close */ } },
  ]);
}

registerNpcAction('quillrook_quartermaster', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(SABLE, 'Quartermaster Sable. Tokens in, gear out, no haggling — the cliff already heard your opening offer and repeated it to me.'),
    ...say(SABLE, 'The quiver is the prize: now and then the echo-stone hands your shot straight back. Earmuffs and gloves for the working marksman, resonant ammunition by the bundle for the impatient one.'),
  ], () => openRewards());
  return 'done';
});

registerNpcAction('quillrook_quartermaster', 'Rewards', (_n: Npc) => {
  openRewards();
  return 'done';
});

export {};
