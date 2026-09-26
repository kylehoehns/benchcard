/* #139 items 7 and 9: two pure text helpers, unit-tested under plain
 * `node --test` per the spec's Proof table, rather than only through the
 * new smoke check.
 *
 * `rowLabel` is the accessible name for a floor/bench row -- built from the
 * SAME inputs `renderGameMode` already has (a player-shaped object with
 * `.number`/`.name`, the played/projected minutes, and the "just on" flag),
 * never re-deriving `fmtMinutes` or the name-fallback logic itself.
 *
 * The stint-live join is `benchHeaderText`'s own title/subtitle joined with
 * ", " -- `benchLiveText` reuses `benchHeaderText` rather than rebuilding the
 * "Q1 · …" wording a second time. Expected strings below are copied straight
 * out of 139-focus-announce.md items 7 and 9, never recomputed the way the
 * helpers themselves compute them.
 *
 * `test/dom-stub.js` first: `gamemode.js` reaches `document`/`matchMedia` at
 * import time (through `dom.js` and `trap.js`), so importing it under plain
 * Node without the stub throws before any assertion runs (see
 * gamemode-bench-text.test.js's own comment). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-stub.js';
import { rowLabel, benchLiveText } from '../app/gamemode.js';

const ROW_LABEL_CASES = [
  ['a numbered player reads "<number>, <name>, <played> of <projected> minutes"',
    { number: 3, name: 'Ana Reyes' }, 0, 16, false,
    '3, Ana Reyes, 0 of 16 minutes'],
  ['no jersey number drops the number, not a blank slot',
    { number: null, name: 'Reese Taylor' }, 0, 16, false,
    'Reese Taylor, 0 of 16 minutes'],
  ['decimal minutes go through fmtMinutes',
    { number: 3, name: 'Ana Reyes' }, 4.5, 16, false,
    '3, Ana Reyes, 4.5 of 16 minutes'],
  ['"just on" appends when the tag shows',
    { number: 3, name: 'Ana Reyes' }, 0, 16, true,
    '3, Ana Reyes, 0 of 16 minutes, just on'],
];

test('rowLabel: wording', () => {
  for (const [label, player, played, projected, justOn, want] of ROW_LABEL_CASES) {
    assert.equal(rowLabel(player, played, projected, justOn), want, label);
  }
});

const BENCH_LIVE_CASES = [
  ['stint 1 of 8 reads "Q1 · 8:00 to 4:00, 1 of 8"',
    { period: 1, periodName: 'Q1', startSec: 480, endSec: 240 }, 0, 8,
    'Q1 · 8:00 to 4:00, 1 of 8'],
  ['stint 8 of 8 reads "Q4 · 4:00 to 0:00, 8 of 8"',
    { period: 4, periodName: 'Q4', startSec: 240, endSec: 0 }, 7, 8,
    'Q4 · 4:00 to 0:00, 8 of 8'],
];

test('benchLiveText: the joined stint line', () => {
  for (const [label, row, i, total, want] of BENCH_LIVE_CASES) {
    assert.equal(benchLiveText(row, i, total), want, label);
  }
});
