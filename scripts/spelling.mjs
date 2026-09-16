#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/* #61: American spelling everywhere. One word list, here, so the hook and the
   guard test both read it rather than each holding a copy.

   Each British fragment is built from pieces so this file's own source never
   contains the fragment it is looking for -- the module is scanned like every
   other tracked file, with no exclusion for itself. */
export const WORDS = [
  ['colo' + 'ur', 'color'],
  ['gr' + 'ey', 'gray'],
  ['cent' + 're', 'center'],
  ['favo' + 'ur', 'favor'],
  ['behavio' + 'ur', 'behavior'],
  ['organi' + 's', 'organiz'],
  ['recogni' + 's', 'recogniz'],
  ['licen' + 'ce', 'license'],
];

/* A line carrying this marker is allowed to keep a British word, because it
   reads (or exercises reading) data saved before #61. It contains no
   fragment itself. */
export const LEGACY_MARK = 'legacy-spelling';

/* The exact number of marked lines each file is allowed to carry, pinned by
   hand against what those files actually do -- see spelling.test.js. */
export const ALLOWED = {
  'app/storage.js': 1,
  'app/index.html': 1,
  'test/storage.test.js': 7,
  'test/first-paint.test.js': 2,
};

/** `git ls-files`, minus app/vendor/ and binary files. Throws rather than
 *  silently returning nothing -- a scan that reads no files finds no bugs. */
export function trackedFiles() {
  let out;
  try {
    out = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`spelling guard: \`git ls-files\` failed: ${e.message}`);
  }
  const all = out.split('\n').filter(Boolean);
  if (!all.length) throw new Error('spelling guard: `git ls-files` returned nothing');
  const files = all
    .filter(f => !f.startsWith('app/vendor/'))
    .filter(f => {
      let buf;
      try { buf = readFileSync(f); } catch { return false; }
      return !buf.includes(0);
    });
  if (!files.length) throw new Error('spelling guard: nothing left to scan after filtering');
  return files;
}

/** Every fragment on every line of `text`, 1-based. */
export function scan(text) {
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marked = line.includes(LEGACY_MARK);
    for (const [british, american] of WORDS) {
      const re = new RegExp(british, 'gi');
      let m;
      while ((m = re.exec(line)) !== null) {
        hits.push({ line: i + 1, fragment: m[0], american, marked });
      }
    }
  }
  return hits;
}

/* CLI: `node scripts/spelling.mjs <file>...` -- prints one line per unmarked
   hit and always exits 0. The hook is advisory, so a British spelling never
   blocks a commit; it only gets a note. */
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const hit of scan(text)) {
      if (!hit.marked) {
        console.log(`${file}:${hit.line}: "${hit.fragment}" → use "${hit.american}"`);
      }
    }
  }
  process.exit(0);
}
