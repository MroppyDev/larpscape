// Boss pack: the Bog Horror — a hulking mound of living swamp in the deep bog.
// Mechanics: ranged poison spit (dist <= 3) applying a 4-stack poison DoT,
// and self-regeneration whenever the player isn't standing toe-to-toe with it.
import {
  state, msg, events, level, saveGame,
  registerNpcSpawn, registerNpcAction, registerTickHook, startDialogue,
  type Npc,
} from '../game';

const BOSS_ID = 'bog_horror';

// Green poison message color (self-contained; no css file edits).
const poisonStyle = document.createElement('style');
poisonStyle.textContent = '.chat-line.poison { color: #1c7a1c; }';
document.head.appendChild(poisonStyle);

// Lair: clearing in the deep bog (district x8-40 / y80-110).
registerNpcSpawn(BOSS_ID, 24, 96);

// ---------------- Poison state (module-level) ----------------
// 1 damage every 5 ticks, 4 times total. Re-application refreshes the stacks
// but only the first application prints the warning line.
const poison = { ticksLeft: 0, everyCounter: 0 };

const SPIT_EVERY = 12;   // ticks between spit attempts
const HEAL_EVERY = 10;   // ticks between self-heals
const HEAL_AMOUNT = 5;
const POISON_HITS = 4;
const POISON_INTERVAL = 5;

let spitCounter = 0;
let healCounter = 0;

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

// Safe player-damage: hitsplat + stats refresh + death fallback teleport.
function damagePlayer(dmg: number) {
  const p = state.player;
  if (!p || p.dead) return;
  p.curHp -= dmg;
  p.hitsplat = { dmg, until: performance.now() + 900 };
  events.onStatsChange();
  if (p.curHp <= 0) {
    p.dead = true;
    p.curHp = 0;
    p.activePrayers.clear();
    poison.ticksLeft = 0; // death cures the poison
    msg('Oh dear, you are dead!');
    window.setTimeout(() => {
      p.x = 22; p.y = 38; p.prevX = 22; p.prevY = 38;
      p.path = []; p.action = null;
      p.curHp = level('Hitpoints');
      p.dead = false;
      p.energy = 100;
      for (const n of state.npcs) if (n.target === 'player') n.target = null;
      events.onStatsChange();
      saveGame();
    }, 2000);
  }
}

function applyPoison() {
  const fresh = poison.ticksLeft <= 0;
  poison.ticksLeft = POISON_HITS * POISON_INTERVAL;
  poison.everyCounter = POISON_INTERVAL;
  if (fresh) msg('You have been poisoned!', 'poison'); // green-tinted message class
}

function playerFightingOrTargeted(n: Npc): boolean {
  const p = state.player;
  if (n.target === 'player') return true;
  return !!(p.action && p.action.type === 'attack' && p.action.npc === n);
}

registerTickHook(() => {
  const p = state.player;
  if (!p) return;

  // -------- poison DoT (ticks down wherever the player runs) --------
  if (poison.ticksLeft > 0 && !p.dead) {
    poison.ticksLeft--;
    poison.everyCounter--;
    if (poison.everyCounter <= 0) {
      poison.everyCounter = POISON_INTERVAL;
      damagePlayer(1);
    }
  }

  // -------- boss behaviour --------
  const horrors = state.npcs.filter((n) => n.def.id === BOSS_ID && !n.dead);
  if (horrors.length === 0) { spitCounter = 0; healCounter = 0; return; }

  spitCounter++;
  healCounter++;

  for (const n of horrors) {
    const dist = chebyshev(n.x, n.y, p.x, p.y);

    // Poison spit: every ~12 ticks at range <= 3, only while the fight is on.
    if (spitCounter >= SPIT_EVERY && !p.dead && dist <= 3 && playerFightingOrTargeted(n)) {
      spitCounter = 0;
      msg('The horror spits a glob of bog filth!');
      applyPoison();
    }

    // Self-heal: every ~10 ticks while the player is not adjacent.
    if (healCounter >= HEAL_EVERY && dist > 1 && n.hp < n.def.hitpoints) {
      healCounter = 0;
      n.hp = Math.min(n.def.hitpoints, n.hp + HEAL_AMOUNT);
      msg('Moss and mire crawl across the horror, knitting its wounds back together.');
    }
  }
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
