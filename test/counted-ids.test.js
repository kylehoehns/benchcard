import { test } from 'node:test';
import assert from 'node:assert/strict';

/* countedIds (#420): who a game counts. Here, or out with minutes in the
 * rotation showing; with no ok plan, the players who are here. */

import { S, bareGame, withTeam, player } from './state-fixture.js';

const roster = ['a', 'b', 'c'].map(id => player(id));
const plan = (minutes, ok = true) => ({ ok, minutes,
  stints: [{ onFloor: Object.keys(minutes).filter(id => minutes[id] > 0), minutes: 8, period: 1 }] });
const counted = (out, p) => { const g = bareGame({ out }); return withTeam(roster, [g], {}, () => S.countedIds(g, p)); };

test('countedIds: a player who is here counts', () => {
  assert.deepEqual(counted([], plan({ a: 8, b: 8, c: 0 })), ['a', 'b', 'c']);
});

test('countedIds: a player marked out who has minutes counts', () => {
  assert.deepEqual(counted(['c'], plan({ a: 8, b: 8, c: 8 })), ['a', 'b', 'c']);
});

test('countedIds: a player marked out with no minutes does not count', () => {
  assert.deepEqual(counted(['c'], plan({ a: 8, b: 8 })), ['a', 'b']);
});

test('countedIds: with no plan, or one that is not ok, it is who is here', () => {
  assert.deepEqual(counted(['c'], undefined), ['a', 'b']);
  assert.deepEqual(counted(['c'], plan({ a: 8, b: 8, c: 8 }, false)), ['a', 'b']);
});
