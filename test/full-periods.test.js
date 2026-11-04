import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';

/* #450: a league minimum counted in full periods. Spec 450, A-C. Expected
   values are the spec's: every kid on for every stint of N whole quarters. */

const QUARTERS = { periods: 4, periodMinutes: 8 };
const EVERY_4 = { mode: 'everyN', value: 4 };
const roster = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
const ids = n => roster(n).map(p => p.id);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const full = (n, seed, over = {}) => generatePlan({
  players: roster(n), availableIds: ids(n), format: QUARTERS, granularity: EVERY_4, seed, iterations: 1500,
  constraints: {
    minMinutes: Object.fromEntries(ids(n).map(id => [id, 16])),
    fullPeriods: Object.fromEntries(ids(n).map(id => [id, 2])),
  },
  ...over,
});
const wholeQuarters = (p, id) => [1, 2, 3, 4]
  .filter(q => p.stints.filter(s => s.period === q).every(s => s.onFloor.includes(id))).length;

for (const n of [8, 10]) {
  test(`A. full periods: ${n} players each play 2 whole quarters, seeds 1-20`, () => {
    for (const seed of SEEDS) {
      const p = full(n, seed);
      assert.ok(p.ok, `seed ${seed} refused`);
      for (const id of ids(n)) assert.ok(wholeQuarters(p, id) >= 2, `seed ${seed}: ${id} has ${wholeQuarters(p, id)} whole quarters`);
    }
  });
}

test('B. 11 players cannot each play 2 full quarters: one error with 22 and 20', () => {
  const p = full(11, 1);
  assert.equal(p.ok, false);
  const errors = p.issues.filter(i => i.severity === 'error');
  assert.deepEqual(errors.map(i => i.code), ['FULL_PERIODS_TOO_MANY']);
  assert.match(errors[0].message, /\b22\b/);
  assert.match(errors[0].message, /\b20\b/);
  assert.ok(!p.issues.some(i => i.code === 'MINS_UNSATISFIABLE'));
});

test('E. the refusal counts whole quarters, or whole halves in a two-half game, never "full periods"', () => {
  const q = full(11, 1).issues.find(i => i.code === 'FULL_PERIODS_TOO_MANY');
  assert.ok(q.message.startsWith('Everyone plays 2 whole quarters needs 22 player-periods'), q.message);
  const h = full(11, 1, { format: { periods: 2, periodMinutes: 16 } }).issues.find(i => i.code === 'FULL_PERIODS_TOO_MANY');
  assert.ok(h.message.startsWith('Everyone plays 2 whole halves needs 22 player-periods'), h.message);
  assert.ok(!/full period/i.test(q.message + h.message));
});

test('C. even: full periods keep the spread within one stint (4 min), seeds 1-20', () => {
  for (const n of [8, 10]) {
    for (const seed of SEEDS) {
      const p = full(n, seed);
      assert.ok(p.spread <= 4 + 1e-9, `${n} players seed ${seed}: spread ${p.spread}`);
    }
  }
});

test('a full-period pick never moves a kid out of the starting five, so no stint is pinned past five', () => {
  const owed = { p0: 3, p1: 2, p2: 2, p3: 1, p4: 1, p5: 3, p6: 2, p7: 1, p8: 1, p9: 1 };
  for (const seed of SEEDS) {
    const p = generatePlan({
      players: roster(10), availableIds: ids(10), format: QUARTERS, granularity: EVERY_4, seed, iterations: 300,
      constraints: { openingFive: ['p7', 'p2', 'p9', 'p8', 'p1'], fullPeriods: owed },
    });
    assert.ok(p.ok, `seed ${seed}: ${p.issues.filter(i => i.severity === 'error').map(i => i.code).join()}`);
  }
});

test('Plays at most 1 in a row: the periods picked for a kid are not back to back, seeds 1-20', () => {
  const owed = Object.fromEntries(ids(10).slice(0, 5).map(id => [id, 2]));
  for (const seed of SEEDS) {
    const p = generatePlan({
      players: roster(10), availableIds: ids(10), format: QUARTERS, granularity: { mode: 'breaksOnly' }, seed, iterations: 300,
      constraints: { fullPeriods: owed, maxConsecutive: 1 },
    });
    assert.ok(p.ok, `seed ${seed} refused`);
    const exceeded = p.issues.filter(i => i.code === 'CONSEC_EXCEEDED').flatMap(i => i.playerIds).filter(id => id in owed);
    assert.deepEqual(exceeded, [], `seed ${seed}: ${exceeded.join()} play two quarters in a row`);
  }
});

test('three periods: the middle one is filed in the second half, so five kids get the first period and one of the others', () => {
  const ids6 = ids(6);
  for (const seed of SEEDS) {
    const p = generatePlan({
      players: roster(6), availableIds: ids6, format: { periods: 3, periodMinutes: 12 }, granularity: EVERY_4, seed, iterations: 300,
      constraints: { fullPeriods: Object.fromEntries(ids6.map(id => [id, 2])) },
    });
    assert.ok(p.ok, `seed ${seed} refused`);
    const whole = id => [1, 2, 3].filter(q => p.stints.filter(s => s.period === q).every(s => s.onFloor.includes(id)));
    assert.equal(ids6.filter(id => whole(id).includes(1)).length, 5, `seed ${seed}: ${ids6.map(id => whole(id).join('')).join(' ')}`);
  }
});
