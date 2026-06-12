// scripts/lint-no-client-grants.ts — the objective proof of ZERO client-authored
// owned data (docs/CONVERSION-CONTRACT.md §lint). Scans the content/pack/quest
// files and FAILS (exit 1) if any of them reference an owned-state mutator
// directly. After the conversion is complete this lint is GREEN, which is the
// machine-checkable guarantee that the client only reflects server-granted
// state. Run via `npm run lint:grants`.
//
// What counts as authoring owned state (forbidden in the scanned files):
//   * the apply-boundary mutators in src/game.ts:
//       addXp / addItem / removeItem / removeFromSlot
//       _applyXp / _applyItem / _applyRemove / _applyRemoveFromSlot
//       applyGrant / applyIntentEcho
//   * the legacy owned-state UI mutators that wrote save state locally:
//       bankDeposit / bankWithdraw / shopBuy / shopSell
//       equipItem / unequip / setEquip
//   * direct writes to owned save fields on the player object:
//       state.player.quests[...] =            (quest stage)
//       state.player.collectionLog[...] =     (collection log)
//       state.player.slayerTask = / .slayerPoints =
//       state.player.specEnergy = / .curHp = / .prayerPoints =
//       p.bank.push(...) / direct bank mutation
//
// Allowed (NOT owned-state authoring): requestIntent / sendIntent, all read-only
// helpers (invCount/hasItem/level/...), and presentation/UI calls.
//
// The scan strips comments and string literals first so doc comments that NAME a
// forbidden function (like this header, or game.ts's migration examples) never
// trip the lint — only real code references count.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Files/dirs the lint governs (the content surface that must author nothing).
const TARGETS = [
  'src/content.ts',
  'src/quests.ts',
  'src/packs', // recursed
  'src/tutorial.ts',
  'src/friends.ts',
];

// Forbidden bare identifiers (owned-state mutators). Matched on word boundaries.
const FORBIDDEN_CALLS = [
  'addXp', 'addItem', 'removeItem', 'removeFromSlot',
  '_applyXp', '_applyItem', '_applyRemove', '_applyRemoveFromSlot',
  'applyGrant', 'applyIntentEcho',
  'bankDeposit', 'bankWithdraw', 'shopBuy', 'shopSell',
  'equipItem', 'unequip', 'setEquip',
];

// Forbidden direct owned-field writes (assignment / push on the player doc).
const FORBIDDEN_WRITES: { re: RegExp; what: string }[] = [
  { re: /(?:state\.)?player\s*\.\s*quests\s*\[[^\]]*\]\s*(?:=|\+\+|--|\+=|-=)(?!=)/, what: 'quest stage write' },
  { re: /(?:state\.)?player\s*\.\s*collectionLog\s*\[[^\]]*\]\s*(?:=|\+=)(?!=)/, what: 'collectionLog write' },
  { re: /(?:state\.)?player\s*\.\s*slayerTask\s*=(?!=)/, what: 'slayerTask write' },
  { re: /(?:state\.)?player\s*\.\s*slayerPoints\s*(?:=|\+=|-=)(?!=)/, what: 'slayerPoints write' },
  { re: /(?:state\.)?player\s*\.\s*specEnergy\s*(?:=|\+=|-=)(?!=)/, what: 'specEnergy write' },
  { re: /(?:state\.)?player\s*\.\s*curHp\s*(?:=|\+=|-=)(?!=)/, what: 'curHp write' },
  { re: /(?:state\.)?player\s*\.\s*prayerPoints\s*(?:=|\+=|-=)(?!=)/, what: 'prayerPoints write' },
  { re: /(?:state\.)?player\s*\.\s*bank\s*\.\s*(?:push|splice|pop|shift|unshift)\s*\(/, what: 'bank array mutation' },
  { re: /(?:state\.)?player\s*\.\s*xp\s*\[[^\]]*\]\s*(?:=|\+=|-=)(?!=)/, what: 'xp array write' },
];

interface Finding { file: string; line: number; col: number; what: string; text: string; }

// Strip // line comments, /* */ block comments, and the *contents* of string
// literals (keeping the quotes) so identifiers inside docs/strings don't match.
function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  type Mode = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl';
  let mode: Mode = 'code';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { mode = 'sq'; out += c; i++; continue; }
      if (c === '"') { mode = 'dq'; out += c; i++; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; } else out += ' ';
      i++; continue;
    }
    if (mode === 'block') {
      if (c === '*' && c2 === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // string literals: keep newlines for line accuracy, blank everything else,
    // honor escapes, and close on the matching quote.
    if (mode === 'sq' || mode === 'dq' || mode === 'tpl') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      const close = mode === 'sq' ? "'" : mode === 'dq' ? '"' : '`';
      if (c === close) { mode = 'code'; out += c; i++; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
  }
  return out;
}

function scanFile(abs: string, rel: string): Finding[] {
  const raw = fs.readFileSync(abs, 'utf8');
  const stripped = stripCommentsAndStrings(raw);
  const rawLines = raw.split('\n');
  const lines = stripped.split('\n');
  const findings: Finding[] = [];

  const callRe = new RegExp(`\\b(${FORBIDDEN_CALLS.join('|')})\\b`, 'g');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let m: RegExpExecArray | null;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(line)) !== null) {
      // ignore property accesses like `.addItem` only if it's a method on some
      // other object? In this codebase the mutators are free functions, so any
      // bare reference is a violation. A leading '.' would still be game-owned;
      // we flag it to be safe.
      findings.push({ file: rel, line: li + 1, col: m.index + 1, what: `mutator ${m[1]}()`, text: rawLines[li].trim() });
    }
    for (const w of FORBIDDEN_WRITES) {
      const wm = w.re.exec(line);
      if (wm) findings.push({ file: rel, line: li + 1, col: (wm.index ?? 0) + 1, what: w.what, text: rawLines[li].trim() });
    }
  }
  return findings;
}

function walk(rel: string, acc: string[]): void {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(abs)) walk(path.join(rel, e), acc);
  } else if (rel.endsWith('.ts') && !rel.endsWith('.d.ts')) {
    acc.push(rel);
  }
}

function main(): void {
  const files: string[] = [];
  for (const t of TARGETS) walk(t, files);
  files.sort();

  const all: Finding[] = [];
  for (const rel of files) all.push(...scanFile(path.join(ROOT, rel), rel));

  if (all.length === 0) {
    console.log(`lint:grants — OK. ${files.length} content file(s) author zero owned state.`);
    process.exit(0);
  }

  console.error(`lint:grants — FAILED. ${all.length} client-authored owned-state reference(s):\n`);
  let lastFile = '';
  for (const f of all) {
    if (f.file !== lastFile) { console.error(`  ${f.file}:`); lastFile = f.file; }
    console.error(`    ${f.file}:${f.line}:${f.col}  ${f.what}\n      ${f.text}`);
  }
  console.error(
    '\nReplace these with requestIntent(kind, payload) — the server validates and ' +
    'grants; the client reflects the echo via applyGrant. See docs/CONVERSION-CONTRACT.md.',
  );
  process.exit(1);
}

main();
