import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Every path in `icons.js`'s `PATHS`, against every name the app asks for —
 * and every name the app asks for, against `PATHS`.
 *
 * The fifth sibling of `test/dead-class.test.js`, `test/dead-export.test.js`,
 * `test/dead-id.test.js` and `test/dead-var.test.js`. None of them reaches an
 * icon: `PATHS` is a module-private object, so the export guard sees only
 * `icon()` itself, and the name never appears as a class, an id or a custom
 * property.
 *
 * The 2026-08-24 sweep found three paths nothing asks for -- `check`,
 * `circle_help` and `users` -- each of which also had a vendored SVG that
 * `vendor/fetch.sh` downloaded and no one ever extracted.
 *
 * The second direction is the one that actually bites. `icon()` ends with
 *
 *     svg.innerHTML = d || '';
 *
 * so a name with no path does not throw -- it renders an empty 1em <svg>.
 * A typo in a `data-icon` attribute is therefore invisible in the browser and
 * invisible in the console, and the only place it can be caught is here.
 *
 * A name is "asked for" if it appears as a `data-icon` attribute in the
 * markup or as a string literal anywhere in a module, which deliberately
 * catches the four call sites that pass a variable: `card.js`'s
 * `play`/`maximize-2`, `render.js`'s theme ternary, `strategy.js`'s
 * `lock`/`lock-open`, and `plan-view.js`'s severity map.
 */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const iconsJs = read('app/icons.js');
const modules = readdirSync(new URL('app', ROOT))
  .filter((f) => f.endsWith('.js') && f !== 'icons.js')
  .map((f) => read('app/' + f));
const pages = readdirSync(new URL('app', ROOT))
  .filter((f) => f.endsWith('.html'))
  .map((f) => read('app/' + f));

// `PATHS` keys use underscores; every name at a call site uses hyphens.
const key = (n) => n.replace(/-/g, '_');

const declared = [...iconsJs.matchAll(/^ {2}([a-z0-9_]+): '/gm)].map((m) => m[1]);

const asked = new Set();
for (const html of pages) {
  for (const m of html.matchAll(/data-icon="([^"]+)"/g)) asked.add(key(m[1]));
}
for (const src of modules) {
  for (const m of src.matchAll(/'([a-z0-9-]+)'/g)) asked.add(key(m[1]));
}

test('icons.js declares no path the app never asks for', () => {
  const dead = declared.filter((k) => !asked.has(k));
  assert.deepEqual(dead, [],
    'path data nothing renders -- delete the entry, and drop the icon from '
    + 'vendor/fetch.sh so it stops being downloaded:\n  ' + dead.join('\n  '));
});

test('every data-icon in the markup has a path', () => {
  const missing = [];
  for (const html of pages) {
    for (const m of html.matchAll(/data-icon="([^"]+)"/g)) {
      if (!declared.includes(key(m[1]))) missing.push(m[1]);
    }
  }
  assert.deepEqual([...new Set(missing)], [],
    'renders a silent blank -- `icon()` falls back to an empty <svg>:\n  '
    + missing.join('\n  '));
});

test('every icon vendor/fetch.sh downloads is extracted into icons.js', () => {
  const sh = read('app/vendor/fetch.sh');
  const list = sh.match(/for n in ([\s\S]*?); do/);
  assert.ok(list, 'vendor/fetch.sh no longer has an icon list');
  const names = list[1].replace(/\\\s*\n/g, ' ').trim().split(/\s+/);
  const unused = names.filter((n) => !declared.includes(key(n)));
  assert.deepEqual(unused, [],
    'downloaded and committed, but its path was never extracted:\n  ' + unused.join('\n  '));
});

test('every icon icons.js declares is vendored, so its provenance is checked in', () => {
  const svgs = readdirSync(new URL('app/vendor/icons', ROOT)).map((f) => key(f.replace(/\.svg$/, '')));
  const orphan = declared.filter((k) => !svgs.includes(k));
  assert.deepEqual(orphan, [],
    'path data with no vendored source -- add it to vendor/fetch.sh:\n  ' + orphan.join('\n  '));
});
