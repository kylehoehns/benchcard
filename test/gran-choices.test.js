/* #575: the Sub interval sheet lists only the options that give different
 * subs for this game's period length. Pure helper, many cases: the expected
 * lists below are read off the spec's rule (options with the same stint
 * lengths are one; the current option stands for its group; else "Only at
 * breaks" for a whole-period group; else the first in the usual order). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './state-fixture.js';
import { buildStints } from '../app/engine.js';
import { distinctGranChoices } from '../app/state.js';

const game = (periods, periodMinutes, granMode, granValue) => ({ periods, periodMinutes, granMode, granValue });
const phrases = g => distinctGranChoices(g).map(c => c.phrase);

test('4 x 6 hides the options that repeat another, and keeps 4x a period', () => {
  assert.deepEqual(phrases(game(4, 6, 'everyN', 3)),
    ['every 2 min', 'every 3 min', 'every 4 min', '4× a period', 'only at breaks']);
});

test('4 x 8 hides 4x a period, 2x a period and Every 6: Every 2, Every 4 and Only at breaks give the same subs', () => {
  assert.deepEqual(phrases(game(4, 8, 'everyN', 4)),
    ['every 2 min', 'every 3 min', 'every 4 min', 'every 5 min', '3× a period', 'only at breaks']);
});

test('2 x 16 hides 4x a period because Every 4 gives the same subs', () => {
  assert.deepEqual(phrases(game(2, 16, 'everyN', 4)),
    ['every 2 min', 'every 3 min', 'every 4 min', 'every 5 min', 'every 6 min',
      '2× a period', '3× a period', 'only at breaks']);
});

test('the current choice always shows, in place of the one it duplicates', () => {
  assert.deepEqual(phrases(game(4, 8, 'perPeriod', 4)),
    ['every 3 min', 'every 4 min', 'every 5 min', '3× a period', '4× a period', 'only at breaks']);
  assert.deepEqual(phrases(game(4, 8, 'everyN', 6)),
    ['every 2 min', 'every 3 min', 'every 4 min', 'every 5 min', 'every 6 min', '3× a period']);
});

test('a group that is the whole period reads Only at breaks when it is not the current one', () => {
  assert.deepEqual(phrases(game(4, 6, 'everyN', 2)),
    ['every 2 min', 'every 3 min', 'every 4 min', '4× a period', 'only at breaks']);
  assert.deepEqual(phrases(game(4, 6, 'everyN', 5)),
    ['every 2 min', 'every 3 min', 'every 4 min', 'every 5 min', '4× a period']);
});

test('no two listed options give the same subs, across common game lengths', () => {
  for (const [p, m] of [[4, 6], [4, 8], [2, 16], [4, 10], [2, 20], [2, 12], [4, 12], [2, 25]]) {
    const subs = distinctGranChoices(game(p, m, 'everyN', 4)).map(c => buildStints(
      { periods: 1, periodMinutes: m }, { mode: c.mode, value: c.value })
      .map(s => s.minutes.toFixed(3)).join());
    assert.ok(subs.length >= 2, `${p} x ${m} keeps real choices`);
    assert.equal(new Set(subs).size, subs.length, `${p} x ${m}`);
  }
});
