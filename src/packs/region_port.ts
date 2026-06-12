// Port Brackwater life pack — dockside NPC spawns, the fish shop, and the
// port's high-level fishing spots (lobster caging + harpooning).
// District (SPEC Phase 6): x70-140 / y178-214; main street y186-188, dock
// streets x99-101 and x117-119, warehouses y192-200, docks run into the sea.
// NOTE: the harbormaster's QUEST dialogue lives in quest6_b under its own
// option — this pack registers ONLY 'Talk-to' idle flavor.
import {
  state, msg, startDialogue, openShop, level,
  registerNpcAction, registerObjectAction,
  hasTool, freeSlots, requestIntent,
} from '../game';
import { audio } from '../audio';

// ---------------- helpers (mirrors content.ts fishing) ----------------

// Chance per tick interpolated from `low` (at the requirement level) to `high` (at 99).
function successRoll(lvl: number, reqLevel: number, low: number, high: number): boolean {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return Math.random() < low + (high - low) * t;
}

// Message once per started action (handlers run every tick while adjacent).
let lastMsgAction: unknown = null;
function onceMsg(text: string) {
  if (state.player.action !== lastMsgAction) {
    lastMsgAction = state.player.action;
    msg(text);
  }
}

// Spawns live in data/spawns.json (server-authoritative world).

// ---------------- NPC actions ----------------

registerNpcAction('fishmonger', 'Trade', () => { openShop('brackwater_fish'); return 'done'; });

registerNpcAction('fishmonger', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Fresh catch! Fresher than the gossip and twice as slippery!' },
    { speaker: state.player.name, text: 'Business going well?' },
    { speaker: n.def.name, text: 'Swimmingly. Though the swordfish keep undercutting each other — very sharp practice.' },
    { speaker: n.def.name, text: 'Need a pot or a harpoon? I sell the gear, you brave the lobsters. They hold a grudge, you know. Whole crustacean of them.' },
    { speaker: state.player.name, text: 'I think you mean "generation".' },
    { speaker: n.def.name, text: 'I know what I said. Mind the claws off the dock ends!' },
  ]);
  return 'done';
});

// Idle flavor ONLY — the quest pack (quest6_b) owns her quest dialogue
// under a separate option name.
registerNpcAction('harbormaster', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Mind your step on the boards — the tide\'s been odd all week.' },
    { speaker: n.def.name, text: 'If you\'re after work or news, the notice board by the docks usually has something pinned to it.' },
  ]);
  return 'done';
});

// ---------------- Port fishing ----------------

// Lobster caging: Fishing 40, requires a lobster pot. (skills_gathering does
// NOT register these two spots — they are owned here.)
registerObjectAction('lobster_spot', 'Cage', (o) => {
  if (!hasTool('lobster_pot')) { msg('You need a lobster pot to catch lobsters here.'); return 'done'; }
  const lvl = level('Fishing');
  if (lvl < 40) { msg('You need a Fishing level of 40 to cage lobsters.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space to hold the fish."); return 'done'; }
  onceMsg('You lower your lobster pot into the water...');
  audio.sfx('splash');
  void requestIntent('port-fish', { spot: 'lobster', x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) return;
    if (echo.granted && echo.granted.length > 0) msg('You catch a lobster.');
  });
  return 'continue';
});

// Harpoon fishing: swordfish at 50; from 76+ there is a 30% roll for shark.
registerObjectAction('harpoon_spot', 'Harpoon', (o) => {
  if (!hasTool('harpoon')) { msg('You need a harpoon to fish here.'); return 'done'; }
  const lvl = level('Fishing');
  if (lvl < 50) { msg('You need a Fishing level of 50 to harpoon fish here.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space to hold the fish."); return 'done'; }
  onceMsg('You start harpooning fish...');
  audio.sfx('splash');
  void requestIntent('port-fish', { spot: 'harpoon', x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) return;
    const first = echo.granted?.[0]?.id;
    if (first === 'raw_shark') msg('You catch a shark!');
    else if (first === 'raw_swordfish') msg('You catch a swordfish.');
  });
  return 'continue';
});

export {};
