// Region pack: Frostpeak Mountains — mountain life, the high agility course,
// and the boss Maraza the Rimebound (ice_queen) in her glassy lair at (205,20).
// Boss mechanic: 'rime shards' — while fighting the player within 4 tiles she
// gathers frost every ~9 ticks (one-tick telegraph), then looses shards for up
// to 10 damage; a player who is MOVING that tick takes only 60% as the shards
// shatter in their wake.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, level, startDialogue, requestIntent,
  registerNpcAction, registerObjectAction, registerFx, registerDamageModifier,
  Npc,
} from '../game';
import { blocked } from '../world';
import { audio } from '../audio';

// Spawns live in data/spawns.json (server-authoritative world).

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
    void requestIntent('train', { obstacle: ob.type, x: o.x, y: o.y });
    msg(ob.done);
    // lap tracking: obstacles in order earn the summit bonus
    if (idx === frostProgress) frostProgress++;
    else frostProgress = idx === 0 ? 1 : 0;
    if (frostProgress >= FROST_COURSE.length) {
      frostProgress = 0;
      void requestIntent('train', { obstacle: 'frost_lap', x: o.x, y: o.y });
      msg('You complete a lap of the mountain course. The thin air no longer bothers you.', 'level');
    }
    return 'done';
  });
}

// ============================================================================
// MARAZA THE RIMEBOUND — rime shards mechanic
// The volley timing runs server-side (server/bosses.ts); the moving-reduction
// is applied here because the server can't see sub-tick movement.
// ============================================================================
const QUEEN_ID = 'ice_queen';

registerFx('queen_telegraph', () => msg('Frost gathers around Maraza...'));
registerFx('queen_dodge', () => msg('Rime shards splinter across the ice where you stood.'));

registerDamageModifier('queen_shards', (dmg) => {
  const moving = state.player.path.length > 0;
  if (moving && dmg > 0) {
    dmg = Math.floor(dmg * 0.6);
    msg('The rime shards shatter on the ice behind you as you keep moving!');
  } else {
    msg('A volley of rime shards slams into you!');
  }
  return dmg;
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
