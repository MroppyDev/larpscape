// Owned-vs-presentation split for the character save document.
//
// Background (docs/ECONOMY-AUTHORITY.md §0–§1): the `characters.save` JSON used
// to be written verbatim by the client via PUT /api/character, which made it the
// forgery master key for all wealth/levels/progress (audit G5/H1/M6). The
// server-owned economy makes that column AUTHORITATIVE: the server is the only
// writer of the value/progress fields below ("owned"), and the client may only
// supply cosmetic UX fields ("presentation").
//
// This module is the single source of truth for which is which. It is imported
// by both the client (so it knows which fields it must NOT expect to author) and
// the server (PUT /api/character merge in server/index.ts uses it to strip owned
// fields out of any client payload). Keep it dependency-free so it loads in both
// the browser bundle and the Node server.

// Fields the SERVER owns. The client may NOT author any of these; PUT
// /api/character ignores them entirely. All gains/losses flow through the
// server-validated intents (docs/ECONOMY-AUTHORITY.md §2). These names are the
// keys as they appear in the save document produced by src/game.ts saveGame().
export const OWNED_FIELDS = [
  'xp',            // number[24] per SKILLS — drives levels, hiscores, combat (G1/G5/H1)
  'coins',         // legacy top-level coin field (some saves carry it; bank also holds 'coins')
  'bank',          // ItemStack[] — wealth store (G4/G5, market/GE backing)
  'inventory',     // (ItemStack|null)[28] — carried items (G2/G3/M4)
  'equipment',     // Record<EquipSlot, ItemStack|null> — worn gear (M4, combat profile)
  'quests',        // Record<questId, stage> — progress gates, monotonic server-side (M6/D1)
  'collectionLog', // Record<itemId, tick> — first-obtain progress
  'specEnergy',    // 0..100 special-attack energy (combat, G1)
  'curHp',         // authoritative live HP (combat/death authority, §3)
  'prayerPoints',  // authoritative prayer pool (combat, §3)
  'slayerTask',    // { npc, remaining } | null — slayer progress
  'slayerPoints',  // slayer reward points
] as const;

// Fields the CLIENT owns. Cosmetic / UX only; never trusted for anything
// authoritative (position is already reconciled by sim range checks). These are
// the only keys accepted from a PUT /api/character body.
export const PRESENTATION_FIELDS = [
  'name',          // display name (the authoritative name lives in users; this is cosmetic mirror)
  'x', 'y',        // last position (cosmetic; sim reconciles actual position)
  'run',           // run toggle
  'energy',        // run energy (cosmetic, not wealth — docs §1.1)
  'combatStyle',   // STYLE SELECTION only — the effect of style is server-applied
  'autocastSpell', // SPELL SELECTION only — validated/applied server-side
  'music',         // unlocked music tracks (UI)
] as const;

export type OwnedField = (typeof OWNED_FIELDS)[number];
export type PresentationField = (typeof PRESENTATION_FIELDS)[number];

const OWNED_SET: ReadonlySet<string> = new Set(OWNED_FIELDS);
const PRESENTATION_SET: ReadonlySet<string> = new Set(PRESENTATION_FIELDS);

export function isOwnedField(key: string): boolean { return OWNED_SET.has(key); }
export function isPresentationField(key: string): boolean { return PRESENTATION_SET.has(key); }

// Return a shallow copy of `clientSave` containing ONLY presentation fields.
// Any owned (or unknown) key is dropped. This is the core of the PUT merge:
// whatever the client sends, only these keys survive to be written over the
// server's authoritative document. Neutralises the save-edit master key (G5).
export function pickPresentation(clientSave: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!clientSave || typeof clientSave !== 'object') return out;
  for (const key of PRESENTATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(clientSave, key)) {
      out[key] = clientSave[key];
    }
  }
  return out;
}

// Merge: authoritative owned doc + client-supplied presentation fields.
// `authoritative` is the server's current save (source of truth for owned
// fields); `clientSave` is the untrusted PUT body. Owned fields are taken from
// `authoritative` ONLY; presentation fields are overlaid from the client.
export function mergeSave(
  authoritative: Record<string, unknown>,
  clientSave: Record<string, unknown>,
): Record<string, unknown> {
  // Start from the full authoritative document so every owned field is preserved
  // exactly as the server holds it, then overlay only the client's presentation.
  const merged: Record<string, unknown> = { ...(authoritative ?? {}) };
  const pres = pickPresentation(clientSave);
  for (const key of Object.keys(pres)) merged[key] = pres[key];
  return merged;
}
