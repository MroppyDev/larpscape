// Region pack: Ashen Depths — cave-extension life, the boss Korr the Molten,
// and the ambient lava-edge hazard. SPEC Phase 6: district x152-222 / y108-162,
// Korr's lair ~(210,150) kept clear of trash spawns.
import {
  state, events, msg, playerDeath,
  registerNpcAction, registerTickHook, registerFx, registerDamageModifier,
  startDialogue,
  Npc,
} from '../game';
import { terrain, key, T, MAP_W, MAP_H } from '../world';

// Spawns live in data/spawns.json (server-authoritative world).

// ---------------- Boss: Korr the Molten ----------------

// Korr's eruption + enrage timing runs server-side (server/bosses.ts).
// The eruption is dodged by MOVING off the telegraphed tile — the server
// can't see sub-tick movement, so the dodge check happens here: we record
// where we stood when the ground began to boil and compare on resolution.
let telegraphPos: { x: number; y: number } | null = null;

registerFx('korr_telegraph', () => {
  msg('The ground begins to boil...');
  telegraphPos = { x: state.player.x, y: state.player.y };
});

registerFx('korr_enrage', () => {
  msg('Korr roars, and his cracked hide blazes white-hot!');
});

registerDamageModifier('korr_eruption', (dmg) => {
  const p = state.player;
  const moved = !telegraphPos || p.x !== telegraphPos.x || p.y !== telegraphPos.y;
  telegraphPos = null;
  if (moved) {
    msg('Magma erupts where you were standing!');
    return -1; // fully dodged: no damage, no hitsplat
  }
  msg('The ground erupts beneath your feet!');
  return dmg;
});

registerDamageModifier('korr_lash', (dmg) => {
  msg('Korr lashes out in molten fury!');
  return dmg;
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
// Standing on a tile orthogonally adjacent to LAVA deals 1 damage every 3
// ticks. Purely local environmental damage; stays client-side.
registerTickHook(() => {
  const p = state.player;
  if (!p || p.dead) return;
  if (state.tick % 3 !== 0) return;
  const nearLava =
    (p.x > 0 && terrain[key(p.x - 1, p.y)] === T.LAVA) ||
    (p.x < MAP_W - 1 && terrain[key(p.x + 1, p.y)] === T.LAVA) ||
    (p.y > 0 && terrain[key(p.x, p.y - 1)] === T.LAVA) ||
    (p.y < MAP_H - 1 && terrain[key(p.x, p.y + 1)] === T.LAVA);
  if (nearLava) {
    p.curHp -= 1;
    p.hitsplat = { dmg: 1, until: performance.now() + 900 };
    msg('The lava sizzles at your boots!');
    events.onStatsChange();
    if (p.curHp <= 0) playerDeath();
  }
});

export {};
