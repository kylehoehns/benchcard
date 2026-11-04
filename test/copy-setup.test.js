import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame } from './state-fixture.js';

/* #548: copySetup(to, from, parts) is the one copying routine, behind both the
 * Same as card and "Copy from another game". Expected values are literals
 * written by hand from the issue: which keys belong to which switch. */

const ALL = { rules: true, plan: true, format: true, here: true };
const NONE = { rules: false, plan: false, format: false, here: false };
const only = k => ({ ...NONE, [k]: true });

/* The source game sets every part to something unlike the target's. */
const source = () => bareGame({
  periods: 2, periodMinutes: 16, granMode: 'perPeriod', granValue: 2,
  strategy: 'order', order: ['b', 'a', 'c'],
  out: ['c'], late: ['c'],
  label: 'Owls', tipoff: '10:00', balance: 'start', useCarryover: true, useSeasonTargets: true,
  overtime: [2], seed: 99, id: 'src',
  constraints: {
    ...S.emptyConstraints(),
    minMinutes: { a: 10 }, maxMinutes: { b: 20 }, pairs: [['a', 'b']], avoids: [['b', 'c']],
    keepOnFloor: [['a', 'c']], openingFive: ['a', 'b'], lastPeriodFive: ['c'], hardPairs: true,
    maxConsecutive: 3, maxBench: 2,
    targetSlots: { a: 4 }, lockedTargets: ['a'], closing: { stints: 3, players: ['b'] },
    units: [['a', 'b', 'c']],
  },
});
const target = () => bareGame({
  id: 'dst', useSeasonTargets: false, label: 'Hawks', tipoff: '09:00', seed: 7, balance: 'even',
  out: ['a'], late: [], live: { at: 0, overrides: {} },
  constraints: { ...S.emptyConstraints(), minMinutes: { c: 5 }, targetSlots: { c: 1 } },
});

test('rules alone copies the ten rule keys and nothing else', () => {
  const to = target(), from = source();
  S.copySetup(to, from, only('rules'));
  const c = to.constraints;
  assert.deepEqual(c.minMinutes, { a: 10 });
  assert.deepEqual(c.maxMinutes, { b: 20 });
  assert.deepEqual(c.pairs, [['a', 'b']]);
  assert.deepEqual(c.avoids, [['b', 'c']]);
  assert.deepEqual(c.keepOnFloor, [['a', 'c']]);
  assert.deepEqual(c.openingFive, ['a', 'b']);
  assert.deepEqual(c.lastPeriodFive, ['c']);
  assert.equal(c.hardPairs, true);
  assert.equal(c.maxConsecutive, 3);
  assert.equal(c.maxBench, 2);
  assert.deepEqual(c.targetSlots, { c: 1 }, 'the strategy settings stay');
  assert.deepEqual(c.units, []);
  assert.equal(to.strategy, 'balanced');
  assert.equal(to.periods, 4);
  assert.deepEqual(to.out, ['a']);
});

test('plan alone copies the strategy, its settings and the order, and leaves the rules', () => {
  const to = target(), from = source();
  S.copySetup(to, from, only('plan'));
  assert.equal(to.strategy, 'order');
  assert.deepEqual(to.order, ['b', 'a', 'c']);
  const c = to.constraints;
  assert.deepEqual(c.targetSlots, { a: 4 });
  assert.deepEqual(c.lockedTargets, ['a']);
  assert.deepEqual(c.closing, { stints: 3, players: ['b'] });
  assert.deepEqual(c.units, [['a', 'b', 'c']]);
  assert.deepEqual(c.minMinutes, { c: 5 }, 'the rules stay');
  assert.deepEqual(c.pairs, []);
  assert.equal(to.periods, 4);
});

test('format alone copies periods, minutes and the sub interval', () => {
  const to = target(), from = source();
  S.copySetup(to, from, only('format'));
  assert.equal(to.periods, 2);
  assert.equal(to.periodMinutes, 16);
  assert.equal(to.granMode, 'perPeriod');
  assert.equal(to.granValue, 2);
  assert.equal(to.strategy, 'balanced');
  assert.deepEqual(to.out, ['a']);
  assert.deepEqual(to.constraints.minMinutes, { c: 5 });
});

test('here alone copies who is out and who is late', () => {
  const to = target(), from = source();
  S.copySetup(to, from, only('here'));
  assert.deepEqual(to.out, ['c']);
  assert.deepEqual(to.late, ['c']);
  assert.equal(to.periods, 4);
  assert.deepEqual(to.constraints.minMinutes, { c: 5 });
});

test('here drops a hand-picked five that names a player who is now out', () => {
  const to = target();
  to.live = { at: 0, overrides: { 2: ['a', 'b', 'c', 'y', 'z'], 3: ['d', 'e', 'f', 'g', 'h'] }, hand: [2, 3] };
  S.copySetup(to, source(), only('here'));
  assert.deepEqual(Object.keys(to.live.overrides), ['3']);
});

test('all four together leave the constraints equal to the source constraints', () => {
  const to = target(), from = source();
  S.copySetup(to, from, ALL);
  assert.deepEqual(to.constraints, from.constraints);
  assert.equal(to.strategy, 'order');
  assert.equal(to.periods, 2);
  assert.deepEqual(to.out, ['c']);
});

test('what is copied is a copy: editing the source afterwards leaves the target alone', () => {
  const to = target(), from = source();
  S.copySetup(to, from, ALL);
  from.constraints.pairs[0].push('z');
  from.order.push('z');
  from.out.push('z');
  assert.deepEqual(to.constraints.pairs, [['a', 'b']]);
  assert.deepEqual(to.order, ['b', 'a', 'c']);
  assert.deepEqual(to.out, ['c']);
});

test('never copied: label, tip-off, id, seed, balance, carryover switches, overtime, live', () => {
  const to = target(), from = source();
  S.copySetup(to, from, ALL);
  assert.equal(to.label, 'Hawks');
  assert.equal(to.tipoff, '09:00');
  assert.equal(to.id, 'dst');
  assert.equal(to.seed, 7);
  assert.equal(to.balance, 'even');
  assert.equal(to.useCarryover, false);
  assert.equal(to.useSeasonTargets, false);
  assert.equal(to.overtime, undefined);
  assert.deepEqual(to.live, { at: 0, overrides: {} });
});

test('a source with no order leaves the target with none', () => {
  const to = target(); to.order = ['a', 'b'];
  const from = source(); delete from.order;
  S.copySetup(to, from, only('plan'));
  assert.equal(to.order, undefined);
});

test('a source from before a rule key existed copies as empty', () => {
  const to = target();
  to.constraints.keepOnFloor = [['a', 'b']];
  const from = source(); delete from.constraints.keepOnFloor;
  S.copySetup(to, from, only('rules'));
  assert.deepEqual(to.constraints.keepOnFloor ?? [], []);
});

/* The Same as card's game: exactly what newGame built before copySetup existed
   -- the format, who is here, the whole constraints object and the strategy
   from the game it copies; a fresh id, seed and live; no order, no Lineup
   balance, no carryover or overtime. */
test('newGame from a game builds the same game the Same as card always did', () => {
  const from = source();
  const g = S.newGame(1, from, { periods: 4, periodMinutes: 8 });
  const { id, seed, ...rest } = g;
  assert.match(id, /^g/);
  assert.equal(typeof seed, 'number');
  assert.deepEqual(rest, {
    label: '', tipoff: '', periods: 2, periodMinutes: 16, overtime: [],
    granMode: 'perPeriod', granValue: 2, out: ['c'], late: ['c'],
    useCarryover: true, useSeasonTargets: false,
    // #566: the two in-a-row numbers are the team's (none here), not the copied game's
    constraints: { ...from.constraints, maxConsecutive: 0, maxBench: 0 }, strategy: 'order', balance: 'even',
    live: { at: 0, overrides: {} },
  });
  assert.equal('order' in g, false, 'the new game continues the day\'s order instead');
  assert.notEqual(g.constraints, from.constraints);
});
