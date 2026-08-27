import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatePlan } from '../app/engine.js';

/* ================================================================== *
 * the longest unbroken sit, and the lever that shortens it
 *
 * Even minutes are only half of what a kid feels; the other half is how
 * long they sat in one go, and the plan never said. `longestSit` is the
 * whole reading -- a scan of `stints[].sitting` -- and the sentence it
 * feeds is the only place the app names the trade.
 *
 * The claim the copy makes ("letting more change at once breaks up runs
 * like that -- the totals come out the same") is measured here against
 * the real solver rather than asserted, because it is advice: if a later
 * engine change stops it being true the sentence has to go with it.
 * plan-view.js reaches for a canvas and a media query at import time, so
 * the stubs below stand in for the document; nothing here renders.
 * ================================================================== */
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
};
const { longestSit } = await import('../app/plan-view.js');

/* Four 4-minute stints, hand-written so the expected runs are obvious. */
const stints = sitting => sitting.map((s, i) => ({ index: i, minutes: 4, sitting: s }));

test('the longest run is the longest unbroken one, not the total sat', () => {
  //         a sits 1,2,3 in a row = 12;  b sits 0, plays, sits 2, plays = 4 each
  const s = stints([['b'], ['a'], ['a', 'b'], ['a']]);
  const r = longestSit(s, ['a', 'b']);
  assert.equal(r.minutes, 12);
  assert.deepEqual(r.ids, ['a']);
});

test('a run resets the moment the player comes back on', () => {
  const s = stints([['a'], ['a'], [], ['a'], ['a']]);
  assert.equal(longestSit(s, ['a']).minutes, 8);
});

test('everyone tied on the longest run is named', () => {
  const s = stints([['a', 'b'], ['a', 'b'], ['c'], ['c']]);
  const r = longestSit(s, ['a', 'b', 'c']);
  assert.equal(r.minutes, 8);
  assert.deepEqual(r.ids, ['a', 'b', 'c']);
});

test('with nobody ever sitting there is nothing to say', () => {
  const r = longestSit(stints([[], [], []]), ['a', 'b']);
  assert.equal(r.minutes, 0);
  assert.deepEqual(r.ids, []);
});

test('stints of unequal length are summed in minutes, not counted', () => {
  const s = [{ minutes: 6, sitting: ['a'] }, { minutes: 3, sitting: ['a'] }, { minutes: 6, sitting: [] }];
  assert.equal(longestSit(s, ['a']).minutes, 9);
});

/* ---------------- the advice has to stay true ---------------- */

const roster = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: `Player${String.fromCharCode(65 + i)} L${i}` }));
const solve = (n, maxSubs, seed) => generatePlan({
  players: roster(n), availableIds: roster(n).map(x => x.id),
  format: { periods: 4, periodMinutes: 8 }, granularity: { mode: 'everyN', value: 4 },
  seed, maxSubs,
});

test('raising the change limit shortens the longest sit, and leaves the spread alone', () => {
  let low = 0, high = 0, n = 0, sp3 = 0, sp5 = 0;
  for (let size = 6; size <= 13; size++) {
    for (let seed = 1; seed <= 6; seed++) {
      const a = solve(size, 3, seed), b = solve(size, 5, seed);
      if (!a.ok || !b.ok) continue;
      low += longestSit(a.stints, Object.keys(a.minutes)).minutes;
      high += longestSit(b.stints, Object.keys(b.minutes)).minutes;
      sp3 += a.spread; sp5 += b.spread; n++;
    }
  }
  assert.ok(n > 30, 'not enough solved plans to say anything');
  assert.ok(high < low, `a change limit of 5 should sit players for less time in one go, got ${high / n} vs ${low / n}`);
  assert.equal(Math.round((sp3 / n) * 100), Math.round((sp5 / n) * 100), 'the minute spread must not move with the change limit');
});

/* ---------------- where it is said, and how it is gated ---------------- */

const src = readFileSync(new URL('../app/plan-view.js', import.meta.url), 'utf8');

test('the sit line lives under the plan bars, not in the engine alerts', () => {
  const table = src.slice(src.indexOf('export function renderPlanTable'));
  assert.ok(table.slice(0, table.indexOf('\n}\n')).includes('Longest sit'),
    'the sentence belongs where the plan already reports on itself');
});

test('it is a trade, not a failure -- no issue code is invented for it', () => {
  assert.ok(!/LONG_SIT|LONG_BENCH|SIT_/.test(src), 'a warning code turns a trade into an accusation');
});

test('the change-limit advice is withheld once the coach is already at 5', () => {
  assert.match(src, /maxSubsNow\(\) < 5/);
});
