// Server-side boss mechanics, ported from the former client packs:
//   goblin_warlord  (src/packs/boss_warlord.ts)  — telegraphed slam
//   bog_horror      (src/packs/boss_bog.ts)      — poison spit + self-heal
//   shadow_drake    (src/packs/boss_drake.ts)    — fire breath (prayer halves, client-side)
//   ice_queen       (src/packs/region_frostpeak.ts) — rime shards (moving reduces, client-side)
//   bandit_king     (src/packs/region_desert.ts) — twin-blade flurry + call-for-help
//   magma_fiend     (src/packs/region_depths.ts) — eruption telegraph + enrage
//
// Damage events carry an `fx` tag; modifiers the server cannot observe
// (active prayers, movement during a telegraph) are applied client-side.

import type { PlayerView, SNpc } from './sim';

export interface BossCtx {
  tick: number;
  npcs: SNpc[];
  players: Map<number, PlayerView>;
  getTargetPlayer: (n: SNpc) => PlayerView | null;
  damagePlayer: (p: PlayerView, npc: SNpc, dmg: number, fx?: string) => void;
  sendFx: (to: PlayerView | null, npc: SNpc, kind: string) => void;
  markDirty: (n: SNpc) => void;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

const adjacent = (p: PlayerView, n: SNpc) =>
  chebyshev(p.x, p.y, n.x, n.y) <= 1 && !(p.x === n.x && p.y === n.y);

export function tickBosses(ctx: BossCtx) {
  for (const n of ctx.npcs) {
    if (n.dead) continue;
    switch (n.def.id) {
      case 'goblin_warlord': tickWarlord(ctx, n); break;
      case 'bog_horror': tickBogHorror(ctx, n); break;
      case 'shadow_drake': tickDrake(ctx, n); break;
      case 'ice_queen': tickIceQueen(ctx, n); break;
      case 'bandit_king': tickBanditKing(ctx, n); break;
      case 'magma_fiend': tickMagmaFiend(ctx, n); break;
    }
  }
}

// ---------------- Goblin Warlord: telegraphed slam ----------------
const SLAM_INTERVAL = 8;
const SLAM_MAX = 8;

function tickWarlord(ctx: BossCtx, n: SNpc) {
  const s = (n.meta.slam ??= { ticks: 0, telegraphed: false });
  const target = ctx.getTargetPlayer(n);
  if (!target) { s.ticks = 0; s.telegraphed = false; return; }

  if (s.telegraphed) {
    s.telegraphed = false;
    if (adjacent(target, n)) ctx.damagePlayer(target, n, randInt(1, SLAM_MAX), 'warlord_slam');
    else ctx.sendFx(target, n, 'warlord_miss');
    s.ticks = 0;
    return;
  }
  s.ticks++;
  if (s.ticks >= SLAM_INTERVAL) {
    ctx.sendFx(target, n, 'warlord_telegraph');
    s.telegraphed = true;
  }
}

// ---------------- Bog Horror: poison spit + self-heal ----------------
const SPIT_EVERY = 12;
const HEAL_EVERY = 10;
const HEAL_AMOUNT = 5;

function tickBogHorror(ctx: BossCtx, n: SNpc) {
  const s = (n.meta.bog ??= { spit: 0, heal: 0 });
  s.spit++;
  s.heal++;

  const target = ctx.getTargetPlayer(n);
  if (target && s.spit >= SPIT_EVERY && chebyshev(n.x, n.y, target.x, target.y) <= 3) {
    s.spit = 0;
    // poison DoT runs client-side on the spat-at player
    ctx.sendFx(target, n, 'bog_spit');
  }

  // self-heal whenever no living player stands toe-to-toe with it
  if (s.heal >= HEAL_EVERY && n.hp < n.def.hitpoints) {
    let anyAdjacent = false;
    for (const p of ctx.players.values()) {
      if (!p.dead && chebyshev(p.x, p.y, n.x, n.y) <= 1) { anyAdjacent = true; break; }
    }
    if (!anyAdjacent) {
      s.heal = 0;
      n.hp = Math.min(n.def.hitpoints, n.hp + HEAL_AMOUNT);
      ctx.markDirty(n);
      ctx.sendFx(null, n, 'bog_heal');
    }
  }
}

// ---------------- Shadow Drake: fire breath ----------------
const BREATH_INTERVAL = 10;
const BREATH_MAX = 12;

function tickDrake(ctx: BossCtx, n: SNpc) {
  const target = ctx.getTargetPlayer(n);
  if (!target) { delete n.meta.breathAt; return; }
  const dist = chebyshev(target.x, target.y, n.x, n.y);
  if (dist > 2) { delete n.meta.breathAt; return; }
  if (n.meta.breathAt === undefined) {
    n.meta.breathAt = ctx.tick + BREATH_INTERVAL;
    return;
  }
  if (ctx.tick === n.meta.breathAt - 1) {
    ctx.sendFx(target, n, 'drake_telegraph');
  } else if (ctx.tick >= n.meta.breathAt) {
    const d2 = chebyshev(target.x, target.y, n.x, n.y);
    if (d2 <= 2) {
      // client halves the damage if any prayer is active
      ctx.damagePlayer(target, n, Math.floor(Math.random() * (BREATH_MAX + 1)), 'drake_breath');
    } else ctx.sendFx(target, n, 'drake_dodge');
    n.meta.breathAt = ctx.tick + BREATH_INTERVAL;
  }
}

// ---------------- Maraza the Rimebound: rime shards ----------------
const SHARD_INTERVAL = 9;
const SHARD_MAX = 10;
const SHARD_RANGE = 4;

function tickIceQueen(ctx: BossCtx, n: SNpc) {
  const target = ctx.getTargetPlayer(n);
  if (!target) { delete n.meta.shardAt; return; }
  const dist = chebyshev(target.x, target.y, n.x, n.y);
  if (dist > SHARD_RANGE) { delete n.meta.shardAt; return; }
  if (n.meta.shardAt === undefined) {
    n.meta.shardAt = ctx.tick + SHARD_INTERVAL;
    return;
  }
  if (ctx.tick === n.meta.shardAt - 1) {
    ctx.sendFx(target, n, 'queen_telegraph');
  } else if (ctx.tick >= n.meta.shardAt) {
    const d2 = chebyshev(target.x, target.y, n.x, n.y);
    if (d2 <= SHARD_RANGE) {
      // client applies the 60% moving-reduction
      ctx.damagePlayer(target, n, Math.floor(Math.random() * (SHARD_MAX + 1)), 'queen_shards');
    } else ctx.sendFx(target, n, 'queen_dodge');
    n.meta.shardAt = ctx.tick + SHARD_INTERVAL;
  }
}

// ---------------- Saif the Red Smile: flurry + call-for-help ----------------
const FLURRY_INTERVAL = 7;
const FLURRY_MAX = 5;

function tickBanditKing(ctx: BossCtx, n: SNpc) {
  const s = (n.meta.flurry ??= { ticks: 0, telegraphed: false, calledHelp: false });
  const target = ctx.getTargetPlayer(n);
  if (!target) {
    s.ticks = 0;
    s.telegraphed = false;
    s.calledHelp = false;
    return;
  }

  if (!s.calledHelp) {
    s.calledHelp = true;
    let best: SNpc | null = null;
    let bestDist = Infinity;
    for (const o of ctx.npcs) {
      if (o.def.id !== 'desert_bandit' || o.dead || o.target !== null) continue;
      const d = Math.abs(o.x - n.x) + Math.abs(o.y - n.y);
      if (d < bestDist) { bestDist = d; best = o; }
    }
    if (best) {
      best.target = n.target;
      ctx.markDirty(best);
      ctx.sendFx(target, n, 'saif_call');
    }
  }

  if (s.telegraphed) {
    s.telegraphed = false;
    if (adjacent(target, n)) {
      ctx.damagePlayer(target, n, randInt(1, FLURRY_MAX) + randInt(1, FLURRY_MAX), 'saif_flurry');
    } else ctx.sendFx(target, n, 'saif_miss');
    s.ticks = 0;
    return;
  }
  s.ticks++;
  if (s.ticks >= FLURRY_INTERVAL) {
    ctx.sendFx(target, n, 'saif_telegraph');
    s.telegraphed = true;
  }
}

// ---------------- Korr the Molten: eruption + enrage ----------------
const ERUPTION_INTERVAL = 11;
const ERUPTION_MAX = 14;
const ENRAGE_MAX = 4;

function tickMagmaFiend(ctx: BossCtx, n: SNpc) {
  const s = (n.meta.korr ??= { ticks: 0, telegraphed: false, enraged: false, parity: 0 });
  const target = ctx.getTargetPlayer(n);
  if (!target) {
    s.ticks = 0;
    s.telegraphed = false;
    return;
  }

  // enrage below 40% hp: extra small hit every other tick while adjacent
  if (!s.enraged && n.hp > 0 && n.hp < n.def.hitpoints * 0.4) {
    s.enraged = true;
    ctx.sendFx(null, n, 'korr_enrage');
  }
  if (s.enraged) {
    s.parity = (s.parity + 1) % 2;
    if (s.parity === 0 && adjacent(target, n)) {
      ctx.damagePlayer(target, n, randInt(1, ENRAGE_MAX), 'korr_lash');
    }
  }

  // eruption: client dodges it by moving off the telegraphed tile
  if (s.telegraphed) {
    s.telegraphed = false;
    ctx.damagePlayer(target, n, randInt(1, ERUPTION_MAX), 'korr_eruption');
    s.ticks = 0;
    return;
  }
  s.ticks++;
  if (s.ticks >= ERUPTION_INTERVAL) {
    ctx.sendFx(target, n, 'korr_telegraph');
    s.telegraphed = true;
  }
}
