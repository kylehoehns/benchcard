import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStints, generatePlan, benchSpan } from '../app/engine.js';

/* #541: Sits at most N in a row is counted over regulation only. Seam: the
   engine under node --test. 4 x 8 minutes, a change every 4, so eight
   regulation stints, then overtime. */

const QUARTERS = { periods: 4, periodMinutes: 8 };
const EVERY_4 = { mode: 'everyN', value: 4 };
const roster = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player${i}` }));
const ids = n => roster(n).map(p => p.id);
/* The closers hold the floor for both overtime stints, so everyone else sits through
   overtime whatever the limit says: a run only overtime made. */
const planWith = (n, seed, limit, overtime) => generatePlan({
  players: roster(n), availableIds: ids(n), format: { ...QUARTERS, overtime }, granularity: EVERY_4, seed,
  constraints: { maxBench: limit, closing: { players: ['p0', 'p1', 'p2', 'p3', 'p4'], stints: 2 } },
});
/* the longest run of stints a kid is off the floor, counted here over `rows` */
const sitRun = (rows, id) => {
  let run = 0, best = 0;
  for (const r of rows) { run = r.includes(id) ? 0 : run + 1; best = Math.max(best, run); }
  return best;
};

test('benchSpan is the number of stints before the first overtime stint', () => {
  const reg = buildStints(QUARTERS, EVERY_4);
  assert.equal(benchSpan(reg), 8);
  assert.equal(benchSpan(buildStints({ ...QUARTERS, overtime: [4, 4] }, EVERY_4)), 8);
  assert.equal(benchSpan(buildStints({ ...QUARTERS, overtime: [4] }, EVERY_4).slice(5)), 3, 'a suffix that reaches overtime');
  assert.equal(benchSpan(buildStints({ ...QUARTERS, overtime: [4] }, EVERY_4).slice(8)), 0, 'a suffix that is all overtime');
  assert.equal(benchSpan([]), 0);
});

test('a plan with overtime and Sits at most never says BENCH_EXCEEDED for a run only overtime made', () => {
  let said = 0;
  for (const n of [9, 10]) for (let seed = 1; seed <= 15; seed++) for (const limit of [1, 2]) {
    const p = planWith(n, seed, limit, [4, 4]);
    assert.equal(p.stints.length, 10);
    const reg = p.stints.slice(0, 8).map(s => s.onFloor);
    for (const i of p.issues.filter(x => x.code === 'BENCH_EXCEEDED')) {
      said++;
      assert.ok(sitRun(reg, i.playerIds[0]) > limit, `${n} players, seed ${seed}, limit ${limit}: ${i.message} but regulation runs are within it`);
    }
  }
  assert.ok(said > 0, 'the sweep measured nothing: no kid sat past the limit in regulation either');
});

test('an all-overtime suffix owes Sits at most nothing: no bench warning, whatever run the kids sat before it', () => {
  const all = buildStints({ ...QUARTERS, overtime: [4, 4] }, EVERY_4);
  const suffix = all.slice(8);
  assert.equal(suffix.length, 2);
  for (let seed = 1; seed <= 12; seed++) {
    const p = generatePlan({
      players: roster(9), availableIds: ids(9), format: QUARTERS, granularity: EVERY_4, seed,
      stints: suffix, constraints: { maxBench: 1 }, sitBefore: { p0: 1, p1: 1, p2: 1, p3: 1 },
    });
    const codes = p.issues.map(i => i.code).filter(c => c.startsWith('BENCH_'));
    assert.deepEqual(codes, [], `seed ${seed}`);
  }
});
