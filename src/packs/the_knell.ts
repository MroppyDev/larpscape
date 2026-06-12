// Pack: THE KNELL — clifftop temple of the Order of the Last Verse, with the
// Charnel Cloister (consecrated prayer training) above and the Sundered Choir
// (clustered slayer dungeon) below. Far-southeast highlands, region origin
// (245,230).
//
// SERVER-AUTHORITATIVE (docs/CONVERSION-CONTRACT.md): every owned-state change
// here is resolved by the 'bone-offering' domain (server/intent-knell.ts) —
// offering bones for tokens, the consecrated-altar bury bonus, prayer
// recharge, the bone-token reward shop, censer charges, the tome of dirges,
// and the choir-dust turn-in. This pack authors NOTHING: it sends
// requestIntent('bone-offering', {op,...}) and reflects the authoritative
// `knell` snapshot (tokens / censerCharges) into a module-local mirror for
// dialogue display only. Cantor Veil's points vault rides the existing
// 'slayer' domain ('buy' op — entries added to REWARDS via sharedEdit).
//
// Imported for side effects by src/packs/index.ts (integrator wires).

import {
  state, msg, invCount, openShop, requestIntent,
  registerObjectAction, registerNpcAction, registerItemAction,
  startDialogue, showOptions,
  DialogueLine, Npc, IntentEcho,
} from '../game';
import { ITEMS } from '../defs';
import { audio } from '../audio';

const VEIL = 'Cantor Veil';
const PLAINSONG = 'Sister Plainsong';
const ABBOT = 'Abbot Threnody';

const DUST_PER_INCENSE = 25;

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}

// ---------------------------------------------------------------------------
// Mirror of the SERVER-authoritative Knell snapshot (tokens / censer charges).
// Computed and persisted server-side; reflected here for dialogue text only.
// ---------------------------------------------------------------------------
let lastTokens = 0;
let lastCenser = 0;
let knellSeen = false;

function reflect(echo: IntentEcho): void {
  const snap = (echo as unknown as { knell?: { tokens?: number; censerCharges?: number } }).knell;
  if (!snap) return;
  if (typeof snap.tokens === 'number') lastTokens = snap.tokens;
  if (typeof snap.censerCharges === 'number') lastCenser = snap.censerCharges;
  knellSeen = true;
}

// ---------------------------------------------------------------------------
// Bone runs: feed every bone in the inventory through the altar/brazier, one
// server-validated intent per bone (the server owns removal + XP + tokens).
// ---------------------------------------------------------------------------
function boneSlots(): { slot: number; id: string }[] {
  const out: { slot: number; id: string }[] = [];
  state.player.inventory.forEach((it, i) => {
    if (it && ITEMS[it.id]?.buryXp) out.push({ slot: i, id: it.id });
  });
  return out;
}

let running = false;
async function runBones(op: 'bury' | 'offer', verb: string): Promise<void> {
  if (running) return;
  const bones = boneSlots();
  if (bones.length === 0) { msg('You have no bones to give.'); return; }
  running = true;
  let done = 0;
  let xp = 0;
  try {
    for (const b of bones) {
      const echo = await requestIntent('bone-offering', { op, item: b.id, invSlot: b.slot });
      reflect(echo);
      if (!echo.ok) { if (echo.error && done === 0) msg(echo.error); break; }
      done++;
      for (const g of echo.xp ?? []) if (g.skill === 'Prayer') xp += g.amount;
      audio.sfx('bury');
    }
  } finally {
    running = false;
  }
  if (done > 0) {
    msg(`You ${verb} ${done} ${done === 1 ? 'bone' : 'sets of bones'} (${xp} Prayer XP).`, 'level');
    if (op === 'offer') msg(`The grey flame keeps the tally: ${lastTokens} offerings to your name.`);
  }
}

// ---------------------------------------------------------------------------
// The Charnel Cloister — consecrated altar + offering braziers.
// ---------------------------------------------------------------------------
registerObjectAction('consecrated_altar', 'Pray-at', () => {
  void requestIntent('bone-offering', { op: 'recharge' }).then((echo) => {
    reflect(echo);
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    audio.sfx('pray');
    msg('You kneel at the consecrated altar. Your prayer rings back at full strength.');
  });
  return 'done';
});

registerObjectAction('consecrated_altar', 'Bury-bones', () => {
  msg('You lay your bones on consecrated ground...');
  void runBones('bury', 'bury');
  return 'done';
});

registerObjectAction('bone_offering_brazier', 'Offer-bones', () => {
  msg('You feed the grey flame...');
  void runBones('offer', 'offer');
  return 'done';
});

registerObjectAction('knell_bell', 'Toll', () => {
  audio.sfx('pray');
  msg('You toll the Knell once. Somewhere below, something stops mid-verse to listen.');
  return 'done';
});

// ---------------------------------------------------------------------------
// Sister Plainsong — supplies shop + the bone-token reward vault.
// ---------------------------------------------------------------------------
interface TokenReward { id: string; cost: number; blurb: string }
const TOKEN_REWARDS: TokenReward[] = [
  { id: 'holy_censer', cost: 250, blurb: 'Swing it while you bury and every burial counts a quarter more. Feed it incense.' },
  { id: 'unsung_helm', cost: 750, blurb: 'The Order\'s helm. Prayer drains half as fast under it. We tested. Extensively.' },
];

function tokenShop() {
  showOptions([
    ...TOKEN_REWARDS.map((r) => ({
      label: `${ITEMS[r.id]?.name ?? r.id} — ${r.cost} offerings`,
      fn: () => {
        startDialogue(say(PLAINSONG, r.blurb), () => {
          showOptions([
            {
              label: `Take it (${r.cost} offerings)`,
              fn: () => {
                void requestIntent('bone-offering', { op: 'buy', item: r.id }).then((echo) => {
                  reflect(echo);
                  if (!echo.ok) { if (echo.error) msg(`${PLAINSONG}: '${echo.error}'`); return; }
                  msg(`Sister Plainsong hands over the ${ITEMS[r.id]?.name.toLowerCase() ?? r.id}.`, 'level');
                });
              },
            },
            { label: 'Not today.', fn: () => undefined },
          ]);
        });
      },
    })),
    { label: 'Never mind.', fn: () => undefined },
  ]);
}

registerNpcAction('sister_plainsong', 'Talk-to', (_n: Npc) => {
  const tally = knellSeen ? ` The flame says you stand at ${lastTokens} offerings.` : '';
  startDialogue([
    ...say(PLAINSONG, 'Welcome to the Charnel Cloister! Mind the braziers, they bite.'),
    ...say(PLAINSONG, `Bury bones at the consecrated altar and the hymn carries further — a fifth more, by the Abbot's arithmetic. Or give them to the grey flame and earn the Order's favour instead.${tally}`),
  ], () => {
    showOptions([
      { label: 'Show me the Order\'s rewards.', fn: tokenShop },
      { label: 'What do you sell?', fn: () => openShop('knell_supplies') },
      {
        label: 'How does the censer work?',
        fn: () => startDialogue(say(PLAINSONG,
          'Wear the holy censer and keep it fed with incense — one cone is good for a hundred burials, each a quarter sweeter.',
          'Light the incense from your pack and it goes straight into the censer. No, I don\'t know where the smoke goes. Nobody asks twice.')),
      },
      { label: 'Just passing through.', fn: () => undefined },
    ]);
  });
  return 'done';
});
registerNpcAction('sister_plainsong', 'Trade', (_n: Npc) => { openShop('knell_supplies'); return 'done'; });

// ---------------------------------------------------------------------------
// Abbot Threnody — lore + tutorial for the prayer economy.
// ---------------------------------------------------------------------------
registerNpcAction('abbot_threnody', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(ABBOT, 'Every death is a voice falling silent, child. A hymn interrupted. We finish the verse — that is all burial is.'),
    ...say(ABBOT, 'Greater bones hold greater notes. Beast bones, drake bones, tollbones — and the unsung bones, which hold their last note still. Bury those on consecrated ground and the whole cliff rings.'),
    ...say(ABBOT, 'Below us the Sundered Choir fights a war that ended an age ago. Cantor Veil handles the... percussion. Speak to him if your creed runs more to silencing than singing.'),
  ]);
  return 'done';
});

// ---------------------------------------------------------------------------
// Cantor Veil — the Knell's slayer master: assignments ride the existing
// server slayer loop; his vault is the expanded slayer REWARDS (sharedEdit);
// choir dust is turned in here for incense.
// ---------------------------------------------------------------------------
interface VaultEntry { id: string; cost: number; blurb: string }
const VAULT: VaultEntry[] = [
  { id: 'binding_chime', cost: 35, blurb: 'Ring it once at the start of a cull. The quarry stops dodging on principle.' },
  { id: 'tome_of_dirges', cost: 60, blurb: 'My ledger of endings. Read it once and you will hear where the wrong notes hide.' },
  { id: 'silencers_cowl', cost: 90, blurb: 'The cowl. Hear everything; be heard by nothing.' },
  { id: 'silencers_greaves', cost: 100, blurb: 'The greaves. A cull should arrive like a rest in the music — unannounced.' },
  { id: 'silencers_robe', cost: 120, blurb: 'The robe. Wear the full vestments and the work itself teaches you faster.' },
  { id: 'knell_brand', cost: 250, blurb: 'Bell-bronze, tuned to a dead stop. The last word the Order ever needs to say.' },
];

function vaultShop() {
  const pts = state.player.slayerPoints ?? 0;
  showOptions([
    ...VAULT.map((r) => ({
      label: `${ITEMS[r.id]?.name ?? r.id} — ${r.cost} pts`,
      fn: () => {
        startDialogue(say(VEIL, r.blurb), () => {
          showOptions([
            {
              label: `Buy (${r.cost} points — you have ${pts})`,
              fn: () => {
                void requestIntent('slayer', { op: 'buy', item: r.id }).then((echo) => {
                  if (!echo.ok) { if (echo.error) msg(`${VEIL}: '${echo.error}'`); return; }
                  msg(`Cantor Veil hands over the ${ITEMS[r.id]?.name.toLowerCase() ?? r.id}.`, 'level');
                });
              },
            },
            { label: 'Not yet.', fn: () => undefined },
          ]);
        });
      },
    })),
    { label: 'Never mind.', fn: () => undefined },
  ]);
}

function turnInDust() {
  const have = invCount('choir_dust');
  if (have < DUST_PER_INCENSE) {
    startDialogue(say(VEIL, `Dust comes in lots of ${DUST_PER_INCENSE}. You hold ${have}. The Choir below sheds it freely — go shake some loose.`));
    return;
  }
  void requestIntent('bone-offering', { op: 'turn-in-dust' }).then((echo) => {
    reflect(echo);
    if (!echo.ok) { if (echo.error) msg(`${VEIL}: '${echo.error}'`); return; }
    msg('Cantor Veil takes the choir dust and presses a cone of incense into your hand.');
  });
}

registerNpcAction('cantor_veil', 'Talk-to', (_n: Npc) => {
  const task = state.player.slayerTask;
  const opening = task && task.remaining > 0
    ? `Your count stands at ${task.remaining}. The Choir is not getting quieter on its own.`
    : 'Below this floor, the Discord War never heard the final chord. We provide it. One wrong note at a time.';
  startDialogue([
    ...say(VEIL, opening),
    ...say(VEIL, 'Brogan assigns the work — my Choir is on his ledger now. I keep the vault, and I buy choir dust. The altar must stay lit somehow.'),
  ], () => {
    showOptions([
      { label: 'Open the vault.', fn: vaultShop },
      { label: `Turn in choir dust (${DUST_PER_INCENSE} per incense).`, fn: turnInDust },
      {
        label: 'What lives down there?',
        fn: () => startDialogue(say(VEIL,
          'The Pews hold the hounds and the ghasts — apprentice work. The Transept: dirgewolves, ghouls, a chordwyrm or two. Journeyman work.',
          'The Apse holds the carillon revenants and the Warden, who still conducts. That work has no adjective. Bring prayers.')),
      },
      { label: 'Another time.', fn: () => undefined },
    ]);
  });
  return 'done';
});
registerNpcAction('cantor_veil', 'Rewards', (_n: Npc) => { vaultShop(); return 'done'; });

// ---------------------------------------------------------------------------
// Items — incense, the dirge tome, the censer check.
// ---------------------------------------------------------------------------
registerItemAction('censer_incense', 'Light', (_slot: number) => {
  void requestIntent('bone-offering', { op: 'light-censer' }).then((echo) => {
    reflect(echo);
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    msg(`The cone catches with a low hum. Your censer holds ${lastCenser} charges.`);
  });
});

registerItemAction('tome_of_dirges', 'Read', (_slot: number) => {
  void requestIntent('bone-offering', { op: 'read-dirge' }).then((echo) => {
    reflect(echo);
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    msg('You read Cantor Veil\'s tome of dirges. Every ending, annotated. You feel decisively better at providing them.', 'level');
  });
});

registerItemAction('holy_censer', 'Check', (_slot: number) => {
  if (knellSeen) msg(`The censer holds ${lastCenser} charge${lastCenser === 1 ? '' : 's'}.`);
  else msg('The censer swings quietly. Light some incense to be sure of its charge.');
});
