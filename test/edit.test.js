import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #122: one path for every coach edit. `app/edit.js` owns the EDITS table --
 * each kind's class (record edit vs preference), repaint keys and timing --
 * and the `edit(kind)` function that runs the right hooks and paints
 * accordingly.
 *
 * edit.js imports state.js (for `editHappened`, `takeFirstRunPending`,
 * `save`, `state`) and analytics.js (for `track`, `bucketRoster`), but not
 * render.js, toast.js or any view -- the painter and `retireUndo` are handed
 * to it at boot through `initEdits`, so this file exercises it with a
 * recording stub for both, the same shape render.js uses for real.
 *
 * `state.js` reaches `document` at import time (`dom.js`'s `ctx2d`, a shared
 * canvas 2D context), so importing edit.js needs *some* document standing in
 * -- but not `test/dom-stub.js`: edit.js itself never touches the DOM, and a
 * dynamic import after a minimal, local, inline stub keeps that true without
 * pulling in the shared fixture other (DOM-painting) test files use. */
globalThis.document ??= {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });

// Captured so record-edit tests can observe `track('first_run_complete', ...)`
// without re-stubbing `analytics.js`'s own `track` -- `payload()` there posts
// through `navigator.sendBeacon`, which this file is the one thing standing
// in for.
// Node's own `navigator` global (added in Node 21) is a getter-only property
// with no `sendBeacon`, so a plain `globalThis.navigator ??= ...` is a no-op
// here -- `track()` (analytics.js) then falls through to its `fetch`
// fallback, which throws on a relative URL and is silently swallowed,
// leaving nothing to observe. `defineProperty` is what actually replaces it.
const beacons = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { sendBeacon: (url, body) => { beacons.push(JSON.parse(body)); return true; } },
});

const { edit, initEdits, AFTER_EDIT, PLAN_ONLY } = await import('../app/edit.js');
const { markFirstRunPending } = await import('../app/state.js');

function stub() {
  const paints = [];
  const retires = [];
  initEdits({
    paint: (...keys) => paints.push(keys),
    retireUndo: () => retires.push(true),
  });
  return { paints, retires };
}

/* The real bug (#122 decision): the strategy handler used to call
 * `renderAll()` directly, which never retires undo -- so a rule removed from
 * the Plan sheet left its Undo toast live, and tapping a different strategy
 * afterward did not retire it. Undo then restored a snapshot from before the
 * strategy tap too, and the strategy reverted along with the rule. */
test('the strategy kind retires a pending undo', () => {
  const { retires } = stub();
  edit('strategy');
  assert.equal(retires.length, 1, "edit('strategy') must retire the undo offer");
});

test('an unknown kind throws, so a typo fails loudly', () => {
  stub();
  assert.throws(() => edit('nope'), /unknown edit kind/);
});

test('a record edit runs the first-run check once', () => {
  beacons.length = 0;
  stub();
  markFirstRunPending();
  edit('strategy');
  const fires = beacons.filter(b => b.e === 'first_run_complete');
  assert.equal(fires.length, 1, "edit('strategy') must fire the first-run check exactly once");
  assert.equal(fires[0].roster, '1-5');
});

test("the strategy kind paints 'all' by calling the painter with no keys", () => {
  const { paints } = stub();
  edit('strategy');
  assert.deepEqual(paints, [[]], "keys: 'all' must call paint() with no arguments -- render() with no keys paints every section");
});

/* A preference (theme, Timeline/Card, the card-print options) runs only
 * `retireUndo` -- Undo snapshots the whole of `state`, including `state.ui`,
 * so an undo after a preference change would silently revert it, and the
 * recovery notice/first-run check are about the roster, not the theme. */
test('the theme kind is a preference: it retires undo but skips the first-run check', () => {
  beacons.length = 0;
  const { retires } = stub();
  markFirstRunPending();
  edit('theme');
  assert.equal(retires.length, 1, "edit('theme') must still retire the undo offer");
  assert.equal(beacons.filter(b => b.e === 'first_run_complete').length, 0,
    "edit('theme') must not fire the first-run check -- it is a preference");
});

test("the theme kind saves only: keys: [] never reaches the painter", () => {
  const { paints } = stub();
  edit('theme');
  assert.deepEqual(paints, [], 'keys: [] must never call paint() -- render() with no keys paints every section');
});

/* `teamColor` (Design table): `keys: []`, but NOT a preference -- the
 * decision text names only theme, Timeline/Card and the card-print options
 * as preferences, so `teamColor` still runs the full record-edit hooks even
 * though, like `theme`, its own handler keeps `applyTint()`/`renderSettings()`
 * and never reaches the shared painter. */
test('the teamColor kind is a record edit with keys: []: hooks run, painter does not', () => {
  beacons.length = 0;
  const { paints, retires } = stub();
  markFirstRunPending();
  edit('teamColor');
  assert.equal(retires.length, 1, "edit('teamColor') must retire the undo offer");
  assert.equal(beacons.filter(b => b.e === 'first_run_complete').length, 1,
    "edit('teamColor') is a record edit -- it must fire the first-run check");
  assert.deepEqual(paints, [], 'keys: [] must never call paint()');
});

/* `gameView` (Design table): a preference with real keys, painted now --
 * distinct from `theme`'s `keys: []` case, and from a record edit's keys. */
test("the gameView kind is a preference that paints its own key immediately", () => {
  beacons.length = 0;
  const { paints, retires } = stub();
  markFirstRunPending();
  edit('gameView');
  assert.equal(retires.length, 1, "edit('gameView') must retire the undo offer");
  assert.equal(beacons.filter(b => b.e === 'first_run_complete').length, 0,
    "edit('gameView') must not fire the first-run check -- it is a preference");
  assert.deepEqual(paints, [['gameview']], "edit('gameView') must paint exactly its own key, now");
});

/* The debounce (Design decision: "soon (debounced, 140ms) for typing and
 * sliders") and the key-union merge `soon()` used to do: several debounced
 * edits inside the window merge into one paint call carrying every key any
 * of them named, not one paint per call. `opponent` and `tipoff` share the
 * key `tabs`, so the union proves the merge rather than just concatenating
 * two disjoint lists. */
test('debounced edits inside the window merge into one paint with the union of their keys', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { paints } = stub();
  edit('opponent');
  edit('tipoff');
  assert.deepEqual(paints, [], 'a debounced edit must not paint before the window elapses');
  t.mock.timers.tick(140);
  assert.deepEqual(paints, [['tabs', 'totals', 'cards']],
    "opponent's and tipoff's keys must merge into one paint, not fire twice");
});
