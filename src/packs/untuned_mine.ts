// THE UNTUNED MINE — solo instanced early-game dungeon (levels ~10-30).
//
// Canon (docs/LORE.md): the sealed north wing of the Swamp Mine, bricked from
// the inside in '88. Aulden's bass line runs shallow here and an Offnote
// fragment has been teaching the ore the wrong note ever since. Chapter 3 of
// the Gathering Discord arc ('The Sealed Wing', gd3_sealed_wing) opens it.
//
// This pack owns the client side of the dungeon:
//   - the entrance gate on `untuned_mine_door` (exact check from
//     QUEST-DESIGN §14.2; if Q3's pack later registers its own 'Enter'
//     handler the integrator should have it call exported enterUntunedMine())
//   - enter/exit via POST /api/dungeon/enter|exit (server validates the
//     quest stage, spawns/despawns the private instance, returns coords)
//   - floor links (mine_ladder / mine_rope), with the F2 rope gated behind
//     Foreman Echo's defeat in the CURRENT run
//   - the ringing veins (rocks_ringing): real mining with a level-scaled ore
//     mix, ~6% resonant_shard bonus, and the tuned_pickaxe 10% speed perk
//   - all boss telegraph fx + damage-modifier messaging (the dodge logic is
//     resolved server-side in server/dungeon.ts; visuals via render.addGroundFx)
//   - Cantor-Surveyor Brigh at the door: shard exchange + supply shop
//   - the surveyor's plaque: fastest-descent leaderboard
//
// Geometry must match scripts/author-dungeon.ts + server/dungeon.ts.

import {
  state, msg, level, hasTool, freeSlots,
  invCount, openShop, requestIntent,
  registerObjectAction, registerNpcAction, registerFx, registerDamageModifier,
  registerTickHook, onKill, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { net } from '../net';
import { addGroundFx } from '../render';
import { audio } from '../audio';

const BRIGH = 'Cantor-Surveyor Brigh';

const DUNGEON = { x0: 6, y0: 238, x1: 50, y1: 295 };
const inDungeon = (x: number, y: number) =>
  x >= DUNGEON.x0 && x <= DUNGEON.x1 && y >= DUNGEON.y0 && y <= DUNGEON.y1;

// per-run client state (kill gate for the F2 rope, exit bookkeeping)
let runActive = false;
const runKills = new Set<string>();

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}

function teleport(x: number, y: number) {
  const p = state.player;
  p.prevX = x; p.prevY = y;
  p.x = x; p.y = y;
  p.path = [];
  p.action = null;
}

// ============================================================
// Entrance gate (untuned_mine_door, Swamp Mine cave area)
// ============================================================

export async function enterUntunedMine(): Promise<void> {
  try {
    const r = await net.api('/api/dungeon/enter', {});
    runActive = true;
    runKills.clear();
    teleport(r.x, r.y);
    msg('You step through the breach. The dark below keeps time against your face.');
    msg('The Ringing Galleries. Every vein down here hums a half-beat flat.', 'level');
  } catch (e: any) {
    msg(String(e?.message ?? 'The breach refuses you.'));
  }
}

// NOTE: the `untuned_mine_door`/'Enter' handler (and the §14.2 gate check)
// is registered by Q3's pack (src/packs/gd3_sealed_wing.ts), which calls
// exported enterUntunedMine() above. Registering it here too would create a
// duplicate menu entry and shadow whichever pack loads second.

// exit portal in the entry hall
registerObjectAction('mine_exit_portal', 'Exit', () => {
  void (async () => {
    try {
      const r = await net.api('/api/dungeon/exit', {});
      runActive = false;
      runKills.clear();
      teleport(r.x, r.y);
      msg('You climb back through the breach into the Swamp Mine. The daylight is in tune.');
    } catch {
      msg('The way out flickers. Try again in a moment.');
    }
  })();
  return 'done';
});

// death / teleport out: tell the server so the instance despawns promptly
// (the server's bounds check would catch it anyway after a few ticks)
registerTickHook(() => {
  const p = state.player;
  if (!p || !runActive) return;
  if (p.dead || !inDungeon(p.x, p.y)) {
    runActive = false;
    runKills.clear();
    void net.api('/api/dungeon/exit', {}).catch(() => { /* server bounds check covers us */ });
  }
});

onKill((defId) => {
  if (!runActive) return;
  runKills.add(defId);
  if (defId === 'foreman_echo') {
    msg('The Foreman Echo finishes its last shift, salutes nobody, and disperses. The rope below is no longer knotted in its rhythm.', 'level');
  }
});

// ============================================================
// Floor links — ladders + ropes (coords match scripts/author-dungeon.ts)
// ============================================================

interface Link { dest: { x: number; y: number }; doing: string; done: string; gate?: () => boolean }
const LINKS = new Map<string, Link>([
  ['44,249', {
    dest: { x: 43, y: 263 },
    doing: 'You climb down the \'88-pattern ladder, knocking twice on the timbers...',
    done: 'The Skipped Seam. The silence here arrives slightly before the sound.',
  }],
  ['44,262', {
    dest: { x: 43, y: 248 },
    doing: 'You climb back up toward the Ringing Galleries...',
    done: 'You haul yourself off the ladder.',
  }],
  ['25,276', {
    dest: { x: 25, y: 283 },
    doing: 'You take the knotted rope down into the Resonant Vault...',
    done: 'The air is thick with one held note. Something enormous is ringing below.',
    gate: () => {
      if (runKills.has('foreman_echo')) return true;
      msg('The rope is knotted in time with the Foreman Echo\'s shift. Until its last loop ends, the knots will not hold you.');
      return false;
    },
  }],
  ['26,282', {
    dest: { x: 24, y: 275 },
    doing: 'You climb the rope back up to the Skipped Seam...',
    done: 'You clamber over the ledge.',
  }],
]);

for (const type of ['mine_ladder', 'mine_rope']) {
  registerObjectAction(type, 'Climb', (o) => {
    const link = LINKS.get(`${o.x},${o.y}`);
    if (!link) { msg('The shaft below is choked with rubble.'); return 'done'; }
    if (link.gate && !link.gate()) return 'done';
    msg(link.doing);
    audio.sfx('agility');
    teleport(link.dest.x, link.dest.y);
    msg(link.done);
    return 'done';
  });
}

// ============================================================
// Ringing veins — the dungeon's mining loop
// ============================================================

const DEPLETE_CHANCE = 0.5;
const VEIN_RESPAWN = 40; // ticks (~24s — forces hops between 2-3 veins)

function hasPickaxe(): boolean { return hasTool('bronze_pickaxe') || hasTool('tuned_pickaxe'); }

registerObjectAction('rocks_ringing', 'Mine', (o) => {
  if (o.depletedUntil > 0) { msg('The vein has rung itself empty. Give it a few bars.'); return 'done'; }
  if (!hasPickaxe()) { msg('You need a pickaxe to mine this vein.'); return 'done'; }
  if (level('Mining') < 10) { msg('You need a Mining level of 10 to work a ringing vein.'); return 'done'; }
  if (freeSlots() === 0) { msg('Your inventory is too full to hold any more ore.'); return 'done'; }
  audio.sfx('mine');
  // Server-authoritative vein mining: validates dungeon room + tile + tool/level
  // and grants ore/shards/xp via echo/applyGrant.
  void requestIntent('mine-vein', { x: o.x, y: o.y });
  if (Math.random() < DEPLETE_CHANCE) {
    o.depletedUntil = state.tick + VEIN_RESPAWN;
    o.depletedAs = 'rocks_empty';
    return 'done';
  }
  return 'continue';
});

// ============================================================
// Boss + hazard fx (telegraph visuals; dodges resolve server-side)
// ============================================================

// Foreman Echo — skips position 2 tiles on a visible beat
registerFx('echo_skip_telegraph', (_n, data) => {
  if (typeof data?.tx === 'number' && typeof data?.ty === 'number') {
    addGroundFx('tile', data.tx, data.ty, { dur: 1200, color: '#9adcd2' });
  }
  msg('The Foreman Echo knocks twice — the next beat is skipped. Move!');
});
registerFx('echo_skip', () => msg('The echo arrives where it was always going to be.'));
registerFx('echo_whiff', () => msg('Its pick falls through the space you just left.'));
registerDamageModifier('echo_slam', (dmg) => {
  msg('The skipped beat lands on you like a dropped chord!');
  return dmg;
});

// The Crystal Heart — phase 1: it rings
registerFx('heart_ring_telegraph', (n, data) => {
  if (n) addGroundFx('ring', n.x, n.y, { dur: 1200, radius: data?.range ?? 4, color: '#c47ae8' });
  msg('The Crystal Heart draws breath — a shockwave is coming. Keep moving!');
});
registerFx('heart_ring_dodge', () => msg('You outrun the ring of the wrong note.'));
registerDamageModifier('heart_shockwave', (dmg) => {
  msg('The shockwave rolls through you, every bone a tuning fork!');
  return dmg;
});
registerFx('heart_summon', () => msg('Slivers shake loose from the Heart and take the air as discord motes.'));

// The Crystal Heart — phase 2: the wrong note solos
registerFx('heart_crack', (n) => {
  if (n) addGroundFx('ring', n.x, n.y, { dur: 900, radius: 2, color: '#ff6ad2' });
  msg('The Crystal Heart CRACKS down its length — and the wrong note begins to solo!', 'level');
});
registerFx('heart_solo_telegraph', (_n, data) => {
  const tiles: unknown = data?.tiles;
  if (Array.isArray(tiles)) {
    for (const t of tiles) {
      if (Array.isArray(t) && typeof t[0] === 'number' && typeof t[1] === 'number') {
        addGroundFx('tile', t[0], t[1], { dur: 1200, color: '#ff6ad2' });
      }
    }
  }
  msg('The floor lights up where the solo will land — get off the bright tiles!');
});
registerFx('heart_solo_dodge', () => msg('The solo crashes down beside you, furious and flat.'));
registerDamageModifier('heart_solo', (dmg) => {
  msg('The wrong note lands its solo directly on you!');
  return dmg;
});

// boss kill — server records the time and reports it via fx payload
registerFx('heart_shatter', (_n, data) => {
  const ms = typeof data?.ms === 'number' ? data.ms : null;
  msg('The Crystal Heart shatters into honest, silent ore. The wing holds its first true rest in fifty-five years.', 'level');
  if (ms !== null) msg(`Descent time: ${fmtMs(ms)}. Brigh chisels it onto her plaque if it ranks.`, 'level');
  msg('Its hoard rings loose across the floor — gather it before you leave.');
});

// The Crawl — collapsing rubble (F2 hazard corridor)
registerFx('rubble_telegraph', (_n, data) => {
  if (typeof data?.tx === 'number' && typeof data?.ty === 'number') {
    addGroundFx('tile', data.tx, data.ty, { dur: 1200, color: '#d8b86a' });
  }
  msg('The roof above you groans out of rhythm — step aside!');
});
registerDamageModifier('rubble_hit', (dmg) => {
  msg('Rubble crashes down on the beat you missed!');
  return dmg;
});

// ============================================================
// Boss flavor (Look-at)
// ============================================================

registerNpcAction('foreman_echo', 'Look-at', (n: Npc) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'A miner of pale light works a seam that is no longer there. He knocks twice on timbers that rotted in \'88, swings, and skips — two strides ahead of where he stood, with no stride in between.' },
    { speaker: 'Foreman Echo', text: '...twice for Aulden... twice for the ones behind me... keep the count... KEEP THE COUNT...' },
  ]);
  return 'done';
});

registerNpcAction('crystal_heart', 'Look-at', (n: Npc) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'A crystal the size of a cottage, ringing without being struck. Every sliver in the vale answers it, faintly, a half-beat flat. Looking at it feels like being listened to.' },
    { speaker: '', text: 'This is not a vein. This is what Foreman Hollis bricked the wing shut against — and it has had fifty-five years to practise.' },
  ]);
  return 'done';
});

// ============================================================
// Cantor-Surveyor Brigh — shard exchange + supplies (at the breach)
// ============================================================

// Shard exchange — SERVER-AUTHORITATIVE (docs/CONVERSION-CONTRACT.md). The deal
// table (shard cost → item/coins) is owned by server/intent-misc.ts; the client
// only names the deal INDEX and reports the echo. `cost`/`flavor` here are for the
// menu labels + chat flavour; the server independently validates shards + room
// and grants exactly the data-defined output. Indices MUST match SHARD_DEALS.
interface Exchange { label: string; cost: number; flavor: string }
const EXCHANGES: Exchange[] = [
  { label: '2 shards — 60 coins', cost: 2, flavor: 'Evidence has a price, and the duchy pays on receipt.' },
  { label: '2 shards — 3 attack potions', cost: 2, flavor: 'Brewed loud on purpose. Drink before the chorus.' },
  { label: '4 shards — an iron scimitar', cost: 4, flavor: 'Guild surplus. It holds its edge and its pitch.' },
  { label: '12 shards — a steel scimitar', cost: 12, flavor: 'Steel sings a fifth higher than iron. Aim it accordingly.' },
  { label: '18 shards — a steel platebody', cost: 18, flavor: 'Proofed against percussion. Most percussion.' },
];

function openExchange() {
  const have = invCount('resonant_shard');
  showOptions([
    ...EXCHANGES.map((ex, idx) => ({
      label: ex.label,
      fn: () => {
        if (invCount('resonant_shard') < ex.cost) {
          startDialogue(say(BRIGH, `That costs ${ex.cost} shards and you are holding ${invCount('resonant_shard')}. The mine is generous. Go be received.`));
          return;
        }
        void (async () => {
          const echo = await requestIntent('shard-exchange', { deal: idx });
          if (!echo.ok) {
            startDialogue(say(BRIGH, echo.error === 'inventory full'
              ? 'Your pack is full. I log everything, including that.'
              : 'The slate says no. Come back with the shards.'));
            return;
          }
          startDialogue(say(BRIGH, ex.flavor));
        })();
      },
    })),
    { label: `Never mind. (you have ${have} shards)`, fn: () => { /* close */ } },
  ]);
}

registerNpcAction('cantor_surveyor', 'Talk-to', (_n: Npc) => {
  const done = (state.player.quests['gd3_sealed_wing'] ?? 0) >= 6;
  startDialogue(done
    ? [
      ...say(BRIGH, 'Cantor-Surveyor Brigh, duchy ledger, sealed-wing detail. I log every wrong note that comes up that shaft, and I pay for the ringing ones.'),
      ...say(BRIGH, 'Bring me resonant shards and I\'ll trade you gear the Guild signed off on. The plaque has the fastest descents — the Heart at the bottom keeps perfect time, so we may as well keep yours.'),
      ...say(BRIGH, 'Advice, free of charge: when the floor lights up, it is not applause. Move.'),
    ]
    : [
      ...say(BRIGH, 'Cantor-Surveyor Brigh. I survey the seal. The seal is the interesting part — it was laid from the inside, you know.'),
      ...say(BRIGH, 'The wing stays shut until the duchy says otherwise. Brogan keeps the licenses. Take it up with him — quest and writ and all.'),
    ]);
  return 'done';
});

registerNpcAction('cantor_surveyor', 'Exchange-shards', (_n: Npc) => {
  if ((state.player.quests['gd3_sealed_wing'] ?? 0) < 6) {
    startDialogue(say(BRIGH, 'Shards come out of an open wing, and this wing is not open. Yet. Officially.'));
    return 'done';
  }
  startDialogue(
    say(BRIGH, 'Shards on the slate, picks off the slate. What are you owed?'),
    () => openExchange(),
  );
  return 'done';
});

registerNpcAction('cantor_surveyor', 'Trade', (_n: Npc) => {
  openShop('brigh_supplies');
  return 'done';
});

// ============================================================
// The surveyor's plaque — fastest descents
// ============================================================

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

registerObjectAction('mine_plaque', 'Read', () => {
  void (async () => {
    try {
      const r = await net.api('/api/dungeon/records');
      const lines: DialogueLine[] = [
        { speaker: '', text: 'THE UNTUNED MINE — FASTEST DESCENTS (time to silence the Crystal Heart, per Brigh\'s chisel):' },
      ];
      const best: { username: string; ms: number }[] = Array.isArray(r?.best) ? r.best : [];
      if (best.length === 0) {
        lines.push({ speaker: '', text: 'The slate is blank. The Heart still holds its note against all comers.' });
      } else {
        best.forEach((b, i) => {
          lines.push({ speaker: '', text: `${i + 1}. ${b.username} — ${fmtMs(b.ms)}` });
        });
      }
      if (typeof r?.yours === 'number') {
        lines.push({ speaker: '', text: `Your best descent: ${fmtMs(r.yours)}.` });
      }
      startDialogue(lines);
    } catch {
      msg('The slate is freshly chalked and unreadable. Try again in a moment.');
    }
  })();
  return 'done';
});

export {};
