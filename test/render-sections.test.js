import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Every repaintable region in `render.js` is placed, or deliberately not.
 *
 * `SECTIONS` is the app's whole repaint vocabulary. `AFTER_EDIT` and
 * `PLAN_ONLY` are the subsets an edit is allowed to touch, and a key that is
 * in `SECTIONS` but in neither list simply never repaints after an edit. That
 * failure is completely silent: no test, no smoke check, no console error —
 * the region just shows yesterday's numbers until something triggers a full
 * `render()`.
 *
 * It has nearly happened three times, and each near-miss left behind a test
 * asserting one key by hand: `test/season.test.js:378`,
 * `test/season-view.test.js:60`, `test/budget-actuals.test.js:38`. This is
 * the same assertion made once, over all of them, so the next section added
 * cannot slip through.
 *
 * The keep-list carries the sections that are correctly absent, each with the
 * reason on the line — the shape `test/dead-export.test.js` uses. Read over
 * source text rather than by importing `render.js`: it pulls in fifteen view
 * modules and touches the DOM at import time.
 */

const SRC = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');

/* In `SECTIONS` and in neither list, on purpose. */
const KEEP = new Map([
  ['roster', 'rebuilt by its own edits (add/remove/reorder), and it holds the rows a coach is dragging'],
  ['setup', 'the game-setup form: inputs a coach types into, repainted only when the game changes'],
  ['avail', 'the availability toggles repaint themselves in place as they are tapped'],
  ['levels', 'the level meters live inside the roster rows, so `roster` covers them'],
  ['constraints', 'the rule editor holds a select and two number inputs mid-edit; `seasonadj` is its plan-dependent half and IS in both lists'],
  ['season', 'the filed-games ledger: nothing about today changes it, so it repaints on a full render only'],
]);

const listOf = (name) => {
  const m = SRC.match(new RegExp(`^export const ${name} = \\[([^\\]]*)\\];`, 'm'));
  assert.ok(m, `${name} is no longer declared as a single-line exported array in render.js`);
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

const sectionKeys = () => {
  const start = SRC.indexOf('const SECTIONS = {');
  assert.ok(start >= 0, 'SECTIONS is no longer declared in render.js');
  const body = SRC.slice(start, SRC.indexOf('\nconst ALL', start));
  const keys = [...body.matchAll(/^ {2}([A-Za-z0-9_$]+):\s/gm)].map((m) => m[1]);
  assert.ok(keys.length > 10, 'SECTIONS scan found almost nothing — the shape changed');
  return keys;
};

test('every SECTIONS key is placed in AFTER_EDIT, PLAN_ONLY or KEEP', () => {
  const after = listOf('AFTER_EDIT');
  const planOnly = listOf('PLAN_ONLY');
  const unplaced = sectionKeys().filter(
    (k) => !after.includes(k) && !planOnly.includes(k) && !KEEP.has(k));
  assert.deepEqual(unplaced, [],
    'section(s) that no edit will ever repaint. Add each to AFTER_EDIT (and '
    + 'PLAN_ONLY if it must not be rebuilt mid-interaction), or to this '
    + "file's KEEP with the reason on the line:\n  " + unplaced.join('\n  '));
});

test('AFTER_EDIT and PLAN_ONLY name only real sections', () => {
  const keys = sectionKeys();
  for (const name of ['AFTER_EDIT', 'PLAN_ONLY']) {
    for (const k of listOf(name)) {
      assert.ok(keys.includes(k), `${name} names '${k}', which is not a SECTIONS key — render(${k}) would throw`);
    }
  }
});

test('PLAN_ONLY stays a subset of AFTER_EDIT', () => {
  const after = listOf('AFTER_EDIT');
  for (const k of listOf('PLAN_ONLY')) {
    assert.ok(after.includes(k),
      `PLAN_ONLY names '${k}' but AFTER_EDIT does not: a plan change would repaint it and a plain edit would not`);
  }
});

test('the keep-list itself is still live', () => {
  const keys = sectionKeys();
  const after = listOf('AFTER_EDIT');
  const planOnly = listOf('PLAN_ONLY');
  for (const [k, why] of KEEP) {
    assert.ok(keys.includes(k), `KEEP names '${k}', which is no longer a SECTIONS key — drop it`);
    assert.ok(!after.includes(k) && !planOnly.includes(k),
      `KEEP names '${k}' but it is now placed in a list — drop it from KEEP`);
    assert.ok(why.length > 20, `KEEP['${k}'] needs a real reason on the line`);
  }
});
