import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';

/* #441: "Sits at most N in a row" (`maxBench`). Seam: `generatePlan`, with
   many input cases. 4x8 pp2 = four periods of 8, a break every period half,
   so eight 4-minute stints; players p0..p(n-1). */

const mkPlayers = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player${String.fromCharCode(65 + i)}` }));
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const input = (n, extra = {}) => {
  const players = mkPlayers(n);
  return {
    players, availableIds: players.map(p => p.id),
    format: { periods: 4, periodMinutes: 8 },
    granularity: { mode: 'perPeriod', value: 2 },
    constraints: {}, strategy: 'balanced', maxSubs: 3, seed: 1,
    ...extra,
  };
};

const codes = r => r.issues.map(i => i.code);

const longestSit = (stints, id) => {
  let run = 0, best = 0;
  for (const s of stints) { if (s.onFloor.includes(id)) run = 0; else { run++; best = Math.max(best, run); } }
  return best;
};

test('Sits at most 2: every kid sits at most 2 in a row, or a BENCH_EXCEEDED names them (12 players, seeds 1-20)', () => {
  for (const maxSubs of [undefined, 5]) {
    for (const seed of SEEDS) {
      const r = generatePlan(input(12, { seed, constraints: { maxBench: 2 }, ...(maxSubs ? { maxSubs } : {}) }));
      assert.equal(r.ok, true, `seed ${seed}`);
      const named = new Set(r.issues.filter(i => i.code === 'BENCH_EXCEEDED').flatMap(i => i.playerIds));
      for (let k = 0; k < 12; k++) {
        const id = `p${k}`;
        assert.ok(longestSit(r.stints, id) <= 2 || named.has(id),
          `maxSubs ${maxSubs ?? 'default'} seed ${seed}: ${id} sits ${longestSit(r.stints, id)} in a row, no BENCH_EXCEEDED`);
      }
    }
  }
});

test('Sits at most 1 with 12 players on a default game says one up-front line, and not SUBS_EXCEEDED', () => {
  for (const seed of [1, 2, 3]) {
    const r = generatePlan(input(12, { seed, constraints: { maxBench: 1 } }));
    const front = r.issues.filter(i => i.code === 'BENCH_TOO_FEW' || i.code === 'BENCH_SUBS');
    assert.equal(front.length, 1, codes(r).join());
    assert.match(front[0].message, /With 12 players/);
    assert.match(front[0].message, /Sits at most 1 in a row/);
    assert.equal(codes(r).includes('SUBS_EXCEEDED'), false);
  }
});

test('Sits at most 1 with 11 players: BENCH_TOO_FEW says the numbers that do not fit', () => {
  const r = generatePlan(input(11, { constraints: { maxBench: 1 } }));
  const few = r.issues.filter(i => i.code === 'BENCH_TOO_FEW');
  assert.equal(few.length, 1);
  assert.equal(few[0].message,
    'With 11 players, Sits at most 1 in a row cannot hold: everyone needs 4 stints on, 44 in all, and the game has 40. Try a limit of 2.');
  assert.equal(codes(r).includes('BENCH_EXCEEDED'), false);
});

test('Sits at most 2 with 12 players and 3 changes at a time: BENCH_SUBS, said once, replacing SUBS_EXCEEDED', () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = generatePlan(input(12, { seed, constraints: { maxBench: 2 } }));
    const subs = r.issues.filter(i => i.code === 'BENCH_SUBS');
    assert.equal(subs.length, 1);
    assert.equal(subs[0].message,
      'With 12 players and 3 changes at a time, Sits at most 2 in a row needs 4 changes at some breaks. Allow 4 changes at a time, or try a limit of 3.');
    assert.equal(codes(r).includes('SUBS_EXCEEDED'), false);
    assert.equal(codes(r).includes('BENCH_TOO_FEW'), false);
  }
});

test('Sits at most 2 with 10 players and 3 changes at a time raises no up-front bench line', () => {
  const r = generatePlan(input(10, { constraints: { maxBench: 2 } }));
  assert.equal(codes(r).includes('BENCH_TOO_FEW') || codes(r).includes('BENCH_SUBS'), false);
});

test('Sits at most 2 leaves every kid within one stint (4 min) of the minutes they get without it', () => {
  for (const n of [9, 11, 12]) {
    for (const seed of SEEDS) {
      const plain = generatePlan(input(n, { seed, maxSubs: 5 }));
      const rule = generatePlan(input(n, { seed, maxSubs: 5, constraints: { maxBench: 2 } }));
      for (let k = 0; k < n; k++) {
        const d = Math.abs(rule.minutes[`p${k}`] - plain.minutes[`p${k}`]);
        assert.ok(d <= 4 + 1e-9, `${n} players seed ${seed}: p${k} ${rule.minutes[`p${k}`]} vs ${plain.minutes[`p${k}`]}`);
      }
    }
  }
});

test('sitBefore: a kid who sat the limit before the cut opens on the floor', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = generatePlan(input(12, { seed, constraints: { maxBench: 2 }, sitBefore: { p0: 2 } }));
    assert.ok(r.stints[0].onFloor.includes('p0'), `seed ${seed}: p0 still on the bench`);
  }
});

test('without maxBench, sitBefore changes nothing, and maxBench 0 is no maxBench', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const base = generatePlan(input(12, { seed }));
    assert.deepEqual(generatePlan(input(12, { seed, sitBefore: { p0: 2 } })), base);
    assert.deepEqual(generatePlan(input(12, { seed, constraints: { maxBench: 0 } })), base);
  }
});
