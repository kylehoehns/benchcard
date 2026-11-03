/* #569: the two pure helpers that fill Platoon's groups and Closers' five.
   Platoon places the first 5 x floor(n / 5) kids in roster order and only uses
   levels to decide who plays together; Closers takes the highest levels when
   they differ, else the five on the floor last. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillGroups, fillClosers } from '../app/engine.js';

const ids = n => Array.from({ length: n }, (_, i) => `p${i}`);
const same = () => 3;
const sorted = a => [...a].sort();

test('fillGroups: fewer than 5 kids fills nothing', () => {
  assert.deepEqual(fillGroups(ids(4), same), []);
  assert.deepEqual(fillGroups([], same), []);
});

test('fillGroups: at one level, groups are the roster in fives, and leftovers stay out', () => {
  assert.deepEqual(fillGroups(ids(5), same), [ids(5)]);
  assert.deepEqual(fillGroups(ids(8), same), [ids(5)]);
  assert.deepEqual(fillGroups(ids(9), same), [ids(5)]);
  assert.deepEqual(fillGroups(ids(10), same), [ids(10).slice(0, 5), ids(10).slice(5)]);
  assert.deepEqual(fillGroups(ids(12), same), [ids(12).slice(0, 5), ids(12).slice(5, 10)]);
  assert.deepEqual(fillGroups(ids(15), same).map(g => g.length), [5, 5, 5]);
});

test('fillGroups: at different levels the stronger players are dealt in a snake', () => {
  const tier = { p0: 5, p1: 5, p2: 4, p3: 4, p4: 3, p5: 3, p6: 2, p7: 2, p8: 1, p9: 1 };
  const [a, b] = fillGroups(ids(10), id => tier[id]);
  assert.deepEqual(sorted(a), ['p0', 'p3', 'p4', 'p7', 'p8']);
  assert.deepEqual(sorted(b), ['p1', 'p2', 'p5', 'p6', 'p9']);
});

test('fillGroups: who is placed never depends on level; roster order breaks ties', () => {
  // 8 kids: p7 is the strongest, but only the first five are placed
  const [g] = fillGroups(ids(8), id => (id === 'p7' ? 5 : 3));
  assert.deepEqual(sorted(g), ids(5));
  // 12 kids, p10 and p11 strongest: still p0-p9 are placed
  const groups = fillGroups(ids(12), id => (id === 'p10' || id === 'p11' ? 5 : id === 'p0' ? 4 : 3));
  assert.deepEqual(sorted(groups.flat()), sorted(ids(10)));
  // ties by roster order: p0 is strongest of the equal top, so it is first dealt (Group 1)
  const tie = fillGroups(ids(10), id => (id < 'p4' ? 4 : 3));
  assert.ok(tie[0].includes('p0') && tie[1].includes('p1') && tie[1].includes('p2') && tie[0].includes('p3'));
});

test('fillGroups: 15 kids at different levels make three groups of five', () => {
  const groups = fillGroups(ids(15), id => (Number(id.slice(1)) % 5) + 1);
  assert.deepEqual(groups.map(g => g.length), [5, 5, 5]);
  assert.deepEqual(sorted(groups.flat()), sorted(ids(15)));
});

test('fillClosers: fewer than 5 kids fills nothing', () => {
  assert.deepEqual(fillClosers(ids(4), same, []), []);
});

test('fillClosers: at one level it is the five on the floor last', () => {
  assert.deepEqual(fillClosers(ids(10), same, ['p9', 'p2', 'p4', 'p6', 'p7']), ['p9', 'p2', 'p4', 'p6', 'p7']);
});

test('fillClosers: at one level with no plan to read, the first five', () => {
  assert.deepEqual(fillClosers(ids(10), same, []), ids(5));
  assert.deepEqual(fillClosers(ids(10), same, undefined), ids(5));
});

test('fillClosers: at different levels the five highest, roster order breaking ties', () => {
  const tier = { p9: 5, p8: 4, p7: 4, p6: 4, p5: 4, p4: 4 };
  const got = fillClosers(ids(10), id => tier[id] ?? 3, ['p0', 'p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(sorted(got), ['p4', 'p5', 'p6', 'p7', 'p9']);
});
