/* #568: a Together rule carries its own strength as an optional third field,
 * `[a, b]` (As much as possible) or `[a, b, true]` (Always). The old game-wide
 * Force Together switch (`hardPairs`) is copied onto each kept rule when a
 * saved game loads, then dropped. Pure cases on storage.js's cleaner. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTeam } from '../app/storage.js';

const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [],
  openingFive: [], lastPeriodFive: [], maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [],
});
const newGame = () => ({ id: 'gnew', label: '', tipoff: '', periods: 4, periodMinutes: 8,
  granMode: 'everyN', granValue: 4, out: [], useCarryover: false, useSeasonTargets: false,
  strategy: 'balanced', seed: 1, constraints: emptyConstraints() });
const H = { emptyConstraints, newGame, today: new Date(2026, 8, 22) };
const NAMES = ['Avery', 'Blake', 'Casey', 'Drew'];
const team = constraints => ({
  id: 't', name: 'T', players: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: NAMES[i] })),
  activeDay: 0, activeGame: 0,
  days: [{ name: '', date: '2026-09-22', games: [{ id: 'g1', constraints }] }],
});
const load = constraints => sanitizeTeam(team(constraints), H);
const cOf = t => t.days[0].games[0].constraints;

test('hardPairs true puts Always on every kept Together rule and the flag is gone', () => {
  const c = cOf(load({ hardPairs: true, pairs: [['a', 'b'], ['c', 'd']] }));
  assert.deepEqual(c.pairs, [['a', 'b', true], ['c', 'd', true]]);
  assert.equal('hardPairs' in c, false);
});

test('hardPairs false or absent leaves Together rules as two ids', () => {
  assert.deepEqual(cOf(load({ hardPairs: false, pairs: [['a', 'b']] })).pairs, [['a', 'b']]);
  assert.deepEqual(cOf(load({ pairs: [['a', 'b']] })).pairs, [['a', 'b']]);
  assert.equal('hardPairs' in cOf(load({ hardPairs: false, pairs: [['a', 'b']] })), false);
});

test('hardPairs true with no Together rule just loses the flag', () => {
  const c = cOf(load({ hardPairs: true, pairs: [] }));
  assert.deepEqual(c.pairs, []);
  assert.equal('hardPairs' in c, false);
});

test('hardPairs true with an unknown id drops that rule and keeps the other as Always', () => {
  const c = cOf(load({ hardPairs: true, pairs: [['a', 'zz'], ['c', 'd']] }));
  assert.deepEqual(c.pairs, [['c', 'd', true]]);
});

test('an already migrated Always rule is kept with no hardPairs key', () => {
  assert.deepEqual(cOf(load({ pairs: [['a', 'b', true], ['c', 'd']] })).pairs, [['a', 'b', true], ['c', 'd']]);
});

test('a third field other than exactly true is dropped and the rule stays; four fields drop the rule', () => {
  for (const junk of [false, 1, 'x', null]) {
    assert.deepEqual(cOf(load({ pairs: [['a', 'b', junk]] })).pairs, [['a', 'b']], String(junk));
  }
  assert.deepEqual(cOf(load({ pairs: [['a', 'b', true, true]] })).pairs, []);
});

test('Apart and One of two on stay strictly two ids', () => {
  const c = cOf(load({ avoids: [['a', 'b', true], ['c', 'd']], keepOnFloor: [['a', 'b', true], ['b', 'c']] }));
  assert.deepEqual(c.avoids, [['c', 'd']]);
  assert.deepEqual(c.keepOnFloor, [['b', 'c']]);
});

test('running the cleaner twice gives the same team', () => {
  const once = load({ hardPairs: true, pairs: [['a', 'b'], ['c', 'd', false]] });
  const twice = sanitizeTeam(once, H);
  assert.deepEqual(twice, once);
  assert.deepEqual(cOf(twice).pairs, [['a', 'b', true], ['c', 'd', true]]);
});
