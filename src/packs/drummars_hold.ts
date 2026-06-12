// DRUMMAR'S HOLD (the Concord Lists) — the melee training hub. A walled
// drill-fortress around the buried Cadence Stone: a dense metronome-dummy yard
// with style-routed, death-free melee XP, three tiers of sparring pits that pay
// out valour tokens, the Cadence anvil (tuned resonant-shard weapons), and the
// Valour Steward's reward shop.
//
// This pack owns the client side only:
//   - 'Hit' handlers on the three dummy grades -> requestIntent('spar-dummy').
//     The client sends the dummy type + tile + its combat-style SELECTION; the
//     server validates everything (tile, range, cooldown, level gate, style)
//     and owns every xp amount. The local throttle below is pacing, not trust.
//   - the Cadence anvil 'Smith' menu (tuned_scimitar / tuned_warblade) ->
//     requestIntent('produce', { recipe:'smith', ... }) — same path as any anvil.
//   - vendor NPCs: Drillmaster Concord (style lore), Quartermaster Bell (shop),
//     Hold Infirmarian (shop), Valour Steward -> requestIntent('valour-buy').
//   - the cadence_post billboard (cosmetic).
//
// Geometry: 30x30 region at origin (150, 95); see data/fragments/melee-combat.json.

import {
  state, msg, level, invCount, hasItem, hasTool,
  openShop, requestIntent, requestMake,
  registerObjectAction, registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc, MakeOption,
} from '../game';
import { audio } from '../audio';

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ============================================================
// The Dummy Court — style-routed melee XP, no death, no walking
// ============================================================

const DUMMIES: Record<string, { level: number; grade: string }> = {
  metronome_dummy: { level: 1, grade: 'a metronome dummy' },
  reinforced_dummy: { level: 30, grade: 'a reinforced dummy' },
  cadence_pillar: { level: 50, grade: 'a cadence pillar' },
};

// Client-side pacing only: the SERVER enforces the real ~2400ms per-tile
// cooldown (RAM + save-backed); this just keeps the loop from spamming it.
const SPAR_COOLDOWN_MS = 2400;
const lastSwing = new Map<string, number>();
let lastSparAction: unknown = null;

for (const type of Object.keys(DUMMIES)) {
  const d = DUMMIES[type];
  registerObjectAction(type, 'Hit', (o) => {
    const best = Math.max(level('Attack'), level('Strength'), level('Defence'));
    if (best < d.level) {
      msg(`You need an Attack, Strength or Defence level of ${d.level} to train on ${d.grade}.`);
      return 'done';
    }
    if (state.player.action !== lastSparAction) {
      lastSparAction = state.player.action;
      msg('You square up and start drilling against the dummy, swinging on the beat...');
    }
    const key = `${type}@${o.x},${o.y}`;
    const now = Date.now();
    if (now - (lastSwing.get(key) ?? 0) >= SPAR_COOLDOWN_MS) {
      lastSwing.set(key, now);
      audio.sfx('hit');
      // Server-authoritative: validates dummy@tile + range + cooldown + level
      // gate, validates the style is one of the four legal stances, and routes
      // ITS OWN xp table (16/32/48 + Hitpoints) accordingly. The style field
      // only picks the lane; the amounts never come from the wire.
      void requestIntent('spar-dummy', {
        dummy: type, x: o.x, y: o.y, style: state.player.combatStyle,
      }).then((echo) => {
        if (!echo.ok && echo.error && echo.error !== 'too soon') msg(echo.error);
      });
    }
    return 'continue';
  });
}

// ============================================================
// Cadence posts — style signage (cosmetic, client-only)
// ============================================================

registerObjectAction('cadence_post', 'Read', () => {
  startDialogue([
    { speaker: '', text: 'DRILL NOTICE — THE CONCORD LISTS. A clean strike lands ON THE BEAT. Pick your stance before you pick your fight:' },
    { speaker: '', text: 'ACCURATE — the swing on-beat. Trains Attack. AGGRESSIVE — the force behind the note. Trains Strength.' },
    { speaker: '', text: 'DEFENSIVE — the held chord that absorbs a blow. Trains Defence. CONTROLLED — the full triad, split evenly across all three.' },
    { speaker: '', text: 'Every true note sustains you: all stances also train Hitpoints. Dummies by grade: metronome (any melee level), reinforced (30), cadence pillar (50).' },
    { speaker: '', text: '(Signed: Drillmaster Concord. Postscript: the dummies do not hit back. The pits do.)' },
  ]);
  return 'done';
});

// ============================================================
// The Cadence anvil — tuned resonant-shard weapons
// ============================================================

interface TunedRecipe { output: string; name: string; level: number; bars: number; shards: number; }
const TUNED: TunedRecipe[] = [
  { output: 'tuned_scimitar', name: 'Tuned scimitar', level: 55, bars: 2, shards: 1 },
  { output: 'tuned_warblade', name: 'Tuned warblade', level: 60, bars: 2, shards: 2 },
];

registerObjectAction('cadence_anvil', 'Smith', () => {
  if (!hasTool('hammer')) { msg('You need a hammer to work the metal with.'); return 'done'; }
  const opts: MakeOption[] = TUNED.map((t) => {
    let disabled: string | undefined;
    if (level('Smithing') < t.level) disabled = `Requires Smithing level ${t.level}.`;
    else if (!hasItem('mithril_bar', t.bars)) disabled = `You need ${t.bars} mithril bars.`;
    else if (!hasItem('resonant_shard', t.shards)) disabled = `You need ${t.shards} resonant shard${t.shards > 1 ? 's' : ''}.`;
    return { id: t.output, label: t.name, icon: t.output, disabled };
  });
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const t = TUNED.find((tt) => tt.output === id)!;
    void (async () => {
      for (let i = 0; i < qty; i++) {
        if (!hasTool('hammer') || !hasItem('mithril_bar', t.bars) || !hasItem('resonant_shard', t.shards)) break;
        audio.sfx('smith');
        // Server-authoritative: validates hammer + Smithing level + bars +
        // resonant shards (recipes.json smithables), consumes the inputs and
        // grants the weapon + Smithing xp.
        const echo = await requestIntent('produce', { recipe: 'smith', output: t.output });
        if (!echo.ok) { if (echo.error) msg(echo.error); break; }
        msg(`You anneal the blade against the Cadence Stone's hum. The ${t.name.toLowerCase()} rings true.`);
        if (i < qty - 1) await sleep(1200);
      }
    })();
  });
  return 'done';
});

// ============================================================
// Drillmaster Concord — style trainer / lore
// ============================================================

const DRILLMASTER = 'Drillmaster Concord';

registerNpcAction('drillmaster_concord', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(DRILLMASTER, 'Eyes front. This is the Concord Lists, and under your boots is the Cadence Stone — the anchor that keeps this whole valley in time.'),
    ...say(DRILLMASTER, 'A clean strike lands on the beat the world was sung to. A sloppy one is a missed note, and the Offnote collects missed notes.'),
    ...say(DRILLMASTER, 'Your stance picks your lesson. Accurate hands sharpen Attack. Aggressive ones build Strength. A held guard trains Defence. Controlled splits the triad three ways. Every stance sustains your Hitpoints.'),
    ...say(DRILLMASTER, 'Start on the metronome dummies — they ring when you get it right. Reinforced dummies want a melee level of 30; the cadence pillars in the sanctum want 50, and they will not flatter you.'),
    ...say(DRILLMASTER, 'When the dummies stop teaching you anything, the pits will. Recruits first. Graduates walk through a gate, not across a map.'),
  ]);
  return 'done';
});

// ============================================================
// Quartermaster Bell — supply shop
// ============================================================

const BELL = 'Quartermaster Bell';

registerNpcAction('quartermaster_bell', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(BELL, 'Quartermaster Bell. Everything on my rack swings, and everything that swings is in my ledger.'),
    ...say(BELL, 'Batons for recruits, charms for the superstitious, and the odd tuned scimitar when the smiths are ahead of quota. Coin up front; the Hold does not run a tab.'),
  ]);
  return 'done';
});

registerNpcAction('quartermaster_bell', 'Trade', (_n: Npc) => {
  openShop('quartermaster_bell');
  return 'done';
});

// ============================================================
// Hold Infirmarian — sustain vendor
// ============================================================

const INFIRMARIAN = 'Hold Infirmarian';

registerNpcAction('hold_infirmarian', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(INFIRMARIAN, 'Sit. Breathe. Drink. In that order.'),
    ...say(INFIRMARIAN, 'Sustain brew keeps your note held between rounds — cheaper than a funeral and considerably quieter. And raise your guard; I am tired of stitching the same shoulder.'),
  ]);
  return 'done';
});

registerNpcAction('hold_infirmarian', 'Trade', (_n: Npc) => {
  openShop('hold_infirmary');
  return 'done';
});

// ============================================================
// Valour Steward — token reward shop (server-authoritative)
// ============================================================

const STEWARD = 'Valour Steward';

// Display data only — the SERVER owns the cost table (intent-melee.ts
// VALOUR_REWARDS) and independently validates tokens + the cape's set
// prerequisite. Labels here must match those costs for honest signage.
interface ValourListing { item: string; label: string; cost: number; }
const VALOUR_LISTINGS: ValourListing[] = [
  { item: 'cadence_gauntlets', label: 'Cadence gauntlets — 200 tokens', cost: 200 },
  { item: 'concord_helm', label: 'Concord helm — 350 tokens', cost: 350 },
  { item: 'concord_platelegs', label: 'Concord platelegs — 550 tokens', cost: 550 },
  { item: 'concord_platebody', label: 'Concord platebody — 900 tokens', cost: 900 },
  { item: 'concord_cape', label: 'Cape of Concord — 1200 tokens (own the other three first)', cost: 1200 },
  { item: 'true_note_blade', label: 'True-note blade — 1500 tokens', cost: 1500 },
];

function openValourShop() {
  const have = invCount('valour_token');
  showOptions([
    ...VALOUR_LISTINGS.map((l) => ({
      label: l.label,
      fn: () => {
        if (invCount('valour_token') < l.cost) {
          startDialogue(say(STEWARD, `That honour costs ${l.cost} tokens and you are carrying ${invCount('valour_token')}. The pits are open. Earn the difference.`));
          return;
        }
        void (async () => {
          const echo = await requestIntent('valour-buy', { item: l.item });
          if (!echo.ok) {
            startDialogue(say(STEWARD, echo.error === 'inventory full'
              ? 'Your pack is full. Valour is heavy; make room for it.'
              : (echo.error ?? 'The ledger says no.')));
            return;
          }
          startDialogue(say(STEWARD, 'Earned, witnessed, and entered in the rolls. Wear it on the beat.'));
        })();
      },
    })),
    { label: `Never mind. (you carry ${have} valour tokens)`, fn: () => { /* close */ } },
  ]);
}

registerNpcAction('valour_steward', 'Talk-to', (_n: Npc) => {
  startDialogue([
    ...say(STEWARD, 'I keep the rolls of the Concord Lists. Every token in your purse is a beat you did not miss — recruits pay one or two, the Champion\'s Echo pays best.'),
    ...say(STEWARD, 'Tokens buy the Concord set, gauntlets that keep count, and — for the rare few — the True-note blade. The cape comes last. It is a chord, and a chord needs its other notes.'),
  ]);
  return 'done';
});

registerNpcAction('valour_steward', 'Trade-valour', (_n: Npc) => {
  startDialogue(
    say(STEWARD, 'Tokens on the table, honours off it. What have you earned?'),
    () => openValourShop(),
  );
  return 'done';
});

// ============================================================
// Sparring pit flavor
// ============================================================

registerNpcAction('sparring_champion', 'Look-at', (n: Npc) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'The Champion\'s Echo. It moves the way the Cadence Stone keeps time: without hurry, without mercy, and exactly on the beat. Somewhere in its guard there is one note it cannot hold.' },
  ]);
  return 'done';
});

export {};
