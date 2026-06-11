// Formatting helpers — coin amounts, ages, and forgiving "120k"-style parsing.

const COMMA = new Intl.NumberFormat('en-US');

/** Full precision with thousands separators: 1234567 -> "1,234,567". */
export function commas(n: number): string {
  return COMMA.format(n);
}

/** Compact coin display: 950 -> "950", 12500 -> "12.5k", 3200000 -> "3.2m". */
export function coins(n: number): string {
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)}b`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}m`;
  if (n >= 10_000) return `${trim(n / 1_000)}k`;
  return commas(n);
}

function trim(v: number): string {
  const s = (Math.floor(v * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Parses "120000", "120,000", "120k", "1.5m", "2b" -> integer coins, or null. */
export function parseCoins(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, '');
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)\s*([kmb]?)$/.exec(s);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : m[2] === 'b' ? 1_000_000_000 : 1;
  const v = Math.round(parseFloat(m[1]) * mult);
  if (!Number.isSafeInteger(v) || v < 0) return null;
  return v;
}

/** "3m ago", "2h ago", "5d ago" — listing age. */
export function age(msEpoch: number): string {
  const d = Date.now() - msEpoch;
  const min = Math.floor(d / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** The 1% listing fee (min 10 gp), mirrored from the server. */
export function listingFee(price: number): number {
  return Math.max(10, Math.floor(price * 0.01));
}

export const EFFECT_LABELS: Record<string, string> = {
  poison: 'Poison',
  burn: 'Burn',
  bleed: 'Bleed',
  freeze: 'Freeze',
  lifesteal: 'Lifesteal',
  family_bane: 'Family bane',
};

export const SLOT_LABELS: Record<string, string> = {
  weapon: 'Weapon', head: 'Head', body: 'Body', legs: 'Legs', shield: 'Shield',
  ammo: 'Ammo', boots: 'Boots', gloves: 'Gloves', neck: 'Neck', ring: 'Ring',
};
