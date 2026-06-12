// Saltsong Harbour pack — the fishing/cooking expansion town on the southern
// coast (docs/specs/fishing-cooking.json). Region: 30x28 at (135,235).
//   * the Shoalrings — dense net/bait pier (shoal_net_spot / deepbait_spot)
//   * Brinemaw Reef — cage/harpoon platform (reef_cage_spot / deep_harpoon_spot)
//   * the Tide-Bell head — bell_lever + tidebell_spot capstone (chimefin)
//   * the Hearthchoir Galley — banked ranges, salt pans, composite dishes
//   * Tide-Token loop — Sella's fish turn-in + Broker Vey's reward shop
//
// Every grant is server-authoritative: all handlers funnel through
// requestIntent(...) to the salt-* domains in server/intent-saltsong.ts
// (modeled on region_port.ts / port-fish). The client only pre-checks for
// friendly messaging and plays cosmetics — values come back in the echo.
import {
  state, msg, startDialogue, showOptions, openShop, level,
  registerNpcAction, registerObjectAction, registerItemOnItem,
  hasTool, hasItem, invCount, freeSlots, requestIntent,
} from '../game';
import { audio } from '../audio';

// ---------------- helpers (mirrors region_port.ts) ----------------

let lastMsgAction: unknown = null;
function onceMsg(text: string) {
  if (state.player.action !== lastMsgAction) {
    lastMsgAction = state.player.action;
    msg(text);
  }
}

function holdsAny(ids: string[]): boolean {
  return ids.some((id) => hasTool(id));
}

const NET_TIERS = ['weighted_seine', 'bronze_net', 'small_net'];
const ROD_TIERS = ['resonant_rod', 'feather_rod', 'fishing_rod'];
const CAGE_TIERS = ['brass_cage', 'wicker_cage', 'lobster_pot'];
const HARPOON_TIERS = ['tidesong_harpoon', 'iron_harpoon', 'harpoon'];

const CATCH_LINES: Record<string, string> = {
  raw_shrimps: 'You net some shrimps.',
  raw_anchovies: 'You net some anchovies.',
  raw_mackerel: 'You net a mackerel — it surfaced on the downbeat.',
  raw_sardine: 'You catch a sardine.',
  raw_herring: 'You catch a herring.',
  raw_pike: 'You land a pike. It bites the whole way up.',
  raw_bass: 'You haul up a bass.',
  raw_lobster: 'You catch a lobster.',
  raw_swordfish: 'You harpoon a swordfish.',
  raw_shark: 'You harpoon a shark!',
  raw_tunaling: 'You harpoon a tunaling.',
  raw_chimefin: 'A chimefin answers the bell — and your harpoon. It rings all the way up!',
};

function spotHandler(spot: string, startLine: string, tools: string[], toolMsg: string, reqLevel: number) {
  return (o: { x: number; y: number }) => {
    if (!holdsAny(tools)) { msg(toolMsg); return 'done' as const; }
    if (level('Fishing') < reqLevel) {
      msg(`You need a Fishing level of ${reqLevel} to fish here.`);
      return 'done' as const;
    }
    if (freeSlots() === 0) { msg("You don't have enough inventory space to hold the fish."); return 'done' as const; }
    onceMsg(startLine);
    audio.sfx('splash');
    void requestIntent('salt-fish', { spot, x: o.x, y: o.y }).then((echo) => {
      if (!echo.ok) { if (echo.error) msg(echo.error); return; }
      const first = echo.granted?.[0]?.id;
      if (first && CATCH_LINES[first]) msg(CATCH_LINES[first]);
    });
    return 'continue' as const;
  };
}

// ---------------- The Shoalrings (Fishing 1-32) ----------------

registerObjectAction('shoal_net_spot', 'Net',
  spotHandler('shoalnet', 'You cast your net into the Shoalrings...', NET_TIERS,
    'You need a fishing net to work the Shoalrings.', 1));

registerObjectAction('deepbait_spot', 'Bait', (o) => {
  if (!holdsAny(ROD_TIERS)) { msg('You need a fishing rod to fish here.'); return 'done'; }
  if (!hasItem('fishing_bait')) { msg('You need fishing bait. Orin sells it by the bucket.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space to hold the fish."); return 'done'; }
  onceMsg('You bait your hook and cast into the dark water...');
  audio.sfx('splash');
  void requestIntent('salt-fish', { spot: 'deepbait', x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    const first = echo.granted?.[0]?.id;
    if (first && CATCH_LINES[first]) msg(CATCH_LINES[first]);
  });
  return 'continue';
});

// ---------------- Brinemaw Reef (Fishing 33-75) ----------------

registerObjectAction('reef_cage_spot', 'Cage',
  spotHandler('reefcage', 'You lower your cage onto the reef ledge...', CAGE_TIERS,
    'You need a cage or lobster pot to fish the reef ledges.', 33));

registerObjectAction('deep_harpoon_spot', 'Harpoon',
  spotHandler('deepharpoon', 'You ready your harpoon over the drop-off...', HARPOON_TIERS,
    'You need a harpoon to fish the drop-off.', 50));

// ---------------- The Tide-Bell head (Fishing 86+) ----------------

registerObjectAction('tidebell_spot', 'Harpoon',
  spotHandler('tidebell', 'You raise the tidesong harpoon and wait for the water to answer...',
    ['tidesong_harpoon'], 'Only a tidesong harpoon can land what answers the bell.', 86));

registerObjectAction('bell_lever', 'Ring', (o) => {
  void requestIntent('salt-bell', { x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    msg('The Tide-Bell tolls. Out past the point, the still water begins to ring back.');
    audio.sfx('splash');
  });
  return 'done';
});

// ---------------- The Hearthchoir Galley ----------------

registerObjectAction('salt_pan', 'Scoop', (o) => {
  onceMsg('You scoop along the salt pan...');
  void requestIntent('salt-scoop', { x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    if (echo.granted && echo.granted.length > 0) msg('You scrape up a pinch of sea salt.');
  });
  return 'continue';
});

// Composite cooking — multi-input dishes the data-driven cookables can't
// express. Server validates every input; these handlers are just the verbs.
function prep(dish: string, doneLine: string) {
  void requestIntent('salt-prep', { dish }).then((echo) => {
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    msg(doneLine);
  });
}
registerItemOnItem('knife', 'onion', () =>
  prep('chopped_onion', 'You dice the onion. Your eyes file a complaint.'));
registerItemOnItem('bowl_of_water', 'bass', () =>
  prep('fish_stew', 'You simmer bass and onion into a stew that holds its note.'));
registerItemOnItem('bowl_of_water', 'chopped_onion', () =>
  prep('fish_stew', 'You simmer bass and onion into a stew that holds its note.'));
registerItemOnItem('salt_pinch', 'shark', () =>
  prep('seasoned_shark', 'You season the shark until it forgives the harpoon. Almost.'));

// ---------------- NPCs ----------------

registerNpcAction('harbourmaster_sella', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Saltsong runs on two things: the tide-table and my patience. Only one of them is renewable.' },
    { speaker: state.player.name, text: 'What are Tide-Tokens?' },
    { speaker: n.def.name, text: 'Harbour scrip. Hand your catch to me and I stamp you tokens — Broker Vey turns them into nets, rods, oilskins, and one extremely smug cape.' },
    { speaker: n.def.name, text: 'Raw fish only. If it\'s cooked, that\'s dinner, not commerce.' },
  ]);
  return 'done';
});

const TOKEN_RATES: Record<string, { name: string; rate: number }> = {
  raw_mackerel: { name: 'Raw mackerel', rate: 1 },
  raw_pike: { name: 'Raw pike', rate: 2 },
  raw_bass: { name: 'Raw bass', rate: 3 },
  raw_lobster: { name: 'Raw lobster', rate: 4 },
  raw_swordfish: { name: 'Raw swordfish', rate: 5 },
  raw_tunaling: { name: 'Raw tunaling', rate: 8 },
  raw_shark: { name: 'Raw shark', rate: 12 },
  raw_chimefin: { name: 'Raw chimefin', rate: 25 },
};

registerNpcAction('harbourmaster_sella', 'Hand-in', () => {
  const opts = Object.entries(TOKEN_RATES)
    .filter(([id]) => invCount(id) > 0)
    .map(([id, d]) => ({
      label: `${d.name} x${invCount(id)} (${d.rate} token${d.rate > 1 ? 's' : ''} each)`,
      fn: () => {
        void requestIntent('salt-exchange', { item: id }).then((echo) => {
          if (!echo.ok) { if (echo.error) msg(echo.error); return; }
          const got = echo.granted?.find((g) => g.id === 'tide_token')?.qty ?? 0;
          msg(`Sella stamps your catch into the ledger: +${got} Tide-Token${got === 1 ? '' : 's'}.`);
        });
      },
    }));
  if (opts.length === 0) {
    msg('Sella looks over your inventory. "Come back when it smells like fish."');
    return 'done';
  }
  showOptions([...opts, { label: 'Never mind', fn: () => undefined }]);
  return 'done';
});

registerNpcAction('tackle_keeper_orin', 'Trade', () => { openShop('saltsong_tackle'); return 'done'; });
registerNpcAction('tackle_keeper_orin', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Lines, weights, cages, bait. If it goes in the water on purpose, I sell it.' },
    { speaker: state.player.name, text: 'What about the fancier gear?' },
    { speaker: n.def.name, text: 'The seine, the resonant rod, the brass cage, the tidesong harpoon? Those are Vey\'s, and Vey only takes Tide-Tokens. The harbour pays for the harbour. Tidy, really.' },
  ]);
  return 'done';
});

const REWARDS: { id: string; name: string; cost: number }[] = [
  { id: 'weighted_seine', name: 'Weighted seine', cost: 30 },
  { id: 'resonant_rod', name: 'Resonant rod', cost: 80 },
  { id: 'brass_cage', name: 'Brass cage', cost: 100 },
  { id: 'tidesong_harpoon', name: 'Tidesong harpoon', cost: 200 },
  { id: 'oilskin_hat', name: 'Oilskin hat', cost: 40 },
  { id: 'oilskin_coat', name: 'Oilskin coat', cost: 40 },
  { id: 'oilskin_waders', name: 'Oilskin waders', cost: 60 },
  { id: 'galley_toque', name: 'Galley toque', cost: 40 },
  { id: 'galley_apron', name: 'Galley apron', cost: 40 },
  { id: 'galley_mitts', name: 'Galley mitts', cost: 60 },
  { id: 'tideturner_cape', name: "Tideturner's cape", cost: 500 },
];

registerNpcAction('tide_token_broker_vey', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: `Tokens in, gear out. You hold ${invCount('tide_token')} Tide-Token${invCount('tide_token') === 1 ? '' : 's'}.` },
    { speaker: n.def.name, text: 'The full oilskin set steadies your line out on the spots. The galley set keeps the cooks looking the part. The cape... the cape is for people the tide already knows by name.' },
  ]);
  return 'done';
});

registerNpcAction('tide_token_broker_vey', 'Redeem', () => {
  showOptions([
    ...REWARDS.map((r) => ({
      label: `${r.name} — ${r.cost} tokens`,
      fn: () => {
        void requestIntent('salt-redeem', { item: r.id }).then((echo) => {
          if (!echo.ok) { if (echo.error) msg(echo.error); return; }
          msg(`Vey slides the ${r.name.toLowerCase()} across the counter. "Spent like a regular."`);
        });
      },
    })),
    { label: 'Never mind', fn: () => undefined },
  ]);
  return 'done';
});

registerNpcAction('galley_cook_maren', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome to the Hearthchoir. Six ranges, one pitch. A dish that holds its note doesn\'t burn — mostly that means practice, and watching the heat like it owes you money.' },
    { speaker: state.player.name, text: 'Any recipes worth knowing?' },
    { speaker: n.def.name, text: 'Knife to an onion makes chopped onion — Cooking 20, and yes, you will cry. Bowl of water, cooked bass, chopped onion at a range makes fish stew at 45. And at 84, a pinch of pan salt on cooked shark makes it almost apologetic.' },
    { speaker: n.def.name, text: 'The Larder next to me sells the bowls, onions, and salt. The salt pans by the wall are free, if your wrists are.' },
  ]);
  return 'done';
});

registerNpcAction('fishmonger_pell', 'Trade', () => { openShop('saltsong_galley'); return 'done'; });
registerNpcAction('fishmonger_pell', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Pelline. Yes, THAT Pell is my brother. No, his lobsters are not fresher. They\'re not even his lobsters.' },
    { speaker: state.player.name, text: 'What do you buy?' },
    { speaker: n.def.name, text: 'Cooked fish, fair coin, no haggling — the price is the price, like the tide is the tide. And I sell what the stew pot wants: onions, bowls, salt.' },
  ]);
  return 'done';
});

registerNpcAction('lighthouse_keeper_brann', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'That bell up there is the oldest verse in Cantorne, cast in brass. The Tideverse. Ring it, and for half a minute the sea remembers the words.' },
    { speaker: state.player.name, text: 'And the chimefin?' },
    { speaker: n.def.name, text: 'The only fish that sings back. While the bell rings, they rise to the spots off the point — but nothing lands one except a tidesong harpoon, and nobody holds one of those before the sea\'s taught them plenty. Fishing 86, by my reckoning.' },
    { speaker: n.def.name, text: 'Pull the lever, mind your footing, and don\'t harpoon the bell. Again.' },
  ]);
  return 'done';
});

export {};
