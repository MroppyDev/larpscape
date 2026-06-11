// Character portraits: GET /api/portrait/:username.svg
//
// Renders an ORIGINAL head-and-shoulders SVG portrait (120x120) of a player's
// character, generated from the save JSON in the 'characters' table (written
// by src/game.ts saveGame). Appearance comes from save.equipment.head /
// save.equipment.body item ids; the id->color mapping mirrors the simple
// metalTint + unique-model palettes in src/render.ts so the portrait matches
// the in-game figure. Deterministic per save state, ETag + 5-minute cache,
// unknown players get a 404 silhouette. No DB writes, no dependencies.

import type { Express, Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Color mapping — mirrors src/render.ts (metalTint + UNIQUE_*_MODELS).
// ---------------------------------------------------------------------------

function metalTint(id: string | undefined | null): string | null {
  if (!id) return null;
  if (id.startsWith('bronze')) return '#9a6a3a';
  if (id.startsWith('iron')) return '#6e6e76';
  if (id.startsWith('steel')) return '#b4bac2';
  if (id.startsWith('mithril')) return '#5a78c8';
  if (id.startsWith('adamant')) return '#2e7a4a';
  if (id.startsWith('rune')) return '#699cb4';
  if (id.startsWith('drake')) return '#3a3046';
  if (id.startsWith('warlord')) return '#7c4a32';
  if (id.startsWith('leather')) return '#8a6a42';
  if (id.startsWith('wooden')) return '#7a5630';
  return '#8c8c94';
}

type HelmKind = 'dome' | 'visor' | 'coif' | 'wrap' | 'wizard';

const UNIQUE_HEAD: Record<string, { col: string; kind: HelmKind }> = {
  wardens_visor: { col: '#566270', kind: 'visor' },
  nightscale_coif: { col: '#23262e', kind: 'coif' },
  bandit_black_wrap: { col: '#221f1d', kind: 'wrap' },
};

const UNIQUE_BODY: Record<string, string> = {
  wraithcloth_robes: '#b6c0ca',
  direwolf_pelt_cloak: '#6a5a48',
  slagplate: '#3c342a',
  larp_pride_cape: '#2a2630',
};

function helmKindFor(id: string): HelmKind {
  const u = UNIQUE_HEAD[id];
  if (u) return u.kind;
  if (id.includes('wizard')) return 'wizard';
  if (id.includes('coif') || id.includes('hood')) return 'coif';
  if (id.includes('wrap')) return 'wrap';
  return 'dome'; // full helms and anything else metal
}

// Base figure palette — same defaults as figureFromAppearance in src/render.ts.
const SKIN = '#d8a878';
const HAIR = '#5a3a1a';
const TUNIC = '#3a5a8a';

// Darken a #rrggbb hex by a factor — used for the second tone of the
// two-tone, vertex-color-ish shading.
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 0xff), g = c((n >> 8) & 0xff), b = c(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// SVG composition
// ---------------------------------------------------------------------------

interface Look {
  headId: string | null;
  bodyId: string | null;
}

// Parchment circle background + subtle ring, shared by every portrait.
function bgLayer(): string {
  return (
    `<circle cx="60" cy="60" r="58" fill="#e2d3ac"/>` +
    `<circle cx="60" cy="60" r="58" fill="none" stroke="#b09a66" stroke-width="3"/>` +
    `<circle cx="60" cy="60" r="52" fill="none" stroke="#cdbb8d" stroke-width="2"/>`
  );
}

// Shoulders: a rounded trapezoid clipped by the portrait circle, with a darker
// lower band for the two-tone look.
function shouldersLayer(col: string): string {
  const dark = shade(col, 0.78);
  return (
    `<g clip-path="url(#pc)">` +
    `<path d="M22 122 Q24 84 44 78 L76 78 Q96 84 98 122 Z" fill="${col}"/>` +
    `<path d="M22 122 Q23 104 30 94 L90 94 Q97 104 98 122 Z" fill="${dark}"/>` +
    // collar seam
    `<path d="M44 78 Q60 88 76 78 L76 84 Q60 94 44 84 Z" fill="${shade(col, 0.62)}"/>` +
    `</g>`
  );
}

function neckLayer(): string {
  return `<rect x="53" y="64" width="14" height="16" rx="5" fill="${shade(SKIN, 0.84)}"/>`;
}

// Bare head: rounded skull, side shading, simple face, hair cap + back blob
// (mirrors the dome-cap-plus-back-blob hair in makeHumanoid).
function headLayer(): string {
  const skinDark = shade(SKIN, 0.82);
  return (
    `<ellipse cx="60" cy="48" rx="19" ry="21" fill="${SKIN}"/>` +
    `<path d="M60 27 a19 21 0 0 1 0 42 a26 21 0 0 0 8 -21 a26 21 0 0 0 -8 -21 Z" fill="${skinDark}"/>`
  );
}

function faceLayer(): string {
  return (
    `<circle cx="53" cy="48" r="2" fill="#2a2018"/>` +
    `<circle cx="67" cy="48" r="2" fill="#2a2018"/>` +
    `<path d="M55 58 Q60 61 65 58" fill="none" stroke="#8a5a3a" stroke-width="1.6" stroke-linecap="round"/>`
  );
}

function hairLayer(): string {
  const dark = shade(HAIR, 0.78);
  return (
    `<path d="M41 46 Q40 26 60 25 Q80 26 79 46 Q79 36 70 33 Q60 30 50 33 Q41 36 41 46 Z" fill="${HAIR}"/>` +
    `<path d="M62 25.5 Q80 26 79 46 Q79 36 70 33 Q66 31.5 62 31 Z" fill="${dark}"/>`
  );
}

// Helm shapes by family — dome+nose guard, coif hood, head wrap, slit visor,
// wizard cone. Each sits over the bare head layer.
function helmLayer(id: string): string {
  const col = UNIQUE_HEAD[id]?.col ?? metalTint(id) ?? '#8c8c94';
  const dark = shade(col, 0.74);
  const lite = shade(col, 1.18);
  switch (helmKindFor(id)) {
    case 'coif':
      return (
        `<path d="M38 50 Q37 25 60 24 Q83 25 82 50 Q83 64 74 68 L70 56 L50 56 L46 68 Q37 64 38 50 Z" fill="${col}"/>` +
        `<path d="M62 24.5 Q83 26 82 50 Q83 64 74 68 L70 56 Q74 40 68 30 Z" fill="${dark}"/>` +
        `<path d="M44 40 Q44 30 54 28" fill="none" stroke="${lite}" stroke-width="2" stroke-linecap="round"/>`
      );
    case 'wrap':
      return (
        `<path d="M40 44 Q39 27 60 26 Q81 27 80 44 L80 50 L40 50 Z" fill="${col}"/>` +
        `<rect x="40" y="42" width="40" height="7" rx="3.5" fill="${dark}"/>` +
        `<path d="M40 46 Q33 52 35 62 L40 58 Z" fill="${dark}"/>` + // trailing knot tail
        `<path d="M46 32 Q53 28 60 28" fill="none" stroke="${lite}" stroke-width="2" stroke-linecap="round"/>`
      );
    case 'visor':
      return (
        `<path d="M39 50 Q38 25 60 24 Q82 25 81 50 L81 54 L39 54 Z" fill="${col}"/>` +
        `<path d="M62 24.5 Q82 26 81 50 L81 54 L70 54 Q74 38 68 28 Z" fill="${dark}"/>` +
        `<rect x="44" y="44" width="32" height="6" rx="2" fill="#1a1c20"/>` +
        `<rect x="47" y="46" width="11" height="2" rx="1" fill="#ffb84a"/>` + // lit slit
        `<rect x="62" y="46" width="11" height="2" rx="1" fill="#ffb84a"/>` +
        `<path d="M58 22 L62 22 L60 16 Z" fill="${col}"/>` // crest spike
      );
    case 'wizard':
      return (
        `<path d="M60 6 L82 46 Q60 52 38 46 Z" fill="${col}"/>` +
        `<path d="M61 8 L82 46 Q72 49 62 49.5 Z" fill="${dark}"/>` +
        `<ellipse cx="60" cy="46" rx="25" ry="5" fill="${dark}"/>`
      );
    default: // dome — rounded helm with rim and nose guard
      return (
        `<path d="M39 47 Q38 24 60 23 Q82 24 81 47 L39 47 Z" fill="${col}"/>` +
        `<path d="M62 23.5 Q82 25 81 47 L70 47 Q74 36 68 27 Z" fill="${dark}"/>` +
        `<rect x="37" y="45" width="46" height="6" rx="3" fill="${dark}"/>` +
        `<rect x="57" y="45" width="6" height="14" rx="2.5" fill="${col}"/>` + // nose guard
        `<path d="M44 38 Q46 28 55 25" fill="none" stroke="${lite}" stroke-width="2" stroke-linecap="round"/>`
      );
  }
}

function composePortrait(look: Look): string {
  const bodyCol = look.bodyId
    ? UNIQUE_BODY[look.bodyId] ?? metalTint(look.bodyId) ?? TUNIC
    : TUNIC;
  const parts = [bgLayer(), shouldersLayer(bodyCol), neckLayer(), headLayer(), faceLayer()];
  if (look.headId) parts.push(helmLayer(look.headId));
  else parts.push(hairLayer());
  return svgWrap(parts.join(''));
}

// Default silhouette for unknown players — a featureless figure in parchment shadow.
function silhouettePortrait(): string {
  const ink = '#8c7a52';
  return svgWrap(
    bgLayer() +
    `<g clip-path="url(#pc)" fill="${ink}">` +
    `<ellipse cx="60" cy="48" rx="19" ry="21"/>` +
    `<rect x="53" y="62" width="14" height="16" rx="5"/>` +
    `<path d="M22 122 Q24 84 44 78 L76 78 Q96 84 98 122 Z"/>` +
    `</g>`,
  );
}

function svgWrap(inner: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">` +
    `<defs><clipPath id="pc"><circle cx="60" cy="60" r="58"/></clipPath></defs>` +
    inner +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9]{1,20}$/;
const MAX_AGE_S = 300;

// Pull the two appearance-relevant ids out of a save blob. Saves are client
// JSON (src/game.ts saveGame): equipment is Record<slot, {id, qty} | null>.
function lookFromSave(saveJson: string): Look {
  const look: Look = { headId: null, bodyId: null };
  try {
    const save = JSON.parse(saveJson) as { equipment?: Record<string, { id?: unknown } | null> };
    const eq = save?.equipment;
    if (eq && typeof eq === 'object') {
      const head = eq.head?.id, body = eq.body?.id;
      if (typeof head === 'string') look.headId = head;
      if (typeof body === 'string') look.bodyId = body;
    }
  } catch {
    // malformed save -> default look
  }
  return look;
}

function sendSvg(req: Request, res: Response, svg: string, status: number): void {
  const etag = `"p-${crypto.createHash('sha1').update(svg).digest('hex').slice(0, 16)}"`;
  res.setHeader('Cache-Control', `public, max-age=${MAX_AGE_S}`);
  res.setHeader('ETag', etag);
  if (status === 200 && req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.status(status).type('image/svg+xml').send(svg);
}

export function initPortraits(app: Express, db: Database): void {
  const stmt = db.prepare(
    `SELECT c.save FROM characters c
     JOIN users u ON u.id = c.user_id
     WHERE u.username = ?`,
  );

  // Express 5 path-to-regexp does not allow a literal suffix after a param,
  // so match the whole filename and strip ".svg" ourselves.
  app.get('/api/portrait/:file', (req: Request, res: Response) => {
    const file = String(req.params.file ?? '');
    if (!file.endsWith('.svg')) {
      sendSvg(req, res, silhouettePortrait(), 404);
      return;
    }
    const username = file.slice(0, -4);
    if (!USERNAME_RE.test(username)) {
      sendSvg(req, res, silhouettePortrait(), 404);
      return;
    }
    const row = stmt.get(username) as { save: string } | undefined;
    if (!row) {
      sendSvg(req, res, silhouettePortrait(), 404);
      return;
    }
    sendSvg(req, res, composePortrait(lookFromSave(row.save)), 200);
  });
}
