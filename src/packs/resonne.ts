// RESONNE, the Singing City — Magic + Runecraft hub (origin 40,150; 32x32).
//
// Canon (docs/specs/magic-runecraft.json): in Cantorne the world was sung;
// runes are frozen syllables of the makers. Resonne is a cliff-terraced wizard
// city built around the GREAT DIAPASON — an amphitheatre where every elemental
// altar rings at once, so a runecrafter barely walks between bindings. The
// deepest stone, the Discord altar in Catalyst Hollow, binds the wrong note.
//
// This pack owns the client side of the hub:
//   - Craft-rune on every new altar type (server: 'runecraft' intent — the
//     altar ladder/essence/multiplier live in server/intent-produce.ts ALTARS)
//   - Mine on rocks_pure (server: built-in 'gather' intent via skillObjs)
//   - Enchant-tiara at keyed altars (server: 'enchant-tiara' intent)
//   - Craft-tiara at the furnace (server: data-driven 'produce' craft recipe)
//   - the rune mill Grind loop (server: 'grind-runes' intent)
//   - Quartermaster Sella's Conservatory reward exchange (server-authoritative
//     deal table in server/intent-resonne.ts; the client only names an index)
//   - the five Conservatory NPCs (dialogue + shops)
//
// Server-authoritative throughout: every grant goes through requestIntent/
// sendIntent; this file never authors xp, items, or coins.

import {
  state, msg, level, hasTool, hasItem, freeSlots, invCount,
  registerObjectAction, registerNpcAction,
  startDialogue, showOptions, openShop,
  requestIntent, sendIntent,
  DialogueLine, Npc,
} from '../game';
import { audio } from '../audio';

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}

// ============================================================
// The altar ring — Craft-rune on every altar type.
// Levels/essence/keys MIRROR server/intent-produce.ts ALTARS (the server is
// authoritative; these checks only save the round-trip and word the refusal).
// ============================================================

interface AltarInfo {
  level: number;
  essence: 'rune_essence' | 'pure_essence';
  key?: { talisman: string; tiara: string; keyName: string };
  flavor: string;
}

const ALTAR_RING: Record<string, AltarInfo> = {
  // low tier — air_altar/fire_altar Craft-rune handlers already exist
  // (content.ts / region_desert.ts); re-registering them here would duplicate
  // menu entries, so only the three NEW low altars appear below.
  mind: { level: 2, essence: 'rune_essence', flavor: 'You bind a stray thought into mind runes. It was not a very good thought.' },
  water: { level: 5, essence: 'rune_essence', flavor: 'You bind Brell\'s dripping verse into water runes.' },
  earth: { level: 9, essence: 'rune_essence', flavor: 'You bind Aulden\'s bass line into earth runes. Your boots stop humming.' },
  // high tier — pure essence, keyed by talisman (held) or tiara (worn)
  body: { level: 20, essence: 'pure_essence', key: { talisman: 'body_talisman', tiara: 'body_tiara', keyName: 'body' }, flavor: 'You bind a borrowed pulse into body runes.' },
  cosmic: { level: 27, essence: 'pure_essence', key: { talisman: 'cosmic_talisman', tiara: 'cosmic_tiara', keyName: 'cosmic' }, flavor: 'You bind an interval wider than the sky into cosmic runes.' },
  chord: { level: 44, essence: 'pure_essence', key: { talisman: 'chord_talisman', tiara: 'chord_tiara', keyName: 'chord' }, flavor: 'You bind the held note into chord runes. It goes on holding.' },
  law: { level: 54, essence: 'pure_essence', key: { talisman: 'law_talisman', tiara: 'law_tiara', keyName: 'law' }, flavor: 'You bind the bar line into law runes, precisely on the beat.' },
  death: { level: 65, essence: 'pure_essence', key: { talisman: 'death_talisman', tiara: 'death_tiara', keyName: 'death' }, flavor: 'You bind the rest at the end of the phrase into death runes. The terrace is very quiet.' },
  discord: { level: 70, essence: 'pure_essence', key: { talisman: 'discord_talisman', tiara: 'discord_tiara', keyName: 'discord' }, flavor: 'You bind the wrong note into discord runes. Something far below approves, which is not reassuring.' },
  blood: { level: 77, essence: 'pure_essence', key: { talisman: 'blood_talisman', tiara: 'blood_tiara', keyName: 'blood' }, flavor: 'You bind the warm downbeat into blood runes. The altar keeps your tempo a moment too long.' },
  soul: { level: 90, essence: 'pure_essence', key: { talisman: 'soul_talisman', tiara: 'soul_tiara', keyName: 'soul' }, flavor: 'You bind your own part of the First Chord into soul runes, and it lets you keep singing it. Generous.' },
};

function hasAltarKey(a: AltarInfo): boolean {
  if (!a.key) return true;
  if (state.player.equipment.head?.id === a.key.tiara) return true;
  return hasItem(a.key.talisman);
}

for (const [key, a] of Object.entries(ALTAR_RING)) {
  registerObjectAction(`${key}_altar`, 'Craft-rune', () => {
    if (level('Runecraft') < a.level) {
      msg(`The stone holds its note against you. You need a Runecraft level of ${a.level} to bind ${key} runes.`);
      return 'done';
    }
    if (!hasAltarKey(a)) {
      msg(`The altar does not answer. You need a ${a.key!.keyName} talisman in your pack, or its tiara on your head.`);
      return 'done';
    }
    if (invCount(a.essence) === 0) {
      msg(a.essence === 'pure_essence'
        ? 'You need pure essence to bind runes this high up the stave.'
        : 'You need some rune essence to craft runes here.');
      return 'done';
    }
    // Server-authoritative: the server binds ALL held essence into runes,
    // applying the level multiplier + Runecraft xp (intent-produce.ts ALTARS).
    void requestIntent('runecraft', { altar: key }).then((echo) => {
      if (!echo.ok) return;
      audio.sfx('spell');
      msg(a.flavor);
    });
    return 'done';
  });
}

// ----- Enchant-tiara: at a keyed altar, chant_tiara + talisman -> tiara -----
for (const [key, a] of Object.entries(ALTAR_RING)) {
  if (!a.key) continue;
  registerObjectAction(`${key}_altar`, 'Enchant-tiara', () => {
    if (!hasItem('chant_tiara')) { msg('You need a blank chant tiara to enchant. Tutor Brae sells them, or a furnace and a silver bar makes one.'); return 'done'; }
    if (!hasItem(a.key!.talisman)) { msg(`The tiara needs the ${a.key!.keyName} talisman pressed into it. The altar keeps the talisman; that's the deal.`); return 'done'; }
    // Server consumes chant_tiara + talisman, grants the element tiara + 25 RC xp.
    void requestIntent('enchant-tiara', { altar: key }).then((echo) => {
      if (!echo.ok) return;
      audio.sfx('spell');
      msg(`You press the talisman into the tiara and the altar teaches it the ${a.key!.keyName} note. It will sing it from your head forever.`);
    });
    return 'done';
  });
}

// ============================================================
// Pure essence rocks — mirrors the content.ts mining loop.
// ============================================================

const PICKAXE_IDS = ['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe', 'tuned_pickaxe', 'mithril_pickaxe', 'adamant_pickaxe', 'rune_pickaxe', 'resonant_pickaxe'];
const hasPickaxe = () => PICKAXE_IDS.some((id) => hasTool(id));

registerObjectAction('rocks_pure', 'Mine', (o) => {
  if (!hasPickaxe()) { msg('You need a pickaxe to mine this rock.'); return 'done'; }
  if (level('Mining') < 20) { msg('You need a Mining level of 20 to quarry pure essence.'); return 'done'; }
  if (freeSlots() === 0) { msg('Your inventory is too full to hold any more essence.'); return 'done'; }
  audio.sfx('mine');
  // Server-authoritative gather: the server rolls + grants the essence + Mining xp
  // (skillObjs.rocks_pure; never depletes, like rocks_essence).
  if (!sendIntent('gather', { obj: 'rocks_pure', x: o.x, y: o.y })) { msg('You are not connected to the server.'); return 'done'; }
  return 'continue';
});

// ============================================================
// Chant tiara at the furnace (data-driven craft recipe, station: furnace).
// ============================================================

registerObjectAction('furnace', 'Craft-tiara', () => {
  if (level('Crafting') < 23) { msg('You need a Crafting level of 23 to shape a chant tiara.'); return 'done'; }
  if (!hasItem('silver_bar')) { msg('You need a silver bar to make a chant tiara.'); return 'done'; }
  void requestIntent('produce', { recipe: 'craft', output: 'chant_tiara' }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('smelt');
    msg('You pour the silver into a circlet. It comes out blank, and faintly expectant.');
  });
  return 'done';
});

// ============================================================
// The rune mill — grind surplus runes into rune dust.
// ============================================================

const GRINDABLE = [
  'air_rune', 'mind_rune', 'water_rune', 'earth_rune', 'fire_rune', 'chaos_rune',
  'body_rune', 'cosmic_rune', 'chord_rune', 'law_rune', 'death_rune',
  'blood_rune', 'soul_rune', 'discord_rune',
];

registerObjectAction('rune_mill', 'Grind', () => {
  const held = GRINDABLE.filter((id) => invCount(id) > 0);
  if (held.length === 0) { msg('The mill turns hopefully, but you have no runes to feed it.'); return 'done'; }
  showOptions([
    ...held.map((id) => ({
      label: `Grind all ${id.replace('_', ' ')}s (${invCount(id)})`,
      fn: () => {
        // Server-authoritative: validates near-mill, removes the whole stack,
        // grants floor(value/3) rune_dust per rune (intent-resonne.ts).
        void requestIntent('grind-runes', { rune: id }).then((echo) => {
          if (!echo.ok) return;
          audio.sfx('mine');
          msg('The mill grinds your spare syllables down to honest dust.');
        });
      },
    })),
    { label: 'Never mind.', fn: () => { /* close */ } },
  ]);
  return 'done';
});

// ============================================================
// Quartermaster Sella — Conservatory reward exchange.
// SERVER-AUTHORITATIVE: the deal table is owned by server/intent-resonne.ts;
// the client only names the deal INDEX. Labels/costs here are menu flavour and
// MUST line up 1:1 with CONSERVATORY_DEALS.
// ============================================================

const SELLA = 'Quartermaster Sella';

interface RewardDeal { label: string; flavor: string }
const REWARD_DEALS: RewardDeal[] = [
  { label: 'Body talisman — 20 rune dust', flavor: 'A pulse on a string. Try not to think about whose.' },
  { label: 'Cosmic talisman — 30 rune dust', flavor: 'Hold it at arm\'s length. It prefers the distance.' },
  { label: 'Chord talisman — 60 rune dust', flavor: 'The held note. Do not put it down mid-phrase.' },
  { label: 'Law talisman — 80 rune dust', flavor: 'It will get you to the altar on time. It insists.' },
  { label: 'Death talisman — 110 rune dust', flavor: 'Every song has a rest. Now you carry one.' },
  { label: 'Discord talisman — 160 rune dust', flavor: 'The Archcantor signed off on this. I made him sign twice.' },
  { label: 'Blood talisman — 150 rune dust', flavor: 'Keep it on the side away from your heart. House policy.' },
  { label: 'Soul talisman — 200 rune dust', flavor: 'Your own part of the Chord. Sing it responsibly.' },
  { label: 'Conservatory robe top — 60 rune dust', flavor: 'Cut for singing in. Machine-washable, mostly.' },
  { label: 'Conservatory robe skirt — 50 rune dust', flavor: 'Hemmed for the altar stairs. You\'re welcome.' },
  { label: 'Diapason hat — 90 rune dust', flavor: 'The amphitheatre, for your head. Acoustically flattering.' },
  { label: 'Resonant staff — 40 dust + 8 resonant shards', flavor: 'It hums Quiess\'s part so you never run out of air. Literally.' },
  { label: 'Chord staff — 200 dust + 25 shards + a resonant staff', flavor: 'Your old staff, retuned to Imber\'s verse. It supplies its own fire.' },
];

function openRewards() {
  const dust = invCount('rune_dust');
  showOptions([
    ...REWARD_DEALS.map((deal, idx) => ({
      label: deal.label,
      fn: () => {
        void (async () => {
          const echo = await requestIntent('conservatory-reward', { deal: idx });
          if (!echo.ok) {
            startDialogue(say(SELLA,
              echo.error === 'inventory full'
                ? 'Your pack is full. The Conservatory does not do delivery.'
                : 'The ledger says you can\'t cover that. Grind more surplus and come back.'));
            return;
          }
          audio.sfx('spell');
          startDialogue(say(SELLA, deal.flavor));
        })();
      },
    })),
    { label: `Never mind. (you have ${dust} rune dust)`, fn: () => { /* close */ } },
  ]);
}

registerNpcAction('resonne_quartermaster', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(SELLA, 'Quartermaster Sella. I run the reward stores: talismans, robes, staves. Payment in rune dust — Dross at the mill grinds your surplus into it.'),
    ...say(SELLA, 'Resonant shards from the Untuned Mine count toward the staves. The Mining Guild and I have an arrangement, and the arrangement has paperwork.'),
  ], () => openRewards());
  return 'done';
});

registerNpcAction('resonne_quartermaster', 'Rewards', (_n: Npc) => {
  openRewards();
  return 'done';
});

// ============================================================
// The other Conservatory NPCs.
// ============================================================

const VEYL = 'Archcantor Veyl';
registerNpcAction('resonne_archcantor', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(VEYL, 'Welcome to Resonne. The makers sang the world in four parts; what your altars bind are the syllables they left holding. Runecraft is dictation. Magic is quoting.'),
    ...say(VEYL, 'The Diapason holds the short syllables — air, mind, water, earth, fire. The high terraces hold the long intervals: body, cosmic, chord, law, death, blood, soul. Pure essence only. The short stones can\'t carry that much held breath.'),
    ...say(VEYL, 'And below us, in Catalyst Hollow, there is a stone that sings the wrong note. We bind it into discord runes because power unbound is worse. If it ever starts singing back on the beat — come and tell me at once.'),
  ]);
  return 'done';
});

const BRAE = 'Tutor Brae';
registerNpcAction('resonne_runecraft_tutor', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(BRAE, 'The loop is three steps and none of them are walking, that\'s the whole point of Resonne. Mine essence at the middle pad, bind it at any stone in the ring, bank it at the booth. Repeat until enlightened.'),
    ...say(BRAE, 'Ordinary rune essence carries the short syllables. Past level twenty you\'ll want pure essence — the paler veins on the pad — for the high terraces. Those altars also want a key: a talisman in your pack, or its tiara on your head.'),
    ...say(BRAE, 'I sell blank chant tiaras, or shape your own from a silver bar at the furnace. Enchant one at an altar — it keeps the talisman, you keep your hands free. Everyone\'s happy except the talisman.'),
  ]);
  return 'done';
});
registerNpcAction('resonne_runecraft_tutor', 'Trade', (_n: Npc) => {
  openShop('resonne_supplies');
  return 'done';
});

const OMPIN = 'Clerk Ompin';
registerNpcAction('resonne_magic_clerk', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(OMPIN, 'Spell ledgers, third shelf. The strike and bolt verses you know; the Conservatory has now transcribed the blast, wave and surge tiers. Death runes for blast, blood for wave, soul for surge. The arithmetic of escalation.'),
    ...say(OMPIN, 'There is also the Dissonant Strike, scored for discord runes. It hits harder than it should for the level. The margin note just says "borrowed". I didn\'t write it and I won\'t sing it.'),
    ...say(OMPIN, 'Low runes I sell in bulk. High runes you bind yourself — that\'s not policy, that\'s economics.'),
  ]);
  return 'done';
});
registerNpcAction('resonne_magic_clerk', 'Trade', (_n: Npc) => {
  openShop('resonne_runes');
  return 'done';
});

const DROSS = 'Keeper Dross';
registerNpcAction('resonne_mill_keeper', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(DROSS, 'Mill takes runes, gives dust. Rate\'s a third of the value, rounded against you. Dust buys Sella\'s stock. That\'s the whole speech.'),
    ...say(DROSS, 'Folk ask if it hurts the runes. It\'s a syllable, not a songbird. Feed the mill.'),
  ]);
  return 'done';
});

export {};
