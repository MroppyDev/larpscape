// Pack: Slayer task loop + points shop — Brogan the slayer master.
//
// OSRS-style assignment loop layered on the existing basic slayer plumbing:
//   - 'Assignment' on Brogan assigns kill-N-of-X tasks (N 15-40), the mob
//     weighted toward the player's combat level. The task itself is stored in
//     state.player.slayerTask (the existing engine field), so the per-kill
//     Slayer XP in netYouKilled and the Combat-tab task line keep working.
//   - Loop bookkeeping lives in state.player.quests (numbers, persisted):
//       slayer_points     — spendable slayer points
//       slayer_streak     — completed loop tasks (milestone bonuses)
//       slayer_task_size  — N of the current loop task; 0 = no loop task
//       slayer_task_pool  — 1-based index into TASK_POOL of the current task
//     (Tasks from the legacy 'Talk-to' menu have slayer_task_size 0 and earn
//     no points — Brogan will trade them for a proper assignment for free.)
//   - Completion (detected via onKill after the engine decrements the task)
//     pays points: 3 base, 15 every 5th task, 40 every 10th, plus bonus
//     Slayer XP scaling with task size.
//   - Rerolling an offered task costs 1 point; abandoning an accepted task
//     costs 3. A fresh task can always be taken immediately.
//   - 'Rewards' is a points shop: dirge_blade (offnote-bane unique with the
//     Final Rest spec), wardens_visor, cull_band, tome_of_grudges (consumable
//     Slayer XP). Item defs ship in data/_fragments/mob_rares.json.
//
// Imported for side effects by src/packs/index.ts (integrator wires).

import {
  state, msg, addItem, removeItem, addXp, combatLevel,
  registerNpcAction, registerItemAction, startDialogue, showOptions, onKill,
  DialogueLine, Npc,
} from '../game';
import { NPCS, ITEMS } from '../defs';

const K_POINTS = 'slayer_points';
const K_STREAK = 'slayer_streak';
const K_SIZE = 'slayer_task_size';
const K_POOL = 'slayer_task_pool';

const REROLL_COST = 1;
const SKIP_COST = 3;
const BASE_POINTS = 3;
const POINTS_5TH = 15;
const POINTS_10TH = 40;

// Ordinary, always-spawned hostiles only (no bosses, no quest-gated mobs).
// Weighting reads each def's combatLevel at runtime, so this stays a flat list.
const TASK_POOL: string[] = [
  'chicken', 'cow', 'giant_rat', 'goblin', 'scorpion', 'forest_spider',
  'ice_wolf', 'dire_wolf', 'bear', 'desert_bandit', 'pirate', 'ice_troll',
  'magma_crawler', 'ash_fiend', 'ruin_wraith', 'discord_wisp',
  'hollow_miner', 'manor_revenant',
];

interface RewardEntry { id: string; cost: number; blurb: string }
const REWARDS: RewardEntry[] = [
  { id: 'dirge_blade', cost: 120, blurb: 'My masterwork. Sings the Offnote to sleep — permanently.' },
  { id: 'cull_band', cost: 60, blurb: 'Tally-ring. Hits a little harder for every grudge it remembers.' },
  { id: 'wardens_visor', cost: 50, blurb: 'Half-helm I wore for thirty years of bad ideas.' },
  { id: 'tome_of_grudges', cost: 25, blurb: 'My field notes. Read them once and burn brighter for it.' },
];

function q(key: string): number { return state.player.quests[key] ?? 0; }
function setQ(key: string, v: number) { state.player.quests[key] = v; }
function points(): number { return q(K_POINTS); }

function randInt(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }

function brogan(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'Brogan', text: t }));
}

function npcName(id: string, plural = true): string {
  const n = NPCS[id]?.name.toLowerCase() ?? id;
  return plural ? `${n}s` : n;
}

// ---------------------------------------------------------------------------
// Task selection: eligible mobs sit at-or-below the player's combat level
// (with a floor that culls trivial mobs as the player grows), weighted toward
// the strongest eligible targets.
// ---------------------------------------------------------------------------
function pickTaskIdx(): number {
  const cb = combatLevel();
  const entries = TASK_POOL
    .map((npc, idx) => ({ idx, lvl: NPCS[npc]?.combatLevel ?? 1 }))
    .filter((e) => NPCS[TASK_POOL[e.idx]]);
  let pool = entries.filter((e) => e.lvl <= cb + 2 && e.lvl >= cb / 5);
  if (pool.length === 0) {
    // brand-new or very high players: fall back to everything at/below cb+2,
    // and failing that the weakest mob in the list.
    pool = entries.filter((e) => e.lvl <= cb + 2);
    if (pool.length === 0) pool = [entries.reduce((a, b) => (a.lvl <= b.lvl ? a : b))];
  }
  const total = pool.reduce((s, e) => s + e.lvl + 1, 0);
  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= e.lvl + 1;
    if (roll <= 0) return e.idx;
  }
  return pool[pool.length - 1].idx;
}

function assignTask(idx: number, count: number) {
  const p = state.player;
  p.slayerTask = { npc: TASK_POOL[idx], remaining: count };
  setQ(K_SIZE, count);
  setQ(K_POOL, idx + 1);
}

function clearLoopTask() {
  state.player.slayerTask = null;
  setQ(K_SIZE, 0);
  setQ(K_POOL, 0);
}

function offerTask() {
  const idx = pickTaskIdx();
  const count = randInt(15, 40);
  const name = npcName(TASK_POOL[idx]);
  startDialogue([
    ...brogan(`Right. ${count} ${name}. Their racket's been carrying, and I want it stopped.`),
  ], () => {
    showOptions([
      {
        label: `Accept: ${count} ${name}.`,
        fn: () => {
          assignTask(idx, count);
          startDialogue(brogan(
            `${count} ${name}. Count them yourself — I'll know if you round down.`,
            'Come back when it\'s done. The points ledger doesn\'t pay for almost.',
          ));
        },
      },
      {
        label: `Ask for a different one. (-${REROLL_COST} point)`,
        fn: () => {
          if (points() < REROLL_COST) {
            startDialogue(brogan('Picky, are we? Picky costs a point, and you haven\'t got one. Take the job or take the door.'));
            return;
          }
          setQ(K_POINTS, points() - REROLL_COST);
          msg(`Brogan docks you ${REROLL_COST} slayer point. (${points()} left)`);
          offerTask();
        },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// Brogan: 'Assignment'
// ---------------------------------------------------------------------------
registerNpcAction('slayer_master', 'Assignment', (_n: Npc) => {
  const p = state.player;
  const task = p.slayerTask;

  // Active loop task.
  if (task && task.remaining > 0 && q(K_SIZE) > 0) {
    startDialogue([
      ...brogan(`You still owe me ${task.remaining} ${npcName(task.npc)}. The ledger doesn't forget and neither do I.`),
    ], () => {
      showOptions([
        { label: 'On it.', fn: () => {} },
        {
          label: `Skip this task. (-${SKIP_COST} points)`,
          fn: () => {
            if (points() < SKIP_COST) {
              startDialogue(brogan(`Skipping costs ${SKIP_COST} points. You have ${points()}. Go earn your cowardice like everyone else.`));
              return;
            }
            setQ(K_POINTS, points() - SKIP_COST);
            clearLoopTask();
            msg(`Task skipped for ${SKIP_COST} slayer points. (${points()} left)`);
            startDialogue(brogan('Fine. Struck from the ledger — for a fee. Let\'s find you something you\'ll actually finish.'), () => offerTask());
          },
        },
      ]);
    });
    return 'done';
  }

  // Legacy task from the old Talk-to menu: trade up for free.
  if (task && task.remaining > 0) {
    startDialogue([
      ...brogan('That old chit you\'re carrying isn\'t on my points ledger. Hand it back and I\'ll write you a proper assignment — no charge, this once.'),
    ], () => {
      showOptions([
        { label: 'Give me a proper assignment.', fn: () => { clearLoopTask(); offerTask(); } },
        { label: 'I\'ll keep the one I have.', fn: () => {} },
      ]);
    });
    return 'done';
  }

  // No task: offer one immediately.
  startDialogue([
    ...brogan('Looking for work? Good. The ledger\'s never short of things that need killing.'),
  ], () => offerTask());
  return 'done';
});

// ---------------------------------------------------------------------------
// Brogan: 'Rewards' — the points shop
// ---------------------------------------------------------------------------
registerNpcAction('slayer_master', 'Rewards', (_n: Npc) => {
  openRewards();
  return 'done';
});

function openRewards() {
  const streak = q(K_STREAK);
  startDialogue([
    ...brogan(`The ledger says ${points()} point${points() === 1 ? '' : 's'} to your name, ${streak} task${streak === 1 ? '' : 's'} done. Spend or save — the stock doesn't spoil.`),
  ], () => {
    showOptions([
      ...REWARDS.map((r) => ({
        label: `${ITEMS[r.id]?.name ?? r.id} — ${r.cost} pts`,
        fn: () => buyReward(r),
      })),
      { label: 'Just looking.', fn: () => {} },
    ]);
  });
}

function buyReward(r: RewardEntry) {
  const name = ITEMS[r.id]?.name ?? r.id;
  if (points() < r.cost) {
    startDialogue(brogan(`${name} runs ${r.cost} points. You have ${points()}. The ledger doesn't do credit.`));
    return;
  }
  if (!addItem(r.id)) {
    msg("You don't have enough inventory space.");
    return;
  }
  setQ(K_POINTS, points() - r.cost);
  msg(`You buy the ${name.toLowerCase()} for ${r.cost} slayer points. (${points()} left)`, 'level');
  startDialogue(brogan(r.blurb), () => openRewards());
}

// Tome of grudges: one-shot Slayer XP consumable from the points shop.
registerItemAction('tome_of_grudges', 'Read', (_slot: number) => {
  if (!removeItem('tome_of_grudges', 1)) return;
  addXp('Slayer', 1500);
  msg('You read Brogan\'s tome of grudges cover to cover. You feel distinctly better at holding them.', 'level');
});

// ---------------------------------------------------------------------------
// Completion: netYouKilled decrements slayerTask and pays per-kill Slayer XP
// before notifying kill listeners, so remaining === 0 here means the task
// finished on this kill. K_SIZE > 0 gates it to loop-assigned tasks and
// guarantees the payout fires exactly once.
// ---------------------------------------------------------------------------
onKill((defId: string) => {
  const p = state.player;
  const size = q(K_SIZE);
  if (size <= 0) return;
  const poolIdx = q(K_POOL) - 1;
  if (poolIdx < 0 || TASK_POOL[poolIdx] !== defId) return;
  const task = p.slayerTask;
  if (!task || task.npc !== defId || task.remaining > 0) return;

  setQ(K_SIZE, 0);
  setQ(K_POOL, 0);
  const streak = q(K_STREAK) + 1;
  setQ(K_STREAK, streak);
  const pts = streak % 10 === 0 ? POINTS_10TH : streak % 5 === 0 ? POINTS_5TH : BASE_POINTS;
  setQ(K_POINTS, points() + pts);
  addXp('Slayer', size * 5);
  msg(
    streak % 5 === 0
      ? `Milestone! Task #${streak} complete: +${pts} slayer points (${points()} total). Brogan has another waiting.`
      : `Task complete: +${pts} slayer points (${points()} total). Brogan has another waiting.`,
    'level',
  );
});
