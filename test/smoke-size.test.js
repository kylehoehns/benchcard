/* #58's own guard: `scripts/smoke.mjs` was 3,062 lines and 167,309 bytes
 * before the split, past the point an agent changing one check could read
 * just that check without paging through the whole file. This asserts the
 * ceiling the split promised — every file in `scripts/smoke.mjs` and under
 * `scripts/smoke/` (recursively, in case a future split nests a directory)
 * is under 40,000 bytes — rather than trusting that a later edit never grows
 * one of them back past it.
 *
 * Byte size, not line count: a `.mjs` file with long template strings (the
 * probe scripts several passes evaluate in the page) can be small in lines
 * and large in bytes, which is the unit the "read it without paging" goal is
 * actually about. `statSync(...).size` is what `wc -c` reports, not a
 * `.length` on decoded text, which would count code points instead of the
 * bytes a reader (or an agent's context window) actually pays for. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LIMIT = 40_000;

// Recurse so a future nested split is still covered, not just today's flat
// `scripts/smoke/*.mjs` layout.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function smokeFiles() {
  return [join(ROOT, 'scripts', 'smoke.mjs'), ...walk(join(ROOT, 'scripts', 'smoke'))];
}

test('every file that makes up the smoke harness is under 40,000 bytes', () => {
  const files = smokeFiles();

  // 2a: a check that measured nothing FAILS, not passes vacuously. If the
  // split ever collapsed back to nothing under scripts/smoke/, or the path
  // stopped resolving, `files.every(...)` below would be vacuously true and
  // this would go green about a harness it never looked at.
  assert.ok(files.length >= 19,
    `expected at least 19 files across scripts/smoke.mjs and scripts/smoke/, found ${files.length}: ` +
    `${JSON.stringify(files)} — a guard that measured nothing must fail, not pass`);

  const sizes = files.map(f => ({ file: f, size: statSync(f).size }));
  const over = sizes.filter(s => s.size > LIMIT);

  assert.deepEqual(over, [],
    `file(s) over the ${LIMIT}-byte guard: ` +
    over.map(s => `${s.file} (${s.size} bytes)`).join(', '));
});
