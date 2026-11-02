/* #545: the Rotation order strategy at the engine. The plan is the coach's
 * list taken in turn -- no search -- so every case here is a rotation worked
 * out the way a coach does it on paper, never by the engine's own arithmetic. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';
import { lacks } from './prose.js';

const FORMAT = { periods: 2, periodMinutes: 16 };
const EVERY_4 = { mode: 'everyN', value: 4 };   // 8 stints
const names = n => Array.from({ length: n }, (_, i) => `p${i}`);
const roster = n => names(n).map(id => ({ id, name: `Kid ${id.toUpperCase()}` }));

const orderPlan = (circle, maxSubs, over = {}) => generatePlan({
  players: roster(circle.length), availableIds: names(circle.length), order: circle,
  strategy: 'order', format: FORMAT, granularity: EVERY_4, maxSubs, seed: 1, ...over,
});
const fives = p => p.stints.map(s => [...s.onFloor].sort());
const sorted = rows => rows.map(r => [...r].sort());

/* The paper way: five on the floor, a line waiting. At each break the c who
   have been on longest go to the back of the line and the next c in line come
   on. Only valid while c players are waiting (c <= n - 5). */
function paperRotation(circle, c, stints) {
  const floor = circle.slice(0, 5), line = circle.slice(5);
  const out = [];
  for (let k = 0; k < stints; k++) {
    out.push([...floor]);
    line.push(...floor.splice(0, c));
    floor.push(...line.splice(0, c));
  }
  return out;
}

for (const n of [6, 7, 9, 10]) {
  for (let c = 1; c <= 5; c++) {
    if (c > n - 5) continue;
    test(`${n} players, ${c} changing at once: the plan is the paper rotation`, () => {
      const circle = names(n);
      const p = orderPlan(circle, c);
      assert.equal(p.ok, true);
      assert.deepEqual(fives(p), sorted(paperRotation(circle, c, 8)));
    });
  }
}

test('more changes than players waiting: the window still slides by c, so fewer change (7 players, 4 at once)', () => {
  const p = orderPlan(names(7), 4);
  assert.deepEqual(fives(p), sorted([
    ['p0', 'p1', 'p2', 'p3', 'p4'],
    ['p4', 'p5', 'p6', 'p0', 'p1'],
    ['p1', 'p2', 'p3', 'p4', 'p5'],
    ['p5', 'p6', 'p0', 'p1', 'p2'],
    ['p2', 'p3', 'p4', 'p5', 'p6'],
    ['p6', 'p0', 'p1', 'p2', 'p3'],
    ['p3', 'p4', 'p5', 'p6', 'p0'],
    ['p0', 'p1', 'p2', 'p3', 'p4'],
  ]));
});

test('6 players, 5 at once: the one who sat comes on and four stay in rotation', () => {
  const p = orderPlan(names(6), 5);
  assert.deepEqual(fives(p).slice(0, 4), sorted([
    ['p0', 'p1', 'p2', 'p3', 'p4'],
    ['p5', 'p0', 'p1', 'p2', 'p3'],
    ['p4', 'p5', 'p0', 'p1', 'p2'],
    ['p3', 'p4', 'p5', 'p0', 'p1'],
  ]));
});

test('five players: everybody plays every stint, whatever the order and c', () => {
  for (const c of [1, 3, 5]) {
    const p = orderPlan(names(5), c);
    assert.deepEqual(fives(p), Array(8).fill(['p0', 'p1', 'p2', 'p3', 'p4']));
  }
});

test('orderNext is the player the cycle puts on after the last stint', () => {
  // the issue's example: 9 players, 4 at once, 8 stints -> game 2 starts at the sixth player
  assert.equal(orderPlan(names(9), 4).orderNext, 'p5');
  // 6 players, 2 at once: the window start moves 0,2,4,0,2,4,0,2 and the next is 4
  assert.equal(orderPlan(names(6), 2).orderNext, 'p4');
  // the circle's own order, not the ids' order
  assert.equal(orderPlan(['p3', 'p1', 'p0', 'p2', 'p5', 'p4'], 2).orderNext, 'p5');
});

test('a plan for another strategy has no orderNext', () => {
  const p = generatePlan({ players: roster(9), availableIds: names(9), format: FORMAT, granularity: EVERY_4, seed: 1 });
  assert.equal('orderNext' in p, false);
});

test('the changes-at-once note is there exactly when fewer than c players sit', () => {
  const said = (n, c) => orderPlan(names(n), c).issues.filter(i => i.code === 'ORDER_CHANGES');
  for (const n of [6, 7, 9, 10]) {
    for (let c = 1; c <= 5; c++) {
      assert.equal(said(n, c).length, c > n - 5 ? 1 : 0, `${n} players, ${c} at once`);
    }
  }
  assert.equal(said(5, 4).length, 0, 'five players have no break to talk about');
  assert.equal(said(7, 4)[0].message, 'With 7 players, only 2 sit each stint, so fewer than 4 change at a break.');
});

test('rules warn and never move the order: an Apart pair, a cap and a minimum', () => {
  const circle = names(9);
  const free = fives(orderPlan(circle, 4));
  const p = orderPlan(circle, 4, { constraints: {
    avoids: [['p0', 'p1']],            // stints 1 and 3 and 5 and 7 seat both
    maxMinutes: { p2: 8 },             // plays 20
    minMinutes: { p5: 24 },            // plays 16
  } });
  assert.equal(p.ok, true);
  assert.deepEqual(fives(p), free, 'the fives are the formula\'s');
  const by = code => p.issues.filter(i => i.code === code);
  assert.equal(by('APART_TOGETHER').length, 1);
  assert.equal(by('APART_TOGETHER')[0].message, 'Kid P0 and Kid P1 are set Apart but are on the floor together for 4 stints.');
  assert.equal(by('CAP_EXCEEDED').length, 1);
  assert.match(by('CAP_EXCEEDED')[0].message, /Kid P2 is at 20 minutes against a 8-minute cap/);
  assert.equal(by('MIN_MISSED').length, 1);
  assert.match(by('MIN_MISSED')[0].message, /Kid P5 got 16 minutes against a 24-minute minimum/);
  for (const i of p.issues) assert.ok(lacks(i.message.toLowerCase(), 'no legal lineup'), i.code);
});

test('Plays at most and Sits at most in a row warn, and say the order put them there', () => {
  // one change at a time with nine, 8 stints: worked by hand, P3 to P8 play 4 or 5 in a row, and P0-P4, P7, P8 sit 3 or 4
  const p = orderPlan(names(9), 1, { constraints: { maxConsecutive: 3, maxBench: 2 } });
  assert.equal(p.ok, true);
  const by = code => p.issues.filter(i => i.code === code);
  assert.deepEqual(by('CONSEC_EXCEEDED').map(i => i.playerIds[0]), ['p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  assert.equal(by('CONSEC_EXCEEDED')[0].message, 'Kid P3 plays 4 stints in a row against a limit of 3 — the order keeps them on the floor.');
  assert.deepEqual(by('BENCH_EXCEEDED').map(i => i.playerIds[0]), ['p0', 'p1', 'p2', 'p3', 'p4', 'p7', 'p8']);
  assert.equal(by('BENCH_EXCEEDED')[0].message, 'Kid P0 sits 4 stints in a row against a limit of 2 — the order keeps them on the bench.');
});

test('nothing here blames a search: no SUBS_EXCEEDED, half or spread-rule notes, and Starting five is ignored', () => {
  const p = orderPlan(names(9), 1, { constraints: { openingFive: ['p5', 'p6', 'p7', 'p8', 'p4'] } });
  assert.deepEqual(fives(p)[0], ['p0', 'p1', 'p2', 'p3', 'p4']);
  const codes = p.issues.map(i => i.code);
  for (const gone of ['SUBS_EXCEEDED', 'HALF_LATE', 'HALF_EARLY', 'SPREAD_RULE', 'SPREAD_FLOOR']) {
    assert.equal(codes.includes(gone), false, gone);
  }
});

test('the fairness note says the minutes as they fall, in the usual words', () => {
  const uneven = orderPlan(names(9), 4);
  assert.equal(uneven.issues.filter(i => i.code === 'SPREAD_ORDER').length, 1);
  // counted by hand from the issue's eight fives: the first and the last four play 4 stints, the four between play 5
  assert.equal(uneven.issues.find(i => i.code === 'SPREAD_ORDER').message,
    'Kid P0, Kid P5, Kid P6, Kid P7 and Kid P8 play 16, everyone else 20.');
  // ten players, five at once, four 8-minute stints: everyone plays two of them
  const even = orderPlan(names(10), 5, { granularity: { mode: 'everyN', value: 8 } });
  assert.equal(even.issues.find(i => i.code === 'SPREAD_ORDER')?.message, 'Minutes divide evenly: every player gets 16.');
});

test('fewer than five available still blocks', () => {
  const p = orderPlan(names(4), 4);
  assert.equal(p.ok, false);
  assert.equal(p.issues[0].code, 'NOT_ENOUGH_PLAYERS');
});
