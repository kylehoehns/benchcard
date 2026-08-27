import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Every `export` in `app/*.js`, against every file that could read it.
 *
 * The sibling of `test/dead-class.test.js`, and it exists for the same reason:
 * this app has no build step and no bundler, so nothing ever tells you that a
 * name is offered and never taken. The 2026-08-24 sweep found 37 export names
 * with no reader outside their own file — four of them (`onceInView`, `SOFT`,
 * `hasIcon`, `iconNames`) with no reader at all, dead code that had been
 * shipped to every install for months, and the rest module-private helpers
 * wearing a keyword that claimed otherwise.
 *
 * That matters more here than in a bundled app. `export` is the only statement
 * a module makes about what it offers; when a third of those names have no
 * reader, the next person cannot tell an API from a leftover, and every future
 * dead-code hunt starts by writing this scan again by hand.
 *
 * A "reader" is any of: another `app/*.js` module, an HTML file in `app/`
 * (inline scripts import from these modules), a test, or a build/CI script.
 * The defining file itself never counts — internal use is exactly the case
 * that should have dropped the keyword.
 *
 * Scope, deliberately: only the declaration forms this codebase actually uses
 * — `export function`, `export const/let/class`, and `export { a, b as c }` at
 * the start of a line. Re-exports and default exports are not used here and
 * are not scanned.
 */

const ROOT = new URL('../', import.meta.url);
const readDir = (d) => readdirSync(new URL(d, ROOT));
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

/* Exports with no reader on purpose. Anything added here needs a reason on
 * the line, or the next sweep cannot tell a deliberate keep from a leftover. */
const KEEP = new Map([
  // `engine.js` is under a no-touch ban while the solver is frozen; this is a
  // module-private helper wearing a stray `export` -- the one name the
  // 2026-08-24 sweep could not clear.
  ['engine.js:periodLabel', 'engine.js is frozen'],
]);

const MODULES = readDir('app').filter((f) => f.endsWith('.js') && f !== 'sw.js');

const READERS = [
  ...MODULES.map((f) => ['app/' + f, read('app/' + f)]),
  ...readDir('app').filter((f) => f.endsWith('.html')).map((f) => ['app/' + f, read('app/' + f)]),
  ...readDir('test').filter((f) => f.endsWith('.js')).map((f) => ['test/' + f, read('test/' + f)]),
  ...readDir('scripts').filter((f) => /\.(m?js|json)$/.test(f)).map((f) => ['scripts/' + f, read('scripts/' + f)]),
];

/* `\b` is useless for `$` (dom.js exports it), so bound on the identifier
 * character class directly. */
const uses = (name, src) =>
  new RegExp(`(?<![A-Za-z0-9_$])${name.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`).test(src);

function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  return names;
}

test('every export in app/ has a reader outside its own file', () => {
  const dead = [];
  for (const file of MODULES) {
    for (const name of exportsOf(read('app/' + file))) {
      if (KEEP.has(`${file}:${name}`)) continue;
      const found = READERS.some(([path, src]) => path !== 'app/' + file && uses(name, src));
      if (!found) dead.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(dead, [],
    'exported with no reader — delete it, or drop the `export` keyword if the '
    + 'use is internal:\n  ' + dead.join('\n  '));
});

test('the keep-list itself is still live', () => {
  for (const key of KEEP.keys()) {
    const [file, name] = key.split(':');
    assert.ok(MODULES.includes(file), `${key}: app/${file} no longer exists`);
    assert.ok(exportsOf(read('app/' + file)).has(name),
      `${key}: no longer exported — drop it from KEEP`);
  }
});
