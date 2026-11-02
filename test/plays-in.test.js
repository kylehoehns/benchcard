import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generatePlan } from '../app/engine.js';

/* #451: Everyone plays in each half or period. Spec 450, D-F and H. */

const roster = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
const ids = n => roster(n).map(p => p.id);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const run = (n, format, granularity, over = {}) => generatePlan({
  players: roster(n), availableIds: ids(n), format, granularity, iterations: 1500, seed: 1, ...over,
});
const min = (n, m) => ({ minMinutes: Object.fromEntries(ids(n).map(id => [id, m])) });
const on = (p, id, pred) => p.stints.filter(pred).some(s => s.onFloor.includes(id));

test('D. each quarter: 10 players, 4x8 perPeriod 2, every kid is on in every quarter, seeds 1-20', () => {
  for (const seed of SEEDS) {
    const p = run(10, { periods: 4, periodMinutes: 8 }, { mode: 'perPeriod', value: 2 },
      { seed, constraints: min(10, 16), playsIn: 'periods' });
    assert.ok(p.ok);
    for (const id of ids(10)) for (let q = 1; q <= 4; q++) {
      assert.ok(on(p, id, s => s.period === q), `seed ${seed}: ${id} misses Q${q}`);
    }
  }
});

const BO5 = [{ periods: 4, periodMinutes: 5 }, { mode: 'breaksOnly' }];
const inHalf = h => s => (s.period <= 2) === (h === 1);

test('E. halves: 4x5 breaksOnly, 10 players, maxSubs 5, every kid on in both halves, seeds 1-20', () => {
  for (const seed of SEEDS) {
    const p = run(10, ...BO5, { seed, maxSubs: 5, constraints: min(10, 10), playsIn: 'halves' });
    assert.ok(p.ok);
    for (const id of ids(10)) for (const h of [1, 2]) {
      assert.ok(on(p, id, inHalf(h)), `seed ${seed}: ${id} misses half ${h}`);
    }
  }
});

test('F. halves at 3 changes: PLAYS_IN_SUBS names 3 and 5, and SUBS_EXCEEDED stays quiet', () => {
  const p = run(10, ...BO5, { maxSubs: 3, constraints: min(10, 10), playsIn: 'halves' });
  const said = p.issues.find(i => i.code === 'PLAYS_IN_SUBS');
  assert.ok(said, 'no PLAYS_IN_SUBS');
  assert.match(said.message, /\b3 changes\b/);
  assert.match(said.message, /\b5 changes\b/);
  assert.ok(!p.issues.some(i => i.code === 'SUBS_EXCEEDED'));
});

test('H. too few seats: 4x8 breaksOnly, 10 players, each period says so and does not also say who missed', () => {
  const p = run(10, { periods: 4, periodMinutes: 8 }, { mode: 'breaksOnly' }, { playsIn: 'periods' });
  assert.ok(p.issues.some(i => i.code === 'PLAYS_IN_TOO_FEW'));
  assert.ok(!p.issues.some(i => i.code === 'PLAYS_IN_MISSED'));
});

/* G. With no fullPeriods and no playsIn the plans are the plans of f3593a0
   (spec 450 G). The digest was taken from that commit's engine over these 126
   cases (7 shapes x 7-12 players x seeds 1-3, iterations 1500): lineups and
   issue codes. It is a frozen fact, not a recomputation. */
test('G. off is unchanged: 126 plans match the digest taken on f3593a0', () => {
  const SHAPES = [
    [{ periods: 4, periodMinutes: 8 }, { mode: 'everyN', value: 4 }],
    [{ periods: 4, periodMinutes: 8 }, { mode: 'perPeriod', value: 2 }],
    [{ periods: 4, periodMinutes: 6 }, { mode: 'everyN', value: 3 }],
    [{ periods: 2, periodMinutes: 16 }, { mode: 'everyN', value: 4 }],
    [{ periods: 2, periodMinutes: 20 }, { mode: 'everyN', value: 5 }],
    [{ periods: 4, periodMinutes: 5 }, { mode: 'breaksOnly' }],
    [{ periods: 4, periodMinutes: 8 }, { mode: 'breaksOnly' }],
  ];
  const h = createHash('sha256');
  for (const [format, granularity] of SHAPES) for (let n = 7; n <= 12; n++) for (let seed = 1; seed <= 3; seed++) {
    const p = run(n, format, granularity, { seed });
    h.update(JSON.stringify([p.ok, p.stints.map(s => s.onFloor), p.issues.map(i => i.code)]));
  }
  assert.equal(h.digest('hex'), 'd879bd9fb31a00ef69479eee77ac971a4e15dcb5e4a6ad767e5a658e0ac096d4');
});
