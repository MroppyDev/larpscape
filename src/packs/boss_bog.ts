// Boss pack: the Bog Horror — a hulking mound of living swamp in the deep bog.
// The spit/heal mechanics run server-side (server/bosses.ts); the poison DoT
// it inflicts ticks locally on the poisoned player. Spawn lives in
// data/spawns.json.
import {
  state, msg, events, playerDeath,
  registerNpcAction, registerTickHook, registerFx, startDialogue,
} from '../game';

const BOSS_ID = 'bog_horror';

// Green poison message color (self-contained; no css file edits).
const poisonStyle = document.createElement('style');
poisonStyle.textContent = '.chat-line.poison { color: #1c7a1c; }';
document.head.appendChild(poisonStyle);

// ---------------- Poison DoT (local to the poisoned player) ----------------
// 1 damage every 5 ticks, 4 times total. Re-application refreshes the stacks
// but only the first application prints the warning line.
const poison = { ticksLeft: 0, everyCounter: 0 };

const POISON_HITS = 4;
const POISON_INTERVAL = 5;

function damagePlayer(dmg: number) {
  const p = state.player;
  if (!p || p.dead) return;
  p.curHp -= dmg;
  p.hitsplat = { dmg, until: performance.now() + 900 };
  events.onStatsChange();
  if (p.curHp <= 0) {
    poison.ticksLeft = 0; // death cures the poison
    playerDeath();
  }
}

function applyPoison() {
  const fresh = poison.ticksLeft <= 0;
  poison.ticksLeft = POISON_HITS * POISON_INTERVAL;
  poison.everyCounter = POISON_INTERVAL;
  if (fresh) msg('You have been poisoned!', 'poison');
}

registerTickHook(() => {
  const p = state.player;
  if (!p) return;
  if (poison.ticksLeft > 0 && !p.dead) {
    poison.ticksLeft--;
    poison.everyCounter--;
    if (poison.everyCounter <= 0) {
      poison.everyCounter = POISON_INTERVAL;
      damagePlayer(1);
    }
  }
});

// ---------------- Server fx ----------------
registerFx('bog_spit', () => {
  msg('The horror spits a glob of bog filth!');
  applyPoison();
});
registerFx('bog_heal', () => {
  msg('Moss and mire crawl across the horror, knitting its wounds back together.');
});

// ---------------- Flavor: Look-at ----------------
registerNpcAction(BOSS_ID, 'Look-at', (n) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'A mound of peat and tangled roots heaves itself upright. Two pale lights blink open where eyes ought to be.' },
    { speaker: 'Bog Horror', text: 'Glrrk... the marsh keeps what it catches.' },
    { speaker: '', text: 'Its hide weeps a thin green ooze. Best not to let any of it land on you.' },
  ]);
  return 'done';
});

export {};
