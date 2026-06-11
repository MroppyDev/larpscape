// Hand-authored pixel-art sprites. All art is ORIGINAL — palette + string-grid pixmaps.
// Item icons are authored on a 16x16 grid and rendered at scale 2 into a 32x32 canvas.
// Convention: '.' = transparent. Per-grid chars are mapped through a palette
// (Record<char, color>). Light source is top-left; every sprite gets a near-black
// hue-tinted outline ('O'), a 2-3 value ramp (D/M/L) and a tiny highlight ('H').

export type Palette = Record<string, string>;
export type Pixmap = string[];

const cache = new Map<string, HTMLCanvasElement>();

// cloneNode(true) on a canvas does NOT copy the bitmap — use this for DOM insertion.
export function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g);
  cache.set(key, c);
  return c;
}

export function drawPixmap(g: CanvasRenderingContext2D, rows: Pixmap, palette: Palette, scale = 1, ox = 0, oy = 0): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

function pal(...parts: Palette[]): Palette { return Object.assign({}, ...parts); }

// ---------------------------------------------------------------------------
// Shared ramps
// ---------------------------------------------------------------------------

// Metal tiers — O outline, D dark, M mid, L light, H highlight.
const METAL: Record<string, Palette> = {
  bronze:  { O: '#2a1808', D: '#7a4a20', M: '#a86c30', L: '#d09450', H: '#f2c684' },
  iron:    { O: '#14151a', D: '#43464d', M: '#6e737b', L: '#989fa8', H: '#c8ced6' },
  steel:   { O: '#1c2128', D: '#67727e', M: '#94a1ae', L: '#c2cdd8', H: '#f0f5fa' },
  // Phase 5 tiers — mithril cool blue-steel, adamant deep green.
  mithril: { O: '#101627', D: '#324070', M: '#4e62a0', L: '#7a8eca', H: '#b2c2ee' },
  adamant: { O: '#0b150d', D: '#27462e', M: '#3e6a44', L: '#5f9162', H: '#92c08e' },
  // Phase 6 tier — rune, cool slate-blue.
  rune:    { O: '#0c1820', D: '#2a4a60', M: '#3f7088', L: '#699cb4', H: '#a6d8e6' },
};

// Wood / leather grip ramp — o dark outline, d dark, m mid, l light, n pale.
const WOOD: Palette = { o: '#1f1308', d: '#523317', m: '#7c5424', l: '#a87a3c', n: '#cfa86a' };

// Gold trim.
const GOLD: Palette = { y: '#a87f1f', Y: '#e3c050', Z: '#f7e69a' };

// Charcoal (burnt food).
const BURNT: Palette = { O: '#0c0c0c', D: '#242424', M: '#383838', L: '#4c4c4c', H: '#5e5e5e' };

// ---------------------------------------------------------------------------
// Shared pixmaps (palette-swapped across tiers / variants)
// ---------------------------------------------------------------------------

const SWORD_G: Pixmap = [
  '................',
  '.............O..',
  '...........OHLO.',
  '..........OLMO..',
  '.........OLMO...',
  '........OLMO....',
  '.......OLMO.....',
  '......OLMO......',
  '..O..OLMO.......',
  '..OyOLMO........',
  '...OYyO.........',
  '..OdOYyO........',
  '.OdmO.OO........',
  '.OmdO...........',
  'OdmO............',
  '.OO.............',
];

const SCIM_G: Pixmap = [
  '................',
  '.......OOO......',
  '.....OOLLHO.....',
  '....OLLLMHO.....',
  '...OLLMMHO......',
  '..OLLMMO........',
  '..OLMMO.........',
  '.OLMMO..........',
  '.OLMO...........',
  '.OLMO...........',
  '.OMMO...........',
  '..OMO...........',
  '..OOyO..........',
  '...OdmO.........',
  '...OmdO.........',
  '....OO..........',
];

const HELM_G: Pixmap = [
  '................',
  '.....OOOOOO.....',
  '....OLLHLMMO....',
  '...OLLHLLMMMO...',
  '..OLLLLLLMMMO...',
  '..OLLLLLLMMMO...',
  '..OLLLLLLMMMO...',
  '..OOxxOOOxxOO...',
  '..OLLLOxOLMMO...',
  '..OLLLOxOLMMO...',
  '..OLLLOxOLMMO...',
  '...OLLOxOLMO....',
  '...OLLLOLMMO....',
  '....OOOOOOO.....',
  '................',
  '................',
];

const BODY_G: Pixmap = [
  '................',
  '..OOO......OOO..',
  '.OLLMOOOOOOMDMO.',
  '.OLLLLHLLMMMDDO.',
  '.OLOLLLLLMMMODO.',
  '..OOLLLLLMMMOO..',
  '...OLLLLLMMMO...',
  '...OLLLLLMMMO...',
  '...OLLOOOMMMO...',
  '...OLLLLLMMMO...',
  '...OLLLLLMMMO...',
  '...OLLLLLMMMO...',
  '...ODLLLLMMDO...',
  '....ODDDMMDO....',
  '.....OOOOOO.....',
  '................',
];

const LEGS_G: Pixmap = [
  '................',
  '...OOOOOOOOOO...',
  '..OLLLLLMMMMMO..',
  '..OLLLLLMMMMMO..',
  '..OLLLOOOOMMMO..',
  '..OLLLO..OMMMO..',
  '..OLLO....OMMO..',
  '..OLLO....OMMO..',
  '..OLLO....OMMO..',
  '..OLLO....OMMO..',
  '..OLLO....OMMO..',
  '..OLLO....OMMO..',
  '..ODLO....ODMO..',
  '..ODDO....ODDO..',
  '...OO......OO...',
  '................',
];

const KITE_G: Pixmap = [
  '................',
  '...OOOOOOOOOO...',
  '..OLLLHLLMMMMO..',
  '..OLLLLLLMMMMO..',
  '..OLLLLLLMMMMO..',
  '..OLLOOOOOMMMO..',
  '..OLLOyYyOMMMO..',
  '..OLLOyYyOMMMO..',
  '..OLLOOOOOMMMO..',
  '...OLLLLMMMMO...',
  '...OLLLLMMMMO...',
  '....OLLLMMMO....',
  '.....OLLMMO.....',
  '......OLMO......',
  '.......OO.......',
  '................',
];

const ARROW_G: Pixmap = [
  '................',
  '............OO..',
  '...........OHLO.',
  '...........OLMO.',
  '..........OLMO..',
  '..........OMO...',
  '.........OmO....',
  '........OmO.....',
  '.......OmO......',
  '......OmO.......',
  '.....OmO........',
  '..O.OmO.........',
  '.OfOmO..........',
  '.OffOO..........',
  'OfffO...........',
  '.OOO............',
];

const TIPS_G: Pixmap = [
  '................',
  '................',
  '....OO..........',
  '...OHLO....OO...',
  '...OLMO...OLLO..',
  '..OLLMO...OLMO..',
  '..OLMMO..OLMMO..',
  '...OOO...OLMMO..',
  '..........OOO...',
  '......OO........',
  '.....OHLO.......',
  '.....OLMO.......',
  '....OLLMO.......',
  '....OLMMO.......',
  '.....OOO........',
  '................',
];

// Pistol side profile — s slide, g grip, t trigger, b barrel muzzle.
const PISTOL_G: Pixmap = [
  '................',
  '......OOOO......',
  '....OsHHHHO.....',
  '....OsLLMMO.....',
  '...OsLLLMMOb....',
  '...OssssssOb....',
  '...OggggggO.....',
  '...OgggtggO.....',
  '....OggggO......',
  '.....OggO.......',
  '......OO........',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Glock 18 — blocky polymer frame, distinct from metal sidearms.
const GLOCK_G: Pixmap = [
  '................',
  '....OOOOOO......',
  '...OpHHHHpO.....',
  '...OpLLLLpO.....',
  '...OssssssO.....',
  '...OppppppO.....',
  '...OptttpO......',
  '....OppppO......',
  '.....OpOO.......',
  '......OO........',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Loaded cartridge — b brass base, M bullet jacket, H tip (stacked for ammo icons).
const ROUND_G: Pixmap = [
  '................',
  '.....OO.........',
  '....ObHLO.......',
  '....ObMLO..OO...',
  '....ObMLO.ObL...',
  '.....OO..ObM....',
  '.........Ob.....',
  '..........OO....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Empty brass casing.
const CASING_G: Pixmap = [
  '................',
  '................',
  '.....OO.........',
  '....ObLLO.......',
  '....ObddO.......',
  '....ObLLO.......',
  '.....OO.........',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Gunpowder keg — n neck, B body, p powder speckle.
const GUNPOWDER_G: Pixmap = [
  '................',
  '......OOO.......',
  '.....OnnnO......',
  '....OBBBBBO.....',
  '....OBppBBO.....',
  '....OBppBBO.....',
  '....OBBBBBO.....',
  '.....ODDDO......',
  '......OOO.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const BAR_G: Pixmap = [
  '................',
  '................',
  '................',
  '................',
  '.....OOOOOOOO...',
  '....OHLLLLMMDO..',
  '...OLLLLLMMMDO..',
  '..OLLLLLMMMMDO..',
  '..OLLLLMMMMDDO..',
  '..ODDDDDDDDDDO..',
  '...OOOOOOOOOO...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const AXE_G: Pixmap = [
  '................',
  '......OOOO......',
  '....OOLLHMOO....',
  '...OLLLLMMMMO...',
  '...OLLOOmOMMO...',
  '...OLLOmOOMMO...',
  '...OOOOmO.OOO...',
  '.......OmO......',
  '.......OmO......',
  '........OmO.....',
  '........OmO.....',
  '.........OmO....',
  '.........OmO....',
  '..........OdO...',
  '..........OdO...',
  '...........O....',
];

const PICK_G: Pixmap = [
  '................',
  '....OOOOOOOO....',
  '..OOLLHLLMMMOO..',
  '.OLLOOOmOOOMMO..',
  '.OLO..OmO..OMO..',
  '.OO...OmO...OO..',
  '.O....OmO.....O.',
  '.......OmO......',
  '.......OmO......',
  '........OmO.....',
  '........OmO.....',
  '.........OmO....',
  '.........OmO....',
  '..........OdO...',
  '..........OdO...',
  '...........O....',
];

// Fish (sardine/herring/anchovy shape) — body M/L, belly H, eye x.
const FISH_G: Pixmap = [
  '................',
  '................',
  '................',
  '..........OO....',
  '....OOOOOOLLO...',
  '..OOLLLLLOLMO...',
  '.OxLLLLLLLOMO...',
  '.OLLHHLLMMOMO...',
  '.OLLHHLMMMMOO...',
  '..OOLLMMMMOMO...',
  '....OOOOOOLMO...',
  '..........OMO...',
  '...........OO...',
  '................',
  '................',
  '................',
];

// Shrimp — curled body, segments.
const SHRIMP_G: Pixmap = [
  '................',
  '................',
  '......OOOO......',
  '....OOLLHLOO....',
  '...OLLLLLLMMO...',
  '..OLLOLLOLMMMO..',
  '..OLMOLLOLMMMO..',
  '..OxLLLLLLMMO...',
  '..OOLLLLLMMO....',
  '...O.OLLMMO.....',
  '..O..OLMMO......',
  '.O..OLMMO.......',
  '....OMMOO.......',
  '.....OOO.O......',
  '................',
  '................',
];

// Meat slab (beef / generic).
const MEAT_G: Pixmap = [
  '................',
  '................',
  '....OOOOOOO.....',
  '..OOLLHHLLMOO...',
  '.OLLLHHLLLMMMO..',
  '.OLLLLLLLMMMMO..',
  'OLLLLLLLMMMMMDO.',
  'OLLLLLLMMMMMDDO.',
  'OLLLLLMMMMMDDDO.',
  '.OLLLMMMMMDDDO..',
  '.OLLMMMMMDDDO...',
  '..OOMMMDDDOO....',
  '....OOOOOO......',
  '................',
  '................',
  '................',
];

// Drumstick (chicken / bird meat) — meat M/L/H + bone b/B.
const DRUM_G: Pixmap = [
  '................',
  '................',
  '....OOOO........',
  '...OLHHLOO......',
  '..OLHHLLLMO.....',
  '..OLLLLLMMMO....',
  '..OLLLLMMMMO....',
  '...OLLMMMMO.....',
  '....OOLMMMO.....',
  '......OOMMOO....',
  '........OOObO...',
  '.........ObBbO..',
  '..........ObbO..',
  '...........OO...',
  '................',
  '................',
];

// Herb leaf — single sprig; 's' = grime speckles (transparent when clean).
const HERB_G: Pixmap = [
  '................',
  '................',
  '.......OO.......',
  '......OHLO......',
  '.....OLLMO......',
  '....OLLsLMO.....',
  '....OLLLMMO.....',
  '...OLsLLMMO.....',
  '...OLLLMsMO.....',
  '...OLLLMMO......',
  '....OLLMMO......',
  '.....OLMO.......',
  '......OdO.......',
  '......OdO.......',
  '.......O........',
  '................',
];

// Two stacked logs — 'e' cut-end mid, 'n' cut-end light.
const LOGS_G: Pixmap = [
  '................',
  '................',
  '................',
  '..OOOOOOOOOO....',
  '.OLLHLLLLMMMOO..',
  '.OLLLLLLMMMMenO.',
  '..ODLLLMMMMOeO..',
  '...OOOOOOOOOO...',
  '....OOOOOOOOOO..',
  '..OOLLHLLLMMMOO.',
  '.OneLLLLLMMMMMO.',
  '.OeOLLLMMMMMDO..',
  '..OOOOOOOOOOO...',
  '................',
  '................',
  '................',
];

// Ore rock — grey lump with mineral glints 'g'/'G'.
const ORE_G: Pixmap = [
  '................',
  '................',
  '......OOOO......',
  '....OOLLLMOO....',
  '...OLLHLLMMMO...',
  '..OLLLgGLMMMMO..',
  '..OLLLGgLMMMDO..',
  '.OLLLLLLMMgGMO..',
  '.OLLgGLMMMGgDO..',
  '.OLLGgLMMMMDDO..',
  '..OLLLMgGMDDO...',
  '..OLLMMGgMDDO...',
  '...OOMMMMDOO....',
  '.....OOOOO......',
  '................',
  '................',
];

// Rune — stone tablet with a glyph ('g' glyph colour varies, 'G' glow).
const RUNE_G: Pixmap = [
  '................',
  '....OOOOOOO.....',
  '...OLLLLLMMO....',
  '..OLLHLLLMMMO...',
  '..OLLLOgOLMMO...',
  '..OLLOgGgOMMO...',
  '..OLLOgOgOMMO...',
  '..OLLOgGgOMMO...',
  '..OLLLOgOLMMO...',
  '..OLLLLgLMMMO...',
  '..OLLLOgOMMMO...',
  '..ODLLLLLMMDO...',
  '...ODDMMMDDO....',
  '....OOOOOOO.....',
  '................',
  '................',
];

// Potion vial — glass v/V, liquid q (dark) Q (light), cork c.
const VIAL_G: Pixmap = [
  '................',
  '......Occ.......',
  '......OccO......',
  '......OvvO......',
  '......OvvO......',
  '.....OvvvvO.....',
  '....OvVvvvvO....',
  '...OvVqqqqvvO...',
  '...OvQQqqqvvO...',
  '...OvQqqqqqvO...',
  '...OvqqqqqqvO...',
  '...OvqqqqqvvO...',
  '....OvqqqvvO....',
  '.....OOOOOO.....',
  '................',
  '................',
];

// Seed pouch — burlap sack, seeds 'q' at the mouth.
const POUCH_G: Pixmap = [
  '................',
  '................',
  '......OOO.......',
  '.....OqqqO......',
  '....OOqOqOO.....',
  '...OmnOOOnmO....',
  '..OmnnlllnnmO...',
  '..OmnlllllnmO...',
  '.OmnnlllllnnmO..',
  '.OmnlllllllnmO..',
  '.OmnlllllllnmO..',
  '.OdmnlllllnmdO..',
  '..OdmnnnnnmdO...',
  '...OOdmmmdOO....',
  '.....OOOOO......',
  '................',
];

// ---------------------------------------------------------------------------
// Unique pixmaps
// ---------------------------------------------------------------------------

const COINS_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '...OOLHHLMOO....',
  '..OLHHLLLMMMO...',
  '..OLLLLLMMMMO...',
  '...OOLLLMMOO....',
  '....OOOOOO......',
  '..OOOOO.OOOOO...',
  '.OLHHLMOOLHLMO..',
  '.OLLLMMOOLLMMO..',
  '..OOOOO..OOOO...',
  '.OOOOOOOOOOOOO..',
  'OLHHLLLLLLMMMMO.',
  'OLLLLLLMMMMMMMO.',
  '.OOOOOOOOOOOOO..',
  '................',
];

const SHIELDWOOD_G: Pixmap = [
  '................',
  '...OOOOOOOOOO...',
  '..OnllnlmmlmmO..',
  '..OlnllmlmmmdO..',
  '..OllOOOOOmmdO..',
  '..OlnOLHMOlmdO..',
  '..OllOLMMOmmdO..',
  '..OlmOOOOOmmdO..',
  '..OllmlmmmmmdO..',
  '...OlmlmmmmdO...',
  '...OllmmlmmdO...',
  '....OlmmmmdO....',
  '.....OlmmdO.....',
  '......OmdO......',
  '.......OO.......',
  '................',
];

const TINDER_G: Pixmap = [
  '................',
  '..........rR....',
  '.........rRr....',
  '.........ORr....',
  '..OOOOOOOOOO....',
  '.OnllllllmmdO...',
  '.OllllllmmmdO...',
  '.OOOOOOOOOOOO...',
  '.OmllllmmmmdO...',
  '.OlllOselmmdO...',
  '.OllOsesOmmdO...',
  '.OlllOseOmmdO...',
  '.OmllllmmmmdO...',
  '.OdmmmmmdddOO...',
  '..OOOOOOOOOO....',
  '................',
];

const NET_G: Pixmap = [
  '................',
  '..OOOOOOOOOOOO..',
  '.OmllllllllmmdO.',
  '..OOOOOOOOOOOO..',
  '..Ow.w.w.w.wO...',
  '..w.w.w.w.w.w...',
  '..Ow.w.w.w.wO...',
  '..w.w.w.w.w.w...',
  '...Ow.w.w.wO....',
  '...w.w.w.w.w....',
  '...Ow.w.w.wO....',
  '....w.w.w.w.....',
  '....Ow.w.wO.....',
  '.....OwwwO......',
  '......OOO.......',
  '................',
];

const ROD_G: Pixmap = [
  '..............O.',
  '.............OmO',
  '............OmO.',
  '...........OmO..',
  '..........OmO...',
  '.........OmO....',
  '.w......OmO.....',
  '.w.....OmO......',
  '.w....OmO.......',
  '.w...OmO........',
  '.w..OmO.........',
  '.Ow.OdO.........',
  '.OwOdO..........',
  '..OOdO..........',
  '...OO...........',
  '................',
];

const KNIFE_G: Pixmap = [
  '................',
  '..........OO....',
  '.........OHLO...',
  '........OHLMO...',
  '.......OLLMO....',
  '......OLLMO.....',
  '.....OLLMO......',
  '....OLLMO.......',
  '....OLMO........',
  '...OLMO.........',
  '...OOO..........',
  '..OdmO..........',
  '.OdmO...........',
  '.OmdO...........',
  'OdmO............',
  '.OO.............',
];

const HAMMER_G: Pixmap = [
  '................',
  '....OOOOOOOO....',
  '...OLLHLLMMMO...',
  '..OLLLLLLMMMMO..',
  '..OLLLLLLMMMDO..',
  '..ODLLLLMMMDDO..',
  '...OOOOmOOOOO...',
  '.......OmO......',
  '.......OmO......',
  '.......OmO......',
  '.......OmO......',
  '.......OmO......',
  '.......OdO......',
  '.......OdO......',
  '........O.......',
  '................',
];

const NEEDLE_G: Pixmap = [
  '................',
  '............OO..',
  '...........OLHO.',
  '...........OOLO.',
  '..........O.OO..',
  '.........OLO....',
  '.........OLO....',
  '........OLO.....',
  '.......OLO......',
  '......OLO.......',
  '.....OLO........',
  '....OLO.........',
  '...OMO..........',
  '..OMO...........',
  '..OO............',
  '................',
];

const THREAD_G: Pixmap = [
  '................',
  '................',
  '.....OOOOO......',
  '...OOwWwwwOO....',
  '..OwWwwwwwwwO...',
  '..OwwOOOOOwwO...',
  '..OWwwwwwwwwO...',
  '..OwwOOOOOwwO...',
  '..OwWwwwwwwwO...',
  '..OwwOOOOOwwO...',
  '..OwwwwwwwwdO...',
  '...OOwwwwdOO....',
  '.....OOOOO..w...',
  '............w...',
  '...........w....',
  '................',
];

const SHEARS_G: Pixmap = [
  '................',
  '....O......O....',
  '...OLO....OMO...',
  '...OLO....OMO...',
  '...OLLO..OMMO...',
  '....OLO..OMO....',
  '....OLLOOMMO....',
  '.....OLOOMO.....',
  '......OOOO......',
  '.....OmOOmO.....',
  '....OmO..OmO....',
  '...OmO....OmO...',
  '...OmO....OmO...',
  '...OdmO..OmdO...',
  '....OOO..OOO....',
  '................',
];

const RAKE_G: Pixmap = [
  '................',
  '..OOOOOOOOOO....',
  '.OMLMLMLMLMMO...',
  '.OOLOLOLOLOO....',
  '..OLOLOLOLO.....',
  '..O.O.OmO.O.....',
  '.......OmO......',
  '.......OmO......',
  '........OmO.....',
  '........OmO.....',
  '.........OmO....',
  '.........OmO....',
  '..........OmO...',
  '..........OdO...',
  '...........OO...',
  '................',
];

const DIBBER_G: Pixmap = [
  '................',
  '......OOO.......',
  '.....OnllO......',
  '.....OlOlO......',
  '......OlO.......',
  '......OlO.......',
  '......OmO.......',
  '......OmO.......',
  '......OmO.......',
  '......OmO.......',
  '......OmO.......',
  '......OdO.......',
  '......OdO.......',
  '.......OdO......',
  '........O.......',
  '................',
];

// Bucket — 'q' liquid only used by bucket_of_milk.
const BUCKET_G: Pixmap = [
  '................',
  '...O........O...',
  '..O.OOOOOOOO.O..',
  '..OOLLLLLMMOO...',
  '.OLqqqqqqqqqMO..',
  '.OLOqqqqqqqOMO..',
  '.OLLOOOOOOOMMO..',
  '.OLLLLLLMMMMDO..',
  '.OLLLLLLMMMMDO..',
  '..OLLLLLMMMDO...',
  '..OLLLLLMMMDO...',
  '..OLLLLMMMDDO...',
  '...OLLLMMMDO....',
  '...ODDDDDDDO....',
  '....OOOOOOO.....',
  '................',
];

const SNARE_G: Pixmap = [
  '................',
  '......OOOO......',
  '....OOwwwwOO....',
  '...Oww....wwO...',
  '..Oww......wwO..',
  '..Ow........wO..',
  '..Ow........wO..',
  '..Oww......wwO..',
  '...Oww....wwO...',
  '....OOwwwwOO....',
  '......OwwO......',
  '.......OmO......',
  '.....OOOmOOO....',
  '...OOmmmdmmOO...',
  '..OmmdddddmmO...',
  '...OOOOOOOOO....',
];

// Bow — 's' = string (mapped to transparent for unstrung shortbow_u).
const BOW_G: Pixmap = [
  '................',
  '.....OOO........',
  '...OOlmO........',
  '..OlnmOs........',
  '..OlmO..s.......',
  '.OlmO....s......',
  '.OlmO.....s.....',
  '.OnmO......s....',
  '.OnmO......s....',
  '.OlmO.....s.....',
  '.OlmO....s......',
  '..OlmO..s.......',
  '..OlnmOs........',
  '...OOlmO........',
  '.....OOO........',
  '................',
];

const BOWSTRING_G: Pixmap = [
  '................',
  '.....OOOO.......',
  '....OwWwwO......',
  '...OwWOOwwO.....',
  '...OwO..OwO.....',
  '...OwO..OwO.....',
  '...OwwOOwwO.....',
  '....OwwwwO......',
  '.....OwwwO......',
  '......OwwO......',
  '......OwO.......',
  '.....OwO........',
  '.....OwO........',
  '......Ow........',
  '.......w........',
  '................',
];

const FLAX_G: Pixmap = [
  '................',
  '....pP..........',
  '...pPPp....pP...',
  '....pp....pPPp..',
  '....OgO....pp...',
  '.....OgO..OgO...',
  '......OgOOgO....',
  '.......OgOgO....',
  '.......OggO.....',
  '........OgO.....',
  '........OgO.....',
  '........OgO.....',
  '.......OgO......',
  '.......OgO......',
  '......OgO.......',
  '................',
];

const WOOL_G: Pixmap = [
  '................',
  '................',
  '....OOOOOO......',
  '..OOwWWwwwOO....',
  '.OwWWwwWwwwwO...',
  '.OwWwwwwwwwwwO..',
  'OwWwwwWwwwwdwO..',
  'OwwwwwwwwdwwdO..',
  'OwWwwwwwwwwddO..',
  '.OwwwWwwwdwdO...',
  '.OwwwwwwdddO....',
  '..OOwwdwddOO....',
  '....OOOOOO......',
  '................',
  '................',
  '................',
];

const BALLWOOL_G: Pixmap = [
  '................',
  '................',
  '.....OOOOO......',
  '...OOwWWwwOO....',
  '..OwWWOwwwwwO...',
  '..OwWOwwOOwwO...',
  '.OwWOwwOwwOwwO..',
  '.OwOwwOwwwOdwO..',
  '.OwwOwOwwOwddO..',
  '.OwwwOOwOwwdO...',
  '..OwwwwOwwdO....',
  '..OOwwwwddOO....',
  '....OOOOOO......',
  '................',
  '................',
  '................',
];

const LEATHER_G: Pixmap = [
  '................',
  '................',
  '..OOOOOOOOOOO...',
  '.OnnnnnnllmmmO..',
  '.OnnOnnllmlmmO..',
  '.OnnnnlllmmmdO..',
  '.OnnlllmlmOmdO..',
  '.OnllllmmmmmdO..',
  '.OnlOllmmmmddO..',
  '.OnlllmmmmdddO..',
  '..OOOOOOOOOOO...',
  '...Od......dO...',
  '................',
  '................',
  '................',
  '................',
];

const LBODY_G: Pixmap = [
  '................',
  '..OOO......OOO..',
  '.OnnlOOOOOOlmdO.',
  '.OnnnnllllmmmdO.',
  '.OnOnnllllmmOdO.',
  '..OOnnOOOOmmOO..',
  '...OnnlOOlmmO...',
  '...OnnllllmmO...',
  '...OnnllllmmO...',
  '...OnllOOllmO...',
  '...OnlllllmmO...',
  '...OnlllllmmO...',
  '...OdllllmmdO...',
  '....OddmmmdO....',
  '.....OOOOOO.....',
  '................',
];

const LGLOVES_G: Pixmap = [
  '................',
  '................',
  '...OO...........',
  '..OnlO.OOOO.....',
  '..OnlOOnllOO....',
  '..OnlOnlllllO...',
  '..OnllnllllmO...',
  '..OnlllllllmO...',
  '...OnllllllmO...',
  '...OnlllllmdO...',
  '...OnlllllmdO...',
  '....OllllmdO....',
  '....OOOOOOO.....',
  '....OdmmmdO.....',
  '.....OOOOO......',
  '................',
];

const LBOOTS_G: Pixmap = [
  '................',
  '................',
  '................',
  '...OOOO.........',
  '...OnllO........',
  '...OnllO........',
  '...OnllO........',
  '...OnllOO.......',
  '...OnlllmOOO....',
  '...OnllllmmdO...',
  '...OnlllllmdO...',
  '...OdllllmmdO...',
  '...OddmmmdddO...',
  '....OOOOOOOO....',
  '................',
  '................',
];

const COWHIDE_G: Pixmap = [
  '................',
  '..O.........O...',
  '.OnOOOOOOOOOnO..',
  '.OnnnnnllmmmmO..',
  '.OnnkknllmmmmO..',
  '.OnnkknlmmmmdO..',
  '.OnnnnllmkkmdO..',
  '..OnnlllmkkmdO..',
  '..OnnkkllmmmdO..',
  '..OnnkklmmmddO..',
  '.OnnnllllmmmdO..',
  '.OnnlllmmmdddO..',
  '.OnOOOOOOOOOdO..',
  '..O.........O...',
  '................',
  '................',
];

const BONES_G: Pixmap = [
  '................',
  '................',
  '..OO.......OO...',
  '.ObBbO...ObBbO..',
  '.OBbbbO.OBbbbO..',
  '..ObbbbObbbbO...',
  '...OObbbbbOO....',
  '.....ObbbO......',
  '....ObbbbbO.....',
  '...ObbbObbbO....',
  '..ObbbO.ObbbO...',
  '.OBbbO...ObbO...',
  '.ObBbO...ObBbO..',
  '..OO.......OO...',
  '................',
  '................',
];

const FEATHER_G: Pixmap = [
  '................',
  '...........OO...',
  '..........OwWO..',
  '.........OwWWO..',
  '........OwwWWO..',
  '.......OwwWWO...',
  '......OwwwWO....',
  '.....OwwwWWO....',
  '.....OwwwWO.....',
  '....OwwwWO......',
  '....OwwwO.......',
  '...OwwwO........',
  '...OwwO.........',
  '..OmO...........',
  '.OmO............',
  '..O.............',
];

const EGG_G: Pixmap = [
  '................',
  '................',
  '................',
  '......OOO.......',
  '.....OLHLO......',
  '....OLHHLMO.....',
  '....OLHLLMO.....',
  '...OLLLLMMMO....',
  '...OLLLLMMMO....',
  '...OLLLMMMMO....',
  '...OLLMMMMDO....',
  '....OLMMMDO.....',
  '.....OMMDO......',
  '......OOO.......',
  '................',
  '................',
];

const BREAD_G: Pixmap = [
  '................',
  '................',
  '................',
  '....OOOOOO......',
  '..OOLHHLLMOO....',
  '.OLHHLLLLMMMO...',
  '.OLLOLLOLMMMMO..',
  'OLLLLOLLOMMMMO..',
  'OLLLLLOLLOMMDO..',
  'OLLLLLLMMMMDDO..',
  '.OLLLLMMMMDDO...',
  '..OLLMMMMDDO....',
  '...OOOOOOOO.....',
  '................',
  '................',
  '................',
];

const CAKE_G: Pixmap = [
  '................',
  '................',
  '......r.........',
  '.....OrO........',
  '....OOOOOOO.....',
  '..OOqQQQQqOOO...',
  '.OqQQqqqQQqqqO..',
  '.OQqOqOqOqOqqO..',
  '.OLLOLOLOLOLMO..',
  '.OLLLLLLLMMMMO..',
  '.OnLLLLLMMMMnO..',
  '.OnnLLLMMMMnnO..',
  '.OdnnnnnnnnndO..',
  '..OOOOOOOOOOO...',
  '................',
  '................',
];

const SHAFT_G: Pixmap = [
  '................',
  '....O.....O.....',
  '...OmO...OmO....',
  '...OmO...OmO....',
  '...OmO...OmO....',
  '...OmO.O.OmO....',
  '...OmOOmOOmO....',
  '...OmOOmOOmO....',
  '...OmOOmOOmO....',
  '...OmOOmOOmO....',
  '...OmOOmOOmO....',
  '...OdOOmOOdO....',
  '...OdOOdOOdO....',
  '....O.OdO.O.....',
  '.......O........',
  '................',
];

const HEADLESS_G: Pixmap = [
  '................',
  '............O...',
  '...........OmO..',
  '..........OmO...',
  '.........OmO....',
  '........OmO.....',
  '.......OmO......',
  '......OmO.......',
  '.....OmO........',
  '....OmO.........',
  '..OOmO..........',
  '.OffO...........',
  'OfffOO..........',
  'OffO............',
  '.OO.............',
  '................',
];

const ESSENCE_G: Pixmap = [
  '................',
  '................',
  '......OO........',
  '.....OHWO.......',
  '....OHWWLO......',
  '...OWWLLLLO.....',
  '..OWWLLLLLMO....',
  '..OWLLLLMMMO....',
  '.OWLLLLMMMMMO...',
  '.OLLLLMMMMMDO...',
  '..OLLMMMMMDO....',
  '..OLMMMMDDDO....',
  '...OMMDDDDO.....',
  '....OODDOO......',
  '......OO........',
  '................',
];

const PLANK_G: Pixmap = [
  '................',
  '................',
  '..........OOO...',
  '.......OOOnllO..',
  '....OOOnnlllmO..',
  '.OOOnnnllllmO...',
  'OnnnllllllmmO...',
  'OnlnlllllmmdO...',
  'OnllllllmmdO....',
  'OOnlllmmmdO.....',
  '.OOOlmmddO......',
  '....OOOmdO......',
  '.......OOO......',
  '................',
  '................',
  '................',
];

const NAILS_G: Pixmap = [
  '................',
  '................',
  '..OOO...........',
  '.OLLMO..OOO.....',
  '..OMO..OLLMO....',
  '..OMO...OMO.....',
  '..OMO...OMO.....',
  '..OMO...OMO..O..',
  '..OMO...OMO.OLO.',
  '..ODO...OMO.OMO.',
  '...O....ODO.OMO.',
  '.........O..OMO.',
  '............ODO.',
  '.............O..',
  '................',
  '................',
];

const NEWT_G: Pixmap = [
  '................',
  '......OOOO......',
  '.....OccccO.....',
  '....OOOOOOOO....',
  '...OvvvvvvvvO...',
  '..OvVqqqqqqvvO..',
  '..OvqqOOOqqqvO..',
  '..OvqOwWwOqqvO..',
  '..OvqOwOwOqqvO..',
  '..OvqOwwwOqqvO..',
  '..OvqqOOOqqqvO..',
  '..OvqqqqqqqvvO..',
  '...OvvqqqvvvO...',
  '....OOOOOOOO....',
  '................',
  '................',
];

const POTATO_G: Pixmap = [
  '................',
  '................',
  '................',
  '.....OOOOO......',
  '...OOLHLLMOO....',
  '..OLLHLLLMMMO...',
  '.OLLLLdLLMMMMO..',
  '.OLLLLLLMMdMMO..',
  '.OLLdLLMMMMMDO..',
  '.OLLLLMMMMDDDO..',
  '..OLLMMMdMDDO...',
  '...OOMMMMDOO....',
  '.....OOOOO......',
  '................',
  '................',
  '................',
];

const CABBAGE_G: Pixmap = [
  '................',
  '................',
  '.....OOOOO......',
  '...OOLHLLMOO....',
  '..OLLHLLLLMMO...',
  '.OLLOLLLOLMMMO..',
  '.OLOLLLLLOMMMO..',
  'OLLOLLOOLLOMMDO.',
  'OLLLOLLLLOMMMDO.',
  'OLLLLOLLOMMMDDO.',
  '.OLLLLOOMMMDDO..',
  '.ODLLLMMMMDDO...',
  '..ODLMMMMDDO....',
  '...OODDDDOO.....',
  '.....OOOO.......',
  '................',
];

const BAIT_G: Pixmap = [
  '................',
  '................',
  '...OOOOOOOOO....',
  '..OmnnnnnlmmO...',
  '..OnllllllmdO...',
  '..OnlqlqllmdO...',
  '..OnqlqlqlmdO...',
  '..OnlqlqllmdO...',
  '..OnllqlqlmdO...',
  '..OnlllllmmdO...',
  '..OdmmmmmmddO...',
  '...OOOOOOOOO....',
  '................',
  '................',
  '................',
  '................',
];

// --- Phase 5 unique grids ---------------------------------------------------

// Horned brute helm — gunmetal dome, bone horns b/B, eye slits x.
const WARLORD_HELM_G: Pixmap = [
  '................',
  '.OO..........OO.',
  'OBbO........ObBO',
  'OBbO..OOOO..ObBO',
  'OBbbOOLLMMOObbBO',
  '.ObbOLLHLMMObbO.',
  '..OOLLHLLMMMOO..',
  '..OLLLLLLMMMO...',
  '..OLLLLLLMMMO...',
  '..OOxxOOOxxOO...',
  '..OLLLOxOLMMO...',
  '..OLLLOxOLMMO...',
  '...OLLOxOLMO....',
  '...OLLLOLMMO....',
  '....OOOOOOO.....',
  '................',
];

// Flame-edged blade — smoked-steel sword with ember licks r/R off the edge.
const DRAKE_SWORD_G: Pixmap = [
  '................',
  '............rO..',
  '...........OHLr.',
  '..........OLMOR.',
  '....r....OLMOr..',
  '...rR...OLMOR...',
  '.......OLMOr....',
  '......OLMOR.....',
  '..O..OLMOr......',
  '..OyOLMO........',
  '...OYyO.........',
  '..OdOYyO........',
  '.OdmO.OO........',
  '.OmdO...........',
  'OdmO............',
  '.OO.............',
];

// Single large drake scale — teardrop plate, ridged.
const DRAKE_SCALE_G: Pixmap = [
  '................',
  '...OOOOOOOOO....',
  '..OLLHHLLMMMO...',
  '..OLHLLLLMMMO...',
  '..OLLLLLMMMDO...',
  '..OLLOLLOMMDO...',
  '..OLLLLLMMMDO...',
  '...OLLOLLMDO....',
  '...OLLLLMMDO....',
  '....OLLLMDO.....',
  '....OLLMMDO.....',
  '.....OLMDO......',
  '.....OLMDO......',
  '......OMO.......',
  '.......O........',
  '................',
];

// Mossy pelt — ragged hide pegged at the corners, moss tufts p, dark patches k.
const HORROR_HIDE_G: Pixmap = [
  '................',
  '..O..O....O.O...',
  '.OnOOnOOOOnOnO..',
  '.OnnpnnllmmmmO..',
  '.OnpppnllmmmdO..',
  '.OnnpnnlmkkmdO..',
  '..OnnnllmkkmdO..',
  '..OnnllpplmmdO..',
  '..OnnlpppmmddO..',
  '.OnnnllpplmmdO..',
  '.OnnlllmmmkddO..',
  '.OnOOnOOOOdOdO..',
  '..O..O....O.O...',
  '................',
  '................',
  '................',
];

// Tattered war standard — wooden pole, ragged red cloth, dark sigil x.
const WARLORD_BANNER_G: Pixmap = [
  '................',
  '....O...........',
  '...OmOOOOOOOO...',
  '...OmOsRRrRRrO..',
  '...OmORsRRrRO...',
  '...OmORxxRrRrO..',
  '...OmORxxRrRO...',
  '...OmOsRRrRrrO..',
  '...OmORRrRrO....',
  '...OmOsRrrO.....',
  '...OmOORrOO.....',
  '...OmO.OO.......',
  '...OmO..........',
  '...OmO..........',
  '...OdO..........',
  '....O...........',
];

// Gnarled glowing heart — knotted bark lump veined with green light g/G.
const BOG_HEART_G: Pixmap = [
  '................',
  '................',
  '..OOO....OOO....',
  '.ODDMOOOOMMDO...',
  '.ODMgGMMMgMDDO..',
  'ODMgGGgMMMgMDO..',
  'ODMGgMMgGMMMDO..',
  'ODMMgMMMGgMDDO..',
  '.ODMgGgMMgMDO...',
  '.ODDMgGgGMDDO...',
  '..ODDMgGMDDO....',
  '...ODDMgMDDO....',
  '....ODDgDDO.....',
  '.....ODDDO......',
  '......ODO.......',
  '.......O........',
];

// Faceted ember-lit crystal — garnet shard with a molten core r/R/W.
const EMBER_CRYSTAL_G: Pixmap = [
  '................',
  '.......O........',
  '......OHO.......',
  '.....OHLLO......',
  '.....OLLMO......',
  '....OHLLMMO.....',
  '....OLLMMMO.....',
  '...OLLrRrMMO....',
  '...OLrRRRrMO....',
  '..OLLrRWRrMMO...',
  '..OLLMrRrMMDO...',
  '..OLLMMMMMDDO...',
  '...OLMMMDDDO....',
  '....OMMDDDO.....',
  '.....OOOOO......',
  '................',
];

// --- Phase 6 unique grids ----------------------------------------------------

// Lobster — twin claws up top, segmented body, fanned tail. Eye x.
const LOBSTER_G: Pixmap = [
  '................',
  '..OOO......OOO..',
  '.OLHLO....OLMMO.',
  '.OLLLLO..OLMMMO.',
  '.OLOLLO..OMMOMO.',
  '..O.OLLOOMMO.O..',
  '.....OLLMMO.....',
  '....OLLLMMMO....',
  '....OLHLLMMO....',
  '....OxLLLMMO....',
  '....OLLLMMMO....',
  '.....OLLMMO.....',
  '....OLLOMMMO....',
  '...OLLO..OMMO...',
  '...OOO....OOO...',
  '................',
];

// Swordfish — long flat bill running off the left, forked tail right.
const SWORDFISH_G: Pixmap = [
  '................',
  '................',
  '........OOOO....',
  '......OOLLMMO...',
  '.....OLHHLLMMO..',
  '.....OxLHLLMMOO.',
  'OLLLLOLLLLMMMOLO',
  '.....OLLLMMMOMO.',
  '......OLLMMMOO..',
  '.......OOOO.....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Shark — tall dorsal fin silhouette over a heavy body, tail right.
const SHARK_G: Pixmap = [
  '................',
  '.......OO.......',
  '......OLMO......',
  '.....OLLMO......',
  '....OLLLMO......',
  '....OOOOOOO.OO..',
  '..OOLLLLLMMOLMO.',
  '.OxLLLLLLMMMLMO.',
  '.OLLHHLLMMMMMO..',
  '.OLLHHLMMMMOMO..',
  '..OOLLMMMMOOLO..',
  '....OOOOOO..OO..',
  '................',
  '................',
  '................',
  '................',
];

// Lobster pot — slatted wooden cage with a dark mouth.
const LOBSTERPOT_G: Pixmap = [
  '................',
  '....OOOOOOOO....',
  '...OnllllllmO...',
  '..OmOOOOOOOOmO..',
  '..OlOnllllmOlO..',
  '..OlOOOOOOOOlO..',
  '..OlOnllllmOlO..',
  '..OlOOOOOOOOlO..',
  '..OlOnllllmOlO..',
  '..OmOOOOOOOOmO..',
  '..OdmllllmmdO...',
  '...OOOOOOOOO....',
  '................',
  '................',
  '................',
  '................',
];

// Harpoon — barbed steel head on a long wooden shaft.
const HARPOON_G: Pixmap = [
  '................',
  '............OO..',
  '...........OHLO.',
  '..........OLLMO.',
  '.........OLOMMO.',
  '..........OLMOO.',
  '.........OLMO...',
  '........OmOLO...',
  '.......OmO.O....',
  '......OmO.......',
  '.....OmO........',
  '....OmO.........',
  '...OmO..........',
  '..OdO...........',
  '..OO............',
  '................',
];

// Chisel — wooden grip, flat steel blade.
const CHISEL_G: Pixmap = [
  '................',
  '................',
  '..........OO....',
  '.........OnlO...',
  '........OnllO...',
  '.......OnllmO...',
  '......OnllmO....',
  '......OllmO.....',
  '.....OOOmO......',
  '.....OHLO.......',
  '....OHLMO.......',
  '...OLLMO........',
  '...OLMO.........',
  '..OLMO..........',
  '..OOO...........',
  '................',
];

// Uncut gem — rough crystalline lump.
const UNCUT_G: Pixmap = [
  '................',
  '................',
  '......OOOO......',
  '....OOLLMMO.....',
  '...OLHLLMMMO....',
  '..OLHLLLMMMDO...',
  '..OLLLLMMMMDO...',
  '.OLLLLMMMMDDO...',
  '.OLLLMMMMDDDO...',
  '..OLLMMMDDDO....',
  '...OOMMDDOO.....',
  '.....OOOO.......',
  '................',
  '................',
  '................',
  '................',
];

// Cut gem — faceted teardrop brilliant.
const GEM_G: Pixmap = [
  '................',
  '................',
  '....OOOOOOO.....',
  '...OHLLLMMMO....',
  '..OHLOLOMOMMO...',
  '..OLLLLMMMMDO...',
  '...OLLLMMMDO....',
  '....OLLMMDO.....',
  '.....OLMDO......',
  '......OMO.......',
  '.......O........',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Ring — gold band, gem dot q/Q set on top.
const RING_G: Pixmap = [
  '................',
  '................',
  '.....OqQO.......',
  '.....OQqO.......',
  '....OOOOOO......',
  '...OyYZYyOO.....',
  '..OyYOOOOYyO....',
  '..OYO....OyO....',
  '..OYO....OyO....',
  '..OyO....OyO....',
  '..OyYO..OYyO....',
  '...OyYYOYyO.....',
  '....OOOOOO......',
  '................',
  '................',
  '................',
];

// Amulet — chain loop over a gold teardrop pendant with gem q/Q.
const AMULET_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '....Oy...yO.....',
  '...Oy.....yO....',
  '...Oy.....yO....',
  '...Oy.....yO....',
  '....Oy...yO.....',
  '.....OyOyO......',
  '.....OYYYO......',
  '....OYZqYyO.....',
  '....OYqQqyO.....',
  '....OyqqqyO.....',
  '.....OyqyO......',
  '......OyO.......',
  '.......O........',
  '................',
];

// Sweetcorn — kernel cob angled, husk leaves at the base.
const CORN_G: Pixmap = [
  '................',
  '................',
  '..........OO....',
  '........OOqQO...',
  '.......OqQqQO...',
  '......OQqQqO....',
  '.....OqQqQqO....',
  '....OQqQqQO.....',
  '...OqQqQqO......',
  '..OgQqQqO.......',
  '..OggOOO........',
  '.OgGggO.........',
  '.OGgO...........',
  '..OO............',
  '................',
  '................',
];

// Watermelon — wedge slice: red flesh, dark seeds s, white pith w, green rind.
const MELON_G: Pixmap = [
  '................',
  '................',
  '..OOOOOOOOOOO...',
  '.ORRrRrRrRRrRO..',
  '.ORrRsRrRsRrO...',
  '..ORrRrRsRrRO...',
  '..ORsRrRrRsO....',
  '...ORrRsRrRO....',
  '...OwRrRrwO.....',
  '....OwwwwO......',
  '....OKkkKO......',
  '.....OOOO.......',
  '................',
  '................',
  '................',
  '................',
];

// Big bones — chunkier crossed bones than BONES_G.
const BIGBONES_G: Pixmap = [
  '................',
  '.OOO........OOO.',
  'ObBbbO....ObBbbO',
  'OBbbbbO..OBbbbbO',
  '.ObbbbbOObbbbbO.',
  '..OObbbbbbbbOO..',
  '....ObbbbbbO....',
  '.....ObbbbO.....',
  '....ObbbbbbO....',
  '...ObbbbObbbbO..',
  '..ObbbbO.ObbbbO.',
  '.OBbbbO...ObbbO.',
  'ObBbbO....ObBbbO',
  '.OOO........OOO.',
  '................',
  '................',
];

// Rimeglass blade — pale translucent ice-glass sword, white inner gleam W.
const RIMEBLADE_G: Pixmap = [
  '................',
  '.............O..',
  '...........OHWO.',
  '..........OWLO..',
  '.........OWLMO..',
  '........OWLO....',
  '.......OLMWO....',
  '......OWLO......',
  '..O..OLMO.......',
  '..OyOWLO........',
  '...OYyO.........',
  '..OdOYyO........',
  '.OdmO.OO........',
  '.OmdO...........',
  'OdmO............',
  '.OO.............',
];

// Red sash — folded band of cloth with two hanging tails.
const SASH_G: Pixmap = [
  '................',
  '................',
  '..OOOOOOOOOOO...',
  '.OsRRrRRrRrrdO..',
  '.ORRRrRrrrrdO...',
  '..OOOOOOOOOO....',
  '...OsRRrRrdO....',
  '..ORRrRrrrdO....',
  '..ORrRrrrdO.....',
  '...OOOOOOO......',
  '..ORrrdO.OrdO...',
  '..ORrdO..OdO....',
  '...OOO....O.....',
  '................',
  '................',
  '................',
];

// Molten core — cracked rock orb veined with magma light r/R/W.
const CORE_G: Pixmap = [
  '................',
  '................',
  '.....OOOOO......',
  '...OOMMLMMOO....',
  '..OMMrRMMMMDO...',
  '..OMrRWRrMMDO...',
  '.OMMRrMMrRMDDO..',
  '.OMMrMMMMRrDDO..',
  '.OMMMrRrRMMDDO..',
  '..OMMMrMMMDDO...',
  '..ODMMMMMDDDO...',
  '...OODDDDDOO....',
  '.....OOOOO......',
  '................',
  '................',
  '................',
];

// Molten gauntlets — dark plate glove, ember studs r/R across the knuckles.
const MGAUNT_G: Pixmap = [
  '................',
  '................',
  '...OO...........',
  '..OLMO.OOOO.....',
  '..OLMOOLLMOO....',
  '..OLMOLLLLMMO...',
  '..OLrLRrLRMMO...',
  '..OLLLLLLLMMO...',
  '...OLLLLLLMDO...',
  '...OLLLLLMMDO...',
  '...OLLLLLMMDO...',
  '....OLLLMMDO....',
  '....OOOOOOO.....',
  '....ODMMMDO.....',
  '.....OOOOO......',
  '................',
];

// Magic logs — the log stack with faint glow flecks G in the grain.
const MAGIC_LOGS_G: Pixmap = [
  '................',
  '................',
  '................',
  '..OOOOOOOOOO....',
  '.OLLHGLLLMMMOO..',
  '.OLLGLLLMMGMenO.',
  '..ODLLLMGMMOeO..',
  '...OOOOOOOOOO...',
  '....OOOOOOOOOO..',
  '..OOLLGLLLMMMOO.',
  '.OneLLLLGMMMMMO.',
  '.OeOLLGMMMMMDO..',
  '..OOOOOOOOOOO...',
  '................',
  '................',
  '................',
];

// --- Phase 7 shared grids ----------------------------------------------------

// Parchment document — n/l/m/d paper ramp, t ink lines, x wax seal / mark.
const DOC_G: Pixmap = [
  '................',
  '...OOOOOOOOO....',
  '..OnnnnnnnnlO...',
  '..OnttttnnnlO...',
  '..OnnnnnnnnlO...',
  '..OntttttnnlO...',
  '..OnnnnnnnllO...',
  '..OntttnnnllO...',
  '..OnnnnnnnlmO...',
  '..OnttttnllmO...',
  '..OnnnnxxllmO...',
  '..OnnnnxxlmmO...',
  '..OdnnnnllmmO...',
  '...OOOOOOOOO....',
  '................',
  '................',
];

// Closed tome — s spine, L/M/D cover ramp, y emblem, p page block.
const BOOK_G: Pixmap = [
  '................',
  '...OOOOOOOOOO...',
  '..OsLLLLLLLMMO..',
  '..OsLLLLLLLMMO..',
  '..OsLLOyyOLMMO..',
  '..OsLLOyyOLMMO..',
  '..OsLLLLLLLMMO..',
  '..OsLLLLLLLMMO..',
  '..OsLLLLLLLMMO..',
  '..OsLLLLLLMMDO..',
  '..OsDDDDDDDDDO..',
  '..OsppppppppdO..',
  '...OOOOOOOOOO...',
  '................',
  '................',
  '................',
];

// Skeleton key — bow up top, shaft down, ward tooth near the foot.
const KEY_G: Pixmap = [
  '................',
  '.....OOOO.......',
  '....OLLMMO......',
  '....OLO.OMO.....',
  '....OLO.OMO.....',
  '....OLLMMO......',
  '.....OLMO.......',
  '.....OLMO.......',
  '.....OLMO.......',
  '.....OLMO.......',
  '.....OLMMO......',
  '.....OLMOMO.....',
  '.....OLMO.......',
  '.....OLMMO......',
  '......OOO.......',
  '................',
];

// Charm on a cord — w cord loop, b binding band, tapered pendant L/M/H.
const CHARM_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '....Ow...wO.....',
  '....Ow...wO.....',
  '....Ow...wO.....',
  '.....Ow.wO......',
  '.....ObbbO......',
  '.....OLLMO......',
  '.....OLLMO......',
  '.....OLMMO......',
  '......OLMO......',
  '......OLMO......',
  '.......OMO......',
  '.......OMO......',
  '........O.......',
  '................',
];

// Single curved fang / tooth.
const FANG_G: Pixmap = [
  '................',
  '................',
  '.....OOO........',
  '....OHLMO.......',
  '....OLLMO.......',
  '....OLLMMO......',
  '.....OLLMO......',
  '.....OLLMO......',
  '......OLMO......',
  '......OLMO......',
  '.......OLMO.....',
  '.......OMO......',
  '........OMO.....',
  '........OO......',
  '................',
];

// Curved fang-dagger — broad hooked blade, y guard, d/m grip.
const FANGBLADE_G: Pixmap = [
  '................',
  '.........OO.....',
  '........OHLO....',
  '.......OHLMO....',
  '......OLLMO.....',
  '......OLMMO.....',
  '.....OLMMO......',
  '.....OLMO.......',
  '....OLMO........',
  '....OOO.........',
  '...OyO..........',
  '..OdmO..........',
  '..OmdO..........',
  '.OdmO...........',
  '..OO............',
  '................',
];

// Hanging cloak — y clasps, i lining visible down both inner edges.
const CLOAK_G: Pixmap = [
  '................',
  '....OOOOOOO.....',
  '...OyOOOOOyO....',
  '..OOLLLOMMMOO...',
  '..OLLLLOMMMMO...',
  '..OLiLLOMMiMO...',
  '..OLiLLOMMiMO...',
  '..OLiLLOMMiMO...',
  '..OLiLLOMMiMO...',
  '..OLiLLOMMiMO...',
  '..OLiLLOMMiMO...',
  '..ODiLLOMMiDO...',
  '..ODDLLOMMDDO...',
  '...OOOOOOOOO....',
  '................',
  '................',
];

// Looped scarf — stripe chars r/o/g/u/v, d shaded tail.
const SCARF_G: Pixmap = [
  '................',
  '..OOOOOOOOOOO...',
  '.OrrooggguuvvO..',
  '.OrooggguuvvdO..',
  '..OOOOOOOOOOO...',
  '....OrroO.......',
  '....OoggO.......',
  '....OgguO.......',
  '....OuvvO.......',
  '....OrroO.......',
  '....OoggO.......',
  '....OguuO.......',
  '....OvddO.......',
  '.....OOO........',
  '................',
  '................',
];

// Bone club — knobbed femur swung diagonal.
const CLUB_G: Pixmap = [
  '................',
  '...OOOO.........',
  '..OBbbbO........',
  '..ObbbbbO.......',
  '..ObbbbbO.......',
  '...ObbbbO.......',
  '....ObbbO.......',
  '.....ObbbO......',
  '......ObbO......',
  '......ObbO......',
  '.......ObbO.....',
  '.......ObbbO....',
  '........ObbbbO..',
  '........OBbbbO..',
  '.........OOOO...',
  '................',
];

// Broad cleaver on a banner-pole haft — r/R cloth scraps lashed below the head.
const CLEAVER_G: Pixmap = [
  '..OOOOOOOOO.....',
  '.OLHHLLLMMMO....',
  '.OLLLLLLMMMO....',
  '.OLLLLLMMMMO....',
  '.OLLLLLMMMDO....',
  '..OOOOmOOOO.....',
  '......OmO.......',
  '......OmO.......',
  '.....OROmO......',
  '....ORrOmO......',
  '....ORrOmO......',
  '.....OROmO......',
  '......OOmO......',
  '.......OdO......',
  '.......OdO......',
  '........O.......',
];

// Two-hand maul — massive square head, r inlay studs, thick haft.
const MAUL_G: Pixmap = [
  '................',
  '...OOOOOOOOO....',
  '..OLHHLLLMMMO...',
  '..OLLLLLLMMMO...',
  '..OLLrLLMrMDO...',
  '..OLLLLLLMMDO...',
  '..ODLLLLMMDDO...',
  '...OOOOmOOOO....',
  '.......OmO......',
  '.......OmO......',
  '.......OmO......',
  '.......OmO......',
  '.......OmO......',
  '.......OdO......',
  '.......OdO......',
  '........O.......',
];

// Staff — diagonal shaft, q/Q orb mounted at the tip.
const STAFF_G: Pixmap = [
  '................',
  '.........OOO....',
  '........OqQQO...',
  '........OQqqO...',
  '.........OqO....',
  '........OmO.....',
  '.......OmO......',
  '......OmO.......',
  '.....OmO........',
  '....OmO.........',
  '...OmO..........',
  '..OmO...........',
  '..OdO...........',
  '.OdO............',
  '..O.............',
  '................',
];

// Round buckler — g/G inlaid glyph bar across the boss.
const WARD_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '...OOLLLMMOO....',
  '..OLLHLLLMMMO...',
  '..OLLOOOOOMMO...',
  '.OLLOgGgGgOMMO..',
  '.OLLLOOOOOMMDO..',
  '.OLLLLLLMMMDDO..',
  '..OLLLLMMMDDO...',
  '..OLLLMMMDDDO...',
  '...OOLMMDDOO....',
  '.....OOOOO......',
  '................',
  '................',
  '................',
  '................',
];

// Hooded lantern — m handle, L/M frame, q/Q/W flame, D base.
const LAMP_G: Pixmap = [
  '................',
  '......OOO.......',
  '.....OmOmO......',
  '.....OOOOO......',
  '....OOOOOOO.....',
  '...OLOOOOOMO....',
  '...OLOqQQOMO....',
  '...OLOQWQOMO....',
  '...OLOqQqOMO....',
  '...OLOOOOOMO....',
  '....OOOOOOO.....',
  '.....ODDDO......',
  '......OOO.......',
  '................',
  '................',
  '................',
];

// Spyglass — collapsing brass-ringed tube, held diagonal.
const SPYGLASS_G: Pixmap = [
  '................',
  '...........OO...',
  '..........OLLO..',
  '.........OLMMO..',
  '........OLMMO...',
  '.......OyYyO....',
  '......OLLMO.....',
  '.....OLLMO......',
  '....OyYyO.......',
  '...OLLMO........',
  '..OLMMO.........',
  '..OLMO..........',
  '.OLMO...........',
  '.OOO............',
  '................',
  '................',
];

// Bell — m handle loop, flared skirt, b clapper.
const BELL_G: Pixmap = [
  '................',
  '......OOO.......',
  '.....OmmmO......',
  '......OOO.......',
  '.....OLHMO......',
  '....OLLHMMO.....',
  '....OLLLMMO.....',
  '...OLLLLMMMO....',
  '...OLLLLMMMO....',
  '..OLLLLLMMMDO...',
  '..ODDDDDDDDDO...',
  '..OOOOOOOOOOO...',
  '......ObO.......',
  '.......O........',
  '................',
  '................',
];

// Tuning fork — twin tines, short grip.
const FORK_G: Pixmap = [
  '................',
  '....OO..OO......',
  '...OLLOOMMO.....',
  '...OLO..OMO.....',
  '...OLO..OMO.....',
  '...OLO..OMO.....',
  '...OLO..OMO.....',
  '...OLLOOMMO.....',
  '....OLMMO.......',
  '.....OMO........',
  '.....OMO........',
  '.....OMO........',
  '....ODDO........',
  '.....OO.........',
  '................',
  '................',
];

// Powder horn — curved horn, y/Y brass cap and tip.
const HORN_G: Pixmap = [
  '................',
  '................',
  '....OOOO........',
  '...OyYyLO.......',
  '..OLLLLMO.......',
  '..OLLLLMMO......',
  '...OLLLMMMO.....',
  '....OLLLMMO.....',
  '.....OLLMMMO....',
  '......OLLMMO....',
  '.......OLMMO....',
  '........OyYO....',
  '.........OO.....',
  '................',
  '................',
  '................',
];

// Crest badge / token — small shield blank with y emblem studs.
const BADGE_G: Pixmap = [
  '................',
  '................',
  '....OOOOOOO.....',
  '...OLLHLLMMO....',
  '...OLLLLLMMO....',
  '...OLOyyOLMO....',
  '...OLOyyOLMO....',
  '...OLLLLLMMO....',
  '....OLLLMMO.....',
  '....OLLLMMO.....',
  '.....OLLMO......',
  '......OLMO......',
  '.......OO.......',
  '................',
  '................',
  '................',
];

// Hood / head wrap — x dark face opening.
const HOOD_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '....OLLLMMO.....',
  '...OLLLLLMMO....',
  '..OLLLLLLMMMO...',
  '..OLLOOOOOMMO...',
  '..OLOxxxxxOMO...',
  '..OLOxxxxxOMO...',
  '..OLOxxxxxOMO...',
  '..OLLOxxxOMMO...',
  '..OLLLOOOMMMO...',
  '..ODLLLLMMMDO...',
  '...ODDMMMDDO....',
  '....OOOOOOO.....',
  '................',
  '................',
];

// Powder keg — banded barrel, n/l/m/d staves.
const KEG_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '....OnlllmO.....',
  '...OOOOOOOOO....',
  '..OllnlllmmdO...',
  '..OlnllllmmdO...',
  '..OOOOOOOOOOO...',
  '..OllnlllmmdO...',
  '..OllnlllmmdO...',
  '..OOOOOOOOOOO...',
  '..OlnllllmmdO...',
  '...OllllmmdO....',
  '....OOOOOOO.....',
  '................',
  '................',
  '................',
];

// Blasting charge — bound bundle of R/r sticks, w cord and trailing fuse.
const CHARGE_G: Pixmap = [
  '................',
  '..........ww....',
  '.........ww.....',
  '.........w......',
  '...OOOOOwOOOO...',
  '...ORrORrORrO...',
  '...ORrORrORrO...',
  '...OwwwwwwwwO...',
  '...ORrORrORrO...',
  '...ORrORrORrO...',
  '...OwwwwwwwwO...',
  '...ORrORrORrO...',
  '...OOOOOOOOOO...',
  '................',
  '................',
  '................',
];

// Lily — W petals, q stamen, g/G stem and leaf.
const LILY_G: Pixmap = [
  '................',
  '....O...O.......',
  '...OWO.OWO......',
  '...OWWOWWO......',
  '....OWWWO.......',
  '....OqWqO.......',
  '.....OWO........',
  '......OgO.......',
  '......OgO.......',
  '.....OgO........',
  '...OGgOgO.......',
  '.....OgO........',
  '.....OgO........',
  '......O.........',
  '................',
  '................',
];

// Burning brand — r/R/W flame over an e ember head, m/d handle.
const TORCH_G: Pixmap = [
  '................',
  '.......rr.......',
  '......rRRr......',
  '.....rRWRr......',
  '.....ORRRO......',
  '.....OeeeO......',
  '......OmO.......',
  '......OmO.......',
  '......OmO.......',
  '......OmO.......',
  '......OmO.......',
  '......OdO.......',
  '......OdO.......',
  '.......O........',
  '................',
  '................',
];

// Dust pile — low heap with g speckle glints.
const DUST_G: Pixmap = [
  '................',
  '................',
  '................',
  '................',
  '......OOO.......',
  '....OOLLMOO.....',
  '...OLLgLLMMO....',
  '..OLLLLgMMMDO...',
  '..OLgLLLMgMDO...',
  '.OLLLLgMMMMDDO..',
  '.OOOOOOOOOOOOO..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Hanging robes — sleeves out wide, centre seam.
const ROBE_G: Pixmap = [
  '................',
  '.....OOOOO......',
  '....OLLOMMO.....',
  '..OOLLLOMMMOO...',
  '.OLLOLLOMMOMMO..',
  '.OLLOLLOMMOMMO..',
  '.ODLOLLOMMODMO..',
  '..OOOLLOMMOOO...',
  '....OLLOMMO.....',
  '....OLLOMMO.....',
  '....OLLOMMO.....',
  '....OLLOMMO.....',
  '...ODLLOMMDO....',
  '...OOOOOOOOO....',
  '................',
  '................',
];

// ---------------------------------------------------------------------------
// Variant palettes
// ---------------------------------------------------------------------------

const FISH_RAMPS: Record<string, Palette> = {
  // shrimps
  raw_shrimps:   { O: '#33161a', D: '#a55c58', M: '#cd837e', L: '#e7aba4', H: '#f8d3cc', x: '#1c0d0f' },
  shrimps:       { O: '#3a1a08', D: '#b35a26', M: '#dd7f3e', L: '#f0a566', H: '#fbcf9a', x: '#200e04' },
  // anchovies
  raw_anchovies: { O: '#161c2a', D: '#56627c', M: '#7d8aa5', L: '#a7b3c9', H: '#d4dde9', x: '#0c1018' },
  anchovies:     { O: '#101622', D: '#3c4a68', M: '#5a6a8c', L: '#8290ac', H: '#aeb9cd', x: '#090d16' },
  // sardine
  raw_sardine:   { O: '#1a2024', D: '#697a85', M: '#94a6b0', L: '#bccbd3', H: '#e4eef3', x: '#0e1316' },
  sardine:       { O: '#2c1a08', D: '#8e5e28', M: '#b9823e', L: '#d8a85e', H: '#f1cf8e', x: '#190e04' },
  // herring
  raw_herring:   { O: '#19211c', D: '#5e7868', M: '#86a18e', L: '#aec6b4', H: '#d8eadd', x: '#0d1410' },
  herring:       { O: '#2a1c0a', D: '#84602c', M: '#ac8442', L: '#cda964', H: '#ecd397', x: '#170f05' },
  burnt_fish:    pal(BURNT, { x: '#000000' }),
};

// Phase 6 fish — each species has its own silhouette grid.
const LOBSTER_RAMPS: Record<string, Palette> = {
  raw_lobster: { O: '#240e10', D: '#6e3038', M: '#8e4850', L: '#b06c70', H: '#d49a98', x: '#120608' },
  lobster:     { O: '#330a08', D: '#9c2c1c', M: '#c8442a', L: '#e46c44', H: '#f8a070', x: '#1a0504' },
};
const SWORDFISH_RAMPS: Record<string, Palette> = {
  raw_swordfish: { O: '#101a24', D: '#3c5570', M: '#5a7a96', L: '#86a6bc', H: '#bcd6e4', x: '#080e14' },
  swordfish:     { O: '#2a1808', D: '#8a5c24', M: '#b07e38', L: '#d2a458', H: '#eecf8c', x: '#160c04' },
};
const SHARK_RAMPS: Record<string, Palette> = {
  raw_shark: { O: '#141a1e', D: '#46545e', M: '#687a86', L: '#92a6b0', H: '#c4d6dc', x: '#0a0e10' },
  shark:     { O: '#221410', D: '#6e4a36', M: '#94684c', L: '#ba8e6c', H: '#e0bc9a', x: '#110a06' },
};

const MEAT_RAMPS: Record<string, Palette> = {
  raw_beef:    { O: '#33090c', D: '#8e2228', M: '#bb3b40', L: '#d9686a', H: '#f0a3a0' },
  cooked_meat: { O: '#2c1305', D: '#7e4416', M: '#a35e24', L: '#c48140', H: '#e3b377' },
  burnt_meat:  BURNT,
};

const DRUM_RAMPS: Record<string, Palette> = {
  raw_chicken:     { O: '#3a2218', D: '#c19077', M: '#dcae94', L: '#efcab2', H: '#fbe6d4', b: '#cdc3ae', B: '#efe8d6' },
  cooked_chicken:  { O: '#2e1606', D: '#8a4f1c', M: '#b0702e', L: '#d1954c', H: '#eec283', b: '#d4c8ae', B: '#f2ebd8' },
  raw_bird_meat:   { O: '#371d16', D: '#a87765', M: '#c79785', L: '#e0b8a4', H: '#f4dcc8', b: '#c8bda6', B: '#ebe3cf' },
  roast_bird_meat: { O: '#26120a', D: '#6e3c14', M: '#965a24', L: '#bb8040', H: '#deb273', b: '#cabfa6', B: '#ece4d0' },
};

const HERB_RAMPS: Record<string, Palette> = {
  guam_leaf:        { O: '#0c2010', D: '#2c6a32', M: '#43924a', L: '#6cb86a', H: '#a4dc9a', d: '#3c5a28' },
  grimy_guam:       { O: '#13200e', D: '#3c5c2e', M: '#54763e', L: '#728f55', H: '#93ab74', d: '#41512a', s: '#6f5b35' },
  marrentill:       { O: '#0a1e1c', D: '#1f655c', M: '#338a7c', L: '#5cb0a0', H: '#94d6c6', d: '#2c5648' },
  grimy_marrentill: { O: '#101e18', D: '#33584a', M: '#48725f', L: '#668c77', H: '#88a893', d: '#3a503e', s: '#6f5b35' },
  ranarr_weed:      { O: '#0a2418', D: '#1e7048', M: '#2f9660', L: '#5abc86', H: '#96e0b4', d: '#2c5a3a' },
  grimy_ranarr:     { O: '#10231a', D: '#33604a', M: '#4a7e62', L: '#699a7e', H: '#8cb89e', d: '#3a5644', s: '#6f5b35' },
  irit_leaf:        { O: '#0c1c24', D: '#226a78', M: '#338ea0', L: '#5cb4c4', H: '#94d8e4', d: '#2a5460' },
  grimy_irit:       { O: '#101e22', D: '#335a64', M: '#48767f', L: '#66929a', H: '#88aeb4', d: '#3a5054', s: '#6f5b35' },
};

const LOG_RAMPS: Record<string, Palette> = {
  logs:        { O: '#1d1206', D: '#5e3d1c', M: '#86592a', L: '#ab7a3e', H: '#d0a263', e: '#caa05c', n: '#e3c084' },
  oak_logs:    { O: '#170d05', D: '#492c12', M: '#67421d', L: '#88602e', H: '#ab8348', e: '#b08a4a', n: '#d0ac6c' },
  willow_logs: { O: '#161710', D: '#4d5038', M: '#6e7250', L: '#94976c', H: '#bcbd90', e: '#b3b282', n: '#d6d4a4' },
  maple_logs:  { O: '#221004', D: '#6e3c14', M: '#9a5e1e', L: '#c4862e', H: '#e8b054', e: '#dca452', n: '#f0cc84' },
  yew_logs:    { O: '#140a08', D: '#3e2018', M: '#5c3424', L: '#7e4e34', H: '#a4724c', e: '#8c5e3e', n: '#b08862' },
  // magic_logs renders on MAGIC_LOGS_G (glow flecks G).
  magic_logs:  { O: '#06141a', D: '#0e3a44', M: '#16566a', L: '#2c7c92', H: '#54aabc', e: '#3e8ca0', n: '#6cc4d4', G: '#9ef2e8' },
};

const ORE_RAMPS: Record<string, Palette> = {
  copper_ore: { O: '#1c1812', D: '#564f44', M: '#7a7264', L: '#a09786', H: '#c8bfac', g: '#a35a1e', G: '#d98a3c' },
  tin_ore:    { O: '#181a1c', D: '#4e5356', M: '#73797d', L: '#9aa1a5', H: '#c3cacd', g: '#aab6bc', G: '#dde6ea' },
  iron_ore:   { O: '#1a1512', D: '#52473e', M: '#776a5e', L: '#9d8e80', H: '#c4b5a6', g: '#7e3b28', G: '#a85a40' },
  coal:       { O: '#0c0d10', D: '#34373e', M: '#4d525a', L: '#6a707a', H: '#8d949e', g: '#15171c', G: '#2b303c' },
  mithril_ore:    { O: '#14161c', D: '#494f5c', M: '#6c7484', L: '#929cae', H: '#bcc6d6', g: '#3e5cc0', G: '#7a96ec' },
  adamantite_ore: { O: '#121712', D: '#454f44', M: '#677263', L: '#8e9a89', H: '#b7c3b1', g: '#2c8a3c', G: '#5cc468' },
  gold_ore:   { O: '#1c1810', D: '#564e3c', M: '#7a705a', L: '#a09678', H: '#c8bea0', g: '#c79a1f', G: '#f0d05c' },
  runite_ore: { O: '#101a1c', D: '#3e5258', M: '#5c747c', L: '#84a0a8', H: '#b4ccd2', g: '#1ea8b8', G: '#5ce4ec' },
};

const STONE_RAMP: Palette = { O: '#17150f', D: '#615c4c', M: '#8a8470', L: '#aea890', H: '#d2ccb2' };
const RUNE_RAMPS: Record<string, Palette> = {
  air_rune:   pal(STONE_RAMP, { g: '#cfeef8', G: '#ffffff' }),
  mind_rune:  pal(STONE_RAMP, { g: '#d96a2c', G: '#f8a85e' }),
  water_rune: pal(STONE_RAMP, { g: '#2e62c8', G: '#6fa0ec' }),
  earth_rune: pal(STONE_RAMP, { g: '#8a5a26', G: '#c08c4c' }),
  fire_rune:  pal(STONE_RAMP, { g: '#d83c1c', G: '#f88444' }),
  chaos_rune: pal(STONE_RAMP, { g: '#d8742c', G: '#ffb058' }),
};

const GLASS: Palette = { O: '#101418', v: '#9fb6c2', V: '#e6f4fa', c: '#8a6533' };
const VIAL_RAMPS: Record<string, Palette> = {
  vial_of_water:  pal(GLASS, { q: '#5d9fc0', Q: '#a8d8ec' }),
  attack_potion:  pal(GLASS, { q: '#b62e22', Q: '#ea7a5e' }),
  defence_potion: pal(GLASS, { q: '#2c50b0', Q: '#7a96e6' }),
  prayer_potion:  pal(GLASS, { q: '#7ec4dc', Q: '#c8ecf6' }),
  super_attack:   pal(GLASS, { q: '#e0641c', Q: '#f8a850' }),
};

const BURLAP: Palette = { O: '#1c1106', d: '#5c3f1e', m: '#83602f', l: '#a98343', n: '#cda866' };
const SEED_RAMPS: Record<string, Palette> = {
  potato_seed:  pal(BURLAP, { q: '#c9a05a' }),
  cabbage_seed: pal(BURLAP, { q: '#7fae3e' }),
  sweetcorn_seed:  pal(BURLAP, { q: '#e8c44e' }),
  watermelon_seed: pal(BURLAP, { q: '#2a2620' }),
};

// Phase 6 bows — palette swaps on the shared bow grid ('s' = string; omitted -> unstrung).
const BOW_RAMPS: Record<string, Palette> = {
  maple_shortbow:   { O: '#1c0e04', d: '#6e3c14', m: '#9a5e1e', l: '#c4862e', n: '#e8b054', s: '#e0dcc8' },
  maple_shortbow_u: { O: '#1c0e04', d: '#6e3c14', m: '#9a5e1e', l: '#c4862e', n: '#e8b054' },
  yew_shortbow:     { O: '#100806', d: '#3e2018', m: '#5c3424', l: '#7e4e34', n: '#a4724c', s: '#e0dcc8' },
  yew_shortbow_u:   { O: '#100806', d: '#3e2018', m: '#5c3424', l: '#7e4e34', n: '#a4724c' },
  // Magic bow glows — bright teal wood and a luminous string.
  magic_shortbow:   { O: '#06141a', d: '#0e3a44', m: '#16566a', l: '#2c7c92', n: '#54aabc', s: '#9ef2e8' },
  magic_shortbow_u: { O: '#06141a', d: '#0e3a44', m: '#16566a', l: '#2c7c92', n: '#6cc4d4' },
};

// Gem tones — shared by uncut lumps, cut gems, and jewelry gem dots.
const GEM_TONES: Record<string, Palette> = {
  sapphire: { O: '#0a1430', D: '#1e3c9c', M: '#2e5ad0', L: '#5c88ec', H: '#a8c4fa' },
  emerald:  { O: '#06200e', D: '#157a36', M: '#22a44c', L: '#54cc7a', H: '#a0eebc' },
  ruby:     { O: '#2a0610', D: '#8c1428', M: '#c02440', L: '#e05468', H: '#f8a0ac' },
};

// Jewelry — one gold base, gem dot q/Q swapped per gem.
const JEWEL_BASE: Palette = { O: '#3a2a08', y: '#a87f1f', Y: '#e3c050', Z: '#f7e69a' };
const JEWEL_GEMS: Record<string, Palette> = {
  gold:     { q: '#e3c050', Q: '#f7e69a' },
  sapphire: { q: '#2e5ad0', Q: '#7aa0f0' },
  ruby:     { q: '#c02440', Q: '#e87084' },
};

// --- Phase 7 variant palettes -------------------------------------------------

// Parchment base for all documents; per-doc ink t and wax/mark x.
const PARCHMENT: Palette = { O: '#241c0c', n: '#e8dcb4', l: '#cdbf92', m: '#a8966a', d: '#7c6c48', t: '#4a3c28' };
const DOC_RAMPS: Record<string, Palette> = {
  shim_receipt:   pal(PARCHMENT, { x: '#8a8a8a' }),
  court_verdict:  pal(PARCHMENT, { x: '#2e8a3c' }),
  clinic_note:    pal(PARCHMENT, { x: '#4a78c0' }),
  mira_letter:    pal(PARCHMENT, { x: '#b03038' }),
  wizards_writ:   pal(PARCHMENT, { x: '#5a3cb0' }),
  mine_survey:    pal(PARCHMENT, { t: '#7c5a2e', x: '#b03030' }),
  joint_writ:     pal(PARCHMENT, { x: '#b08a2c' }),
  torn_score_page: pal(PARCHMENT, { t: '#26262c', x: '#26262c' }),
  hollow_verse:   pal(PARCHMENT, { t: '#56607a', x: '#56607a' }),
  guild_writ:     pal(PARCHMENT, { x: '#2c5a9c' }),
  false_manifest: pal(PARCHMENT, { x: '#3a3a42' }),
  wreck_chart:    pal(PARCHMENT, { t: '#2e6e80', x: '#b03030' }),
  brokentooth_chant_page: pal(PARCHMENT, { n: '#cfc09a', l: '#b3a47e', t: '#70201a', x: '#a02818' }),
};

const BOOK_RAMPS: Record<string, Palette> = {
  foreman_ledger:  { O: '#170f06', s: '#3a2410', L: '#7c5424', M: '#5e3f1a', D: '#452e12', y: '#a87f1f', p: '#e8dcb4', d: '#a8966a' },
  ravenmoor_diary: { O: '#100a16', s: '#241636', L: '#46306a', M: '#352450', D: '#261a3a', y: '#8a8e98', p: '#d8d2e2', d: '#a49cb6' },
  war_march_score: { O: '#1a0808', s: '#481414', L: '#8a2424', M: '#6a1a1a', D: '#4e1212', y: '#e3c050', p: '#e8dcb4', d: '#a8966a' },
  tome_of_grudges: { O: '#120d08', s: '#2e2014', L: '#5a4024', M: '#44301a', D: '#302212', y: '#9aa2aa', p: '#d8ccaa', d: '#a09070' },
};

// Rings & signets — band y/Y/Z, gem dot q/Q on RING_G.
const RING_RAMPS: Record<string, Palette> = {
  rimeglass_ring:   { O: '#142632', y: '#5890ac', Y: '#8cc0d8', Z: '#c8ecf8', q: '#e8f8ff', Q: '#ffffff' },
  marazas_signet:   { O: '#161a26', y: '#7a8eca', Y: '#a8bce4', Z: '#d8e6f8', q: '#bce8f8', Q: '#f0fbff' },
  ravenmoor_signet: { O: '#1c1408', y: '#8a6510', Y: '#c79a1f', Z: '#e8c44e', q: '#3c2c54', Q: '#6a4e92' },
  guardsman_signet: { O: '#14161a', y: '#5e646e', Y: '#8a919c', Z: '#b8bfca', q: '#2e54a8', Q: '#5a82d0' },
  grave_ring:       { O: '#121410', y: '#4e5246', Y: '#6e7464', Z: '#8e9480', q: '#3a4a3a', Q: '#5a6e58' },
  cull_band:        { O: '#101216', y: '#43464d', Y: '#6e737b', Z: '#989fa8', q: '#2e3238', Q: '#43464d' },
};

// Cord charms & talismans on CHARM_G — w cord, b band, pendant L/M/H.
const CHARM_RAMPS: Record<string, Palette> = {
  elder_charm:        { O: '#1c1206', w: '#b8a070', b: '#a87f1f', L: '#a87a3c', M: '#7c5424', H: '#cfa86a' },
  wolf_fang_amulet:   { O: '#241c12', w: '#9a8a6a', b: '#6a5638', L: '#ece4cc', M: '#c8bc9c', H: '#fcf8ea' },
  bearclaw_necklace:  { O: '#160f08', w: '#8a6a3c', b: '#5a4424', L: '#5e4630', M: '#3e2c1c', H: '#8a6c4c' },
  rat_tail_talisman:  { O: '#1a1410', w: '#9a8a78', b: '#6a5a4c', L: '#b08a8a', M: '#8a6464', H: '#ccaaa6' },
  ember_charm:        { O: '#1c0c06', w: '#a87f1f', b: '#e3c050', L: '#f08030', M: '#c04818', H: '#ffd060' },
};

// Loose powders on DUST_G.
const DUST_RAMPS: Record<string, Palette> = {
  grave_dust:  { O: '#15161a', D: '#494c54', M: '#686c76', L: '#8a8e98', g: '#b4b8c0' },
  mote_dust:   { O: '#1a1410', D: '#564830', M: '#7a6845', L: '#9e8a5e', g: '#f0e08a' },
  powder_grit: { O: '#0a0a0c', D: '#1e1e24', M: '#303038', L: '#44444e', g: '#5e5e6a' },
};

// Singing shards on the rune-essence crystal grid.
const SHARD_RAMPS: Record<string, Palette> = {
  resonant_shard:   { O: '#0a1e20', D: '#175a60', M: '#238088', L: '#4ab0b4', H: '#8ce4e4', W: '#d8fffc' },
  dissonant_sliver: { O: '#16101c', D: '#3a2c48', M: '#544068', L: '#7a5e92', H: '#b48cc8', W: '#f0d8fa' },
  rimeglass_shard:  { O: '#142632', D: '#3a6884', M: '#5890ac', L: '#8cc0d8', H: '#c8ecf8', W: '#ffffff' },
};

// Shardpoint crystal — bolt-on ramp for the shared arrow/tips grids.
const SHARDPOINT: Palette = { O: '#0a1c1e', D: '#1e5a5e', M: '#2e8488', L: '#56b4b6', H: '#a0ecec' };

// ---------------------------------------------------------------------------
// itemIcon
// ---------------------------------------------------------------------------

const FLETCH: Palette = { f: '#d8dde2' };

function metalSpec(id: string): [Pixmap, Palette] | null {
  const m = /^(bronze|iron|steel|mithril|adamantite|adamant|rune)_(sword|scimitar|full_helm|platebody|platelegs|kiteshield|arrow|arrowtips|pistol|round|bullet_casing|bar|axe|pickaxe)$/.exec(id);
  if (!m) return null;
  const ramp = METAL[m[1] === 'adamantite' ? 'adamant' : m[1]];
  const base = pal(ramp, WOOD, GOLD, { x: '#0a0a0c' });
  switch (m[2]) {
    case 'sword': return [SWORD_G, base];
    case 'scimitar': return [SCIM_G, base];
    case 'full_helm': return [HELM_G, base];
    case 'platebody': return [BODY_G, base];
    case 'platelegs': return [LEGS_G, base];
    case 'kiteshield': return [KITE_G, base];
    case 'arrow': return [ARROW_G, pal(base, FLETCH)];
    case 'round': return [ROUND_G, pal(base, { b: ramp.D, M: ramp.M, H: ramp.H, d: ramp.O })];
    case 'bullet_casing': return [CASING_G, pal(base, { b: ramp.D, d: ramp.O, L: ramp.L })];
    case 'pistol': return [PISTOL_G, pal(base, WOOD, { g: WOOD.m, t: '#2a2a30', b: ramp.O, s: ramp.L })];
    case 'arrowtips': return [TIPS_G, base];
    case 'bar': return [BAR_G, base];
    case 'axe': return [AXE_G, base];
    case 'pickaxe': return [PICK_G, base];
  }
  return null;
}

const LEATHER_RAMP: Palette = { O: '#21130a', n: '#c89a5e', l: '#a87a3c', m: '#84582a', d: '#5e3c1c' };
const BONE: Palette = { O: '#2b2b22', b: '#ddd6c0', B: '#f6f1de' };
const WOOL_W: Palette = { O: '#34322c', w: '#e4e0d2', W: '#f8f6ec', d: '#b3ad98' };

export function itemSpec(id: string): [Pixmap, Palette] | null {
  const metal = metalSpec(id);
  if (metal) return metal;
  if (FISH_RAMPS[id]) return [id.includes('shrimp') || id === 'burnt_fish' ? SHRIMP_G : FISH_G, FISH_RAMPS[id]];
  if (LOBSTER_RAMPS[id]) return [LOBSTER_G, LOBSTER_RAMPS[id]];
  if (SWORDFISH_RAMPS[id]) return [SWORDFISH_G, SWORDFISH_RAMPS[id]];
  if (SHARK_RAMPS[id]) return [SHARK_G, SHARK_RAMPS[id]];
  if (MEAT_RAMPS[id]) return [MEAT_G, MEAT_RAMPS[id]];
  if (DRUM_RAMPS[id]) return [DRUM_G, DRUM_RAMPS[id]];
  if (HERB_RAMPS[id]) return [HERB_G, HERB_RAMPS[id]];
  if (LOG_RAMPS[id]) return [id === 'magic_logs' ? MAGIC_LOGS_G : LOGS_G, LOG_RAMPS[id]];
  if (ORE_RAMPS[id]) return [ORE_G, ORE_RAMPS[id]];
  if (RUNE_RAMPS[id]) return [RUNE_G, RUNE_RAMPS[id]];
  if (VIAL_RAMPS[id]) return [VIAL_G, VIAL_RAMPS[id]];
  if (SEED_RAMPS[id]) return [POUCH_G, SEED_RAMPS[id]];
  if (BOW_RAMPS[id]) return [BOW_G, BOW_RAMPS[id]];
  if (DOC_RAMPS[id]) return [DOC_G, DOC_RAMPS[id]];
  if (BOOK_RAMPS[id]) return [BOOK_G, BOOK_RAMPS[id]];
  if (RING_RAMPS[id]) return [RING_G, RING_RAMPS[id]];
  if (CHARM_RAMPS[id]) return [CHARM_G, CHARM_RAMPS[id]];
  if (DUST_RAMPS[id]) return [DUST_G, DUST_RAMPS[id]];
  if (SHARD_RAMPS[id]) return [ESSENCE_G, SHARD_RAMPS[id]];
  const gem = /^(uncut_)?(sapphire|emerald|ruby)$/.exec(id);
  if (gem) return [gem[1] ? UNCUT_G : GEM_G, GEM_TONES[gem[2]]];
  const jw = /^(gold|sapphire|ruby)_(ring|amulet)$/.exec(id);
  if (jw) return [jw[2] === 'ring' ? RING_G : AMULET_G, pal(JEWEL_BASE, JEWEL_GEMS[jw[1]])];
  switch (id) {
    case 'coins': return [COINS_G, { O: '#3a2a08', D: '#8a6510', M: '#c79a1f', L: '#e8c44e', H: '#fbe98e' }];
    case 'wooden_shield': return [SHIELDWOOD_G, pal(WOOD, { O: '#1f1308', L: '#9aa2aa', H: '#c8ced4', M: '#70767e' })];
    case 'tinderbox': return [TINDER_G, pal(WOOD, { O: '#1f1308', r: '#e88822', R: '#f8cc55', s: '#8c8c84', e: '#f2b03a' })];
    case 'small_net': return [NET_G, pal(WOOD, { O: '#1f1308', w: '#cdc3a4' })];
    case 'fishing_rod': return [ROD_G, pal(WOOD, { O: '#1f1308', w: '#b8c2c8' })];
    case 'knife': return [KNIFE_G, pal(METAL.steel, WOOD)];
    case 'hammer': return [HAMMER_G, pal(METAL.iron, WOOD)];
    case 'needle': return [NEEDLE_G, METAL.steel];
    case 'thread': return [THREAD_G, pal(WOOD, WOOL_W, { O: '#2c2a24' })];
    case 'shears': return [SHEARS_G, pal(METAL.steel, WOOD)];
    case 'rake': return [RAKE_G, pal(METAL.iron, WOOD)];
    case 'seed_dibber': return [DIBBER_G, pal(WOOD, { O: '#1f1308' })];
    case 'bucket': return [BUCKET_G, pal(WOOD, { O: '#1f1308', L: '#a87a3c', M: '#7c5424', D: '#523317' })];
    case 'bucket_of_milk': return [BUCKET_G, pal(WOOD, { O: '#1f1308', L: '#a87a3c', M: '#7c5424', D: '#523317', q: '#f4f0e2' })];
    case 'bird_snare': return [SNARE_G, pal(WOOD, { O: '#1f1308', w: '#d8ceae' })];
    case 'glock_18': return [GLOCK_G, { O: '#1a1a1e', p: '#3a3a42', P: '#4e4e58', L: '#62626c', H: '#787882', s: '#505058', t: '#2a2a30' }];
    case 'gunpowder': return [GUNPOWDER_G, { O: '#1a1410', n: '#5a4c38', B: '#443828', p: '#2e2418', D: '#2a2018', d: '#1a1410' }];
    case 'shortbow': return [BOW_G, pal(WOOD, { O: '#241608', s: '#e0dcc8' })];
    case 'oak_shortbow': return [BOW_G, { O: '#170d05', o: '#170d05', d: '#3c2410', m: '#553616', l: '#714c20', n: '#8e662e', s: '#e0dcc8' }];
    case 'shortbow_u': return [BOW_G, pal(WOOD, { O: '#241608' })];
    case 'bowstring': return [BOWSTRING_G, WOOL_W];
    case 'flax': return [FLAX_G, { O: '#13240e', g: '#5d8c38', p: '#7a8fd6', P: '#aabcf0' }];
    case 'wool': return [WOOL_G, WOOL_W];
    case 'ball_of_wool': return [BALLWOOL_G, WOOL_W];
    case 'leather': return [LEATHER_G, LEATHER_RAMP];
    case 'leather_body': return [LBODY_G, LEATHER_RAMP];
    case 'leather_gloves': return [LGLOVES_G, LEATHER_RAMP];
    case 'leather_boots': return [LBOOTS_G, LEATHER_RAMP];
    case 'cowhide': return [COWHIDE_G, pal(LEATHER_RAMP, { k: '#3e2c1a' })];
    case 'bones': return [BONES_G, BONE];
    case 'feather': return [FEATHER_G, { O: '#4a4638', w: '#e8e4d4', W: '#faf8ee', m: '#9a9282' }];
    case 'egg': return [EGG_G, { O: '#3e3526', D: '#c9b98c', M: '#e0d4ac', L: '#f0e8c8', H: '#fcf8e4' }];
    case 'bread': return [BREAD_G, { O: '#2e1c08', D: '#9a6e2c', M: '#bd8e3e', L: '#d9ad58', H: '#f0d088' }];
    case 'cake': return [CAKE_G, { O: '#33200e', L: '#e8c878', M: '#d4a854', n: '#b07c34', d: '#8a5c22', q: '#f4e0e8', Q: '#fdf4f8', r: '#d83c3c' }];
    case 'arrow_shaft': return [SHAFT_G, pal(WOOD, { O: '#1f1308' })];
    case 'headless_arrow': return [HEADLESS_G, pal(WOOD, FLETCH, { O: '#241708' })];
    case 'rune_essence': return [ESSENCE_G, { O: '#262830', D: '#8f93a8', M: '#b4b8ca', L: '#d5d8e6', H: '#eef0f8', W: '#ffffff' }];
    case 'plank': return [PLANK_G, pal(WOOD, { O: '#1f1308' })];
    case 'nails': return [NAILS_G, METAL.iron];
    case 'eye_of_newt': return [NEWT_G, pal(GLASS, { q: '#7a9c4a', Q: '#b0cc7c', w: '#f0eccc', W: '#fcfae8' })];
    case 'potato': return [POTATO_G, { O: '#2c1d0c', D: '#9a7234', M: '#bd9148', L: '#d8b066', H: '#efd494', d: '#7c5a2a' }];
    case 'cabbage': return [CABBAGE_G, { O: '#10240f', D: '#3a7c34', M: '#54994a', L: '#7cbc68', H: '#b0e094' }];
    case 'fishing_bait': return [BAIT_G, pal(BURLAP, { q: '#c87a90' })];
    // Phase 5 boss / quest items.
    case 'warlord_helm': return [WARLORD_HELM_G, { O: '#15120e', D: '#4a4038', M: '#6e6055', L: '#92816f', H: '#bcab92', b: '#cfc4a4', B: '#efe6c8', x: '#0a0a0c' }];
    case 'drake_sword': return [DRAKE_SWORD_G, pal(WOOD, GOLD, { O: '#1c0e08', D: '#5a4438', M: '#8a6a52', L: '#c09a6e', H: '#f2d8a4', r: '#e8642c', R: '#f8a83c' })];
    case 'drake_scale': return [DRAKE_SCALE_G, { O: '#0e1018', D: '#28304e', M: '#3e4a72', L: '#5c6c9c', H: '#8fa0cc' }];
    case 'horror_hide': return [HORROR_HIDE_G, { O: '#0d1408', n: '#96aa58', l: '#748e44', m: '#566c30', d: '#3c4e22', k: '#2a3814', p: '#b4c878' }];
    case 'warlord_banner': return [WARLORD_BANNER_G, { O: '#170d08', m: '#7c5424', d: '#523317', r: '#7e201a', R: '#aa3226', s: '#cc5a42', x: '#16100c' }];
    case 'bog_heart': return [BOG_HEART_G, { O: '#0c0a06', D: '#3a3022', M: '#564834', g: '#5dbc3e', G: '#a4f068' }];
    case 'ember_crystal': return [EMBER_CRYSTAL_G, { O: '#240c06', D: '#6e2a14', M: '#9c4420', L: '#cc6c2e', H: '#f0a052', r: '#f06028', R: '#ffa040', W: '#ffe6b0' }];
    // Phase 6 items.
    case 'gold_bar': return [BAR_G, { O: '#3a2a08', D: '#8a6510', M: '#c79a1f', L: '#e8c44e', H: '#fbe98e' }];
    case 'lobster_pot': return [LOBSTERPOT_G, pal(WOOD, { O: '#1f1308' })];
    case 'harpoon': return [HARPOON_G, pal(METAL.steel, WOOD)];
    case 'chisel': return [CHISEL_G, pal(METAL.steel, WOOD)];
    case 'sweetcorn': return [CORN_G, { O: '#2a1c06', q: '#d8a826', Q: '#f2cc4e', g: '#3e8a2c', G: '#6cb44e' }];
    case 'watermelon': return [MELON_G, { O: '#1c0a0c', r: '#c8344a', R: '#e25668', s: '#241c14', w: '#f0e6d2', k: '#2e7a30', K: '#54a44c' }];
    case 'big_bones': return [BIGBONES_G, BONE];
    case 'rimeglass_blade': return [RIMEBLADE_G, pal(WOOD, GOLD, { O: '#1c2e3a', L: '#bcdde8', M: '#8ec0d4', H: '#eafaff', W: '#ffffff' })];
    case 'red_sash': return [SASH_G, { O: '#1c0608', r: '#8e2430', R: '#c0364a', d: '#5e1620', s: '#e06070' }];
    case 'molten_core': return [CORE_G, { O: '#160a06', D: '#3a2418', M: '#54382a', L: '#6e4c38', r: '#f06028', R: '#ffa040', W: '#ffe6b0' }];
    case 'molten_gauntlets': return [MGAUNT_G, { O: '#15100c', D: '#43342a', M: '#62503e', L: '#86705a', H: '#b09a7e', r: '#f06028', R: '#ffa040' }];
    // --- Phase 7: boss uniques -------------------------------------------
    case 'red_smile': return [SCIM_G, pal(WOOD, GOLD, { O: '#2a060a', D: '#7c1424', M: '#a82434', L: '#d04050', H: '#f88c94' })];
    case 'mirefang': return [FANGBLADE_G, { O: '#0a0c06', H: '#74884c', L: '#4a5430', M: '#323a20', y: '#8aa050', d: '#241c10', m: '#3a2e1a' }];
    case 'drakebreath_staff': return [STAFF_G, { O: '#140c08', m: '#8a7456', d: '#5e4c38', q: '#f06028', Q: '#ffa040' }];
    case 'errata_pistol': return [PISTOL_G, { O: '#0e0e14', s: '#3c4254', L: '#555c72', M: '#454c60', H: '#d878d0', g: '#2c3040', t: '#181a22', b: '#0e0e14' }];
    case 'cindermaul': return [MAUL_G, { O: '#0e0a08', H: '#6e5648', L: '#4e3c32', M: '#382a24', D: '#241a16', r: '#f06028', m: '#3a2e22', d: '#241c14' }];
    case 'shardsong_bow': return [BOW_G, { O: '#0a1c20', l: '#2e8488', m: '#1e5a5e', n: '#56b4b6', s: '#c8fff4' }];
    case 'echo_pick': return [PICK_G, { O: '#0c1a18', D: '#1e5048', M: '#2e7468', L: '#52a392', H: '#9ef0dc', m: '#2e5e58', d: '#1e423e' }];
    case 'banner_cleaver': return [CLEAVER_G, { O: '#0e1014', H: '#aab4c0', L: '#7e8896', M: '#5a6270', D: '#3c424e', m: '#7c5424', d: '#523317', r: '#7e201a', R: '#aa3226' }];
    case 'chantbreaker_ward': return [WARD_G, { O: '#0e1014', H: '#aab4c0', L: '#7e8896', M: '#5a6270', D: '#3c424e', g: '#d8b94a', G: '#f7e69a' }];
    case 'stillwater_amulet': return [AMULET_G, pal(JEWEL_BASE, { q: '#aeb6c2', Q: '#e6ecf2' })];
    case 'unstruck_bell': return [BELL_G, { O: '#140e06', m: '#4a3a20', L: '#8a6e34', H: '#e8c868', M: '#6a521f', D: '#473614', b: '#2a2010' }];
    case 'corsairs_fang': return [SCIM_G, pal(WOOD, GOLD, { O: '#101216', D: '#2e3540', M: '#454f5e', L: '#67737f', H: '#9aa6b2' })];
    // --- Phase 7: weapons & armour ----------------------------------------
    case 'dirge_blade': return [SWORD_G, pal(WOOD, { O: '#0e1014', D: '#2c3240', M: '#414a5c', L: '#5e6a80', H: '#8a96ac', y: '#5a6474', Y: '#8a96a8' })];
    case 'boarding_cutlass': return [SCIM_G, pal(WOOD, GOLD, METAL.iron)];
    case 'stinger_dirk': return [FANGBLADE_G, { O: '#1c1404', H: '#e8d070', L: '#c0a040', M: '#8a6e24', y: '#6a7a2c', d: '#2e2410', m: '#4a3a1c' }];
    case 'trollbone_club': return [CLUB_G, BONE];
    case 'dissonant_baton': return [STAFF_G, { O: '#101018', m: '#3c4254', d: '#262b3a', q: '#7a5e92', Q: '#b48cc8' }];
    case 'tuning_hammer': return [MAUL_G, pal(METAL.iron, WOOD, { r: '#e8c868' })];
    case 'tuned_pickaxe': return [PICK_G, pal(METAL.steel, WOOD, { H: '#8ae8d8' })];
    case 'wrongnote_round': return [ROUND_G, { O: '#101014', b: '#6a5a30', M: '#3a3e4a', L: '#555a6a', H: '#8a90a2', d: '#0c0c10' }];
    case 'shardpoint_arrowtips': return [TIPS_G, SHARDPOINT];
    case 'shardpoint_arrow': return [ARROW_G, pal(SHARDPOINT, WOOD, FLETCH)];
    case 'spidersilk_bowstring': return [BOWSTRING_G, { O: '#2a3038', w: '#cdd6e2', W: '#eef4fa' }];
    case 'wardens_visor': return [HELM_G, { O: '#15100e', L: '#5a4a44', M: '#3e3430', H: '#7e6a60', x: '#c03020' }];
    case 'slagplate': return [BODY_G, { O: '#170d06', D: '#4a2c18', M: '#6a3e20', L: '#8a5630', H: '#c08048' }];
    case 'wraithcloth_robes': return [ROBE_G, { O: '#0e1216', L: '#3c4a56', M: '#2a3640', D: '#1c242c' }];
    case 'nightscale_coif': return [HOOD_G, { O: '#06080e', L: '#293248', M: '#1a2030', D: '#10141f', x: '#05060a' }];
    case 'bandit_black_wrap': return [HOOD_G, { O: '#0c0c0e', L: '#3a3a40', M: '#2a2a30', D: '#1e1e24', x: '#101014' }];
    case 'drakescale_vambraces': return [LGLOVES_G, { O: '#0a0c14', n: '#4a5572', l: '#353e58', m: '#252c42', d: '#181d30' }];
    case 'dune_kings_grips': return [LGLOVES_G, { O: '#2a1606', n: '#f2c46a', l: '#d89c3c', m: '#a86a22', d: '#7c4a16' }];
    case 'direwolf_pelt_cloak': return [CLOAK_G, { O: '#14161a', y: '#8a8e98', L: '#7a8290', M: '#5a626e', D: '#3e444e', i: '#2c3038' }];
    // --- Phase 7: drops, materials & curios --------------------------------
    case 'bear_fur': return [COWHIDE_G, { O: '#1c1208', n: '#8a6034', l: '#6e4a26', m: '#54381c', d: '#3c2812', k: '#2a1c0e' }];
    case 'spider_silk': return [BALLWOOL_G, { O: '#2c3036', w: '#d8dde6', W: '#f4f7fc', d: '#a8aebc' }];
    case 'templesilk_wraps': return [BALLWOOL_G, { O: '#2a0a0c', w: '#c03040', W: '#e05868', d: '#8a1f2c' }];
    case 'sarrash_temple_silk': return [LEATHER_G, { O: '#2a0a0c', n: '#e06070', l: '#c03c50', m: '#992638', d: '#701825' }];
    case 'nightscale': return [DRAKE_SCALE_G, { O: '#06080e', D: '#10141f', M: '#1a2030', L: '#293248', H: '#425070' }];
    case 'bog_horror_fang': return [FANG_G, { O: '#141008', L: '#c8bc96', M: '#9a8c64', H: '#e8e0c0' }];
    case 'goblin_lucky_tooth': return [FANG_G, { O: '#2b2418', L: '#e8e0c4', M: '#c0b694', H: '#f8f4e0' }];
    case 'drowned_pearl': return [EGG_G, { O: '#2a2e34', D: '#8a929e', M: '#aeb6c2', L: '#ccd4de', H: '#eef2f6' }];
    case 'gilded_egg': return [EGG_G, { O: '#3a2a08', D: '#8a6510', M: '#c79a1f', L: '#e8c44e', H: '#fbe98e' }];
    case 'quiess_feather': return [FEATHER_G, { O: '#2e3a4a', w: '#c2d4e8', W: '#e8f4fc', m: '#7a8ca0' }];
    case 'everburn_slag': return [ORE_G, { O: '#120c08', D: '#2e2018', M: '#46322a', L: '#5e453c', H: '#7a5c50', g: '#f06028', G: '#ffb050' }];
    case 'lucky_shim': return [UNCUT_G, { O: '#15140f', D: '#56524a', M: '#7a766c', L: '#a09c90', H: '#c8c4b6' }];
    case 'ivory_cowbell': return [BELL_G, { O: '#2b2820', m: '#8a6a3c', L: '#ece4cc', H: '#fcf8ea', M: '#c8bc9c', D: '#9a8e6e', b: '#6a5a40' }];
    case 'chimperton_medallion': return [AMULET_G, pal(JEWEL_BASE, { q: '#e8d44e', Q: '#f8f0a0' })];
    case 'tick_jerky': return [MEAT_G, { O: '#1c1208', D: '#4a2e16', M: '#64401e', L: '#7e562a', H: '#a07840' }];
    case 'fluoride_ration': return [VIAL_G, pal(GLASS, { q: '#3ec0a0', Q: '#9af0d8' })];
    case 'lamp_oil': return [VIAL_G, pal(GLASS, { q: '#c08a28', Q: '#ecc468' })];
    case 'wheat': return [FLAX_G, { O: '#241c06', g: '#b08a2c', p: '#d8b045', P: '#f0d478' }];
    case 'flour': return [POUCH_G, pal(BURLAP, { q: '#f2efe4' })];
    case 'white_lily': return [LILY_G, { O: '#1c2410', W: '#f4f4ec', q: '#e8c84e', g: '#3e7a30', G: '#62a44c' }];
    // --- Phase 7: quest & utility gear --------------------------------------
    case 'cellar_key': return [KEY_G, { O: '#101114', L: '#555a64', M: '#3e424c' }];
    case 'tuning_fork': return [FORK_G, METAL.steel];
    case 'hollis_lamp': return [LAMP_G, { O: '#141008', m: '#6a5a3c', L: '#8a8060', M: '#5e5640', D: '#3a3424', q: '#f0a030', Q: '#ffd060', W: '#fff4c0' }];
    case 'keepers_spyglass': return [SPYGLASS_G, { O: '#121418', L: '#5a7a8c', M: '#3e5666', y: '#a87f1f', Y: '#e3c050' }];
    case 'guild_powder_horn': return [HORN_G, { O: '#1a1208', L: '#d8c8a4', M: '#b09a6e', y: '#a87f1f', Y: '#e3c050' }];
    case 'guild_deputy_badge': return [BADGE_G, { O: '#2a1c08', L: '#e3c050', M: '#a87f1f', H: '#f7e69a', y: '#6a4a14' }];
    case 'millers_token': return [BADGE_G, { O: '#1f1308', L: '#a87a3c', M: '#7c5424', H: '#cfa86a', y: '#523317' }];
    case 'powder_keg': return [KEG_G, pal(WOOD, { O: '#15100a' })];
    case 'blasting_charge': return [CHARGE_G, { O: '#160a06', R: '#8a2e1c', r: '#b04428', w: '#d8c89a' }];
    case 'calder_brand': return [TORCH_G, pal(WOOD, { O: '#160c06', r: '#e86028', R: '#f8a838', W: '#ffe8b0', e: '#54341c' })];
  }
  return null;
}

export function itemIcon(id: string): HTMLCanvasElement {
  return make('item:' + id, 32, 32, (g) => {
    const spec = itemSpec(id);
    if (spec) { drawPixmap(g, spec[0], spec[1], 2); return; }
    // Unknown id — loud magenta placeholder so missing art is obvious.
    g.fillStyle = '#ff00ff'; g.fillRect(3, 3, 26, 26);
    g.fillStyle = '#5a005a'; g.fillRect(3, 3, 26, 2); g.fillRect(3, 27, 26, 2);
    g.fillRect(3, 3, 2, 26); g.fillRect(27, 3, 2, 26);
    g.fillStyle = '#ffffff'; g.font = 'bold 18px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 16, 17);
  });
}

// ---------------------------------------------------------------------------
// Skill icons (16x16) — vector-drawn, outlined + two-tone shaded.
// ---------------------------------------------------------------------------

const INK = '#15100a';

export function skillIcon(name: string): HTMLCanvasElement {
  return make('skill:' + name, 16, 16, (g) => {
    g.lineWidth = 1; g.lineCap = 'round'; g.lineJoin = 'round';
    const shape = (fill: string, fn: () => void, outline = INK) => {
      g.beginPath(); fn();
      g.fillStyle = fill; g.fill();
      g.strokeStyle = outline; g.lineWidth = 1; g.stroke();
    };
    const line = (col: string, w: number, fn: () => void) => {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); fn(); g.stroke(); g.lineWidth = 1;
    };
    switch (name) {
      case 'Attack':
        line(INK, 3.6, () => { g.moveTo(3, 13); g.lineTo(13, 3); });
        line('#cfd4dc', 1.8, () => { g.moveTo(3, 13); g.lineTo(13, 3); });
        line(INK, 3.6, () => { g.moveTo(3, 3); g.lineTo(13, 13); });
        line('#9aa2ae', 1.8, () => { g.moveTo(3, 3); g.lineTo(13, 13); });
        line('#a87a1c', 2, () => { g.moveTo(2, 11); g.lineTo(5, 14); g.moveTo(11, 14); g.lineTo(14, 11); });
        break;
      case 'Strength':
        shape('#c8402f', () => { g.rect(4.5, 5.5, 7, 5.5); });
        shape('#e06a4a', () => { g.arc(4.5, 8, 3, 0, 7); });
        shape('#a82c20', () => { g.arc(11.5, 8, 3, 0, 7); });
        line('#f2a080', 1, () => { g.moveTo(5, 6.5); g.lineTo(10, 6.5); });
        break;
      case 'Defence':
        shape('#3a5cae', () => { g.moveTo(8, 1.5); g.lineTo(14, 3.5); g.lineTo(13, 10); g.lineTo(8, 14.5); g.lineTo(3, 10); g.lineTo(2, 3.5); g.closePath(); });
        shape('#6e8cd2', () => { g.moveTo(8, 3); g.lineTo(12.4, 4.5); g.lineTo(8, 7.5); g.closePath(); }, '#3a5cae');
        break;
      case 'Ranged':
        line(INK, 3, () => { g.arc(7.5, 8, 6, -1.25, 1.25); });
        line('#7a5226', 1.6, () => { g.arc(7.5, 8, 6, -1.25, 1.25); });
        line(INK, 2.4, () => { g.moveTo(2, 8); g.lineTo(14, 8); });
        line('#a3743a', 1.2, () => { g.moveTo(2, 8); g.lineTo(13, 8); });
        shape('#cfd4dc', () => { g.moveTo(15, 8); g.lineTo(11.5, 6.4); g.lineTo(11.5, 9.6); g.closePath(); });
        break;
      case 'Gun':
        shape('#2a2a30', () => { g.rect(3, 6.5, 9, 3.5); });
        shape('#3a3a42', () => { g.rect(10, 5.5, 4, 2.5); });
        shape('#1a1a1e', () => { g.rect(4, 9.5, 3, 2); });
        line('#5a5a64', 1.2, () => { g.moveTo(14, 6.5); g.lineTo(15.5, 6.5); });
        break;
      case 'Prayer':
        shape('#e9e7f4', () => { g.rect(6.8, 1.5, 2.4, 13); });
        shape('#e9e7f4', () => { g.rect(3, 4.5, 10, 2.4); });
        line('#fdfdff', 1, () => { g.moveTo(7.4, 2.5); g.lineTo(7.4, 13.5); });
        break;
      case 'Magic':
        shape('#2c46b8', () => { g.moveTo(8, 0.8); g.lineTo(9.8, 6.2); g.lineTo(15.2, 8); g.lineTo(9.8, 9.8); g.lineTo(8, 15.2); g.lineTo(6.2, 9.8); g.lineTo(0.8, 8); g.lineTo(6.2, 6.2); g.closePath(); });
        shape('#7c98ec', () => { g.moveTo(8, 4); g.lineTo(9, 7); g.lineTo(12, 8); g.lineTo(9, 9); g.lineTo(8, 12); g.lineTo(7, 9); g.lineTo(4, 8); g.lineTo(7, 7); g.closePath(); }, '#2c46b8');
        break;
      case 'Runecraft':
        shape('#cfc6ae', () => { g.arc(8, 8, 6.2, 0, 7); });
        shape('#ece5d0', () => { g.arc(6.5, 6.5, 3.2, 0, 7); }, '#cfc6ae');
        line('#6a5420', 1.6, () => { g.moveTo(8, 4); g.lineTo(8, 12); g.moveTo(5, 6); g.lineTo(11, 10); g.moveTo(11, 6); g.lineTo(5, 10); });
        break;
      case 'Construction':
        shape('#9a6428', () => { g.moveTo(1.5, 9); g.lineTo(8, 2.5); g.lineTo(14.5, 9); g.closePath(); });
        shape('#cfa86a', () => { g.rect(3.5, 9, 9, 5.5); });
        shape('#6e4a20', () => { g.rect(6.8, 10.5, 2.4, 4); }, '#3a2810');
        break;
      case 'Hitpoints':
        shape('#c42525', () => { g.moveTo(8, 14.5); g.quadraticCurveTo(0.5, 8.5, 2.5, 4); g.quadraticCurveTo(5.5, 0.8, 8, 4.8); g.quadraticCurveTo(10.5, 0.8, 13.5, 4); g.quadraticCurveTo(15.5, 8.5, 8, 14.5); });
        shape('#ef7a6a', () => { g.ellipse(5.4, 5.2, 1.7, 1.2, -0.5, 0, 7); }, '#c42525');
        break;
      case 'Agility':
        line(INK, 3.4, () => { g.moveTo(3.5, 14); g.quadraticCurveTo(8, 1.5, 12.5, 14); });
        line('#3a6ad4', 1.8, () => { g.moveTo(3.5, 14); g.quadraticCurveTo(8, 1.5, 12.5, 14); });
        shape('#7ca0ee', () => { g.arc(8, 4, 2.2, 0, 7); });
        break;
      case 'Herblore':
        shape('#2c8c3c', () => { g.ellipse(5.6, 9.2, 3, 5, 0.55, 0, 7); });
        shape('#1e6e2e', () => { g.ellipse(10.8, 7, 3, 5, -0.55, 0, 7); });
        line('#7cc070', 1, () => { g.moveTo(4.5, 12.5); g.quadraticCurveTo(5.5, 9, 7, 6.5); });
        break;
      case 'Thieving':
        shape('#26242a', () => { g.ellipse(8, 6.4, 6, 3.6, 0, 0, 7); });
        shape('#e6c39a', () => { g.arc(8, 9.4, 3.2, 0, 7); });
        line('#26242a', 1.4, () => { g.moveTo(5.4, 9.2); g.lineTo(10.6, 9.2); });
        break;
      case 'Crafting':
        line(INK, 2.6, () => { g.moveTo(2.5, 12.5); g.lineTo(13.5, 12.5); });
        line('#8a6a34', 1.2, () => { g.moveTo(3, 12.5); g.lineTo(13, 12.5); });
        shape('#c8a35e', () => { g.moveTo(4.6, 12); g.lineTo(8, 2.5); g.lineTo(11.4, 12); g.closePath(); });
        line('#e8cc92', 1, () => { g.moveTo(7.4, 5); g.lineTo(5.8, 10.5); });
        break;
      case 'Fletching':
        line(INK, 2.6, () => { g.moveTo(3, 13); g.lineTo(11.5, 4.5); });
        line('#7c5426', 1.2, () => { g.moveTo(3.5, 12.5); g.lineTo(11, 5); });
        shape('#cfd4dc', () => { g.moveTo(11, 5); g.lineTo(14, 2); g.lineTo(12.6, 6.4); g.closePath(); });
        shape('#e0dcc8', () => { g.moveTo(3, 13); g.lineTo(5.5, 12.2); g.lineTo(3.8, 10.5); g.closePath(); });
        break;
      case 'Slayer':
        shape('#73201c', () => { g.arc(8, 8, 5.6, 0, 7); });
        shape('#9c342c', () => { g.arc(6.6, 6.4, 2.4, 0, 7); }, '#73201c');
        shape('#100c0a', () => { g.ellipse(5.8, 7.4, 1.5, 1.8, 0, 0, 7); }, '#100c0a');
        shape('#100c0a', () => { g.ellipse(10.2, 7.4, 1.5, 1.8, 0, 0, 7); }, '#100c0a');
        line('#100c0a', 1.6, () => { g.moveTo(6.4, 11.4); g.lineTo(9.6, 11.4); });
        break;
      case 'Hunter':
        shape('#8a6034', () => { g.moveTo(8, 1.8); g.lineTo(12.2, 14); g.lineTo(8, 10.6); g.lineTo(3.8, 14); g.closePath(); });
        line('#c69a5e', 1, () => { g.moveTo(8, 3.5); g.lineTo(10.5, 11.5); });
        break;
      case 'Mining':
        line(INK, 3, () => { g.moveTo(3.5, 13.5); g.lineTo(10.5, 5.5); });
        line('#8a6536', 1.6, () => { g.moveTo(4, 13); g.lineTo(10.5, 5.5); });
        shape('#9aa2ae', () => { g.moveTo(7, 3.2); g.quadraticCurveTo(13.5, 1.5, 15.2, 8.2); g.quadraticCurveTo(12, 4.8, 7.5, 6); g.closePath(); });
        line('#d2d8e0', 1, () => { g.moveTo(8.5, 3.6); g.quadraticCurveTo(12, 3, 13.6, 5.6); });
        break;
      case 'Smithing':
        shape('#5e6670', () => { g.moveTo(2.5, 7.5); g.lineTo(13.5, 7.5); g.lineTo(12, 11.5); g.lineTo(4, 11.5); g.closePath(); });
        shape('#828c98', () => { g.rect(5, 4.5, 6, 3); });
        shape('#454c56', () => { g.rect(6, 11.5, 4, 2.5); }, '#22262c');
        line('#aeb6c0', 1, () => { g.moveTo(3.5, 8.2); g.lineTo(12.5, 8.2); });
        break;
      case 'Fishing':
        shape('#3c6ec0', () => { g.ellipse(6.8, 8, 5, 3.2, 0, 0, 7); });
        shape('#3c6ec0', () => { g.moveTo(11, 8); g.lineTo(15, 4.8); g.lineTo(15, 11.2); g.closePath(); });
        shape('#7aa2e4', () => { g.ellipse(5.6, 6.8, 2, 1.1, -0.3, 0, 7); }, '#3c6ec0');
        shape('#0e1420', () => { g.arc(3.8, 7.6, 0.9, 0, 7); }, '#0e1420');
        break;
      case 'Cooking':
        shape('#6a2486', () => { g.moveTo(2, 7); g.lineTo(14, 7); g.lineTo(12, 13.5); g.lineTo(4, 13.5); g.closePath(); });
        line(INK, 2.2, () => { g.arc(8, 7, 5, 3.34, 6.08); });
        line('#9a54b4', 1.2, () => { g.arc(8, 7, 5, 3.34, 6.08); });
        line('#b87ad0', 1, () => { g.moveTo(3.5, 8); g.lineTo(12.5, 8); });
        break;
      case 'Firemaking':
        shape('#e0641c', () => { g.moveTo(8, 1); g.quadraticCurveTo(13.5, 6, 11.5, 11); g.quadraticCurveTo(10.5, 14.2, 8, 14.2); g.quadraticCurveTo(4.8, 14.2, 4.8, 10); g.quadraticCurveTo(2.5, 6, 8, 1); });
        shape('#f8c83a', () => { g.moveTo(8, 6); g.quadraticCurveTo(10.4, 9.4, 8, 13.4); g.quadraticCurveTo(5.6, 9.8, 8, 6); }, '#e0641c');
        break;
      case 'Woodcutting':
        shape('#1e7a2e', () => { g.arc(8, 5.2, 4.4, 0, 7); });
        shape('#3a9a48', () => { g.arc(6.6, 4, 2.2, 0, 7); }, '#1e7a2e');
        shape('#7c5226', () => { g.rect(6.9, 8.5, 2.2, 6.5); });
        break;
      case 'Farming':
        shape('#1e8a30', () => { g.moveTo(8, 14.5); g.quadraticCurveTo(2.5, 8, 8, 1.8); g.quadraticCurveTo(13.5, 8, 8, 14.5); });
        line('#7cc468', 1.1, () => { g.moveTo(8, 13); g.lineTo(8, 4); g.moveTo(8, 10); g.quadraticCurveTo(6, 8.6, 5.4, 6.8); g.moveTo(8, 8.4); g.quadraticCurveTo(10, 7, 10.6, 5.4); });
        break;
      default:
        shape('#8a8a8a', () => { g.arc(8, 8, 5, 0, 7); });
    }
  });
}

// ---------------------------------------------------------------------------
// Sidebar tab icons (20x20)
// ---------------------------------------------------------------------------

export function tabIcon(name: string): HTMLCanvasElement {
  return make('tab:' + name, 20, 20, (g) => {
    g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (col: string, w: number, fn: () => void) => {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); fn(); g.stroke();
    };
    const shape = (fill: string, fn: () => void, outline = INK) => {
      g.beginPath(); fn();
      g.fillStyle = fill; g.fill();
      g.strokeStyle = outline; g.lineWidth = 1.2; g.stroke();
    };
    switch (name) {
      case 'combat':
        line(INK, 4.2, () => { g.moveTo(4, 16); g.lineTo(16, 4); });
        line('#d8dce4', 2.2, () => { g.moveTo(4, 16); g.lineTo(16, 4); });
        line(INK, 4.2, () => { g.moveTo(4, 4); g.lineTo(16, 16); });
        line('#a6acb8', 2.2, () => { g.moveTo(4, 4); g.lineTo(16, 16); });
        line('#a87a1c', 2.4, () => { g.moveTo(3, 13.5); g.lineTo(6.5, 17); g.moveTo(13.5, 17); g.lineTo(17, 13.5); });
        break;
      case 'skills':
        shape('#3c9444', () => { g.rect(3, 11, 4, 6); });
        shape('#d2ae34', () => { g.rect(8, 7, 4, 10); });
        shape('#bc3c34', () => { g.rect(13, 3, 4, 14); });
        line('#7cc474', 1, () => { g.moveTo(4, 12); g.lineTo(4, 16); });
        line('#ecd070', 1, () => { g.moveTo(9, 8); g.lineTo(9, 16); });
        line('#e07a6c', 1, () => { g.moveTo(14, 4); g.lineTo(14, 16); });
        break;
      case 'quests':
        shape('#2e54a8', () => { g.arc(10, 10, 7.5, 0, 7); });
        shape('#4a74cc', () => { g.arc(7.8, 7.6, 3, 0, 7); }, '#2e54a8');
        g.fillStyle = '#f2d24a'; g.font = 'bold 11px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', 10, 10.8);
        break;
      case 'inventory':
        shape('#8a5e30', () => { g.moveTo(4, 7); g.quadraticCurveTo(10, 2, 16, 7); g.lineTo(16, 15.5); g.quadraticCurveTo(10, 18.8, 4, 15.5); g.closePath(); });
        line('#5a3a1a', 1.6, () => { g.moveTo(4, 10); g.quadraticCurveTo(10, 13, 16, 10); });
        line('#c89a5c', 1, () => { g.moveTo(5.5, 6.2); g.quadraticCurveTo(10, 3.2, 14.5, 6.2); });
        shape('#caa23a', () => { g.rect(8.6, 9.4, 2.8, 3.2); }, '#5e4310');
        break;
      case 'equipment':
        shape('#aeb6c2', () => {
          g.moveTo(7, 3.5); g.lineTo(13, 3.5); g.lineTo(16.5, 6.5); g.lineTo(14.5, 10); g.lineTo(13, 8.4);
          g.lineTo(13, 16.5); g.lineTo(7, 16.5); g.lineTo(7, 8.4); g.lineTo(5.5, 10); g.lineTo(3.5, 6.5); g.closePath();
        });
        line('#dfe5ec', 1.2, () => { g.moveTo(8.2, 4.6); g.lineTo(8.2, 15.4); });
        line('#6e7682', 1.2, () => { g.moveTo(12, 5.5); g.lineTo(12, 15.4); });
        break;
      case 'prayer':
        shape('#eef0f8', () => { g.moveTo(10, 2); g.quadraticCurveTo(14.2, 8, 12.4, 17); g.lineTo(7.6, 17); g.quadraticCurveTo(5.8, 8, 10, 2); });
        line('#c2c6da', 1.2, () => { g.moveTo(11, 5); g.quadraticCurveTo(12.6, 10, 11.6, 16); });
        break;
      case 'magic':
        shape('#3450c4', () => {
          g.moveTo(10, 1); g.lineTo(12, 7.8); g.lineTo(19, 10); g.lineTo(12, 12.2); g.lineTo(10, 19);
          g.lineTo(8, 12.2); g.lineTo(1, 10); g.lineTo(8, 7.8); g.closePath();
        });
        shape('#8ca4f0', () => { g.moveTo(10, 5); g.lineTo(11.2, 8.8); g.lineTo(15, 10); g.lineTo(11.2, 11.2); g.lineTo(10, 15); g.lineTo(8.8, 11.2); g.lineTo(5, 10); g.lineTo(8.8, 8.8); g.closePath(); }, '#3450c4');
        break;
      case 'music':
        line(INK, 3.4, () => { g.moveTo(8, 15); g.lineTo(8, 4); g.lineTo(15, 3); g.lineTo(15, 13); });
        line('#2e9440', 1.8, () => { g.moveTo(8, 15); g.lineTo(8, 4); g.lineTo(15, 3); g.lineTo(15, 13); });
        shape('#2e9440', () => { g.ellipse(6, 15, 2.6, 2, -0.3, 0, 7); });
        shape('#2e9440', () => { g.ellipse(13, 13, 2.6, 2, -0.3, 0, 7); });
        break;
      case 'friends':
        shape('#3a8a3a', () => { g.arc(7, 9, 4.5, 0, 7); });
        shape('#3a8a3a', () => { g.arc(13, 9, 4.5, 0, 7); });
        line('#2a6a2a', 1.4, () => { g.moveTo(5, 14); g.quadraticCurveTo(10, 17, 15, 14); });
        shape('#5ae05a', () => { g.arc(16, 5, 2.2, 0, 7); }, '#2a6a2a');
        break;
      case 'settings': {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          line(INK, 3.4, () => { g.moveTo(10 + Math.cos(a) * 4.5, 10 + Math.sin(a) * 4.5); g.lineTo(10 + Math.cos(a) * 8.2, 10 + Math.sin(a) * 8.2); });
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          line('#b0a890', 1.8, () => { g.moveTo(10 + Math.cos(a) * 4.5, 10 + Math.sin(a) * 4.5); g.lineTo(10 + Math.cos(a) * 7.8, 10 + Math.sin(a) * 7.8); });
        }
        shape('#b0a890', () => { g.arc(10, 10, 5, 0, 7); });
        shape('#8a8268', () => { g.arc(10, 10, 2.2, 0, 7); }, '#544e3c');
        break;
      }
      case 'logout':
        line(INK, 3.8, () => { g.arc(10, 11, 6, -2.55, -0.59); });
        line('#c43c34', 2, () => { g.arc(10, 11, 6, -2.55, -0.59); });
        line(INK, 3.8, () => { g.moveTo(10, 3); g.lineTo(10, 10); });
        line('#e06a5c', 2, () => { g.moveTo(10, 3); g.lineTo(10, 10); });
        break;
      default:
        shape('#888888', () => { g.arc(10, 10, 6, 0, 7); });
    }
  });
}
