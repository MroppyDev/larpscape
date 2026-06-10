// Skill names + classic XP table, mirrored from src/defs.ts for the admin UI.

export const SKILLS = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing', 'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Gun',
] as const;

export type SkillName = (typeof SKILLS)[number];

// Classic experience table: cumulative XP required for each level 1..99.
export const XP_TABLE: number[] = (() => {
  const t = [0, 0]; // index by level; level 1 = 0 xp
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 99; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) { lvl = i; break; }
  }
  return Math.min(99, lvl);
}

export function totalLevel(xp: number[]): number {
  return SKILLS.reduce((sum, _s, i) => sum + levelForXp(xp[i] ?? 0), 0);
}
