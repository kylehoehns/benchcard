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
import { benchHeaderText, nextAt } from '../app/gamemode.js';

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
