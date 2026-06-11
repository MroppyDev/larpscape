// Weapon effects + special attacks: the one schema both damage paths share.
// Pure types + math only — no imports, safe for both the client (src/) and the
// server (server/) builds. docs/EFFECTS.md is the designer-facing contract;
// keep the two in sync.

// ---------------------------------------------------------------------------
// Effect defs (item "effects" array)
// ---------------------------------------------------------------------------

/** Damage-over-time effect types. Hitsplat kind on the wire matches the type. */
export type DotType = 'poison' | 'burn' | 'bleed';

export interface DotEffectDef {
  type: DotType;
  chance: number;     // 0..1 proc chance per damaging hit
  dmg: number;        // damage per DoT tick
  hits: number;       // number of DoT ticks
  every: number;      // game ticks between DoT ticks (600ms each)
  maxStacks?: number; // default 1; a re-proc refreshes the newest stack
}

export interface FreezeEffectDef {
  type: 'freeze';
  chance: number;     // 0..1 proc chance per damaging hit
  holdTicks: number;  // target cannot move for this many ticks (can still attack)
}

export interface LifestealEffectDef {
  type: 'lifesteal';
  pct: number;        // 0..1 fraction of damage dealt returned as healing
}

export interface FamilyBaneEffectDef {
  type: 'family_bane';
  family: string;     // npc def "family" tag, e.g. "offnote"
  accMult?: number;   // attack-roll multiplier vs that family (default 1)
  dmgMult?: number;   // max-hit multiplier vs that family (default 1)
}

export type EffectDef = DotEffectDef | FreezeEffectDef | LifestealEffectDef | FamilyBaneEffectDef;

// ---------------------------------------------------------------------------
// Special attack defs (item "spec" object)
// ---------------------------------------------------------------------------

export const SPEC_KINDS = [
  'double_hit',        // two independent accuracy+damage rolls
  'heavy_hit',         // one boosted roll
  'aoe_adjacent',      // main hit + reduced hits on NPCs near the target
  'stun',              // hit + target cannot move OR attack for holdTicks
  'drain_def',         // hit + permanently (until respawn) lowers target defence
  'warcry_aoe_debuff', // hit + NPCs near YOU attack weaker for a duration
  'guaranteed_dot',    // hit + applies a DoT with 100% chance
] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

export interface SpecParams {
  accMult?: number;    // accuracy multiplier on the spec hit(s)
  dmgMult?: number;    // max-hit multiplier on the spec hit(s)
  holdTicks?: number;  // stun
  amount?: number;     // drain_def: flat defence levels removed
  radius?: number;     // aoe_adjacent / warcry_aoe_debuff (tiles, chebyshev; default 1)
  atkMult?: number;    // warcry_aoe_debuff: npc attack-level multiplier (e.g. 0.7)
  ticks?: number;      // warcry_aoe_debuff: debuff duration in ticks
  dot?: DotEffectDef;  // guaranteed_dot: the DoT to apply (chance ignored)
}

export interface SpecDef {
  name: string;        // shown on the spec bar
  energy: number;      // 25..100, consumed when the spec swing fires
  desc: string;        // one-line tooltip
  kind: SpecKind;
  params?: SpecParams;
}

// ---------------------------------------------------------------------------
// Engine state shapes (server-owned, mirrored client-side via hitsplat kinds)
// ---------------------------------------------------------------------------

/** One active DoT stack on an NPC (server-side). */
export interface ActiveDot {
  type: DotType;
  dmg: number;
  hitsLeft: number;
  every: number;
  nextAt: number;   // sim tick of the next DoT tick
  byUserId: number; // who applied it (gets kill credit + slayer/xp via 'hit' path)
}

/** Hitsplat kinds carried on the 'hit' wire message; renderers color by kind. */
export type HitsplatKind = 'hit' | DotType | 'spec';

// ---------------------------------------------------------------------------
// Pure helpers (used by server/sim.ts; the client may use them for previews)
// ---------------------------------------------------------------------------

export interface FamilyMods { accMult: number; dmgMult: number; }

/** Combined family_bane multipliers from a gear effect list vs one npc family. */
export function familyMods(effects: EffectDef[], family: string | undefined): FamilyMods {
  let accMult = 1, dmgMult = 1;
  if (family) {
    for (const e of effects) {
      if (e.type === 'family_bane' && e.family === family) {
        accMult *= e.accMult ?? 1;
        dmgMult *= e.dmgMult ?? 1;
      }
    }
  }
  return { accMult, dmgMult };
}

/** Clamp helper shared by both sides when reading designer numbers. */
export function clampNum(n: unknown, lo: number, hi: number, dflt: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

/**
 * Apply a DoT proc to an NPC's stack list (mutates and returns it).
 * Respects maxStacks (default 1); at cap, the oldest matching stack refreshes.
 */
export function applyDotStack(
  dots: ActiveDot[], def: DotEffectDef, byUserId: number, nowTick: number,
): ActiveDot[] {
  const maxStacks = Math.max(1, def.maxStacks ?? 1);
  const mine = dots.filter((d) => d.type === def.type);
  if (mine.length >= maxStacks) {
    const oldest = mine[0];
    oldest.dmg = def.dmg;
    oldest.hitsLeft = def.hits;
    oldest.every = def.every;
    oldest.nextAt = nowTick + def.every;
    oldest.byUserId = byUserId;
  } else {
    dots.push({
      type: def.type, dmg: def.dmg, hitsLeft: def.hits,
      every: def.every, nextAt: nowTick + def.every, byUserId,
    });
  }
  return dots;
}

/** Defensive validation for gear effect lists arriving from item defs. */
export function isDotType(t: string): t is DotType {
  return t === 'poison' || t === 'burn' || t === 'bleed';
}
export function isSpecKind(k: string): k is SpecKind {
  return (SPEC_KINDS as readonly string[]).includes(k);
}
