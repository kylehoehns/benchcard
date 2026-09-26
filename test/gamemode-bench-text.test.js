/* #138 item 1 and item 6: the bench header's title/subtitle and the Next
 * change box's "at" string, both extracted as pure helpers so they can be
 * asserted against literal spec examples under plain `node --test`, rather
 * than only through a browser smoke check. Values below are taken straight
 * from the spec (138-bench-restyle.md items 1 and 6), never recomputed the
 * way the helpers themselves compute them.
 *
 * `test/dom-stub.js` is imported first: `gamemode.js` reaches `document` and
 * `matchMedia` at import time (through `dom.js`'s canvas context and
 * `trap.js`), so importing it under plain Node without the stub throws
 * before any assertion runs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-stub.js';
import { benchHeaderText, nextAt, swapToastText } from '../app/gamemode.js';

const HEADER_CASES = [
  ['Q1, stint 1 of 8 reads "Q1 · 8:00 to 4:00" / "1 of 8"',
    { period: 1, periodName: 'Q1', startSec: 480, endSec: 240 }, 0, 8,
    { title: 'Q1 · 8:00 to 4:00', subtitle: '1 of 8' }],
  ['a period name like "H1" is used in place of "Q1"',
    { period: 1, periodName: 'H1', startSec: 1200, endSec: 0 }, 0, 2,
    { title: 'H1 · 20:00 to 0:00', subtitle: '1 of 2' }],
];

test('benchHeaderText: title/subtitle wording', () => {
  for (const [label, row, i, total, want] of HEADER_CASES) {
    assert.deepEqual(benchHeaderText(row, i, total), want, label);
  }
});

const NEXT_AT_CASES = [
  ['next stint in the same period drops the period name',
    { period: 1, periodName: 'Q1' }, { period: 1, periodName: 'Q1', startSec: 240 }, '4:00'],
  ['next stint in a different period keeps the period name',
    { period: 1, periodName: 'Q1' }, { period: 2, periodName: 'Q2', startSec: 480 }, 'Q2 8:00'],
  ['overtime uses the row\'s own period name',
    { period: 4, periodName: 'Q4' }, { period: 5, periodName: 'OT', startSec: 300 }, 'OT 5:00'],
];

test('nextAt: the "at" string', () => {
  for (const [label, row, nextRow, want] of NEXT_AT_CASES) {
    assert.equal(nextAt(row, nextRow), want, label);
  }
});

/* #147 item 2: the swap toast names the minutes -- literals taken straight
 * from the spec (147-bench-details.md, "What would settle it" item 2), never
 * recomputed the way `liveMinutes`/`fmtMinutes` themselves compute them.
 * `inMin`/`outMin` are each player's projected minutes AFTER the swap;
 * `inBefore`/`outBefore` are their projected minutes before it, read only to
 * decide whether the minutes clause is worth printing at all. */
const SWAP_TOAST_CASES = [
  ['This stint: minutes changed for both',
    'Casey', 'Ana', 'stint', 20, 12, 16, 16,
    'Casey on for Ana this stint. Casey now ends at 20 min, Ana at 12.'],
  ['Rest of game: minutes changed for both',
    'Casey', 'Ana', 'rest', 32, 0, 16, 16,
    'Casey on for Ana for the rest of the game. Casey now ends at 32 min, Ana at 0.'],
  ['no change in minutes: the clause is dropped entirely',
    'Jordan', 'Sam', 'stint', 16, 16, 16, 16,
    'Jordan on for Sam this stint.'],
  ['fractional minutes go through fmtMinutes',
    'Reese', 'Kira', 'rest', 20.5, 11.5, 16, 16,
    'Reese on for Kira for the rest of the game. Reese now ends at 20.5 min, Kira at 11.5.'],
];

test('swapToastText: names the minutes, or drops the clause when they do not change', () => {
  for (const [label, inName, outName, scope, inMin, outMin, inBefore, outBefore, want] of SWAP_TOAST_CASES) {
    assert.equal(swapToastText(inName, outName, scope, inMin, outMin, inBefore, outBefore), want, label);
  }
});
