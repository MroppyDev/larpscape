// Sunscorch Desert life pack — spawns, nomad + gem trader shops, bandit
// pickpocketing, gem stall thieving, the fire altar, and the bandit king boss.
// Desert district (SPEC Phase 6): x6-64 / y170-218; bandit camp ~30,200
// (palisade 24-36/195-205); nomad tent 10-15/176-181; gem_stall at 17,178;
// fire_altar at 50,180. Imported for side effects via src/packs/index.ts.
import {
  state, events, msg, level, saveGame,
  registerNpcSpawn, registerNpcAction, registerObjectAction, registerTickHook,
  startDialogue, openShop,
  addItem, removeItem, invCount, freeSlots, addXp,
  Npc,
} from '../game';
import { NPCS } from '../defs';
import { audio } from '../audio';

// ---------------- Local helpers (mirror content.ts conventions) ----------------
function successRoll(lvl: number, reqLevel: number, low: number, high: number): boolean {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / 50));
  return Math.random() < low + (high - low) * t;
}
function randInt(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }

let stunnedUntil = 0; // shared thieving stun for this pack

function stunPlayer(dmg: number, ticks: number) {
  const p = state.player;
  p.curHp = Math.max(1, p.curHp - dmg);
  p.hitsplat = { dmg, until: performance.now() + 900 };
  audio.sfx('hit');
  stunnedUntil = state.tick + ticks;
  events.onStatsChange();
}

// ---------------- Spawns ----------------
// Scorpions roam the open sand, away from the camp interior (24-36/195-205).
registerNpcSpawn('scorpion', 36, 180);
registerNpcSpawn('scorpion', 52, 196);
registerNpcSpawn('scorpion', 14, 206);
registerNpcSpawn('scorpion', 58, 208);

// Desert bandits loiter around (not inside) the camp palisade.
registerNpcSpawn('desert_bandit', 28, 190);
registerNpcSpawn('desert_bandit', 40, 199);
registerNpcSpawn('desert_bandit', 24, 209);
registerNpcSpawn('desert_bandit', 34, 208);

// Nomad Zahra inside her tent; the gem trader minds the stall beside it.
registerNpcSpawn('desert_nomad', 13, 178);
registerNpcSpawn('gem_trader', 18, 178);

// Saif the Red Smile holds court in the camp's clear centre.
registerNpcSpawn('bandit_king', 30, 200);

// ---------------- Nomad Zahra ----------------
registerNpcAction('desert_nomad', 'Trade', (_n: Npc) => {
  openShop('nomad_supplies');
  return 'done';
});

registerNpcAction('desert_nomad', 'Talk-to', (_n: Npc) => {
  startDialogue([
    { speaker: 'Nomad Zahra', text: 'Welcome to the shade, traveller. Out here we measure wealth in two things: water you carry, and water you know where to find.' },
    { speaker: 'You', text: 'And the sand? There seems to be a lot of it.' },
    { speaker: 'Nomad Zahra', text: 'The sand is not for measuring. The sand simply arrives — in your boots, your bread, your bedroll. You learn to share.' },
    { speaker: 'Nomad Zahra', text: 'Buy a waterskin before you wander far. The dunes are patient, and they have outlasted prouder folk than you.' },
  ]);
  return 'done';
});

// ---------------- Gem trader ----------------
registerNpcAction('gem_trader', 'Trade', (_n: Npc) => {
  openShop('gem_stall');
  return 'done';
});

registerNpcAction('gem_trader', 'Talk-to', (_n: Npc) => {
  startDialogue([
    { speaker: 'Gem trader', text: 'Behold! Sapphires bluer than the oasis at dawn, rubies redder than a noon sunburn. The finest stones south of anywhere.' },
    { speaker: 'You', text: 'Where do you find them all?' },
    { speaker: 'Gem trader', text: 'Find? Ha! Gems find ME. I once sneezed and an emerald fell out of my turban. True story. Mostly true. Partly true.' },
    { speaker: 'Gem trader', text: 'And keep your fingers where I can see them. Every stone on this stall is counted twice — once by me, once by my knife.' },
  ]);
  return 'done';
});

// ---------------- Desert bandit pickpocket (data-driven) ----------------
// NPCS.desert_bandit.pickpocket: level 35, xp 65.8, stunDmg 3,
// loot coins 20-50 + occasional uncut_sapphire.
registerNpcAction('desert_bandit', 'Pickpocket', (n: Npc) => {
  const pp = NPCS.desert_bandit.pickpocket!;
  if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't pickpocket right now."); return 'done'; }
  const lvl = level('Thieving');
  if (lvl < pp.level) { msg(`You need a Thieving level of ${pp.level} to pickpocket the desert bandit.`); return 'done'; }
  msg('You attempt to pick the desert bandit\'s pocket...');
  if (successRoll(lvl, pp.level, 0.6, 0.95)) {
    const coins = pp.loot.find((l) => l.item === 'coins');
    if (coins) addItem('coins', randInt(coins.qty[0], coins.qty[1]));
    if (Math.random() < 0.05) {
      addItem('uncut_sapphire', 1);
      msg('Among the coins you find an uncut sapphire!');
    }
    addXp('Thieving', pp.xp);
    audio.sfx('thieve');
    msg('You pick the desert bandit\'s pocket.');
  } else {
    msg('You fail to pick the desert bandit\'s pocket.');
    msg(`${n.def.name}: 'Hands off, or lose them!'`);
    stunPlayer(pp.stunDmg, 3);
  }
  return 'done';
});

// ---------------- Gem stall thieving ----------------
registerObjectAction('gem_stall', 'Steal-from', (o) => {
  if (o.depletedUntil > 0) { msg('The stall has been picked over. The trader is restocking, glaring all the while.'); return 'done'; }
  if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't steal right now."); return 'done'; }
  const lvl = level('Thieving');
  if (lvl < 30) { msg('You need a Thieving level of 30 to steal from the gem stall.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space."); return 'done'; }
  if (!successRoll(lvl, 30, 0.55, 0.95)) {
    msg('You fumble — the trader catches your wrist and cuffs you smartly.');
    stunPlayer(2, 3);
    return 'done';
  }
  const r = Math.random();
  let gem: string; let name: string;
  if (r < 0.6) { gem = 'uncut_sapphire'; name = 'an uncut sapphire'; }
  else if (r < 0.9) { gem = 'uncut_emerald'; name = 'an uncut emerald'; }
  else { gem = 'uncut_ruby'; name = 'an uncut ruby'; }
  addItem(gem);
  addXp('Thieving', 40);
  audio.sfx('thieve');
  msg(`You palm ${name} from the gem stall.`);
  o.depletedUntil = state.tick + 15;
  return 'done';
});

// ---------------- Fire altar runecrafting ----------------
registerObjectAction('fire_altar', 'Craft-rune', () => {
  const lvl = level('Runecraft');
  if (lvl < 14) { msg('The altar\'s heat pushes you back. You need a Runecraft level of 14 to bind fire runes.'); return 'done'; }
  const n = invCount('rune_essence');
  if (n === 0) { msg('You need some rune essence to craft runes here.'); return 'done'; }
  const mult = Math.floor(1 + lvl / 14);
  removeItem('rune_essence', n);
  addItem('fire_rune', n * mult);
  addXp('Runecraft', n * 7);
  audio.sfx('spell');
  msg('You bind the desert\'s shimmering heat into fire runes.');
  return 'done';
});

// ---------------- Bandit king: Saif the Red Smile ----------------
// Blade flurry every ~7 ticks while in melee: telegraph, then two rapid hits
// of up to 5 each. On first engagement he whistles a nearby bandit onto you.
interface FlurryState { ticksInCombat: number; telegraphed: boolean; calledHelp: boolean; }
const flurryStates = new WeakMap<Npc, FlurryState>();

const FLURRY_INTERVAL = 7;
const FLURRY_MAX = 5; // per hit, two hits

function playerDeathFallback() {
  // Mirror game.ts playerDeath (not exported): die, then respawn at 22,38.
  const p = state.player;
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

function applyFlurryDamage() {
  const p = state.player;
  if (p.dead) return;
  let total = 0;
  for (let i = 0; i < 2; i++) {
    if (p.curHp - total <= 0) break;
    total += randInt(1, FLURRY_MAX);
  }
  p.curHp -= total;
  p.hitsplat = { dmg: total, until: performance.now() + 900 };
  msg('Saif\'s twin blades bite twice in a blur!');
  audio.sfx('hit');
  events.onStatsChange();
  if (p.curHp <= 0) playerDeathFallback();
}

function callNearestBandit(king: Npc) {
  let best: Npc | null = null;
  let bestDist = Infinity;
  for (const n of state.npcs) {
    if (n.def.id !== 'desert_bandit' || n.dead || n.target === 'player') continue;
    const d = Math.abs(n.x - king.x) + Math.abs(n.y - king.y);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  if (best) {
    best.target = 'player';
    msg('Saif whistles sharply — a desert bandit answers his king\'s call!');
  }
}

registerTickHook(() => {
  for (const n of state.npcs) {
    if (n.def.id !== 'bandit_king') continue;
    if (n.dead) { flurryStates.delete(n); continue; }

    let s = flurryStates.get(n);
    if (!s) { s = { ticksInCombat: 0, telegraphed: false, calledHelp: false }; flurryStates.set(n, s); }

    if (n.target !== 'player' || state.player.dead) {
      s.ticksInCombat = 0;
      s.telegraphed = false;
      if (n.target !== 'player') s.calledHelp = false;
      continue;
    }

    if (!s.calledHelp) {
      s.calledHelp = true;
      callNearestBandit(n);
    }

    // Resolve a telegraphed flurry from the previous tick.
    if (s.telegraphed) {
      s.telegraphed = false;
      const p = state.player;
      const adjacent = Math.abs(p.x - n.x) <= 1 && Math.abs(p.y - n.y) <= 1
        && !(p.x === n.x && p.y === n.y);
      if (adjacent) applyFlurryDamage();
      else msg('Saif\'s blades carve only sunlight.');
      s.ticksInCombat = 0;
      continue;
    }

    s.ticksInCombat++;
    if (s.ticksInCombat >= FLURRY_INTERVAL) {
      msg('Saif twirls his blades...');
      s.telegraphed = true;
    }
  }
});

// ---------------- Look-at flavor ----------------
registerNpcAction('bandit_king', 'Look-at', (_n: Npc) => {
  startDialogue([
    { speaker: '', text: 'A lean man in sun-bleached red silk, a curved blade on each hip. His grin has more confidence than teeth, and twice as many scars.' },
    { speaker: 'Saif the Red Smile', text: 'Another guest! The desert sends me so few, and keeps even fewer.' },
    { speaker: 'Saif the Red Smile', text: 'Everything in these dunes pays my toll, friend. The caravans pay in gold. You? You may pay in whatever you have left.' },
  ]);
  return 'done';
});

export {};
