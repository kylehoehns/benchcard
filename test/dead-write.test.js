import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* A write whose value the markup already carries is a write that does nothing
 * — and, worse, it is a SECOND source for one string.
 *
 * The sixth sibling of `dead-class` / `dead-export` / `dead-id` / `dead-var` /
 * `dead-icon`. Those five all ask "does this thing have a user?". This one
 * asks the other question, the one the 2026-08-24 sweeps kept finding defects
 * with: not "is it used" but "could this ever change anything".
 *
 * Found by the duplicated-string-constant sweep, 2026-08-24:
 * `gamemode.js` ran `set('#gmFloorLab', 'textContent', 'On the floor')` on
 * every game-mode render, into a span `index.html` already shipped reading
 * "On the floor". Never branched, never varied. Proved live rather than by
 * grep: the served markup was edited to a sentinel, the sentinel reached the
 * DOM, and opening game mode silently reverted it. So a copy edit to the
 * markup — exactly what the overnight copy run-through does — would have been
 * thrown away with no error and no diff to look at. Both the write and the
 * span it targeted are gone; the markup is the one source.
 *
 * The rule, stated so it stays narrow: a module may write a constant into an
 * element, or the markup may declare that text, but not both with the same
 * text. A JS write that BRANCHES is fine (`#gmBenchLab` really does alternate
 * between "Bench" and "Swap in for …", and `#themeNow` really does cycle), so
 * only literal-argument writes are examined. The markup keeps the constant
 * labels and the modules keep the variable ones, which is already this file's
 * convention — `#gmMinsKey` sits empty in the markup beside the label that
 * does not.
 */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const MARKUP = 'app/index.html';
const html = read(MARKUP);

const SOURCES = readdirSync(new URL('app', ROOT))
  .filter((f) => f.endsWith('.js'))
  .map((f) => ['app/' + f, read('app/' + f)]);

/* The leading text run of the element carrying `id`: everything between that
 * element's own `>` and the next `<`. Enough for the shape this guards — a
 * label element whose whole content is one string — and it deliberately
 * returns '' for an element that opens with a child, which is not this shape. */
function leadingText(id) {
  const at = html.indexOf(` id="${id}"`);
  if (at < 0) return null;
  const gt = html.indexOf('>', at);
  if (gt < 0) return null;
  const lt = html.indexOf('<', gt);
  return html.slice(gt + 1, lt < 0 ? undefined : lt).trim();
}

/* Both spellings of a constant write, and only the constant ones: the literal
 * has to be the whole argument, so anything with a `${…}` or a ternary in it
 * never matches. */
const PATTERNS = [
  /set\(\s*'#([A-Za-z0-9_-]+)'\s*,\s*'textContent'\s*,\s*'([^'\\\n]*)'\s*\)/g,
  /\$\(\s*'#([A-Za-z0-9_-]+)'\s*\)(?:\?)?\.textContent\s*=\s*'([^'\\\n]*)'/g,
];

test('no module writes a constant the markup already carries', () => {
  const dead = [];
  for (const [file, src] of SOURCES) {
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) {
        const [, id, value] = m;
        if (!value) continue;              // clearing an element is not a duplicate
        const already = leadingText(id);
        if (already !== null && already === value) {
          const line = src.slice(0, m.index).split('\n').length;
          dead.push(`${file}:${line} writes ${JSON.stringify(value)} into #${id}, which ${MARKUP} already says`);
        }
      }
    }
  }
  assert.deepEqual(dead, [],
    'Two sources for one string. Delete the write and let the markup say it, ' +
    'or delete the markup text and let the module own it — not both:\n' + dead.join('\n'));
});
