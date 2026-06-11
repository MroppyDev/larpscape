// Serializes itemSpec() pixmaps for every item id into trade/src/data/sprites.json,
// exactly like scripts/build-wiki.ts does for the wiki. Run before vite:
//   npx tsx trade/build-sprites.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import itemsJson from '../data/items.json';
import { itemSpec } from '../src/sprites';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'src/data/sprites.json');

const sprites: Record<string, { grid: string[]; palette: Record<string, string> }> = {};
let missing = 0;
for (const id of Object.keys(itemsJson).sort()) {
  const spec = itemSpec(id);
  if (spec) sprites[id] = { grid: spec[0], palette: spec[1] };
  else missing++;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(sprites));
console.log(`trade sprites: ${Object.keys(sprites).length} serialized, ${missing} without art ('?' fallback)`);
