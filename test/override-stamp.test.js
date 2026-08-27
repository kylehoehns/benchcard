import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* One chokepoint for "these hand swaps no longer describe this rotation".

   `reseed` closed the Shuffle door. Four more were still open — the periods
   and min/period spinners, the sub-frequency chips and the strategy segment —
   and each one left the same zombie five behind: a lineup the coach picked
   against an eight-stint rotation, spliced into a four-stint one at a clock
   window it was never chosen for. Repro that started this: 11 players, 4×8,
   every 4 min; swap someone for the rest of the game (overrides at 3 and 6),
   Done, then tap "Breaks only". The plan drops to 4 stints, override 3 lands
   in a different window and override 6 is a zombie that reappears the moment
   the chip goes back to every-4.

   A fifth sweep per control is a race the app loses on the next control that
   lands, so instead nothing sweeps: the overrides carry a stamp of the
   rotation they were made against, and `computeAll` — which every mutating
   control already repaints through — drops them when the stamp stops
   matching. The stamp covers every stint's period, clock window and five, so
   it moves when and only when the rotation does.

   state.js reaches for localStorage at import time, so the helpers are
   exercised through `new Function`, the same trick reseed.test.js uses. */
const src = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');

const lift = (start, end) => {
  const body = src.slice(src.indexOf(start));
  return body.slice(0, body.indexOf(end));
};
const stampSrc = lift('const rotationStamp', '\nlet dropped');
const syncSrc = lift('function syncOverrides', '\n\nexport function computeAll');
// eslint-disable-next-line no-new-func
const [rotationStamp, syncOverrides] = new Function(
  `${stampSrc}\nlet dropped = 0;\n${syncSrc}\nreturn [rotationStamp, syncOverrides];`)();

const stint = (i, on) => ({
  index: i, period: 1 + Math.floor(i / 2), periodName: 'Q' + (1 + Math.floor(i / 2)),
  startSec: 480 - (i % 2) * 240, endSec: 240 - (i % 2) * 240, minutes: 4, onFloor: on,
});
const planOf = (...fives) => ({ ok: true, stints: fives.map((f, i) => stint(i, f)) });

const A = planOf(['a', 'b', 'c', 'd', 'e'], ['b', 'c', 'd', 'e', 'f'], ['a', 'c', 'd', 'e', 'f']);
const B = planOf(['a', 'b', 'c', 'd', 'f'], ['b', 'c', 'd', 'e', 'f'], ['a', 'c', 'd', 'e', 'f']);
const swapped = () => ({ at: 1, overrides: { 1: ['a', 'b', 'c', 'd', 'f'] } });

test('the stamp moves when the rotation does and not otherwise', () => {
  assert.equal(rotationStamp(A), rotationStamp(planOf(...A.stints.map(s => s.onFloor))),
    'the same rotation must stamp the same twice');
  assert.notEqual(rotationStamp(A), rotationStamp(B),
    'one different five is a different rotation');
});

test('a swap is stamped on first sight and then left alone', () => {
  const g = { live: swapped() };
  syncOverrides(g, A);
  assert.equal(g.live.stamp, rotationStamp(A), 'the swap is stamped with the plan it was made against');
  syncOverrides(g, A);
  assert.deepEqual(Object.keys(g.live.overrides), ['1'], 'a repaint must not touch the swaps');
});

test('a rotation that changed shape drops the swaps', () => {
  const g = { live: swapped() };
  syncOverrides(g, A);
  syncOverrides(g, B);
  assert.deepEqual(g.live.overrides, {}, 'a five made against another rotation is not a lineup');
  assert.equal(g.live.at, 1, 'how far into the game the coach is does not depend on the rotation');
  assert.equal(g.live.stamp, '', 'nothing left to stamp');
});

test('undo restores the plan and its stamp together, so the swaps survive', () => {
  /* The stamp lives in `live` rather than a module-level map precisely for
     this: the undo snapshot is a clone of the whole of `state`, so it carries
     the stamp back with the overrides and the inputs that made them. */
  const g = { live: swapped() };
  syncOverrides(g, A);
  const snap = JSON.parse(JSON.stringify(g));
  syncOverrides(g, B);
  assert.deepEqual(g.live.overrides, {});
  const undone = JSON.parse(JSON.stringify(snap));
  syncOverrides(undone, A);
  assert.deepEqual(Object.keys(undone.live.overrides), ['1'], 'undo must bring the swaps back');
});

test('a plan that cannot be solved leaves the swaps and the stamp alone', () => {
  const g = { live: swapped() };
  syncOverrides(g, A);
  syncOverrides(g, { ok: false, stints: [] });
  assert.deepEqual(Object.keys(g.live.overrides), ['1']);
  assert.equal(g.live.stamp, rotationStamp(A), 'no plan is not a different plan');
});

test('every plan computeAll returns goes through the chokepoint', () => {
  const body = src.slice(src.indexOf('export function computeAll'));
  const fn = body.slice(0, body.indexOf('\n}\n'));
  const returns = fn.match(/^\s*return .*/gm) || [];
  assert.ok(returns.length >= 2, 'computeAll has a cache-hit path and a solve path');
  for (const r of returns) {
    assert.match(r, /syncOverrides\(/,
      'a plan handed back without the stamp check is a door back into the stale-override bug');
  }
});

test('the renderer says so once, after every game has been checked', () => {
  const render = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');
  const fn = render.slice(render.indexOf('export function render'));
  const head = fn.slice(0, fn.indexOf('\n}'));
  assert.match(head, /computeAll\(\)[\s\S]*overridesDropped\(\)[\s\S]*save\(\)/,
    'the notice reads the flag after computeAll and before the save that persists the drop');
  assert.match(head, /flash\(/, 'a drop the coach is not told about is a silent edit');
});
