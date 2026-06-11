// server/combat.ts — SERVER-DERIVED player combat profile (closes G1/M4 godmode).
//
// docs/ECONOMY-AUTHORITY.md §3.1: every input to the hit roll and every defensive
// value is derived HERE from the player's SERVER-OWNED xp + SERVER-VALIDATED
// equipment, never read from the wire. handleSwing (server/sim.ts) consumes a
// CombatProfile produced by this module instead of trusting
// msg.eff/bonus/maxHit/speed/gear/spec/effDef/defBonus.
//
// The math is ported VERBATIM from the client (src/game.ts: equipBonus,
// playerMaxHit, rangedMaxHit, gunMaxHit, weaponSpeed, combatLevel, combatSnapshot)
// so a legit player's PvE numbers are byte-identical to before — the only change
// is WHO computes them. The one fidelity gap: offensive/defensive PRAYER boosts
// (prayerMult) are NOT yet server-owned (activePrayers is transient client state,
// not persisted in the save), so the server derives from BASE levels + combat
// style + equipment. Prayer-boosted accuracy/maxHit are therefore not honoured by
// the server roll until prayers become authoritative; defensive prayer halving of
// incoming NPC hits remains client-applied via the `fx` rider (see damagePlayer).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { EffectDef, SpecDef } from '../shared/effects';
import { isSpecKind } from '../shared/effects';
import { SKILLS, levelForXp, type AuthState, type SkillName } from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Item catalogue — the server reads bonuses/speed/effects/specs from its own
// copy; the client never supplies any of these values.
// ---------------------------------------------------------------------------

interface CItemDef {
  id: string;
  equipSlot?: string;
  attBonus?: number; strBonus?: number; defBonus?: number;
  rangedBonus?: number; gunBonus?: number; mageBonus?: number;
  attackSpeed?: number;
  effects?: EffectDef[];
  spec?: SpecDef;
}
const ITEMS: Record<string, CItemDef> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8'),
);

// Autocast spells: maxHit per spell id, validated server-side (the client used
// to send spell.maxHit on the wire — now ignored, looked up here by id).
interface SpellDef { id: string; level: number; maxHit: number; runes: { item: string; qty: number }[] }
const MAGIC: { spells: SpellDef[] } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/magic.json'), 'utf8'),
);
const SPELLS = new Map<string, SpellDef>(MAGIC.spells.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttackMode = 'melee' | 'ranged' | 'gun' | 'magic';
export type CombatStyle = 'accurate' | 'aggressive' | 'defensive' | 'controlled';

// The cached, server-derived combat snapshot for one connected player. Rebuilt
// only when xp / equipment / style / autocast change (cheap; not per swing).
export interface CombatProfile {
  // skill levels (from server xp via the level table)
  attackLvl: number; strengthLvl: number; defenceLvl: number;
  rangedLvl: number; gunLvl: number; magicLvl: number; hitpointsLvl: number;
  prayerLvl: number;
  combatLevel: number;

  // weapon-derived attack speed (ticks) — governs nextSwingAt, NOT msg.speed
  attackSpeed: number;

  // the attack mode the equipped weapon / autocast implies (validated, not trusted)
  weaponMode: AttackMode;

  // per-mode offensive numbers (accuracy eff level, accuracy bonus, max hit)
  // already incorporating combat style. The swing handler selects by mode.
  melee: { eff: number; bonus: number; maxHit: number };
  ranged: { eff: number; bonus: number; maxHit: number };
  gun: { eff: number; bonus: number; maxHit: number };
  magicMaxHit: number; // by autocast spell (0 if none / unmet level)

  // defensive — server-owned, used by NPC retaliation rolls (npcAttackRoll)
  effDef: number;
  defBonus: number;

  // hp pool
  maxHp: number;

  // equipped effect-bearing gear, resolved server-side from real equipment.
  // ids of items actually worn that carry effects or a spec — only these are
  // honoured by the swing resolver (closes M4: no unowned best-in-slot specs).
  effectGear: string[];
  // the spec the player may fire (weapon slot first, then shield), server-resolved
  specItemId: string | null;
}

// ---------------------------------------------------------------------------
// Derivation — mirrors the client formulas exactly.
// ---------------------------------------------------------------------------

function xpFor(state: AuthState, skill: SkillName): number {
  const i = SKILLS.indexOf(skill);
  const xp = Array.isArray(state.xp) ? state.xp[i] : 0;
  return typeof xp === 'number' && Number.isFinite(xp) ? xp : 0;
}
function lvl(state: AuthState, skill: SkillName): number {
  return levelForXp(xpFor(state, skill));
}

function equippedDefs(state: AuthState): CItemDef[] {
  const out: CItemDef[] = [];
  const eq = state.equipment;
  if (!eq || typeof eq !== 'object') return out;
  for (const slot of Object.keys(eq)) {
    const it = (eq as Record<string, { id: string } | null>)[slot];
    if (it && typeof it.id === 'string' && ITEMS[it.id]) out.push(ITEMS[it.id]);
  }
  return out;
}

// client equipBonus() — sum the given bonus across all equipped items.
function equipBonus(defs: CItemDef[], kind: 'att' | 'str' | 'def' | 'ranged' | 'gun'): number {
  let b = 0;
  for (const d of defs) {
    b += kind === 'att' ? d.attBonus ?? 0
      : kind === 'str' ? d.strBonus ?? 0
      : kind === 'ranged' ? d.rangedBonus ?? 0
      : kind === 'gun' ? d.gunBonus ?? 0
      : d.defBonus ?? 0;
  }
  return b;
}

function weaponDef(state: AuthState): CItemDef | null {
  const w = (state.equipment as Record<string, { id: string } | null> | undefined)?.weapon;
  return w && ITEMS[w.id] ? ITEMS[w.id] : null;
}

// client currentAttackMode() (equipment portion; autocast handled separately).
function weaponMode(state: AuthState, autocastSpell: string | null): AttackMode {
  if (autocastSpell) {
    const sp = SPELLS.get(autocastSpell);
    if (sp && lvl(state, 'Magic') >= sp.level) return 'magic';
  }
  const w = weaponDef(state);
  if (w) {
    if (w.id.includes('pistol') || w.id === 'glock_18') return 'gun';
    if (w.id.includes('shortbow') || w.id === 'shortbow') return 'ranged';
  }
  return 'melee';
}

function meleeNumbers(state: AuthState, defs: CItemDef[], style: CombatStyle) {
  // playerMaxHit(): effStr = Strength + (aggressive?3:0) + 8
  const strStyle = style === 'aggressive' ? 3 : 0;
  const effStr = lvl(state, 'Strength') + strStyle + 8;
  const maxHit = Math.floor(0.5 + effStr * (equipBonus(defs, 'str') + 64) / 640);
  // accuracy eff: floor(Attack) + (accurate?3:0)  (prayerMult omitted — see header)
  const attStyle = style === 'accurate' ? 3 : 0;
  const eff = lvl(state, 'Attack') + attStyle;
  return { eff, bonus: equipBonus(defs, 'att'), maxHit };
}
function rangedNumbers(state: AuthState, defs: CItemDef[]) {
  const eff = lvl(state, 'Ranged') + 8; // rangedMaxHit eff
  const maxHit = Math.floor(0.5 + eff * (equipBonus(defs, 'ranged') + 64) / 640);
  return { eff: lvl(state, 'Ranged'), bonus: equipBonus(defs, 'ranged'), maxHit };
}
function gunNumbers(state: AuthState, defs: CItemDef[]) {
  const eff = lvl(state, 'Gun') + 8;
  const maxHit = Math.floor(0.5 + eff * (equipBonus(defs, 'gun') + 64) / 640);
  return { eff: lvl(state, 'Gun'), bonus: equipBonus(defs, 'gun'), maxHit };
}

export function deriveCombatProfile(
  state: AuthState,
  style: CombatStyle,
  autocastSpell: string | null,
): CombatProfile {
  const defs = equippedDefs(state);

  // effect-bearing equipped gear (client effectGear()): items with effects or a spec.
  const effectGear: string[] = [];
  const eq = state.equipment as Record<string, { id: string } | null> | undefined;
  let specItemId: string | null = null;
  if (eq) {
    for (const slot of Object.keys(eq)) {
      const it = eq[slot];
      const d = it && ITEMS[it.id];
      if (d && ((d.effects?.length) || d.spec) && !effectGear.includes(it!.id)) effectGear.push(it!.id);
    }
    // specItem(): weapon slot first, then shield
    for (const slot of ['weapon', 'shield'] as const) {
      const it = eq[slot];
      const sd = it && ITEMS[it.id]?.spec;
      if (it && sd && isSpecKind(sd.kind)) { specItemId = it.id; break; }
    }
  }

  const w = weaponDef(state);
  const attackSpeed = (w?.attackSpeed) ?? 4;

  // autocast magic max hit (validated by level)
  let magicMaxHit = 0;
  if (autocastSpell) {
    const sp = SPELLS.get(autocastSpell);
    if (sp && lvl(state, 'Magic') >= sp.level) magicMaxHit = sp.maxHit;
  }

  const defenceLvl = lvl(state, 'Defence');
  // combatSnapshot(): effDef = floor(Defence * prayerMult) + (defensive?3:0).
  // prayerMult omitted (prayers not server-owned) → base + style.
  const effDef = defenceLvl + (style === 'defensive' ? 3 : 0);

  return {
    attackLvl: lvl(state, 'Attack'),
    strengthLvl: lvl(state, 'Strength'),
    defenceLvl,
    rangedLvl: lvl(state, 'Ranged'),
    gunLvl: lvl(state, 'Gun'),
    magicLvl: lvl(state, 'Magic'),
    hitpointsLvl: lvl(state, 'Hitpoints'),
    prayerLvl: lvl(state, 'Prayer'),
    combatLevel: deriveCombatLevel(state),
    attackSpeed,
    weaponMode: weaponMode(state, autocastSpell),
    melee: meleeNumbers(state, defs, style),
    ranged: rangedNumbers(state, defs),
    gun: gunNumbers(state, defs),
    magicMaxHit,
    effDef,
    defBonus: equipBonus(defs, 'def'),
    maxHp: lvl(state, 'Hitpoints'),
    effectGear,
    specItemId,
  };
}

// client combatLevel()
export function deriveCombatLevel(state: AuthState): number {
  const base = 0.25 * (lvl(state, 'Defence') + lvl(state, 'Hitpoints') + Math.floor(lvl(state, 'Prayer') / 2));
  const melee = 0.325 * (lvl(state, 'Attack') + lvl(state, 'Strength'));
  const range = 0.325 * Math.floor(lvl(state, 'Ranged') * 1.5);
  const gun = 0.325 * Math.floor(lvl(state, 'Gun') * 1.5);
  const mage = 0.325 * Math.floor(lvl(state, 'Magic') * 1.5);
  return Math.floor(base + Math.max(melee, range, gun, mage));
}

export function isValidStyle(s: unknown): s is CombatStyle {
  return s === 'accurate' || s === 'aggressive' || s === 'defensive' || s === 'controlled';
}
