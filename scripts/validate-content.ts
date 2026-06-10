// Validates all data/*.json content files (predeploy gate).
// Run: npx tsx scripts/validate-content.ts   (exit 1 on any error)
import path from 'path';
import { fileURLToPath } from 'url';
import { validateContent } from '../shared/validate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const errors = validateContent(path.resolve(__dirname, '../data'));

if (errors.length > 0) {
  console.error(`Content validation FAILED (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('Content validation passed.');
