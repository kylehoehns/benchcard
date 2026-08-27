import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Every name a module imports, against that module's own body.
 *
 * Cosmetic on its own — an unused import costs a coach nothing. It is here
 * because it punches a hole in a guard this repo already trusts.
 * `test/dead-export.test.js` asks "does any reader file mention this name?",
 * and a reader file's own `import` statement mentions it. So a dead import
 * launders a dead export straight past the sweep: the export has no real
 * reader anywhere, the sweep reports clean, and the name ships forever.
 *
 * Verified rather than assumed, 2026-08-24: a genuinely dead export was added
 * to `dom.js` and imported-but-unused in `card.js`, and the export sweep
 * passed. This test failed on the same tree. Nothing is laundered today, but
 * the mechanism is live, and the export sweep cannot close it from its own
 * side without re-parsing every import — which is this file.
 *
 * Scope, deliberately narrow to the only form this codebase uses: named
 * static imports, `import { a, b as c } from './x.js';`, one or more lines.
 * There are no default, namespace or side-effect imports in `app/`; if one
 * appears, it is simply not scanned, not silently mis-scanned.
 *
 * A name counts as used if it appears anywhere outside the import block —
 * including inside a comment. That is a deliberate false-negative: comments
 * name the things they explain, and a guard that fires on a correct file is
 * worse than one that misses an occasional leftover.
 */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const MODULES = readdirSync(new URL('app', ROOT)).filter((f) => f.endsWith('.js'));

/* Imported and unused on purpose. Anything added here needs a reason on the
 * line — the same shape as `test/dead-export.test.js`'s keep-list. */
const KEEP = new Map([]);

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'[^']*';?[ \t]*$/gm;

/* `\b` is useless for `$` (dom.js exports it), so bound on the identifier
 * character class directly — same expression as the export sweep. */
const uses = (name, src) =>
  new RegExp(`(?<![A-Za-z0-9_$])${name.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`).test(src);

function importsOf(src) {
  const names = [];
  for (const m of src.matchAll(IMPORT)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.push(n);
    }
  }
  return names;
}

/* The body is the file with its import statements removed, so a name's own
 * import no longer counts as a use of it. */
const bodyOf = (src) => src.replace(IMPORT, '');

test('every import in app/ is used by the file that imports it', () => {
  const dead = [];
  for (const file of MODULES) {
    const src = read('app/' + file);
    const body = bodyOf(src);
    for (const name of importsOf(src)) {
      if (KEEP.has(`${file}:${name}`)) continue;
      if (!uses(name, body)) dead.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(dead, [],
    'imported and never used — delete the name from the import list. An '
    + 'unused import also hides a dead export from test/dead-export.test.js, '
    + 'which counts a mention inside an import statement as a reader:\n  '
    + dead.join('\n  '));
});

/* The multi-line form is real (`app.js`, `state.js`, `gamemode.js`,
 * `strategy.js` all wrap an import list), and a single-line-only regex would
 * silently skip those four files. Pin that the scanner sees them. */
test('the scanner reads multi-line import lists', () => {
  assert.deepEqual(
    importsOf("import { a, b as c,\n         d } from './x.js';\nconst q = 1;\n"),
    ['a', 'c', 'd']);
  assert.ok(importsOf(read('app/app.js')).includes('migrateLegacy'),
    'app.js wraps its state.js import across two lines; the scanner must see the tail');
});

test('the keep-list itself is still live', () => {
  for (const key of KEEP.keys()) {
    const [file, name] = key.split(':');
    assert.ok(MODULES.includes(file), `${key}: app/${file} no longer exists`);
    assert.ok(importsOf(read('app/' + file)).includes(name),
      `${key}: no longer imported — drop it from KEEP`);
  }
});
