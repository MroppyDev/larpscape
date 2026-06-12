// Pack: Slayer task loop + points shop — Brogan the slayer master.
//
// SERVER-AUTHORITATIVE (docs/CONVERSION-CONTRACT.md): every owned-state change in
// the slayer loop (task assignment, per-kill credit + Slayer XP, completion
// points/streak/bonus XP, reroll/skip point spend, and the points-shop rewards)
// is resolved by the 'slayer' domain intent (server/intent-misc.ts). This pack
// authors NOTHING: it sends requestIntent('slayer', {op,...}) and REFLECTS the
// authoritative `slayer` snapshot the server returns into the client mirror for
// the Combat-tab UI. The server independently validates points/level/inventory
// and computes points + XP from its own state, so a forged intent grants nothing.
//
// Loop state, all server-owned:
//   state.slayerTask   — { npc, remaining } | null (the engine task field)
//   state.slayerPoints — spendable slayer points
//   state.slayer       — { streak, size } loop metadata (size 0 = legacy task)
//
// Imported for side effects by src/packs/index.ts (integrator wires).

import {
  state, msg, requestIntent,
  registerNpcAction, registerItemAction, startDialogue, showOptions, events,
  DialogueLine, Npc, IntentEcho,
} from '../game';
import { NPCS, ITEMS } from '../defs';

const REROLL_COST = 1;
const SKIP_COST = 3;

interface RewardEntry { id: string; cost: number; blurb: string }
const REWARDS: RewardEntry[] = [
  { id: 'dirge_blade', cost: 120, blurb: 'My masterwork. Sings the Offnote to sleep — permanently.' },
  { id: 'cull_band', cost: 60, blurb: 'Tally-ring. Hits a little harder for every grudge it remembers.' },
  { id: 'wardens_visor', cost: 50, blurb: 'Half-helm I wore for thirty years of bad ideas.' },
  { id: 'tome_of_grudges', cost: 25, blurb: 'My field notes. Read them once and burn brighter for it.' },
];

function brogan(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'Brogan', text: t }));
}

function npcName(id: string, plural = true): string {
  const n = NPCS[id]?.name.toLowerCase() ?? id;
  return plural ? `${n}s` : n;
}

// ---------------------------------------------------------------------------
// Reflection: mirror the SERVER-authoritative slayer snapshot the echo carries
// into the client's display state. These are not client-authored values — they
// are computed and persisted by server/intent-misc.ts and merely reflected here
// for the Combat-tab UI (identical in spirit to applyGrant mirroring inventory).
// ---------------------------------------------------------------------------
interface SlayerSnap {
  task?: { npc: string; remaining: number } | null;
  points?: number;
  streak?: number;
  size?: number;
}
// Module-local mirror of server-owned loop metadata (points/streak/size). The
// Player doc only carries slayerTask (for the Combat-tab line, which the engine
// also reflects), so points/streak/size — needed only for these dialogues — are
// mirrored here from the authoritative echo rather than written to owned state.
let lastPoints = 0;
let lastStreak = 0;
let lastSize = 0;

function reflect(echo: IntentEcho): SlayerSnap | null {
  const snap = (echo as unknown as { slayer?: SlayerSnap }).slayer;
  if (!snap) return null;
  // Mirror the SERVER-authoritative task into the display field the Combat tab
  // reads. This is reflection of a value the server computed + persisted (the
  // echo), not client authoring — the same role applyGrant plays for inventory.
  const p = state.player;
  if (snap.task !== undefined) p.slayerTask = snap.task ?? null;
  if (typeof snap.points === 'number') { lastPoints = snap.points; p.slayerPoints = snap.points; }
  if (typeof snap.streak === 'number') lastStreak = snap.streak;
  if (typeof snap.size === 'number') lastSize = snap.size;
  events.onStatsChange?.();
  return snap;
}

// Read the AUTHORITATIVE points from the loaded save (server-owned, persisted and
// synced via save_reload). lastPoints is a session echo mirror that resets to 0 on
// login and is only refreshed when a slayer echo arrives — relying on it alone made
// Brogan show 0 points after relog even though the server held them.
function points(): number {
  const owned = state.player?.slayerPoints;
  return typeof owned === 'number' ? owned : lastPoints;
}

// ---------------------------------------------------------------------------
// Brogan: 'Assignment' — assign / reroll / skip via the server.
// ---------------------------------------------------------------------------

async function doAssign(op: 'assign' | 'reroll' | 'trade-legacy'): Promise<SlayerSnap | null> {
  const echo = await requestIntent('slayer', { op });
  if (!echo.ok) { if (echo.error) msg(`Brogan: '${echo.error}'`); return reflect(echo); }
  return reflect(echo);
}

function describeTask(snap: SlayerSnap | null) {
  const task = snap?.task ?? state.player.slayerTask;
  if (task && task.remaining > 0) {
    startDialogue(brogan(
      `${task.remaining} ${npcName(task.npc)}. Count them yourself — I'll know if you round down.`,
      'Come back when it\'s done. The points ledger doesn\'t pay for almost.',
    ));
  }
}

function offerFlow() {
  void (async () => {
    const snap = await doAssign('assign');
    const task = snap?.task ?? state.player.slayerTask;
    if (!task || task.remaining <= 0) return;
    startDialogue(
      brogan(`Right. ${task.remaining} ${npcName(task.npc)}. Their racket's been carrying, and I want it stopped.`),
      () => {
        showOptions([
          { label: 'On it.', fn: () => describeTask(snap) },
          {
            label: `Ask for a different one. (-${REROLL_COST} point)`,
            fn: () => {
              if (points() < REROLL_COST) {
                startDialogue(brogan('Picky, are we? Picky costs a point, and you haven\'t got one. Take the job or take the door.'));
                return;
              }
              void (async () => {
                const re = await doAssign('reroll');
                const t = re?.task ?? state.player.slayerTask;
                if (re && t && t.remaining > 0) {
                  msg(`Brogan docks you ${REROLL_COST} slayer point. (${points()} left)`);
                  offerFlow();
                }
              })();
            },
          },
        ]);
      },
    );
  })();
}

registerNpcAction('slayer_master', 'Assignment', (_n: Npc) => {
  const p = state.player;
  const task = p.slayerTask;
  // `lastSize` mirrors the server's loop-task size: >0 means a points-eligible
  // loop task. It is only authoritative after the server has spoken this session;
  // the server re-validates every op regardless, so a stale mirror cannot grant.
  const isLoop = !!task && task.remaining > 0 && lastSize > 0;

  // Active points-eligible loop task.
  if (isLoop) {
    startDialogue([
      ...brogan(`You still owe me ${task!.remaining} ${npcName(task!.npc)}. The ledger doesn't forget and neither do I.`),
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
            void (async () => {
              const echo = await requestIntent('slayer', { op: 'skip' });
              if (!echo.ok) { if (echo.error) msg(`Brogan: '${echo.error}'`); return; }
              reflect(echo);
              msg(`Task skipped for ${SKIP_COST} slayer points. (${points()} left)`);
              startDialogue(brogan('Fine. Struck from the ledger — for a fee. Let\'s find you something you\'ll actually finish.'), () => offerFlow());
            })();
          },
        },
      ]);
    });
    return 'done';
  }

  // Legacy task from the old menu (size 0): trade up for free.
  if (task && task.remaining > 0) {
    startDialogue([
      ...brogan('That old chit you\'re carrying isn\'t on my points ledger. Hand it back and I\'ll write you a proper assignment — no charge, this once.'),
    ], () => {
      showOptions([
        { label: 'Give me a proper assignment.', fn: () => {
          void (async () => {
            const snap = await doAssign('trade-legacy');
            const t = snap?.task ?? state.player.slayerTask;
            if (snap && t && t.remaining > 0) offerFlow();
          })();
        } },
        { label: 'I\'ll keep the one I have.', fn: () => {} },
      ]);
    });
    return 'done';
  }

  // No task: offer one immediately.
  startDialogue([
    ...brogan('Looking for work? Good. The ledger\'s never short of things that need killing.'),
  ], () => offerFlow());
  return 'done';
});

// ---------------------------------------------------------------------------
// Brogan: 'Rewards' — the points shop (server-validated 'buy').
// ---------------------------------------------------------------------------
registerNpcAction('slayer_master', 'Rewards', (_n: Npc) => {
  openRewards();
  return 'done';
});

function openRewards() {
  const streak = lastStreak;
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
  void (async () => {
    const echo = await requestIntent('slayer', { op: 'buy', item: r.id });
    if (!echo.ok) {
      msg(echo.error === 'inventory full' ? "You don't have enough inventory space." : `Brogan: '${echo.error ?? 'no deal'}'`);
      return;
    }
    reflect(echo);
    msg(`You buy the ${name.toLowerCase()} for ${r.cost} slayer points. (${points()} left)`, 'level');
    startDialogue(brogan(r.blurb), () => openRewards());
  })();
}

// Tome of grudges: one-shot Slayer XP consumable. The server consumes the tome
// and grants the (server-defined) Slayer XP via the slayer 'read-tome' op.
registerItemAction('tome_of_grudges', 'Read', (_slot: number) => {
  void (async () => {
    const echo = await requestIntent('slayer', { op: 'read-tome' });
    if (!echo.ok) { if (echo.error) msg(echo.error); return; }
    msg('You read Brogan\'s tome of grudges cover to cover. You feel distinctly better at holding them.', 'level');
  })();
});

// ---------------------------------------------------------------------------
// Slayer kill credit is server-pushed on the killing blow (installSlayerKillHook).
// Reflect the authoritative snapshot + surface completion flavour lines.
// ---------------------------------------------------------------------------
export function onSlayerEcho(echo: IntentEcho) {
  if (!echo.ok || echo.kind !== 'slayer') return;
  const snap = reflect(echo);
  if (!snap) return;
  // Only announce completion when this kill actually credited a task (xp granted)
  // AND the task is now finished — never on an unrelated kill with no active task.
  const credited = Array.isArray(echo.xp) && echo.xp.length > 0;
  const t = snap.task ?? state.player.slayerTask;
  if (credited && (!t || t.remaining <= 0)) {
    const streak = snap.streak ?? lastStreak;
    msg(
      streak > 0 && streak % 5 === 0
        ? `Milestone! Task #${streak} complete: slayer points awarded (${points()} total). Brogan has another waiting.`
        : `Task complete: slayer points awarded (${points()} total). Brogan has another waiting.`,
      'level',
    );
  }
}

export {};
