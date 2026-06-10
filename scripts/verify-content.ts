// Verifies the JSON-loaded world matches the pre-refactor fingerprint.
// Run: npx tsx scripts/verify-content.ts <expected-fingerprint>
import crypto from 'crypto';
import { buildWorld, terrain, objects } from '../src/world';

buildWorld();
const mapObjects = objects.map((o) => ({ type: o.type, x: o.x, y: o.y }));
const hash = crypto.createHash('sha256');
hash.update(terrain);
hash.update(JSON.stringify(mapObjects));
const fp = hash.digest('hex');
console.log('world fingerprint:', fp);
const expected = process.argv[2];
if (expected) {
  if (fp === expected) console.log('MATCH — world is byte-identical');
  else { console.error('MISMATCH — expected ' + expected); process.exit(1); }
}
