// Region pack: Ashen Depths — cave-extension life, the boss Korr the Molten,
// and the ambient lava-edge hazard. SPEC Phase 6: district x152-222 / y108-162,
// Korr's lair ~(210,150) kept clear of trash spawns.
import {
  state, events, msg, level, saveGame,
  registerNpcSpawn, registerNpcAction, registerTickHook, startDialogue,
  Npc,
} from '../game';
import { terrain, key, T, MAP_W, MAP_H } from '../world';

// ---------------- Trash spawns ----------------
// Scattered through the cave extension, away from Korr's lair (~210,150)
// and off the lava pools / wall ring.
registerNpcSpawn('magma_crawler', 165, 135);
registerNpcSpawn('magma_crawler', 172, 120);
registerNpcSpawn('magma_crawler', 158, 148);
registerNpcSpawn('ash_fiend', 195, 140);
registerNpcSpawn('ash_fiend', 205, 122);

// ---------------- Boss: Korr the Molten ----------------
registerNpcSpawn('magma_fiend', 210, 150);

// Per-instance mechanic state, keyed by the live Npc so respawns reset cleanly.
interface KorrState {
  ticksInCombat: number;
  telegraphed: boolean;
  telegraphPos: { x: number; y: number } | null; // player pos when the ground boiled
  enraged: boolean;
  enrageParity: number; // extra hit lands on every other adjacent tick
}
const korrStates = new WeakMap<Npc, KorrState>();

const ERUPTION_INTERVAL = 11; // ticks between eruptions while fighting
const ERUPTION_MAX = 14;      // heavy hit if the player stands still
const ENRAGE_MAX = 4;         // small extra hit while enraged + adjacent

// Shared safe-damage + death fallback (mirrors boss_warlord.ts; playerDeath
// in game.ts is not exported, so respawn at 22,38 is replicated here).
function hurtPlayer(dmg: number, text: string) {
  const p = state.player;
  if (p.dead || dmg <= 0) return;
  p.curHp -= dmg;
  p.hitsplat = { dmg, until: performance.now() + 900 };
  msg(text);
  events.onStatsChange();
  if (p.curHp <= 0) {
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
    if (n.def.id !== 'magma_fiend') continue;
    if (n.dead) { korrStates.delete(n); continue; }

    let s = korrStates.get(n);
    if (!s) {
      s = { ticksInCombat: 0, telegraphed: false, telegraphPos: null, enraged: false, enrageParity: 0 };
      korrStates.set(n, s);
    }

    if (n.target !== 'player' || state.player.dead) {
      s.ticksInCombat = 0;
      s.telegraphed = false;
      s.telegraphPos = null;
      continue;
    }

    const p = state.player;

    // (2) Enrage once below 40% hp: effectively doubled attack speed via an
    // extra small hit every other tick while adjacent.
    const maxHp = n.def.hitpoints ?? 250;
    if (!s.enraged && n.hp > 0 && n.hp < maxHp * 0.4) {
      s.enraged = true;
      msg('Korr roars, and his cracked hide blazes white-hot!');
    }
    if (s.enraged) {
      s.enrageParity = (s.enrageParity + 1) % 2;
      const adjacent = Math.abs(p.x - n.x) <= 1 && Math.abs(p.y - n.y) <= 1
        && !(p.x === n.x && p.y === n.y);
      if (s.enrageParity === 0 && adjacent) {
        const dmg = 1 + Math.floor(Math.random() * ENRAGE_MAX); // 1..4
        hurtPlayer(dmg, 'Korr lashes out in molten fury!');
        if (p.dead) continue;
      }
    }

    // (1) Resolve a telegraphed eruption from the previous tick: standing on
    // the same tile as when the ground began to boil means a heavy hit;
    // moving makes you safe.
    if (s.telegraphed) {
      s.telegraphed = false;
      const moved = !s.telegraphPos || p.x !== s.telegraphPos.x || p.y !== s.telegraphPos.y;
      s.telegraphPos = null;
      if (moved) {
        msg('Magma erupts where you were standing!');
      } else {
        const dmg = 1 + Math.floor(Math.random() * ERUPTION_MAX); // 1..14
        hurtPlayer(dmg, 'The ground erupts beneath your feet!');
      }
      s.ticksInCombat = 0;
      continue;
    }

    s.ticksInCombat++;
    if (s.ticksInCombat >= ERUPTION_INTERVAL) {
      msg('The ground begins to boil...');
      s.telegraphed = true;
      s.telegraphPos = { x: p.x, y: p.y };
    }
  }
});

// ---------------- Look-at flavor ----------------
registerNpcAction('magma_fiend', 'Look-at', (_n: Npc) => {
  startDialogue([
    { speaker: '', text: 'A mountain of cooling slag in the rough shape of a giant, seams of liquid fire glowing between the plates. The air around him shivers with heat.' },
    { speaker: 'Korr the Molten', text: 'You walk on my roof, little spark. Everything down here was fire once. Everything will be again.' },
    { speaker: 'Korr the Molten', text: 'Stand still. The ground remembers how to swallow.' },
  ]);
  return 'done';
});

// ---------------- Ambient hazard: lava edges ----------------
// Standing on a tile orthogonally adjacent to LAVA deals 1 damage every 3 ticks.
registerTickHook(() => {
  const p = state.player;
  if (!p || p.dead) return;
  if (state.tick % 3 !== 0) return;
  const nearLava =
    (p.x > 0 && terrain[key(p.x - 1, p.y)] === T.LAVA) ||
    (p.x < MAP_W - 1 && terrain[key(p.x + 1, p.y)] === T.LAVA) ||
    (p.y > 0 && terrain[key(p.x, p.y - 1)] === T.LAVA) ||
    (p.y < MAP_H - 1 && terrain[key(p.x, p.y + 1)] === T.LAVA);
  if (nearLava) hurtPlayer(1, 'The lava sizzles at your boots!');
});

export {};
