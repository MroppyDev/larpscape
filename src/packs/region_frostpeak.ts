// Region pack: Frostpeak Mountains — mountain life, the high agility course,
// and the boss Maraza the Rimebound (ice_queen) in her glassy lair at (205,20).
// Boss mechanic: 'rime shards' — while fighting the player within 4 tiles she
// gathers frost every ~9 ticks (one-tick telegraph), then looses shards for up
// to 10 damage; a player who is MOVING that tick takes only 60% as the shards
// shatter in their wake.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, events, level, addXp, saveGame, startDialogue,
  registerNpcSpawn, registerNpcAction, registerObjectAction, registerTickHook,
  Npc,
} from '../game';
import { blocked } from '../world';
import { audio } from '../audio';

// ============================================================================
// SPAWNS — scattered on the ROCK/SNOW massif, clear of the agility course
// (x188-200/y30-48), the pass road (y51-53) and Maraza's lair (~200-211/15-25).
// ============================================================================
registerNpcSpawn('ice_troll', 185, 14);
registerNpcSpawn('ice_troll', 212, 46);
registerNpcSpawn('ice_troll', 192, 60);
registerNpcSpawn('ice_troll', 205, 80);
registerNpcSpawn('ice_wolf', 188, 20);
registerNpcSpawn('ice_wolf', 215, 28);
registerNpcSpawn('ice_wolf', 198, 72);
// Guide Torvald by the mountain pass entrance into the foothills
registerNpcSpawn('mountain_guide', 172, 54);
// Maraza the Rimebound, on the ice shelf of her lair
registerNpcSpawn('ice_queen', 205, 20);

// ============================================================================
// GUIDE TORVALD — flavor + agility tips
// ============================================================================
registerNpcAction('mountain_guide', 'Talk-to', (_n: Npc) => {
  startDialogue([
    { speaker: 'Torvald', text: 'Welcome to the pass, traveller! Frostpeak ahead — mind the wind, mind the wolves, and mind the trolls. Mostly the trolls.' },
    { speaker: 'You', text: 'Any advice for the climb?' },
    { speaker: 'Torvald', text: 'The high course, eh? Four obstacles between here and the summit: the icy ledge, the rope bridge, the rock face, then the snow slope.' },
    { speaker: 'Torvald', text: 'You\'ll want an Agility level of 30 at the least, or the mountain will hand you straight back to me.' },
    { speaker: 'Torvald', text: 'Take them in order and the rhythm carries you — finish a full lap and you\'ll feel the difference in your legs.' },
    { speaker: 'Torvald', text: 'One more thing: if you hear the frost start to sing up by the ice shelf... keep moving. Never stand still for the queen.' },
  ]);
  return 'done';
});

// ============================================================================
// MOUNTAIN AGILITY COURSE (lvl 30+) — pass -> north toward the lair.
// Obstacles sit at (188,48) -> (192,42) -> (196,36) -> (200,30); each crossing
// moves the player to the far side along the course's north-south axis,
// same technique as the castle course in content.ts.
// ============================================================================
const FROST_COURSE: { type: string; verb: string; xp: number; doing: string; done: string }[] = [
  { type: 'ice_ledge', verb: 'Balance-across', xp: 25, doing: 'You inch along the glassy ledge, arms out wide...', done: 'You step off the far end, heart thumping but boots dry.' },
  { type: 'rope_bridge', verb: 'Cross', xp: 28, doing: 'You cross the swaying rope bridge, plank by plank...', done: 'You hop off as the bridge bucks one last time behind you.' },
  { type: 'rock_climb', verb: 'Climb', xp: 32, doing: 'You haul yourself up the frozen rock face...', done: 'You pull yourself over the lip and catch your breath.' },
  { type: 'snow_slope', verb: 'Slide-down', xp: 35, doing: 'You launch yourself down the packed snow slope...', done: 'You skid to a stop in a spray of powder.' },
];
const FROST_LEVEL = 30;
const LAP_BONUS = 150;
let frostProgress = 0;

for (let idx = 0; idx < FROST_COURSE.length; idx++) {
  const ob = FROST_COURSE[idx];
  registerObjectAction(ob.type, ob.verb, (o) => {
    if (level('Agility') < FROST_LEVEL) {
      msg(`You need an Agility level of ${FROST_LEVEL} to attempt this obstacle.`);
      return 'done';
    }
    const p = state.player;
    // course runs (roughly) north-south: cross to the far side by approach direction
    const dirY = p.y <= o.y ? 1 : -1;
    let destY = o.y + 2 * dirY;
    for (let tryY = destY; Math.abs(tryY - o.y) <= 4; tryY += dirY) {
      if (!blocked(o.x, tryY)) { destY = tryY; break; }
    }
    msg(ob.doing);
    audio.sfx('agility');
    p.prevX = p.x; p.prevY = p.y;
    p.x = o.x; p.y = destY;
    p.path = [];
    addXp('Agility', ob.xp);
    msg(ob.done);
    // lap tracking: obstacles in order earn the summit bonus
    if (idx === frostProgress) frostProgress++;
    else frostProgress = idx === 0 ? 1 : 0;
    if (frostProgress >= FROST_COURSE.length) {
      frostProgress = 0;
      addXp('Agility', LAP_BONUS);
      msg('You complete a lap of the mountain course. The thin air no longer bothers you.', 'level');
    }
    return 'done';
  });
}

// ============================================================================
// MARAZA THE RIMEBOUND — rime shards mechanic
// ============================================================================
const QUEEN_ID = 'ice_queen';
const SHARD_INTERVAL = 9;   // ticks between volleys while engaged
const SHARD_MAX = 10;       // max hit; 60% if the player is moving that tick
const SHARD_RANGE = 4;

function playerDies() {
  const p = state.player;
  if (p.dead) return;
  p.dead = true;
  p.curHp = 0;
  p.activePrayers.clear();
  msg('Oh dear, you are dead!');
  events.onStatsChange();
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

function looseShards() {
  const p = state.player;
  let dmg = Math.floor(Math.random() * (SHARD_MAX + 1));
  const moving = p.path.length > 0;
  if (moving && dmg > 0) {
    dmg = Math.floor(dmg * 0.6);
    msg('The rime shards shatter on the ice behind you as you keep moving!');
  } else {
    msg('A volley of rime shards slams into you!');
  }
  p.curHp -= dmg;
  p.hitsplat = { dmg, until: performance.now() + 900 };
  audio.sfx(dmg > 0 ? 'hit' : 'miss');
  events.onStatsChange();
  if (p.curHp <= 0) playerDies();
}

registerTickHook(() => {
  const p = state.player;
  for (const n of state.npcs) {
    if (n.def.id !== QUEEN_ID) continue;
    if (n.dead || p.dead || n.target !== 'player') { delete n.meta.shardAt; continue; }
    const dist = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
    if (dist > SHARD_RANGE) { delete n.meta.shardAt; continue; }
    if (n.meta.shardAt === undefined) {
      n.meta.shardAt = state.tick + SHARD_INTERVAL;
      continue;
    }
    if (state.tick === n.meta.shardAt - 1) {
      msg('Frost gathers around Maraza...');
    } else if (state.tick >= n.meta.shardAt) {
      // re-check range at the moment of the volley — getting clear avoids it
      const d2 = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
      if (d2 <= SHARD_RANGE) looseShards();
      else msg('Rime shards splinter across the ice where you stood.');
      n.meta.shardAt = state.tick + SHARD_INTERVAL;
    }
  }
});

// ---- flavor ----------------------------------------------------------------

registerNpcAction(QUEEN_ID, 'Look-at', (n) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'Maraza stands sheathed in centuries of clear ice, a crown of frost grown jagged about her brow.' },
    { speaker: '', text: 'The air around her hums faintly, like a wet glass rim — and the hum sharpens whenever you stop walking.' },
    { speaker: '', text: 'Whatever froze her here did not freeze her anger. It only gave it time.' },
  ]);
  return 'done';
});

export {};
