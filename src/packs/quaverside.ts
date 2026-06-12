// Quaverside District pack — the agility/thieving/hunter/construction hub on
// the river Murmur weir (30x30 at origin 70,160). Four walk-free quarters:
//   NW  rooftop/weir agility lap (7 obstacles, inner quaver lap + spire lap)
//   NE  market square (fruit/silk/coffer/relic stalls + pickpocket targets)
//   SW  the Reedmarsh (box / pitfall / high-box trap lines)
//   SE  Wrightsong Yard (sawmill, guild workbenches, contract board, grove)
// All grants are server-authoritative via the qv-* intents in
// server/intent-quaverside.ts (and the existing 'thieve' intent for stalls/
// pickpockets); this pack is messages, cosmetics and menus only.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, level, startDialogue, showOptions, requestMake, startAction,
  registerNpcAction, registerObjectAction, registerItemAction,
  invCount, hasItem, hasTool, freeSlots,
  openShop, requestIntent,
  Npc, MakeOption,
} from '../game';
import { objectAt, key, addObject, removeObject, terrain, T, blocked, WorldObject } from '../world';
import { audio } from '../audio';

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

// Run a per-tick job while standing at an object (same helper as content.ts).
function startObjJob(o: WorldObject, step: () => boolean) {
  startAction({ type: 'interact-obj', obj: o, handler: () => (step() ? 'continue' : 'done') }, o.x, o.y);
}

let stunnedUntil = 0; // cosmetic thieving stun timer (damage is server-owned)

// ============================================================================
// ROOFTOP COURSE — inner ring (quaver lap, L1-30) then spire ring (L40-65).
// Obstacles sit in a ring so each crossing lands you beside the next; the lap
// keys (quaver_lap / spire_lap) pay the bonus xp + Wrightsong marks, all
// server-keyed via qv-train.
// ============================================================================
interface QvOb { type: string; verb: string; level: number; tool?: string; doing: string; done: string; }
const INNER_COURSE: QvOb[] = [
  { type: 'qv_beam', verb: 'Cross', level: 1, doing: 'You step onto the tuned beam...', done: 'The plank chimes a clean note as you hop off. It approves.' },
  { type: 'qv_lock_jump', verb: 'Leap', level: 8, doing: 'You back up two steps and leap the lock gates...', done: 'You clear the gap with a hand-span to spare.' },
  { type: 'qv_rooftop', verb: 'Climb', level: 20, doing: 'You swarm up the scaffold to the rooftops...', done: 'You pull yourself onto the tiles. The district hums below.' },
  { type: 'qv_zipline', verb: 'Ride', level: 30, tool: 'silk_climbing_rope', doing: 'You loop your silk rope over the line and kick off...', done: 'You skim over the weir and drop off neatly at the far post.' },
];
const SPIRE_COURSE: QvOb[] = [
  { type: 'qv_chimney', verb: 'Squeeze', level: 40, doing: 'You wedge between the warm flues and shimmy through...', done: 'You pop out the far side, lightly toasted.' },
  { type: 'qv_gap_vault', verb: 'Vault', level: 52, doing: 'You sprint at the gap and vault...', done: 'You land in a roll. The street below sighs, disappointed.' },
  { type: 'qv_spire_run', verb: 'Run', level: 65, doing: 'You run the bell-spire ridgeline, arms wide...', done: 'You ride the last slope down. Somewhere, the bell tolls approval.' },
];
let innerProgress = 0;
let spireProgress = 0;

function crossObstacle(o: WorldObject) {
  // cross to the far side along the dominant approach axis (frost course technique)
  const p = state.player;
  const useX = Math.abs(p.x - o.x) > Math.abs(p.y - o.y);
  if (useX) {
    const dirX = p.x <= o.x ? 1 : -1;
    let destX = o.x + 2 * dirX;
    for (let tryX = destX; Math.abs(tryX - o.x) <= 4; tryX += dirX) {
      if (!blocked(tryX, o.y)) { destX = tryX; break; }
    }
    p.prevX = p.x; p.prevY = p.y;
    p.x = destX; p.y = o.y;
  } else {
    const dirY = p.y <= o.y ? 1 : -1;
    let destY = o.y + 2 * dirY;
    for (let tryY = destY; Math.abs(tryY - o.y) <= 4; tryY += dirY) {
      if (!blocked(o.x, tryY)) { destY = tryY; break; }
    }
    p.prevX = p.x; p.prevY = p.y;
    p.x = o.x; p.y = destY;
  }
  p.path = [];
}

function registerCourse(course: QvOb[], lapKey: string, lapLevel: number, lapMsg: string, getProgress: () => number, setProgress: (n: number) => void) {
  for (let idx = 0; idx < course.length; idx++) {
    const ob = course[idx];
    registerObjectAction(ob.type, ob.verb, (o) => {
      if (level('Agility') < ob.level) {
        msg(`You need an Agility level of ${ob.level} to attempt this obstacle.`);
        return 'done';
      }
      if (ob.tool && !hasTool(ob.tool)) {
        msg('You need a silk climbing rope to ride the zipline. Pell sells them, and three silk make one.');
        return 'done';
      }
      msg(ob.doing);
      audio.sfx('agility');
      crossObstacle(o);
      // Server-authoritative: xp (and lap marks) are granted by qv-train,
      // data-keyed by obstacle type — the client never names amounts.
      void requestIntent('qv-train', { obstacle: ob.type, x: o.x, y: o.y });
      msg(ob.done);
      // lap tracking: obstacles in sequence earn the lap bonus
      if (idx === getProgress()) setProgress(getProgress() + 1);
      else setProgress(idx === 0 ? 1 : 0);
      if (getProgress() >= course.length) {
        setProgress(0);
        if (level('Agility') >= lapLevel) {
          void requestIntent('qv-train', { obstacle: lapKey, x: o.x, y: o.y }).then((echo) => {
            if (!echo.ok) return;
            const marks = echo.granted?.find((g) => g.id === 'wrightsong_mark')?.qty ?? 0;
            msg(lapMsg, 'level');
            if (marks > 0) msg(`The Wrightsong Guild stamps you ${marks} marks for the lap.`);
          });
        }
      }
      return 'done';
    });
  }
}
registerCourse(INNER_COURSE, 'quaver_lap', 1,
  'You complete a quaver lap of the rooftops. The whole district seems to keep your tempo.',
  () => innerProgress, (n) => { innerProgress = n; });
registerCourse(SPIRE_COURSE, 'spire_lap', 60,
  'You complete a spire lap. Even the weir pauses its drone, briefly impressed.',
  () => spireProgress, (n) => { spireProgress = n; });

// ============================================================================
// MARKET SQUARE — stalls (existing 'thieve' intent; STALLS rows live server-
// side). Echo-gated depletion + failure messages, gem_stall pattern.
// ============================================================================
interface StallCfg { type: string; level: number; deplete: number; fail: string; name: (id: string) => string; }
const QV_STALLS: StallCfg[] = [
  {
    type: 'fruit_stall', level: 25, deplete: 8,
    fail: 'You knock an apple off the pile — the fruitier catches your wrist and cuffs you.',
    name: (id) => (id === 'apple' ? 'an apple' : 'an orange'),
  },
  {
    type: 'silk_stall', level: 20, deplete: 10,
    fail: 'Your fingers catch in the weave — the merchant raps your knuckles with a measuring rod.',
    name: (id) => (id === 'silk' ? 'a length of silk' : 'a whole bolt of cloth'),
  },
  {
    type: 'coffer_stall', level: 55, deplete: 15,
    fail: 'A guard\'s gauntlet lands on your shoulder before your hand lands on the coffer.',
    name: (id) => (id === 'hum_coin' ? 'an off-key coin — it hums accusingly in your pocket'
      : id === 'uncut_ruby' ? 'an uncut ruby' : 'a clipped coin pouch'),
  },
  {
    type: 'relic_stall', level: 75, deplete: 20,
    fail: 'The relic rings an alarm-note as you touch it. The whole square looks at you.',
    name: (id) => (id === 'uncut_diamond' ? 'an uncut diamond'
      : id === 'gold_bar' ? 'a gold bar' : 'a resonant shard'),
  },
];
for (const s of QV_STALLS) {
  registerObjectAction(s.type, 'Steal-from', (o) => {
    if (o.depletedUntil > 0) { msg('The stall has been picked over. The keeper restocks, glaring all the while.'); return 'done'; }
    if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't steal right now."); return 'done'; }
    if (level('Thieving') < s.level) { msg(`You need a Thieving level of ${s.level} to steal from this stall.`); return 'done'; }
    if (freeSlots() === 0) { msg("You don't have enough inventory space."); return 'done'; }
    void requestIntent('thieve', { target: s.type, x: o.x, y: o.y }).then((echo) => {
      if (!echo.ok) {
        if (echo.error === 'out of range') msg("You're not close enough to the stall — step closer and try again.");
        else if (echo.error === 'timeout' || echo.error === 'offline') msg('The stall slips out of reach for a moment — try again.');
        else if (echo.error === 'inventory full') msg("You don't have enough inventory space.");
        return;
      }
      if (!echo.granted || echo.granted.length === 0) {
        msg(s.fail);
        stunnedUntil = state.tick + 3;
        return;
      }
      audio.sfx('thieve');
      msg(`You palm ${s.name(echo.granted[0].id)} from the ${s.type.replace('_', ' ')}.`);
      o.depletedUntil = state.tick + s.deplete;
    });
    return 'done';
  });
}

// ---------------- pickpocket targets (existing 'thieve' NPC branch) ----------------
interface PickCfg { id: string; level: number; success: string; caught: string; rare?: { item: string; note: string }; }
const QV_PICKS: PickCfg[] = [
  {
    id: 'market_crowd_thug', level: 1,
    success: 'You lift a few coins from the loiterer. He was loitering with intent anyway.',
    caught: "'Oi! I was going to steal that myself!'",
  },
  {
    id: 'silk_merchant', level: 38,
    success: "You slip a hand into the merchant's apron.",
    caught: "'Thief! And after I gave you my best haggling face!'",
    rare: { item: 'silk', note: 'A length of silk comes away with the coins.' },
  },
  {
    id: 'guild_treasurer', level: 60,
    success: "You ease the treasurer's purse open mid-count.",
    caught: "'My ledger never lies — and it says STOP THIEF.'",
    rare: { item: 'hum_coin', note: 'One coin in the take hums sourly. Guild-marked. Sly Maren can fix that.' },
  },
  {
    id: 'gilded_noble', level: 80,
    success: 'You relieve the noble of a little surplus magnificence.',
    caught: "'Guards! This person TOUCHED me!'",
    rare: { item: 'uncut_diamond', note: 'Among the coins: an uncut diamond. The nobility carry the strangest pocket change.' },
  },
];
for (const pc of QV_PICKS) {
  registerNpcAction(pc.id, 'Pickpocket', (n: Npc) => {
    if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't pickpocket right now."); return 'done'; }
    if (level('Thieving') < pc.level) { msg(`You need a Thieving level of ${pc.level} to pickpocket ${n.def.name.toLowerCase()}s.`); return 'done'; }
    msg(`You attempt to pick the ${n.def.name.toLowerCase()}'s pocket...`);
    void requestIntent('thieve', { target: pc.id }).then((echo) => {
      if (!echo.ok) return;
      if (echo.granted && echo.granted.length > 0) {
        audio.sfx('thieve');
        msg(pc.success);
        if (pc.rare && echo.granted.some((g) => g.id === pc.rare!.item)) msg(pc.rare.note);
      } else {
        msg(`You fumble — ${pc.caught}`);
        stunnedUntil = state.tick + 3;
      }
    });
    return 'done';
  });
}

// ============================================================================
// THE REEDMARSH — box / pitfall / high-box trap lines (qv-trap-lay/check).
// The placed trap object is client cosmetic; the kind/timer/roll live server-
// side in the qvTraps store.
// ============================================================================
const TRAP_LAYS: { option: string; kind: string; level: number; obj: string; laid: string }[] = [
  { option: 'Lay', kind: 'box', level: 20, obj: 'box_trap_set', laid: 'You set the box trap and hum the bait-note. Something in the reeds hums back.' },
  { option: 'Lay-pitfall', kind: 'pitfall', level: 45, obj: 'pitfall_set', laid: 'You dig in the trap kit as a pitfall and rake reeds across the top. Art.' },
  { option: 'Lay-high', kind: 'highbox', level: 63, obj: 'high_box_trap_set', laid: 'You brace the box for something with real opinions and step back quickly.' },
];
for (const t of TRAP_LAYS) {
  registerItemAction('box_trap', t.option, () => {
    const p = state.player;
    const tt = terrain[key(p.x, p.y)];
    if (tt !== T.GRASS && tt !== T.FLOWERS) { msg('You can only set a trap on open grass.'); return; }
    if (objectAt.has(key(p.x, p.y))) { msg("There isn't enough room to set the trap here."); return; }
    if (level('Hunter') < t.level) { msg(`You need a Hunter level of ${t.level} to set that trap.`); return; }
    void requestIntent('qv-trap-lay', { kind: t.kind, x: p.x, y: p.y }).then((echo) => {
      if (!echo.ok) {
        if (echo.error === 'trap already here') msg('There is already a trap set here.');
        return;
      }
      const o = addObject(t.obj, p.x, p.y);
      o.meta = { laidAt: state.tick, catchAt: state.tick + randInt(15, 40) };
      audio.sfx('plant');
      msg(t.laid);
    });
  });
}

const TRAP_CHECKS: { obj: string; catches: { id: string; note: string }[] }[] = [
  {
    obj: 'box_trap_set',
    catches: [
      { id: 'chime_moth', note: 'The box rings a clear E — a chime-moth! You pocket it before it can change key.' },
      { id: 'resonant_fowl_meat', note: 'A resonant fowl! You take the meat and a few humming feathers.' },
    ],
  },
  {
    obj: 'pitfall_set',
    catches: [
      { id: 'larupia_fur', note: 'A marsh-cat took the bait. The fur alone is worth the mud on your boots.' },
      { id: 'resonant_fowl_meat', note: 'A resonant fowl blundered in. Not the cat you hoped for, but dinner is dinner.' },
    ],
  },
  {
    obj: 'high_box_trap_set',
    catches: [
      { id: 'chincrest', note: 'The box is vibrating angrily — a chincrest! You handle it with enormous respect.' },
    ],
  },
];
for (const tc of TRAP_CHECKS) {
  registerObjectAction(tc.obj, 'Check', (o) => {
    if (freeSlots() < 3) { msg("You don't have enough inventory space to dismantle the trap."); return 'done'; }
    void requestIntent('qv-trap-check', { x: o.x, y: o.y }).then((echo) => {
      if (!echo.ok) return;
      const hit = tc.catches.find((c) => echo.granted?.some((g) => g.id === c.id));
      if (hit) msg(hit.note);
      else msg('The trap sits empty, humming to itself. You dismantle it.');
    });
    removeObject(o);
    return 'done';
  });
}

// ============================================================================
// WRIGHTSONG YARD — sawmill (qv-saw), guild workbenches (qv-build), and the
// contract board. Builds are donated to the Guild for xp + Wrightsong marks.
// ============================================================================
registerObjectAction('qv_sawmill', 'Saw-logs', () => {
  showOptions([
    {
      label: 'Saw teak logs (15 coins each)',
      fn: () => {
        if (!hasItem('teak_logs')) { msg('You have no teak logs to saw.'); return; }
        void requestIntent('qv-saw', { log: 'teak' }).then((echo) => {
          if (!echo.ok) { if (echo.error === 'no logs or coins') msg('You need teak logs and 15 coins per plank.'); return; }
          audio.sfx('smith');
          msg('The sawmill sings through the teak. Planks out, coins gone.');
        });
      },
    },
    {
      label: 'Saw mahogany logs (25 coins each)',
      fn: () => {
        if (!hasItem('mahogany_logs')) { msg('You have no mahogany logs to saw.'); return; }
        void requestIntent('qv-saw', { log: 'mahogany' }).then((echo) => {
          if (!echo.ok) { if (echo.error === 'no logs or coins') msg('You need mahogany logs and 25 coins per plank.'); return; }
          audio.sfx('smith');
          msg('The blade hums a darker note through the mahogany.');
        });
      },
    },
  ]);
  return 'done';
});

interface QvBuildRow { id: string; label: string; level: number; tool: string; inputs: { item: string; qty: number; name: string }[]; }
const QV_BUILD_MENU: QvBuildRow[] = [
  { id: 'teak_chair', label: 'Teak chair', level: 28, tool: 'hammer', inputs: [{ item: 'teak_plank', qty: 3, name: 'teak planks' }, { item: 'nails', qty: 3, name: 'nails' }] },
  { id: 'teak_bookcase', label: 'Teak bookcase', level: 36, tool: 'hammer', inputs: [{ item: 'teak_plank', qty: 4, name: 'teak planks' }, { item: 'nails', qty: 4, name: 'nails' }] },
  { id: 'mahogany_table', label: 'Mahogany table', level: 50, tool: 'hammer', inputs: [{ item: 'mahogany_plank', qty: 4, name: 'mahogany planks' }, { item: 'nails', qty: 4, name: 'nails' }] },
  { id: 'chiming_wardrobe', label: 'Chiming wardrobe', level: 58, tool: 'tuned_hammer', inputs: [{ item: 'mahogany_plank', qty: 5, name: 'mahogany planks' }, { item: 'nails', qty: 5, name: 'nails' }, { item: 'chime_moth', qty: 1, name: 'chime-moth' }] },
  { id: 'wrightsong_lectern', label: 'Wrightsong lectern', level: 70, tool: 'tuned_hammer', inputs: [{ item: 'mahogany_plank', qty: 6, name: 'mahogany planks' }, { item: 'nails', qty: 6, name: 'nails' }, { item: 'chime_moth', qty: 2, name: 'chime-moths' }] },
];
function buildDisabled(b: QvBuildRow): string | undefined {
  if (level('Construction') < b.level) return `Requires Construction level ${b.level}.`;
  if (!hasTool(b.tool)) return b.tool === 'tuned_hammer' ? 'Requires a tuned hammer (Oss sells them for marks).' : 'You need a hammer.';
  for (const inp of b.inputs) {
    if (!hasItem(inp.item, inp.qty)) return `You need ${b.inputs.map((i) => `${i.qty} ${i.name}`).join(', ')}.`;
  }
  return undefined;
}
registerObjectAction('qv_workbench', 'Build', (o) => {
  if (!hasTool('hammer') && !hasTool('tuned_hammer')) { msg('You need a hammer to build anything.'); return 'done'; }
  const opts: MakeOption[] = QV_BUILD_MENU.map((b) => ({
    id: b.id, label: b.label, icon: b.inputs[0].item, disabled: buildDisabled(b),
  }));
  requestMake(opts, (id, qty) => {
    if (!id || qty <= 0) return;
    const b = QV_BUILD_MENU.find((bb) => bb.id === id)!;
    let left = qty;
    let busy = false;
    startObjJob(o, () => {
      if (left <= 0) return false;
      if (buildDisabled(b)) { msg(buildDisabled(b)!); return false; }
      if (busy) return true;
      // Server-authoritative: qv-build consumes the inputs and grants
      // Construction xp + the contract's Wrightsong marks (build is donated).
      busy = true;
      left--;
      void requestIntent('qv-build', { output: b.id }).then((echo) => {
        busy = false;
        if (!echo.ok) { left = 0; return; }
        audio.sfx('smith');
        const marks = echo.granted?.find((g) => g.id === 'wrightsong_mark')?.qty ?? 0;
        msg(`You build a ${b.label.toLowerCase()} and the Guild sings it into the district. ${marks} marks, stamped and paid.`);
      });
      return left > 0;
    });
  });
  return 'done';
});

registerObjectAction('contract_board', 'Read', () => {
  startDialogue([
    { speaker: '', text: 'WRIGHTSONG GUILD — STANDING CONTRACTS. All builds donated at the yard benches are credited in Wrightsong marks on the spot.' },
    { speaker: '', text: 'Teak chair (L28, 2 marks). Teak bookcase (L36, 3 marks). Mahogany table (L50, 5 marks).' },
    { speaker: '', text: 'TUNING COMMISSIONS (tuned hammer required): Chiming wardrobe (L58, 8 marks). Wrightsong lectern (L70, 12 marks).' },
    { speaker: '', text: 'The Guild reminds contractors that furniture which hums off-key will be returned. The contractor will not be.' },
  ]);
  return 'done';
});

// ============================================================================
// FENCE TABLE — launder off-key coins (qv-launder; the fence keeps a fifth).
// ============================================================================
registerObjectAction('fence_table', 'Launder', () => {
  if (invCount('hum_coin') < 5) {
    msg('Maren glances at your purse. "Five off-key coins a batch. Come back when you\'ve got a chord\'s worth."');
    return 'done';
  }
  void requestIntent('qv-launder', {}).then((echo) => {
    if (!echo.ok) {
      if (echo.error === 'frozen') msg('Maren shakes her head. "Vault\'s frozen, love. Even crime keeps banker\'s hours."');
      return;
    }
    audio.sfx('coins');
    msg('Maren taps each coin once and slides back a stack that sings in tune. Minus her fifth, naturally.');
  });
  return 'done';
});

// ============================================================================
// REWARD VENDORS — qv-redeem (marks are the district-wide sink). Prices here
// are labels only; the server owns the real table.
// ============================================================================
interface RewardOpt { item: string; label: string; price: number; }
function rewardMenu(vendor: string, rewards: RewardOpt[]) {
  registerNpcAction(vendor, 'Rewards', () => {
    const marks = invCount('wrightsong_mark');
    showOptions(rewards.map((r) => ({
      label: `${r.label} — ${r.price} marks`,
      fn: () => {
        if (marks < r.price) { msg(`You need ${r.price} Wrightsong marks for that (you have ${marks}).`); return; }
        void requestIntent('qv-redeem', { item: r.item }).then((echo) => {
          if (!echo.ok) {
            if (echo.error?.startsWith('requires')) msg(`That reward ${echo.error}.`);
            else if (echo.error === 'not enough marks') msg('You don\'t have enough Wrightsong marks.');
            else if (echo.error === 'inventory full') msg("You don't have enough inventory space.");
            return;
          }
          audio.sfx('coins');
          msg(`You trade ${r.price} marks for the ${r.label.toLowerCase()}.`);
        });
      },
    })));
    return 'done';
  });
}

rewardMenu('qv_agility_master', [
  { item: 'silk_climbing_rope', label: 'Silk climbing rope', price: 10 },
  { item: 'quaver_boots', label: 'Quaver boots', price: 120 },
  { item: 'graceful_hood', label: 'Graceful hood', price: 90 },
  { item: 'graceful_jerkin', label: 'Graceful jerkin', price: 140 },
  { item: 'graceful_leggings', label: 'Graceful leggings', price: 120 },
  { item: 'graceful_gloves', label: 'Graceful gloves', price: 70 },
  { item: 'graceful_boots', label: 'Graceful boots', price: 80 },
  { item: 'skill_cape_agility', label: 'Cape of the Quaver (Agility 99)', price: 990 },
]);
rewardMenu('qv_thieving_master', [
  { item: 'cutpurse_gloves', label: 'Cutpurse gloves', price: 110 },
]);
rewardMenu('qv_hunter_master', [
  { item: 'hunters_horn', label: "Hunter's horn", price: 120 },
]);
rewardMenu('qv_construction_master', [
  { item: 'tuned_hammer', label: 'Tuned hammer', price: 35 },
  { item: 'wrightsong_robe', label: 'Wrightsong robe', price: 150 },
]);

// ---------------- master dialogues + shops ----------------
registerNpcAction('qv_agility_master', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Pell the Quick', text: 'Welcome to Quaverside! Inner ring first — beam, lock gates, scaffold, zipline. Land in rhythm and the planks sing for you.' },
    { speaker: 'You', text: 'And the outer ring?' },
    { speaker: 'Pell the Quick', text: 'Chimneys, the big gap, then the spire ridge. Level sixty before you try a spire lap, or the street learns your name.' },
    { speaker: 'Pell the Quick', text: 'Laps pay Wrightsong marks. Run enough of them and I\'ll dress you Graceful — the rooftops barely notice a Graceful runner.' },
  ]);
  return 'done';
});
registerNpcAction('qv_thieving_master', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Sly Maren', text: 'The weir hums all day, friend. Lovely thing about a hum: nobody hears a purse open inside one.' },
    { speaker: 'You', text: 'Is that an invitation?' },
    { speaker: 'Sly Maren', text: 'It\'s a market square. Fruit and silk for the learning fingers, coffers and relics for the confident ones. Mind the guards at the inner court.' },
    { speaker: 'Sly Maren', text: 'And if anything you... acquire... hums off-key, bring it to my table. I tune coins. For a fifth.' },
  ]);
  return 'done';
});
registerNpcAction('qv_hunter_master', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Brackle the Trapper', text: 'The Reedmarsh funnels everything that flies, hops or hums down off the weir. You just have to be holding a box when it arrives.' },
    { speaker: 'You', text: 'Any technique to it?' },
    { speaker: 'Brackle the Trapper', text: 'Lay a line — every trap a few steps from the next — then walk it. Lay all, check all. Standing over one trap is fishing with your face.' },
    { speaker: 'Brackle the Trapper', text: 'Box traps at twenty. Pitfalls for marsh-cats at forty-five. And at sixty-three... the chincrest. Wear gloves. Wear everything.' },
  ]);
  return 'done';
});
registerNpcAction('qv_hunter_master', 'Trade', () => { openShop('qv_hunter_supplies'); return 'done'; });
registerNpcAction('qv_construction_master', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Foreward Oss', text: 'Wrightsong Yard. We sing timber into place here — the hammer just keeps the beat. Saw your logs at the mill, build at the benches, read the board.' },
    { speaker: 'You', text: 'You pay in... marks?' },
    { speaker: 'Foreward Oss', text: 'Guild marks, good as coin to anyone in the district. Every donated build earns its rate. Tuning commissions pay best, but they want a tuned hammer.' },
    { speaker: 'Foreward Oss', text: 'And before you ask: no, the district is never finished. Finished buildings stop ringing. Where\'s the music in that?' },
  ]);
  return 'done';
});
registerNpcAction('qv_general_clerk', 'Trade', () => { openShop('qv_general'); return 'done'; });
registerNpcAction('qv_general_clerk', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Clerk Tilba', text: 'Hammers, nails, saws, fruit for the runners and cloth for the seamstresses. If a trade forgot to pack it, I sell it.' },
    { speaker: 'Clerk Tilba', text: 'No refunds on apples with bites in them. We\'ve had words about this. Several times.' },
  ]);
  return 'done';
});
registerNpcAction('qv_banker', 'Talk-to', () => {
  startDialogue([
    { speaker: 'Vaultwright Senna', text: 'The booth is right there, and your vault is the same vault it is everywhere. Tuned, stasis-kept, and sworn.' },
    { speaker: 'Vaultwright Senna', text: 'Quaverside tip: bank between laps, not during. We\'ve fished three couriers out of the canal this week.' },
  ]);
  return 'done';
});

// ---------------- district flavor ----------------
registerObjectAction('qv_weir', 'Listen', () => {
  msg('The Murmur drops over the weir in one long, steady drone. Under it: footsteps, hammers, and at least one purse opening.');
  return 'done';
});
registerObjectAction('qv_canal_lock', 'Look-at', () => {
  msg('The lock fills with a slow chord. Barge crews swear the left gate is a quarter-tone flat.');
  return 'done';
});
registerObjectAction('qv_scaffold', 'Look-at', () => {
  msg('Wrightsong scaffolding. The knots are tied in time signatures.');
  return 'done';
});
registerObjectAction('wrightsong_banner', 'Look-at', () => {
  msg('A timber-and-quaver crest on guild cloth. It flaps strictly on the downbeat.');
  return 'done';
});
registerObjectAction('trophy_mount', 'Look-at', () => {
  msg('A mounted marsh-cat, mid-pounce forever. Brackle insists it volunteered.');
  return 'done';
});

export {};
