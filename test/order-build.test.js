/* #547: the list Order builds for you, at the engine. `buildOrder` picks who
 * takes which spot in the rotation; every expected value here is worked out the
 * way a coach would on paper (a five is the window of c places on from the
 * last, counted round the list), never with the builder's own arithmetic.
 *
 * The issue's nine: 2 periods of 16 minutes, a sub every 4 (8 stints), four
 * changing at once. Spots 2 to 5 (index 1 to 4 here) play 20 minutes, the rest 16. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrder, orderShortNote } from '../app/engine.js';

const stintsOf = (lens, perPeriod) => lens.map((minutes, i) => ({ minutes, period: 1 + Math.floor(i / perPeriod) }));
const EIGHT = stintsOf(Array(8).fill(4), 4);            // two periods of four 4-minute stints
const names = n => Array.from({ length: n }, (_, i) => `p${i}`);
const NONE = { minMinutes: {}, maxMinutes: {}, avoids: [], pairs: [], keepOnFloor: [], lastPeriodFive: [] };
const build = (over = {}) => buildOrder({
  ids: names(9), stints: EIGHT, maxSubs: 4, priority: {}, periods: 2,
  ...over, constraints: { ...NONE, ...(over.constraints || {}) },
});
/* The paper way: stint j puts on the c places from j*c, counted round the list. */
const fiveAt = (order, c, j) => Array.from({ length: 5 }, (_, t) => order[(j * c + t) % order.length]);
const lineupsOf = (order, c, stints = EIGHT) => stints.map((_, j) => fiveAt(order, c, j));
const minutesOfKid = (order, id, c, stints = EIGHT) =>
  lineupsOf(order, c, stints).reduce((a, lu, j) => a + (lu.includes(id) ? stints[j].minutes : 0), 0);
const sharedMinutes = (order, a, b, c, stints = EIGHT) =>
  lineupsOf(order, c, stints).reduce((s, lu, j) => s + (lu.includes(a) && lu.includes(b) ? stints[j].minutes : 0), 0);
const permutations = list => list.length <= 1 ? [list]
  : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(r => [x, ...r]));

test('the issue\'s nine: the four best players take the four 20-minute spots', () => {
  const priority = { p4: 3000, p5: 3000, p6: 3000, p7: 3000 };
  const { order, short } = build({ priority: Object.fromEntries(names(9).map(id => [id, priority[id] ?? 1000])) });
  assert.deepEqual(order, ['p0', 'p4', 'p5', 'p6', 'p7', 'p1', 'p2', 'p3', 'p8']);
  assert.deepEqual(short, []);
  for (const id of ['p4', 'p5', 'p6', 'p7']) assert.equal(minutesOfKid(order, id, 4), 20);
  assert.equal(minutesOfKid(order, 'p0', 4), 16);
});

test('everyone equal and no rules: the list is the roster order', () => {
  assert.deepEqual(build().order, names(9));
  const hair = Object.fromEntries(names(9).map(id => [id, 5 + (id === 'p1' ? 1e-9 : 0)]));
  assert.deepEqual(build({ priority: hair }).order, names(9), 'a hair apart is a tie');
});

test('five or fewer players: everybody plays everything, so the roster order stands', () => {
  assert.deepEqual(build({ ids: names(5) }).order, names(5));
});

test('the kid with the most priority gets the spot that plays the most, over every list (6 players, 2 changing)', () => {
  const ids = names(6);
  const priority = { p0: 10, p1: 40, p2: 20, p3: 60, p4: 30, p5: 50 };
  const c = 2;
  const { order } = build({ ids, maxSubs: c, priority });
  const rank = Object.keys(priority).sort((a, b) => priority[a] - priority[b]);   // weight = rank
  const value = list => list.reduce((s, id) => s + rank.indexOf(id) * minutesOfKid(list, id, c), 0);
  const best = Math.max(...permutations(ids).map(value));
  assert.equal(value(order), best);
});

test('unequal stints are counted in minutes (7 players, 2 changing, stints of 5, 3, 4, 2, 6, 3)', () => {
  const stints = stintsOf([5, 3, 4, 2, 6, 3], 3);
  const ids = names(7);
  const priority = { p0: 3, p1: 1, p2: 7, p3: 5, p4: 2, p5: 6, p6: 4 };
  const { order } = build({ ids, stints, maxSubs: 2, priority });
  const rank = Object.keys(priority).sort((a, b) => priority[a] - priority[b]);
  const value = list => list.reduce((s, id) => s + rank.indexOf(id) * minutesOfKid(list, id, 2, stints), 0);
  assert.equal(value(order), Math.max(...permutations(ids).map(value)));
});

test('Apart: a best player and a kid the list would put on beside them are never on together', () => {
  const priority = Object.fromEntries(names(9).map(id => [id, id === 'p4' ? 3000 : 1000]));
  const { order, short } = build({ priority, constraints: { avoids: [['p4', 'p0']] } });
  assert.equal(sharedMinutes(order, 'p4', 'p0', 4), 0);
  assert.deepEqual(short, []);
});

test('Together: the pair share as many minutes as any two spots can', () => {
  const { order, short } = build({ constraints: { pairs: [['p0', 'p8']] } });
  // the paper: over every two spots, the fewest minutes the two do not share
  const notShared = (x, y) => minutesOfKid(order, x, 4) + minutesOfKid(order, y, 4) - 2 * sharedMinutes(order, x, y, 4);
  const fewest = Math.min(...order.flatMap((x, i) => order.slice(i + 1).map(y => notShared(x, y))));
  assert.equal(notShared('p0', 'p8'), fewest);
  assert.deepEqual(short, []);
});

test('a minimum of 20 puts a kid nobody ranks high into a 20-minute spot', () => {
  const priority = Object.fromEntries(names(9).map(id => [id, id === 'p0' ? 0 : 1000]));
  const { order, short } = build({ priority, constraints: { minMinutes: { p0: 20 } } });
  assert.equal(minutesOfKid(order, 'p0', 4), 20);
  assert.deepEqual(short, []);
});

test('a cap of 16 keeps a top-ranked kid in a 16-minute spot', () => {
  const priority = Object.fromEntries(names(9).map(id => [id, id === 'p4' ? 9000 : 1000]));
  const { order, short } = build({ priority, constraints: { maxMinutes: { p4: 16 } } });
  assert.equal(minutesOfKid(order, 'p4', 4), 16);
  assert.deepEqual(short, []);
});

test('One of two on: one of the pair is on the floor at every stint', () => {
  const { order, short } = build({ constraints: { keepOnFloor: [['p1', 'p2']] } });
  for (const lu of lineupsOf(order, 4)) assert.ok(lu.includes('p1') || lu.includes('p2'), `${lu} has neither`);
  assert.deepEqual(short, []);
});

test('Starts the last period: those five are on at its first stint, over the preference', () => {
  const lastFive = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const priority = Object.fromEntries(names(9).map(id => [id, lastFive.includes(id) ? 0 : 1000]));
  const { order, short } = build({ priority, periods: 2, constraints: { lastPeriodFive: lastFive } });
  assert.deepEqual([...fiveAt(order, 4, 4)].sort(), lastFive);
  assert.deepEqual(short, []);
});

test('an impossible set returns the closest list and names every rule it broke', () => {
  const c = { minMinutes: { p0: 20, p1: 20, p2: 20 }, avoids: [['p0', 'p1'], ['p0', 'p2'], ['p1', 'p2']] };
  const { order, short } = build({ constraints: c });
  assert.deepEqual([...order].sort(), names(9));
  assert.ok(short.length > 0, 'three 20-minute kids who cannot be apart is not meetable');
  // each rule is named exactly when the list breaks it
  const shortOf = id => minutesOfKid(order, id, 4) < 20;
  for (const id of ['p0', 'p1', 'p2']) {
    assert.equal(short.some(s => s.kind === 'minimum' && s.ids.includes(id)), shortOf(id), `minimum for ${id}`);
  }
  for (const [a, b] of c.avoids) {
    assert.equal(short.some(s => s.kind === 'apart' && s.ids.includes(a) && s.ids.includes(b)),
      sharedMinutes(order, a, b, 4) > 0, `apart ${a} ${b}`);
  }
});

test('the same input gives the same list, and a different roster order does too when priorities differ', () => {
  const ids = names(12);
  const priority = Object.fromEntries(ids.map((id, i) => [id, (i * 37) % 11 * 10 + i]));   // all distinct
  const constraints = { avoids: [['p1', 'p2']], pairs: [['p3', 'p4']], keepOnFloor: [['p5', 'p6']],
    minMinutes: { p7: 12 }, maxMinutes: { p8: 8 }, lastPeriodFive: ['p9', 'p10'] };
  const once = build({ ids, priority, constraints, maxSubs: 3 });
  assert.deepEqual(build({ ids, priority, constraints, maxSubs: 3 }), once);
  assert.deepEqual(build({ ids: [...ids].reverse(), priority, constraints, maxSubs: 3 }), once);
});

test('the builder reads no clock and no random numbers', () => {
  const realRandom = Math.random, realNow = Date.now;
  Math.random = () => { throw new Error('Math.random'); };
  Date.now = () => { throw new Error('Date.now'); };
  try { build({ priority: { p3: 9 } }); } finally { Math.random = realRandom; Date.now = realNow; }
});

test('the largest roster with every rule at once finishes, and returns every kid once', () => {
  const ids = names(15);
  const stints = stintsOf(Array(16).fill(2), 4).map((s, i) => ({ ...s, period: 1 + Math.floor(i / 4) }));
  const priority = Object.fromEntries(ids.map((id, i) => [id, (i * 7) % 15]));
  const { order } = buildOrder({ ids, stints, maxSubs: 2, priority, periods: 4, constraints: {
    ...NONE, avoids: [['p0', 'p1'], ['p2', 'p3']], pairs: [['p4', 'p5']], keepOnFloor: [['p6', 'p7']],
    minMinutes: { p8: 20 }, maxMinutes: { p9: 10 }, lastPeriodFive: ['p10', 'p11', 'p12'] } });
  assert.deepEqual([...order].sort(), [...ids].sort());
});

test('orderShortNote names each rule in plain words', () => {
  const label = id => ({ a: 'Ava', b: 'Ben', c: 'Cal', d: 'Dee' })[id];
  const note = orderShortNote([
    { kind: 'apart', ids: ['a', 'b'] }, { kind: 'minimum', ids: ['c'] }, { kind: 'keepon', ids: ['a', 'b'] },
  ], label);
  assert.equal(note.severity, 'warn');
  assert.equal(note.code, 'ORDER_BUILT_SHORT');
  assert.equal(note.message,
    "No order meets every rule, so this list comes closest. It can't keep Ava and Ben apart, give Cal their minimum and keep Ava or Ben on the floor.");
  assert.deepEqual(note.playerIds.sort(), ['a', 'b', 'c']);
});

test('orderShortNote words every kind, and says nothing when nothing is short', () => {
  const label = id => id.toUpperCase();
  const said = short => orderShortNote(short, label).message.replace(/^.*It can't /, '');
  assert.equal(said([{ kind: 'together', ids: ['a', 'b'] }]), 'keep A and B together more.');
  assert.equal(said([{ kind: 'cap', ids: ['a'] }, { kind: 'cap', ids: ['b'] }]), 'keep A and B to their most minutes.');
  assert.equal(said([{ kind: 'minimum', ids: ['a'] }, { kind: 'minimum', ids: ['b'] }]), 'give A and B their minimum.');
  assert.equal(said([{ kind: 'lastq', ids: ['a'] }, { kind: 'lastq', ids: ['b'] }]), 'start A and B in the last period.');
  assert.equal(orderShortNote([], label), null);
});

/* #547 x #548: copying "how it plans" carries whose list it is. An app-built
   list stays the app's in the copy (so it is built again for that game); a
   list the coach set is copied as the coach's. A new game from the Same as
   card starts with neither, and addGame decides. */
test('copying how a game plans carries whether its list is the app\'s or the coach\'s', async () => {
  const { S, bareGame } = await import('./state-fixture.js');
  const plan = { rules: false, plan: true, format: false, here: false };
  const built = bareGame({ strategy: 'order', order: ['b', 'a'], orderBuilt: true });
  const mine = bareGame({ strategy: 'order', order: ['a', 'b'] });

  const a = bareGame({});
  S.copySetup(a, built, plan);
  assert.equal(a.orderBuilt, true);

  const b = bareGame({ orderBuilt: true });
  S.copySetup(b, mine, plan);
  assert.equal('orderBuilt' in b, false);
  assert.deepEqual(b.order, ['a', 'b']);

  const c = bareGame({ orderBuilt: true });
  S.copySetup(c, built, { rules: true, plan: false, format: true, here: true });
  assert.equal(c.orderBuilt, true, 'the plan switch off leaves the target\'s own list alone');

  assert.equal('orderBuilt' in S.newGame(1, built), false);
});
