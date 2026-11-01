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

test('Sits at most 2 with 9 or 11 players on a default game: the rule can hold, and it does, with no BENCH_EXCEEDED (seeds 1-20)', () => {
  for (const n of [9, 11]) {
    for (const seed of SEEDS) {
      const r = generatePlan(input(n, { seed, constraints: { maxBench: 2 } }));
      assert.equal(codes(r).includes('BENCH_EXCEEDED'), false, `${n} players seed ${seed}: ${codes(r).join()}`);
      for (let k = 0; k < n; k++) {
        assert.ok(longestSit(r.stints, `p${k}`) <= 2, `${n} players seed ${seed}: p${k} sits ${longestSit(r.stints, `p${k}`)} in a row`);
      }
    }
  }
});

test('Sits at most 1 with 12 players on a default game says BENCH_TOO_FEW once, and not SUBS_EXCEEDED', () => {
  for (const seed of [1, 2, 3]) {
    const r = generatePlan(input(12, { seed, constraints: { maxBench: 1 } }));
    const front = r.issues.filter(i => i.code === 'BENCH_TOO_FEW' || i.code === 'BENCH_SUBS');
    assert.equal(front.length, 1, codes(r).join());
    assert.equal(front[0].code, 'BENCH_TOO_FEW');
    assert.equal(front[0].message,
      'With 12 players, Sits at most 1 in a row cannot hold: everyone needs 4 stints on, 48 in all, and the game has 40. Try a limit of 2.');
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
  for (const seed of [1, 2, 4, 6, 7, 8]  /* seeds where p0 sits out the first stint on their own */) {
    const without = generatePlan(input(12, { seed, constraints: { maxBench: 2 } }));
    assert.ok(!without.stints[0].onFloor.includes('p0'), `seed ${seed}: p0 opens without sitBefore, so this proves nothing`);
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

/* Review fixes on #441. */

test('Sits at most 2 with 16 players: any 3 stints in a row have 15 floor spots for 16 kids, so BENCH_TOO_FEW', () => {
  for (const seed of [1, 2, 3]) {
    const r = generatePlan(input(16, { seed, constraints: { maxBench: 2 } }));
    const few = r.issues.filter(i => i.code === 'BENCH_TOO_FEW');
    assert.equal(few.length, 1, codes(r).join());
    assert.equal(few[0].message,
      'With 16 players, Sits at most 2 in a row cannot hold: any 3 stints in a row have 15 spots on the floor, and all 16 players need one. Try a limit of 3.');
    assert.equal(codes(r).includes('BENCH_SUBS'), false);
    assert.equal(codes(r).includes('BENCH_EXCEEDED'), false);
  }
});

test('Sits at most 4 with 26 players: no limit a coach can set would hold, so BENCH_TOO_FEW says turn it off', () => {
  const r = generatePlan(input(26, { constraints: { maxBench: 4 } }));
  const few = r.issues.filter(i => i.code === 'BENCH_TOO_FEW');
  assert.equal(few.length, 1, codes(r).join());
  assert.equal(few[0].message,
    'With 26 players, Sits at most 4 in a row cannot hold: any 5 stints in a row have 25 spots on the floor, and all 26 players need one. Turn off Sits at most N in a row or add players.');
});

test('Sits at most 1 with 26 players: the total does not fit, and the only limit that would is above the stepper, so turn it off', () => {
  const r = generatePlan(input(26, { constraints: { maxBench: 1 } }));
  const few = r.issues.filter(i => i.code === 'BENCH_TOO_FEW');
  assert.equal(few.length, 1, codes(r).join());
  assert.equal(few[0].message,
    'With 26 players, Sits at most 1 in a row cannot hold: everyone needs 4 stints on, 104 in all, and the game has 40. Turn off Sits at most N in a row or add players.');
});

test('Sits at most 4 with 10 players and 1 change at a time: BENCH_SUBS offers the change limit, not a limit of 5', () => {
  const r = generatePlan(input(10, { maxSubs: 1, constraints: { maxBench: 4 } }));
  const subs = r.issues.filter(i => i.code === 'BENCH_SUBS');
  assert.equal(subs.length, 1, codes(r).join());
  assert.equal(subs[0].message,
    'With 10 players and 1 change at a time, Sits at most 4 in a row needs 2 changes at some breaks. Allow 2 changes at a time, or turn off Sits at most N in a row.');
});

test('Sits at most with a Platoon plan raises no BENCH_SUBS: the units are the coach\'s', () => {
  const units = [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8', 'p9']];
  const r = generatePlan(input(12, { strategy: 'platoon', constraints: { maxBench: 2, units } }));
  assert.equal(codes(r).includes('BENCH_SUBS'), false, codes(r).join());
});

test('more kids at the bench limit than seats: the ones who have sat longest open on the floor', () => {
  /* eleven kids are at the limit of 1 before the tip, five seats: the five who sat 3 go on */
  const sitBefore = { p0: 3, p1: 1, p2: 3, p4: 2, p5: 2, p6: 1, p7: 3, p8: 3, p9: 2, p10: 1, p11: 3 };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = generatePlan(input(12, { seed, constraints: { maxBench: 1 }, sitBefore }));
    for (const id of ['p0', 'p2', 'p7', 'p8', 'p11']) assert.ok(r.stints[0].onFloor.includes(id), `seed ${seed}: ${id} (sat 3) still on the bench`);
  }
});

test('a break that Sits at most forces past the change limit says so, by name', () => {
  /* 10 players, limit 2, 3 changes: BENCH_SUBS stays quiet (3 x 2 covers the 5 who sit), but
     with this much already sat before the cut, one break must bring four kids on at once */
  const sitBefore = { p0: 2, p2: 1, p3: 1, p4: 1, p5: 1, p6: 1, p7: 2, p8: 2, p9: 1 };
  const r = generatePlan(input(10, { seed: 4, sitBefore, constraints: { maxBench: 2 } }));
  assert.equal(codes(r).includes('BENCH_SUBS'), false);
  const over = r.issues.filter(i => i.code === 'SUBS_EXCEEDED');
  assert.equal(over.length, 1, codes(r).join());
  assert.equal(over[0].message,
    'One break puts 4 players on at once, more than the 3 you asked for — Sits at most 2 in a row makes more than 3 come on at once.');
});
