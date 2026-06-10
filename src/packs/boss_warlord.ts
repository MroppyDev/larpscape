// Boss pack: Goblin Warlord — fort arena boss with a telegraphed slam attack.
// Spawned in the warlord fort district (x132-160 / y10-34) per SPEC Phase 5.
import {
  state, events, msg, level, saveGame,
  registerNpcSpawn, registerNpcAction, registerTickHook, startDialogue,
  Npc,
} from '../game';

// ---------------- Spawn ----------------
// Arena clearing near the centre of the fort.
registerNpcSpawn('goblin_warlord', 146, 22);

// ---------------- Slam mechanic ----------------
// Per-instance state, keyed by the live Npc object so respawns reset cleanly.
interface SlamState { ticksInCombat: number; telegraphed: boolean; }
const slamStates = new WeakMap<Npc, SlamState>();

const SLAM_INTERVAL = 8; // ticks between slams while in combat
const SLAM_MAX = 8;      // heavy hit, up to 8

function applySlamDamage() {
  const p = state.player;
  if (p.dead) return;
  const dmg = 1 + Math.floor(Math.random() * SLAM_MAX); // 1..8
  p.curHp -= dmg;
  p.hitsplat = { dmg, until: performance.now() + 900 };
  msg('The warlord\'s blade crashes down on you!');
  events.onStatsChange();
  if (p.curHp <= 0) {
    // Mirror game.ts playerDeath (not exported): die, then respawn at 22,38.
    p.dead = true;
    p.curHp = 0;
    p.activePrayers.clear();
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

registerTickHook(() => {
  for (const n of state.npcs) {
    if (n.def.id !== 'goblin_warlord') continue;
    if (n.dead) { slamStates.delete(n); continue; }

    let s = slamStates.get(n);
    if (!s) { s = { ticksInCombat: 0, telegraphed: false }; slamStates.set(n, s); }

    if (n.target !== 'player' || state.player.dead) {
      s.ticksInCombat = 0;
      s.telegraphed = false;
      continue;
    }

    // Resolve a telegraphed slam from the previous tick.
    if (s.telegraphed) {
      s.telegraphed = false;
      const p = state.player;
      const adjacent = Math.abs(p.x - n.x) <= 1 && Math.abs(p.y - n.y) <= 1
        && !(p.x === n.x && p.y === n.y);
      if (adjacent) applySlamDamage();
      else msg('The warlord\'s blade slams into empty earth.');
      s.ticksInCombat = 0;
      continue;
    }

    s.ticksInCombat++;
    if (s.ticksInCombat >= SLAM_INTERVAL) {
      msg('The warlord raises his blade...');
      s.telegraphed = true;
    }
  }
});

// ---------------- Look-at flavor ----------------
registerNpcAction('goblin_warlord', 'Look-at', (_n: Npc) => {
  startDialogue([
    { speaker: '', text: 'A hulking goblin in scavenged plate, a tattered war banner lashed to his back. Notches on his blade mark every fool who reached the arena.' },
    { speaker: 'Goblin Warlord', text: 'Grakk Splitjaw breaks armies, little soft-skin. You? You is barely a snack.' },
    { speaker: 'Goblin Warlord', text: 'Come closer. My blade is hungry, and the fort needs new decorations.' },
  ]);
  return 'done';
});

export {};
