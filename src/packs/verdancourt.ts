// Verdancourt, the Greening Garth — herb-garden hub for the herblore-farming
// expansion. Three terraces of farming_patch clusters (allotment / herb rows /
// resonant terrace), secondary gather nodes, compost bins, an apothecary hall,
// and the Sustainer NPCs.
//
// What is intentionally NOT here (content.ts already covers it dynamically
// over the defs.ts catalogs once data/fragments/herblore-farming.json merges):
// herb-seed planting/harvest (SEEDS), grimy-herb cleaning (HERBS), standard
// vial+herb+secondary potion mixing (POTIONS), and Eat on strawberry/onion
// (edible item defs). Re-registering those would duplicate menus/handlers.
//
// New intents this pack drives (server/intent-verdancourt.ts):
//   verd-pick     — limpwurt_plant / white_berry_bush / snape_grass_clump
//   verd-compost  — compost bins: crops -> compost, compost+herbs -> super
//   verd-extreme  — resonant_dust on a super potion -> extreme potion
//
// Imported for side effects via src/packs/index.ts.

import {
  msg, events, requestIntent, requestMake,
  registerObjectAction, registerNpcAction, registerItemAction, registerItemOnItem,
  startDialogue, openShop,
  level, hasItem, invCount, freeSlots,
  DialogueLine, MakeOption,
} from '../game';
import { ITEMS, SKILL_OBJS } from '../defs';
import { audio } from '../audio';

function itemName(id: string) { return ITEMS[id]?.name ?? id; }
function lowName(id: string) { return itemName(id).toLowerCase(); }
function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

// ============================================================================
// SECONDARY GATHER NODES — server-authoritative via the 'verd-pick' domain.
// Data (level/xp/rates) lives in objects.json skillObjs; the server re-reads
// the same table, so the numbers can never diverge.
// ============================================================================
const PICK_NODES: { type: string; flavor: string }[] = [
  { type: 'snape_grass_clump', flavor: 'You pull at the snape grass...' },
  { type: 'limpwurt_plant', flavor: 'You dig around the limpwurt root...' },
  { type: 'white_berry_bush', flavor: 'You pick through the pale berries...' },
];
for (const node of PICK_NODES) {
  registerObjectAction(node.type, 'Pick', (o) => {
    const data = SKILL_OBJS[node.type];
    if (!data) { msg('Nothing interesting happens.'); return 'done'; }
    if (level('Farming') < data.level) {
      msg(`You need a Farming level of ${data.level} to gather this.`);
      return 'done';
    }
    if (freeSlots() === 0 && !hasItem(data.item)) { msg("You don't have enough inventory space."); return 'done'; }
    msg(node.flavor);
    // Server validates object@tile + range + level, rolls success, grants the
    // secondary + Farming xp. One attempt per click (flax-style, no depletion).
    void requestIntent('verd-pick', { obj: node.type, x: o.x, y: o.y }).then((echo) => {
      if (!echo.ok) return;
      if ((echo.granted?.length ?? 0) > 0) {
        audio.sfx('plant');
        msg(`You gather some ${lowName(data.item)}.`);
      } else {
        msg('You come away with nothing but green fingers.');
      }
    });
    return 'done';
  });
}

// ============================================================================
// COMPOST BINS — crops in, compost out (server: 'verd-compost').
// ============================================================================
const COMPOST_CROPS = ['potato', 'cabbage', 'onion', 'sweetcorn', 'strawberry', 'watermelon'];
const GRIMY_HERBS = [
  'grimy_guam', 'grimy_marrentill', 'grimy_ranarr', 'grimy_irit',
  'grimy_harralander', 'grimy_toadflax', 'grimy_avantoe', 'grimy_kwuarm',
  'grimy_cadantine', 'grimy_dwarf_weed', 'grimy_truechord_bloom',
];
const cropCount = () => COMPOST_CROPS.reduce((n, id) => n + invCount(id), 0);
const grimyCount = () => GRIMY_HERBS.reduce((n, id) => n + invCount(id), 0);

registerObjectAction('compost_bin', 'Compost', (o) => {
  const opts: MakeOption[] = [
    {
      id: 'compost', label: 'Compost (5 crops)', icon: 'compost',
      disabled: level('Farming') < 20 ? 'Requires Farming level 20.'
        : cropCount() < 5 ? 'You need 5 crops (potato/cabbage/onion/sweetcorn/strawberry/watermelon).'
        : undefined,
    },
    {
      id: 'supercompost', label: 'Supercompost (compost + 2 grimy herbs)', icon: 'supercompost',
      disabled: level('Farming') < 50 ? 'Requires Farming level 50.'
        : !hasItem('compost') ? 'You need a heap of compost to enrich.'
        : grimyCount() < 2 ? 'You need 2 grimy herbs to rot in.'
        : undefined,
    },
  ];
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    // Server consumes the inputs and grants the compost + small Farming xp.
    void requestIntent('verd-compost', { what: id, x: o.x, y: o.y }).then((echo) => {
      if (!echo.ok) return;
      audio.sfx('plant');
      msg(id === 'compost'
        ? 'You tread the crops down into the bin and shovel out a heap of compost.'
        : 'You fold the grimy herbs through the compost. It smells ambitious.');
    });
  });
  return 'done';
});

// ============================================================================
// BREW CAULDRON (Vell's hall) — flavor station; brewing is stationless via
// vial-on-herb (content.ts POTIONS loop), so this just teaches the loop.
// ============================================================================
registerObjectAction('cauldron', 'Brew', () => {
  msg('The cauldron hums a low, patient chord.');
  msg('To brew: use a vial of water on a clean herb, with the right secondary in your pack.');
  return 'done';
});

// ============================================================================
// EXTREME TIER — resonant_dust on a finished super potion ('verd-extreme').
// The 'potion|' make recipe hardcodes vial+herb+secondary, so these two ride
// a dedicated domain instead (spec verdict correction #3).
// ============================================================================
const EXTREMES: { base: string; output: string; level: number }[] = [
  { base: 'super_attack', output: 'extreme_attack', level: 88 },
  { base: 'super_strength', output: 'extreme_strength', level: 90 },
];
for (const ex of EXTREMES) {
  registerItemOnItem('resonant_dust', ex.base, () => {
    if (level('Herblore') < ex.level) {
      msg(`You need a Herblore level of ${ex.level} to tune this brew.`);
      return;
    }
    void requestIntent('verd-extreme', { output: ex.output }).then((echo) => {
      if (!echo.ok) return;
      audio.sfx('eat');
      msg(`You stir the resonant dust into the ${lowName(ex.base)}. It rings a full octave sharper: ${lowName(ex.output)}.`);
    });
  });
}

// ============================================================================
// DRINK — every new potion, registered exactly ONCE each (registerItemAction
// does not de-dupe). The server's consume intent removes the dose and applies
// the data-driven effects (restoresPrayer today; boosts once the hook lands).
// ============================================================================
const DRINKS: { id: string; line: string; stats?: boolean }[] = [
  { id: 'strength_potion', line: 'You drink the strength potion. Doors look suddenly optional.' },
  { id: 'restore_potion', line: 'You drink the restore potion. Everything settles back to true.', stats: true },
  { id: 'energy_potion', line: 'You drink the energy potion. Your legs forget they were complaining.' },
  { id: 'steadying_brew', line: 'You drink the steadying brew. Sword and shield arm fall into step.' },
  { id: 'antiblight_tonic', line: 'You drink the antiblight tonic. Something sour in you packs up and leaves.' },
  { id: 'super_strength', line: 'You drink the super strength potion. The barrels nearby look light.' },
  { id: 'prayer_renewal', line: 'You drink the prayer renewal. Your faith returns with interest.', stats: true },
  { id: 'super_defence', line: 'You drink the super defence potion. Your skin takes the news stoically.' },
  { id: 'ranging_potion', line: 'You drink the ranging potion. Distant things look rudely close.' },
  { id: 'super_restore', line: 'You drink the super restore. Body and soul, retuned.', stats: true },
  { id: 'extreme_attack', line: 'You drink the extreme attack potion. Your sword arm hears a high, sharp note.' },
  { id: 'extreme_strength', line: 'You drink the extreme strength potion. The ground feels apologetic.' },
  { id: 'truechord_draught', line: 'You drink the Truechord draught. For a moment you are entirely in tune.', stats: true },
];
for (const d of DRINKS) {
  registerItemAction(d.id, 'Drink', (slot) => {
    void requestIntent('consume', { item: d.id, invSlot: slot }).then((echo) => {
      if (!echo.ok) return;
      audio.sfx('eat');
      msg(d.line);
      if (d.stats) events.onStatsChange();
    });
  });
}

// ============================================================================
// NPCS
// ============================================================================
const BRISA = 'Warden Brisa';
const OAK = 'Master Sustainer Oak';
const VELL = 'Apothecary Vell';
const THISTLE = 'Keeper Thistle';
const MARA = 'Blight Warden Mara';

registerNpcAction('warden_brisa', 'Trade', () => { openShop('verdancourt_seeds'); return 'done'; });
registerNpcAction('warden_brisa', 'Talk-to', () => {
  startDialogue([
    ...say(BRISA, 'Welcome to Verdancourt, the Greening Garth. Forty-one patches on three terraces — you will barely have to walk, which I am told is the fashion.'),
    ...say(BRISA, 'Rake a patch, dib a seed, wait for the note to ripen. The Seed Trough stocks everything up to kwuarm; the rarer seeds you earn, or pry from the Blight.'),
    ...me('A seed is a held breath, then?'),
    ...say(BRISA, 'So the Sustainers sing. Mind you exhale on time — and buy a trowel, the soil respects good steel.'),
  ]);
  return 'done';
});

registerNpcAction('apothecary_vell', 'Trade', () => { openShop('verdancourt_apothecary'); return 'done'; });
registerNpcAction('apothecary_vell', 'Talk-to', () => {
  startDialogue([
    ...say(VELL, 'Vials, newt eyes, roots and berries — everything a brew needs except the patience.'),
    ...say(VELL, 'A potion is a chord struck once and drunk: clean herb, the right secondary, a vial of water. The cauldron hums approval but does none of the work.'),
    ...me('And the extreme brews I hear about?'),
    ...say(VELL, 'Resonant dust, stirred into a finished super potion. It re-tunes the whole chord an octave sharp. Costly, brief, and absolutely worth it mid-fight.'),
  ]);
  return 'done';
});

registerNpcAction('master_sustainer_oak', 'Talk-to', () => {
  const farm = level('Farming');
  const herb = level('Herblore');
  const lines: DialogueLine[] = [
    ...say(OAK, 'Hsst. Listen. Under your boots — the Greenchord. A root-vein that hums in the key of growing things. Verdancourt exists to keep that note true.'),
    ...say(OAK, 'The Offnote would rot it to Blight: withered crops, sour brews. We Sustainers answer with rakes and patience.'),
  ];
  if (farm >= 85 && herb >= 82) {
    lines.push(...say(OAK, `Farming ${farm}, Herblore ${herb} — the Resonant Terrace is yours, Sustainer. The truechord blooms will hold their note for your hands.`));
  } else {
    lines.push(...say(OAK, `The upper terrace is for those who can hold the long note — Farming 85 and Herblore 82. You stand at ${farm} and ${herb}. The truechord does not forgive a wobble.`));
  }
  startDialogue(lines);
  return 'done';
});

registerNpcAction('keeper_thistle', 'Trade', () => { openShop('sustainer_rewards'); return 'done'; });
registerNpcAction('keeper_thistle', 'Talk-to', () => {
  startDialogue([
    ...say(THISTLE, 'The Reward Trough. Herb sacks, the gardener\'s set, the resonant dibber, truechord seed — the good stuff, priced so only the dedicated flinch and pay.'),
    ...me('Steep prices for garden tools.'),
    ...say(THISTLE, 'Steep? The dibber hums seeds back into your hand and the sack has eaten forty harvests. Cheap, for what they are. Now — buying, or browsing?'),
  ]);
  return 'done';
});

registerNpcAction('blight_warden_mara', 'Talk-to', () => {
  startDialogue([
    ...say(MARA, 'See the upper rows? Last season half of them went sour — the Blight crept in on a single flat note and the crops withered where they stood.'),
    ...say(MARA, 'Toadflax and white berries, brewed sharp: antiblight tonic. It scours the rot out of a body the way we scour it out of a patch. Keep one on you.'),
    ...me('And the Blight drops the rare seeds, I hear.'),
    ...say(MARA, 'It hoards what it ruins. Cadantine, dwarf weed — cut the rot open and plant what spills out. Best revenge there is.'),
  ]);
  return 'done';
});

export {};
