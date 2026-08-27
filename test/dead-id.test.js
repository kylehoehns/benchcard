import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Every `id` in the shipped markup, against every file that could read it —
 * and every `#id` selector in the modules, against the markup.
 *
 * The third sibling of `test/dead-class.test.js` ("does every class the JS
 * emits have a rule?") and `test/dead-export.test.js` ("does every exported
 * name have a reader?"). Neither of those reaches an `id`, and `index.html`
 * carried 138 of them. The 2026-08-24 sweep found five with no reader at all:
 * `#cardHint` (real hint, but `game-setup.js` writes it through
 * `.s-cardhd .hint`, so the id had been inert since that selector was
 * written), `#seasonwrap` / `#setTeam` / `#setApp` (ids on `.side-box`
 * wrappers that take every declaration from the class), and `#backupbox` — an
 * unstyled wrapper `<div>` that existed only so one test had somewhere to
 * slice the HTML, a DOM node shipped to every install for a test anchor.
 *
 * Why it is worth a guard rather than a one-off delete: an inert `id` reads
 * as a hook that something depends on, so it survives every refactor that
 * walks past it, and there is no build step here to notice.
 *
 * A "reader" is a mention anywhere in `app/*.js`, `app/*.css` or the markup
 * file itself — the last one on purpose, so an id whose only use is an
 * `aria-labelledby` (`#helpTitle`, `#keysTitle`) counts as live. The `id="…"`
 * declarations themselves never count.
 */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const readDir = (d) => readdirSync(new URL(d, ROOT));

/* Ids with no reader on purpose. Anything added here needs a reason on the
 * line, or the next sweep cannot tell a deliberate hook from a leftover. */
const KEEP = new Map();

const MARKUP = ['app/index.html'];
const SOURCES = readDir('app')
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => ['app/' + f, read('app/' + f)]);

const idsIn = (src) => [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

const bounded = (name) =>
  new RegExp(`(?<![A-Za-z0-9_$-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_$-])`, 'g');

test('every id in the shipped markup has a reader', () => {
  const dead = [];
  for (const file of MARKUP) {
    const html = read(file);
    for (const id of new Set(idsIn(html))) {
      if (KEEP.has(id)) continue;
      // the markup counts as its own reader, minus the declarations
      const own = (html.match(bounded(id)) || []).length
        - (html.match(new RegExp(`\\sid="${id}"`, 'g')) || []).length;
      const found = own > 0 || SOURCES.some(([, src]) => bounded(id).test(src));
      if (!found) dead.push(`${file}: #${id}`);
    }
  }
  assert.deepEqual(dead, [],
    'declared and never read — delete the attribute, and the element too if '
    + 'the id was its only reason to exist:\n  ' + dead.join('\n  '));
});

test('no id is declared twice on one page', () => {
  for (const file of MARKUP) {
    const ids = idsIn(read(file));
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    assert.deepEqual([...new Set(dupes)], [], `${file}: duplicate id`);
  }
});

test('every #id a module selects on exists in the markup or is set at runtime', () => {
  const declared = new Set(MARKUP.flatMap((f) => idsIn(read(f))));
  const missing = [];
  for (const [path, src] of SOURCES) {
    if (!path.endsWith('.js')) continue;
    // only selector positions — a bare `'#fff'` in a canvas fill is not a query
    const CALLS = /(?:\$|\$\$|on|set|style|querySelector|querySelectorAll|closest|matches)\(\s*'([^']*#[A-Za-z][\w-]*[^']*)'/g;
    for (const m of src.matchAll(CALLS)) {
      for (const [, id] of m[1].matchAll(/#([A-Za-z][\w-]*)/g)) {
        if (declared.has(id)) continue;
        // rules.js and strategy.js build their hosts and stamp the id on
        const runtime = SOURCES.some(([, s]) =>
          new RegExp(`\\.id\\s*=\\s*['"\`]${id}['"\`]`).test(s));
        if (!runtime) missing.push(`${path}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [],
    'selects an id that is in neither the markup nor any runtime assignment:\n  '
    + missing.join('\n  '));
});

/* The other direction, and the one about.html now depends on: an in-page link
 * whose target id no longer exists. `about.html` carries a nine-link section
 * index under the hero, and the labels are the headings themselves — so a
 * heading can be reworded, lose or change its id, and the link keeps looking
 * exactly right while doing nothing. The three tests above are all scoped to
 * `index.html`; this one is every shipped page, because that is where the
 * anchors are. A bare `href="#"` is a JS hook, not a target. */
test('every in-page link points at an id on the same page', () => {
  const pages = readDir('app').filter((f) => f.endsWith('.html'));
  const broken = [];
  for (const file of pages) {
    const html = read('app/' + file);
    const declared = new Set(idsIn(html));
    for (const m of html.matchAll(/\shref="#([^"]*)"/g)) {
      if (m[1] === '') continue;
      if (!declared.has(m[1])) broken.push(`app/${file}: href="#${m[1]}"`);
    }
  }
  assert.deepEqual(broken, [],
    'links to a fragment that is on no element of that page:\n  ' + broken.join('\n  '));
});

test('every aria/for reference points at an id that exists', () => {
  const ATTRS = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'for'];
  const pages = readDir('app').filter((f) => f.endsWith('.html'));
  const broken = [];
  for (const file of pages) {
    const html = read('app/' + file);
    const declared = new Set(idsIn(html));
    // ids the modules stamp on at runtime are legitimate targets too
    const runtime = new Set(
      SOURCES.flatMap(([, s]) => [...s.matchAll(/\.id\s*=\s*['"`]([\w-]+)['"`]/g)].map((m) => m[1])));
    for (const attr of ATTRS) {
      for (const m of html.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, 'g'))) {
        for (const ref of m[1].trim().split(/\s+/)) {
          if (!declared.has(ref) && !runtime.has(ref)) broken.push(`app/${file}: ${attr}="${ref}"`);
        }
      }
    }
  }
  assert.deepEqual(broken, [], 'points at no element:\n  ' + broken.join('\n  '));
});
